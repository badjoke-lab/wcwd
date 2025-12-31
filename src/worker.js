/**
 * WCWD History Worker (KV saver edition)
 *
 * KV keys:
 * - snap:list                   -> recent snapshots (json array, capped)
 * - snap:latest                 -> latest snapshot (json object, optional)
 *
 * API:
 * - GET  /api/latest
 * - GET  /api/list?limit=96
 * - POST /run        (manual run)
 * - GET  /health
 */

const INTERVAL_MIN = 15;
const MAX_POINTS = 672;
const DEFAULT_LIMIT = 96;
const FETCH_TIMEOUT_MS = 9000;
const SERIES_RAW_MAX_POINTS = 3000;
const SERIES_PERIOD_DAYS = {
  "7d": 7,
};
const SERIES_METRICS = new Set(["tps", "gas_gwei", "wld_usd", "token_pct"]);

function corsHeaders(origin = "*") {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-max-age": "86400",
  };
}

function baseHeaders(corsOrigin = "*") {
  const headers = new Headers(corsHeaders(corsOrigin));
  headers.set("cache-control", "no-store");
  headers.set("x-wcwd-interval-min", String(INTERVAL_MIN));
  return headers;
}

function mergeHeaders(base, extra) {
  const headers = new Headers(base);
  const extraHeaders = new Headers(extra || {});
  for (const [k, v] of extraHeaders.entries()) {
    headers.set(k, v);
  }
  return headers;
}

function json(data, init = {}, corsOrigin = "*") {
  const headers = mergeHeaders(baseHeaders(corsOrigin), init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function text(s, init = {}, corsOrigin = "*") {
  const headers = mergeHeaders(baseHeaders(corsOrigin), init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/plain; charset=utf-8");
  }
  return new Response(s, { ...init, headers });
}

function errorJson(where, error, status = 500, corsOrigin = "*") {
  return json({ ok: false, error, where }, { status }, corsOrigin);
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function formatDateUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildDayKeys(days) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() - i);
    keys.push(`snap:day:${formatDateUTC(day)}`);
  }
  return keys;
}

async function loadDaySnapshots(env, days) {
  const keys = buildDayKeys(days);
  const snapshots = [];

  for (const key of keys) {
    let raw = null;
    try {
      raw = await env.HIST.get(key);
    } catch (error) {
      console.error(`Failed to read ${key} from KV`, error);
      continue;
    }
    if (!raw) continue;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error(`Failed to parse ${key} JSON`, error);
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const ts = typeof entry.ts === "string" ? entry.ts : null;
      if (!ts) continue;
      const ms = Date.parse(ts);
      if (!Number.isFinite(ms)) continue;
      snapshots.push({ ts, tsMs: ms, data: entry });
    }
  }

  return snapshots;
}

function extractMetricValue(metric, data) {
  const v = data?.[metric];
  return Number.isFinite(v) ? v : null;
}

function buildRawPoints(snapshots, metric) {
  const points = [];
  for (const snap of snapshots) {
    const v = extractMetricValue(metric, snap.data);
    if (v == null) continue;
    points.push({ ts: new Date(snap.tsMs).toISOString(), tsMs: snap.tsMs, v });
  }
  points.sort((a, b) => a.tsMs - b.tsMs);
  if (points.length > SERIES_RAW_MAX_POINTS) {
    return points.slice(points.length - SERIES_RAW_MAX_POINTS).map(({ ts, v }) => ({ ts, v }));
  }
  return points.map(({ ts, v }) => ({ ts, v }));
}

