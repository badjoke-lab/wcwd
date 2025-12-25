/**
 * WCWD History Worker (KV saver edition)
 *
 * KV keys:
 * - snap:latest                 -> latest snapshot (json object)
 * - snap:day:YYYY-MM-DD          -> snapshots for that UTC day (json array)
 *
 * API:
 * - GET  /api/latest
 * - GET  /api/list?limit=96
 * - POST /run        (manual run)
 * - GET  /health
 */

const DEFAULT_LIMIT = 96;          // 15min * 24h = 96 points
const MAX_LIMIT = 2000;            // safety
const DAY_BUCKET_MAX = 3000;       // per-day cap to avoid unbounded growth
const FETCH_TIMEOUT_MS = 9000;

function corsHeaders(origin = "*") {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  const ch = corsHeaders(headers.get("origin") || "*");
  for (const [k, v] of Object.entries(ch)) headers.set(k, v);
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function text(s, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("cache-control", "no-store");
  const ch = corsHeaders(headers.get("origin") || "*");
  for (const [k, v] of Object.entries(ch)) headers.set(k, v);
  return new Response(s, { ...init, headers });
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function utcDayKeyFromIso(isoTs) {
  // isoTs example: 2025-12-23T16:15:18.866Z
  const day = String(isoTs).slice(0, 10); // UTC day
  return `snap:day:${day}`;
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
  const ts = new Date().toISOString();

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

  const snap = { ts, ...buildSnapshot(j, httpStatus) };

  // --- KV saver: only 2 writes per run ---
  const dayKey = utcDayKeyFromIso(ts);

  // read current day bucket (1 read), append, cap, write back (1 write)
  let dayArr = [];
  try {
    const raw = await env.HIST.get(dayKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) dayArr = parsed;
    }
  } catch {
    dayArr = [];
  }

  dayArr.push(snap);

  // keep last DAY_BUCKET_MAX points
  if (dayArr.length > DAY_BUCKET_MAX) {
    dayArr = dayArr.slice(dayArr.length - DAY_BUCKET_MAX);
  }

  // write day bucket + latest
  await env.HIST.put(dayKey, JSON.stringify(dayArr));
  await env.HIST.put("snap:latest", JSON.stringify(snap));

  return snap;
}

async function getLatest(env) {
  const raw = await env.HIST.get("snap:latest");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getDay(env, dayKey) {
  const raw = await env.HIST.get(dayKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function utcDayKey(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const day = d.toISOString().slice(0, 10);
  return `snap:day:${day}`;
}

async function getRecentList(env, limit) {
  // Combine today + yesterday to cover last 24h even if interval is coarse
  const [today, yday] = await Promise.all([
    getDay(env, utcDayKey(0)),
    getDay(env, utcDayKey(-1)),
  ]);

  const merged = yday.concat(today);

  // sort by ts ascending (safe even if out-of-order)
  merged.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  // return last N
  if (merged.length <= limit) return merged;
  return merged.slice(merged.length - limit);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders("*") });
    }

    if (pathname === "/health") {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    if (pathname === "/run") {
      if (request.method !== "POST") return text("Method Not Allowed", { status: 405 });
      const snap = await runOnce(env);
      return json({ ok: true, snap });
    }

    if (pathname === "/api/latest") {
      if (request.method !== "GET") return text("Method Not Allowed", { status: 405 });
      const latest = await getLatest(env);
      if (!latest) return json({ error: "not_found" }, { status: 404 });
      return json(latest);
    }

    if (pathname === "/api/list") {
      if (request.method !== "GET") return text("Method Not Allowed", { status: 405 });

      const limit = clampInt(url.searchParams.get("limit"), 1, MAX_LIMIT, DEFAULT_LIMIT);
      const list = await getRecentList(env, limit);
      return json(list);
    }

    return text("Not Found", { status: 404 });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await runOnce(env);
      })()
    );
  },
};