function buildHourlyPoints(snapshots, metric) {
  const buckets = new Map();
  for (const snap of snapshots) {
    const v = extractMetricValue(metric, snap.data);
    if (v == null) continue;
    const bucketStart = Math.floor(snap.tsMs / 3600000) * 3600000;
    const bucketEnd = bucketStart + 3600000;
    const list = buckets.get(bucketEnd) ?? [];
    list.push(v);
    buckets.set(bucketEnd, list);
  }
  const points = [];
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  for (const key of keys) {
    const values = buckets.get(key) ?? [];
    if (!values.length) continue;
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    points.push({ ts: new Date(key).toISOString(), v: avg });
  }
  return points;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function hexToInt(hex) {
  if (hex == null) return null;
  if (typeof hex !== "string") return null;
  if (!hex.startsWith("0x")) return null;
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : null;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function buildSnapshot(j, httpStatus) {
  const ok = !!j && typeof j === "object" ? (j.ok ?? null) : null;

  const tps = j?.rpc?.tps_estimate ?? null;

  const gasHex = j?.rpc?.gas_price ?? null;
  const gasWei = hexToInt(gasHex);
  const gasGwei = gasWei != null ? gasWei / 1e9 : null;

  const tokenPct = j?.activity_sample?.token_pct ?? null;
  const nativePct = j?.activity_sample?.native_pct ?? null;

  const wldUsd = j?.coingecko?.simple?.usd ?? null;
  const wldJpy = j?.coingecko?.simple?.jpy ?? null;

  return {
    ts: new Date().toISOString(),
    summary_http_status: httpStatus,
    summary_ok: ok,
    tps,
    gas_gwei: gasGwei,
    token_pct: tokenPct,
    native_pct: nativePct,
    wld_usd: wldUsd,
    wld_jpy: wldJpy,
  };
}

async function runOnce(env) {
  let httpStatus = 0;
  let j = null;

  try {
    const res = await fetchWithTimeout(env.SUMMARY_URL, { method: "GET" }, FETCH_TIMEOUT_MS);
    httpStatus = res.status;
    j = await safeJson(res);
  } catch (e) {
    httpStatus = 0;
    j = null;
  }

  if (httpStatus === 0) return null;

  const snap = buildSnapshot(j, httpStatus);
  let list = await safeLoadList(env);
  const seed = await safeLoadLatest(env);

  if (list.length === 0 && seed && shouldAppendSnapshot(list, seed)) {
    list.push(seed);
  }

  if (shouldAppendSnapshot(list, snap)) {
    list.push(snap);
  }

  if (list.length > MAX_POINTS) {
    list = list.slice(list.length - MAX_POINTS);
  }

  await env.HIST.put("snap:list", JSON.stringify(list));
  await env.HIST.put("snap:latest", JSON.stringify(snap));

  return snap;
}

function shouldAppendSnapshot(list, snap) {
  if (!snap || typeof snap !== "object") return false;
  const last = list[list.length - 1];
  if (last?.ts && snap.ts && last.ts === snap.ts) return false;
  return true;
}

async function safeLoadList(env) {
  let raw = null;
  try {
    raw = await env.HIST.get("snap:list");
  } catch (error) {
    console.error("Failed to read snap:list from KV", error);
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.error("Failed to parse snap:list JSON", error);
    return [];
  }
}

async function safeLoadLatest(env) {
  let raw = null;
  try {
    raw = await env.HIST.get("snap:latest");
  } catch (error) {
    console.error("Failed to read snap:latest from KV", error);
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch (error) {
    console.error("Failed to parse snap:latest JSON", error);
    return null;
  }
}

async function getLatestSnapshot(env) {
  const list = await safeLoadList(env);
  if (list.length) return list[list.length - 1];
  return safeLoadLatest(env);
}

async function getRecentList(env, limit) {
  const list = await safeLoadList(env);
  if (list.length <= limit) return list;
  return list.slice(list.length - limit);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = "*";
    const { pathname } = url;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: baseHeaders(origin) });
    }
    try {
      if (pathname === "/health") {
        return json({ ok: true, ts: new Date().toISOString() }, {}, origin);
      }

      if (pathname === "/run") {
        if (request.method !== "POST") return errorJson("run", "method_not_allowed", 405, origin);
        const snap = await runOnce(env);
        if (!snap) return errorJson("run", "fetch_failed", 502, origin);
        return json({ ok: true, snap }, {}, origin);
      }

      if (pathname === "/api/latest") {
        if (request.method !== "GET") {
          return errorJson("latest", "method_not_allowed", 405, origin);
        }
        const latest = await getLatestSnapshot(env);
        if (!latest) return json({ ok: false, reason: "no_data" }, {}, origin);
        return json(latest, {}, origin);
      }

      if (pathname === "/api/list") {
        if (request.method !== "GET") return errorJson("list", "method_not_allowed", 405, origin);

        const limit = clampInt(url.searchParams.get("limit"), 1, MAX_POINTS, DEFAULT_LIMIT);
        const list = await getRecentList(env, limit);
        return json(list, {}, origin);
      }

      if (pathname === "/api/series") {
        if (request.method !== "GET") return errorJson("series", "method_not_allowed", 405, origin);

        const metric = url.searchParams.get("metric") || "";
        const period = url.searchParams.get("period") || "7d";
        const step = url.searchParams.get("step") || "1h";

        if (!SERIES_METRICS.has(metric)) {
          return errorJson("series", "invalid_metric", 400, origin);
        }
        const days = SERIES_PERIOD_DAYS[period];
        if (!days) {
          return errorJson("series", "invalid_period", 400, origin);
        }
        if (step !== "1h" && step !== "raw") {
          return errorJson("series", "invalid_step", 400, origin);
        }

        const snapshots = await loadDaySnapshots(env, days);
        const points = step === "raw" ? buildRawPoints(snapshots, metric) : buildHourlyPoints(snapshots, metric);

        return json(
          {
            ok: true,
            metric,
            period,
            step,
            interval_min: INTERVAL_MIN,
            points,
          },
          {},
          origin
        );
      }

      return errorJson("router", "not_found", 404, origin);
    } catch (error) {
      return errorJson("fetch", error?.message ?? "unknown_error", 500, origin);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await runOnce(env);
      })()
    );
  },
};
