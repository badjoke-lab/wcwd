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
 * - GET  /api/health
 * - GET  /api/version
 * - GET  /api/events?limit=50
 * - GET  /api/daily?date=YYYY-MM-DD
 * - GET  /api/daily/latest
 * - POST /run        (manual run)
 * - GET  /health
 */

const INTERVAL_MIN = 15;
const LIST_MAX = Math.ceil((24 * 60) / INTERVAL_MIN) + 2;
const DEFAULT_LIMIT = 96;
const FETCH_TIMEOUT_MS = 9000;
const SERIES_RAW_MAX_POINTS = 3000;
const SERIES_PERIOD_DAYS = {
  "7d": 7,
};
const SERIES_METRICS = new Set(["tps", "gas_gwei", "wld_usd", "token_pct"]);
const EVENTS_MAX = 200;
const HEALTH_KEY = "health:latest";
const EVENTS_KEY = "events:list";
const DAILY_LATEST_KEY = "daily:latest";
const ALERT_DEBOUNCE_MS = 60 * 60 * 1000;
const ALERT_TYPES = {
  tps_spike: "alert:last_sent:tps_spike",
  tps_drop: "alert:last_sent:tps_drop",
  gas_high: "alert:last_sent:gas_high",
  summary_fail: "alert:last_sent:summary_fail",
  health_change: "alert:last_sent:health_change",
  daily_summary: "alert:last_sent:daily_summary",
};
const UNKNOWN_VERSION = "unknown";

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

// step=1h is fixed to hourly average (no "last") to reduce noise for monitoring.
function buildHourlyPoints(snapshots, metric) {
  const buckets = new Map();
  for (const snap of snapshots) {
    const v = extractMetricValue(metric, snap.data);
    if (v == null) continue;
    const bucketStart = Math.floor(snap.tsMs / 3600000) * 3600000;
    const list = buckets.get(bucketStart) ?? [];
    list.push(v);
    buckets.set(bucketStart, list);
  }
  const points = [];
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  for (const key of keys) {
    const values = buckets.get(key) ?? [];
    if (!values.length) continue;
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    points.push({ ts: new Date(key).toISOString(), v: avg, n: values.length });
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

function avg(nums) {
  const list = (nums || []).filter((v) => Number.isFinite(v));
  if (!list.length) return null;
  return list.reduce((sum, val) => sum + val, 0) / list.length;
}

function fmtNum(n, digits = 0) {
  if (!Number.isFinite(n)) return "—";
  return Number(n).toFixed(digits);
}

function fmtRatio(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  return Number(n).toFixed(digits);
}

async function readLastSent(env, key) {
  try {
    const raw = await env.HIST.get(key);
    if (!raw) return null;
    const ms = Number(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (error) {
    console.error(`Failed to read ${key}`, error);
    return null;
  }
}

async function writeLastSent(env, key, ms) {
  try {
    await env.HIST.put(key, String(ms));
  } catch (error) {
    console.error(`Failed to write ${key}`, error);
  }
}

function buildAlertMessage(type, latest, avgValue, intervalMin, message = "") {
  const ts = typeof latest?.ts === "string" ? latest.ts : new Date().toISOString();
  if (type === "tps_spike") {
    return `[WCWD] TPS spike: ${fmtNum(latest?.tps, 0)} (avg ${fmtNum(avgValue, 0)}) interval=${intervalMin}m ts=${ts}\nhttps://wcwd.badjoke-lab.com/`;
  }
  if (type === "tps_drop") {
    return `[WCWD] TPS drop: ${fmtNum(latest?.tps, 0)} (avg ${fmtNum(avgValue, 0)}) interval=${intervalMin}m ts=${ts}\nhttps://wcwd.badjoke-lab.com/`;
  }
  if (type === "gas_high") {
    return `[WCWD] Gas high: ${fmtNum(latest?.gas_gwei, 6)} (avg ${fmtNum(avgValue, 6)}) interval=${intervalMin}m ts=${ts}\nhttps://wcwd.badjoke-lab.com/`;
  }
  if (type === "summary_fail") {
    return `[WCWD] Summary fetch failed repeatedly. interval=${intervalMin}m ts=${ts}\nhttps://wcwd.badjoke-lab.com/`;
  }
  if (type === "daily_summary") {
    return message || `[WCWD] Daily summary: ${ts}\nhttps://wcwd.badjoke-lab.com/`;
  }
  if (type === "health_change") {
    return `[WCWD] Health change: ${message}\nhttps://wcwd.badjoke-lab.com/`;
  }
  return `[WCWD] Alert: ${type} interval=${intervalMin}m ts=${ts}\nhttps://wcwd.badjoke-lab.com/`;
}

async function sendDiscordAlert(env, key, message) {
  if (!env.DISCORD_WEBHOOK_URL) return { ok: false, skipped: "webhook_unset" };
  const nowMs = Date.now();
  const lastSent = await readLastSent(env, key);
  if (lastSent && nowMs - lastSent < ALERT_DEBOUNCE_MS) {
    return { ok: false, skipped: "debounced" };
  }
  const res = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, skipped: `http_${res.status}`, detail: body };
  }
  await writeLastSent(env, key, nowMs);
  return { ok: true };
}

function buildLatestMetrics(latest) {
  return {
    tps: latest?.tps ?? null,
    gas_gwei: latest?.gas_gwei ?? null,
    token_pct: latest?.token_pct ?? null,
  };
}

function buildHealthEvent(type, level, msg, latest, ts) {
  return {
    ts,
    type,
    level,
    msg,
    latest: buildLatestMetrics(latest),
  };
}

function buildHealthReport(list, latest, intervalMin) {
  if (!latest) return null;
  const pointsFor3h = Math.max(3, Math.round((3 * 60) / intervalMin));
  const recent = list.slice(Math.max(0, list.length - pointsFor3h - 1), Math.max(0, list.length - 1));
  const tpsAvg = avg(recent.map((entry) => entry?.tps).filter(Number.isFinite));
  const gasAvg = avg(recent.map((entry) => entry?.gas_gwei).filter(Number.isFinite));

  const reasons = [];
  const events = [];
  const ts = new Date().toISOString();

  if (tpsAvg && Number.isFinite(latest?.tps)) {
    const ratio = latest.tps / tpsAvg;
    if (ratio >= 1.5) {
      reasons.push(`TPS spike (${fmtRatio(ratio)}x vs 3h avg)`);
      events.push(
        buildHealthEvent(
          "tps_spike",
          "WARN",
          `TPS spike: ${fmtNum(latest.tps, 0)} (avg ${fmtNum(tpsAvg, 0)}) interval=${intervalMin}m`,
          latest,
          ts
        )
      );
    } else if (ratio <= 0.7) {
      reasons.push(`TPS drop (${fmtRatio(ratio)}x vs 3h avg)`);
      events.push(
        buildHealthEvent(
          "tps_drop",
          "WARN",
          `TPS drop: ${fmtNum(latest.tps, 0)} (avg ${fmtNum(tpsAvg, 0)}) interval=${intervalMin}m`,
          latest,
          ts
        )
      );
    }
  }

  if (gasAvg && Number.isFinite(latest?.gas_gwei)) {
    const ratio = latest.gas_gwei / gasAvg;
    if (ratio >= 2.0) {
      reasons.push(`Gas high (${fmtRatio(ratio)}x vs 3h avg)`);
      events.push(
        buildHealthEvent(
          "gas_high",
          "ALERT",
          `Gas high: ${fmtNum(latest.gas_gwei, 6)} (avg ${fmtNum(gasAvg, 6)}) interval=${intervalMin}m`,
          latest,
          ts
        )
      );
    }
  }

  const failWindow = 3;
  const recentFail = list.slice(Math.max(0, list.length - failWindow));
  if (recentFail.length === failWindow && recentFail.every((entry) => entry?.summary_ok === false)) {
    reasons.push("Summary fetch failed repeatedly");
    events.push(
      buildHealthEvent(
        "summary_fail",
        "WARN",
        `Summary fetch failed repeatedly (${failWindow}x) interval=${intervalMin}m`,
        latest,
        ts
      )
    );
  }

  let level = "NORMAL";
  if (events.some((event) => event.level === "ALERT")) level = "ALERT";
  else if (events.some((event) => event.level === "WARN")) level = "WARN";

  return {
    ok: true,
    level,
    reasons,
    latest,
    baseline: {
      tps_3h: tpsAvg ?? null,
      gas_3h: gasAvg ?? null,
    },
    interval_min: intervalMin,
    ts,
    events,
  };
}

async function safeLoadEvents(env) {
  let raw = null;
  try {
    raw = await env.HIST.get(EVENTS_KEY);
  } catch (error) {
    console.error("Failed to read events:list from KV", error);
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse events:list JSON", error);
    return [];
  }
}

async function writeEvents(env, events) {
  try {
    await env.HIST.put(EVENTS_KEY, JSON.stringify(events));
  } catch (error) {
    console.error("Failed to write events:list", error);
  }
}

async function safeLoadHealth(env) {
  let raw = null;
  try {
    raw = await env.HIST.get(HEALTH_KEY);
  } catch (error) {
    console.error("Failed to read health:latest from KV", error);
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch (error) {
    console.error("Failed to parse health:latest JSON", error);
    return null;
  }
}

async function appendEvents(env, incoming) {
  if (!incoming.length) return [];
  const events = await safeLoadEvents(env);
  const merged = events.concat(incoming);
  const trimmed = merged.length > EVENTS_MAX ? merged.slice(merged.length - EVENTS_MAX) : merged;
  await writeEvents(env, trimmed);
  return incoming;
}

async function updateHealthAndEvents(env, list, latest) {
  if (!latest) return null;
  const report = buildHealthReport(list, latest, INTERVAL_MIN);
  if (!report) return null;

  const prev = await safeLoadHealth(env);
  const prevLevel = prev?.level ?? null;
  const levelChanged = prevLevel && prevLevel !== report.level;

  await env.HIST.put(HEALTH_KEY, JSON.stringify({
    ok: report.ok,
    level: report.level,
    reasons: report.reasons,
    latest: report.latest,
    baseline: report.baseline,
    interval_min: report.interval_min,
    ts: report.ts,
  }));

  const eventsToAdd = [];
  if (report.level === "WARN" || report.level === "ALERT") {
    eventsToAdd.push(...report.events);
  }
  if (levelChanged) {
    eventsToAdd.push(
      buildHealthEvent(
        "health_change",
        report.level,
        `Health ${prevLevel} -> ${report.level}`,
        latest,
        report.ts
      )
    );
  }

  if (eventsToAdd.length) {
    await appendEvents(env, eventsToAdd);
  }

  for (const event of eventsToAdd) {
    if (event.level !== "WARN" && event.level !== "ALERT") continue;
    const alertKey = ALERT_TYPES[event.type];
    if (!alertKey) continue;
    const avgValue = event.type === "gas_high" ? report.baseline?.gas_3h : report.baseline?.tps_3h;
    const message = buildAlertMessage(event.type, latest, avgValue, INTERVAL_MIN, event.msg);
    const result = await sendDiscordAlert(env, alertKey, message);
    if (!result.ok) console.log("Discord alert skipped", result);
  }

  return report;
}

function buildDailySummary(list, intervalMin, dateStr) {
  if (!list.length) return null;
  const tpsValues = list.map((entry) => entry?.tps).filter(Number.isFinite);
  const gasValues = list.map((entry) => entry?.gas_gwei).filter(Number.isFinite);
  const wldUsdValues = list.map((entry) => entry?.wld_usd).filter(Number.isFinite);
  const wldJpyValues = list.map((entry) => entry?.wld_jpy).filter(Number.isFinite);

  const tpsMax = tpsValues.length ? Math.max(...tpsValues) : null;
  const tpsMin = tpsValues.length ? Math.min(...tpsValues) : null;
  const gasMax = gasValues.length ? Math.max(...gasValues) : null;

  const wldUsdChange = wldUsdValues.length ? wldUsdValues[wldUsdValues.length - 1] - wldUsdValues[0] : null;
  const wldJpyChange = wldJpyValues.length ? wldJpyValues[wldJpyValues.length - 1] - wldJpyValues[0] : null;

  const healthCounts = { NORMAL: 0, WARN: 0, ALERT: 0 };
  for (let i = 0; i < list.length; i += 1) {
    const slice = list.slice(0, i + 1);
    const latest = slice[slice.length - 1];
    const report = buildHealthReport(slice, latest, intervalMin);
    const level = report?.level ?? "NORMAL";
    if (healthCounts[level] != null) healthCounts[level] += 1;
  }
  const healthMode = Object.entries(healthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "NORMAL";

  return {
    ok: true,
    date: dateStr,
    health: {
      counts: healthCounts,
      mode: healthMode,
    },
    tps: {
      max: tpsMax,
      min: tpsMin,
    },
    gas: {
      max: gasMax,
    },
    wld: {
      usd_change: wldUsdChange,
      jpy_change: wldJpyChange,
    },
    interval_min: intervalMin,
    ts: new Date().toISOString(),
  };
}

async function maybeGenerateDailySummary(env, list) {
  const today = formatDateUTC(new Date());
  const latestDaily = await safeLoadJson(env, DAILY_LATEST_KEY);
  if (latestDaily?.date === today) return null;

  const summary = buildDailySummary(list, INTERVAL_MIN, today);
  if (!summary) return null;

  await env.HIST.put(`daily:${today}`, JSON.stringify(summary));
  await env.HIST.put(DAILY_LATEST_KEY, JSON.stringify(summary));

  const message = `[WCWD] Daily summary ${today}\nHealth mode: ${summary.health.mode} (N:${summary.health.counts.NORMAL} W:${summary.health.counts.WARN} A:${summary.health.counts.ALERT})\nTPS max/min: ${fmtNum(summary.tps.max, 0)} / ${fmtNum(summary.tps.min, 0)}\nGas max: ${fmtNum(summary.gas.max, 6)}\nWLD change: USD ${fmtNum(summary.wld.usd_change, 6)} / JPY ${fmtNum(summary.wld.jpy_change, 2)}\nhttps://wcwd.badjoke-lab.com/`;
  const result = await sendDiscordAlert(env, ALERT_TYPES.daily_summary, message);
  if (!result.ok) console.log("Daily summary skipped", result);
  return summary;
}

async function safeLoadJson(env, key) {
  let raw = null;
  try {
    raw = await env.HIST.get(key);
  } catch (error) {
    console.error(`Failed to read ${key} from KV`, error);
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to parse ${key} JSON`, error);
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

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  list = list.filter((entry) => {
    const ts = typeof entry?.ts === "string" ? entry.ts : null;
    if (!ts) return false;
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) return false;
    return ms >= cutoff;
  });

  if (list.length > LIST_MAX) {
    list = list.slice(list.length - LIST_MAX);
  }

  await env.HIST.put("snap:list", JSON.stringify(list));
  await env.HIST.put("snap:latest", JSON.stringify(snap));

  return { snap, list, listLength: list.length };
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
        const result = await runOnce(env);
        if (!result?.snap) return errorJson("run", "fetch_failed", 502, origin);
        await updateHealthAndEvents(env, result.list ?? [], result.snap);
        return json({ ok: true, snap: result.snap }, {}, origin);
      }

      if (pathname === "/api/latest") {
        if (request.method !== "GET") {
          return errorJson("latest", "method_not_allowed", 405, origin);
        }
        const latest = await getLatestSnapshot(env);
        if (!latest) return json({ ok: false, reason: "no_data" }, {}, origin);
        return json(latest, {}, origin);
      }

      if (pathname === "/api/version") {
        if (request.method !== "GET") return errorJson("version", "method_not_allowed", 405, origin);
        const workerVersion = env.WORKER_VERSION || UNKNOWN_VERSION;
        const deployedAt = env.DEPLOYED_AT || new Date().toISOString();
        return json(
          {
            ok: true,
            worker_version: workerVersion,
            deployed_at: deployedAt,
          },
          {},
          origin
        );
      }

      if (pathname === "/api/list") {
        if (request.method !== "GET") return errorJson("list", "method_not_allowed", 405, origin);

        const limit = clampInt(url.searchParams.get("limit"), 1, LIST_MAX, DEFAULT_LIMIT);
        const list = await getRecentList(env, limit);
        return json(list, {}, origin);
      }

      if (pathname === "/api/health") {
        if (request.method !== "GET") return errorJson("health", "method_not_allowed", 405, origin);
        const health = await safeLoadJson(env, HEALTH_KEY);
        if (!health) {
          return json(
            {
              ok: true,
              level: "UNKNOWN",
              reasons: [],
              latest: null,
              baseline: { tps_3h: null, gas_3h: null },
              interval_min: INTERVAL_MIN,
              ts: new Date().toISOString(),
              reason: "no_data",
            },
            {},
            origin
          );
        }
        return json({ ok: true, ...health }, {}, origin);
      }

      if (pathname === "/api/events") {
        if (request.method !== "GET") return errorJson("events", "method_not_allowed", 405, origin);
        const limit = clampInt(url.searchParams.get("limit"), 1, EVENTS_MAX, 50);
        const events = await safeLoadEvents(env);
        const list = events.length > limit ? events.slice(events.length - limit) : events;
        return json({ ok: true, events: list }, {}, origin);
      }

      if (pathname === "/api/daily/latest") {
        if (request.method !== "GET") return errorJson("daily_latest", "method_not_allowed", 405, origin);
        const daily = await safeLoadJson(env, DAILY_LATEST_KEY);
        if (!daily) {
          return json(
            {
              ok: true,
              date: null,
              health: { counts: { NORMAL: 0, WARN: 0, ALERT: 0 }, mode: "NORMAL" },
              tps: { max: null, min: null },
              gas: { max: null },
              wld: { usd_change: null, jpy_change: null },
              interval_min: INTERVAL_MIN,
              ts: new Date().toISOString(),
              reason: "no_data",
            },
            {},
            origin
          );
        }
        return json({ ok: true, ...daily }, {}, origin);
      }

      if (pathname === "/api/daily") {
        if (request.method !== "GET") return errorJson("daily", "method_not_allowed", 405, origin);
        const date = url.searchParams.get("date") || "";
        if (!date) return errorJson("daily", "invalid_date", 400, origin);
        const daily = await safeLoadJson(env, `daily:${date}`);
        if (!daily) return json({ ok: true, reason: "no_data", date }, {}, origin);
        return json({ ok: true, ...daily }, {}, origin);
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
        const agg = step === "raw" ? "raw" : "avg";

        return json(
          {
            ok: true,
            metric,
            period,
            step,
            agg,
            interval_min: INTERVAL_MIN,
            points,
          },
          { headers: { "x-wcwd-series-agg": agg } },
          origin
        );
      }

      if (pathname === "/api/test-notify") {
        if (request.method !== "POST") return errorJson("test_notify", "method_not_allowed", 405, origin);
        if (!env.ADMIN_TOKEN) return errorJson("test_notify", "not_found", 404, origin);
        const auth = request.headers.get("authorization") || "";
        if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
          return errorJson("test_notify", "unauthorized", 401, origin);
        }
        const type = url.searchParams.get("type") || "";
        const alertKey = ALERT_TYPES[type];
        if (!alertKey) return errorJson("test_notify", "invalid_type", 400, origin);

        const list = await safeLoadList(env);
        const latest = list[list.length - 1] || (await safeLoadLatest(env));
        if (!latest) return errorJson("test_notify", "no_data", 404, origin);
        const pointsFor3h = Math.max(3, Math.round((3 * 60) / INTERVAL_MIN));
        const recent = list.slice(Math.max(0, list.length - pointsFor3h - 1), Math.max(0, list.length - 1));
        const tpsAvg = avg(recent.map((entry) => entry?.tps).filter(Number.isFinite));
        const gasAvg = avg(recent.map((entry) => entry?.gas_gwei).filter(Number.isFinite));
        const baseAvg = type === "gas_high" ? gasAvg : tpsAvg;
        const message = buildAlertMessage(type, latest, baseAvg ?? 0, INTERVAL_MIN);
        const result = await sendDiscordAlert(env, alertKey, message);
        const ok = result.ok || result.skipped === "webhook_unset";
        return json({ ok, result }, {}, origin);
      }

      return errorJson("router", "not_found", 404, origin);
    } catch (error) {
      return errorJson("fetch", error?.message ?? "unknown_error", 500, origin);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const result = await runOnce(env);
        if (!result?.snap) return;
        const now = new Date();
        for (let i = 8; i <= 14; i += 1) {
          const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          day.setUTCDate(day.getUTCDate() - i);
          const dayKey = formatDateUTC(day);
          await env.HIST.delete(`snap:day:${dayKey}`);
          await env.HIST.delete(`hist:${dayKey}`);
        }
        const meta = {
          days: 7,
          interval_min: INTERVAL_MIN,
          list_max: LIST_MAX,
          list_points: result.listLength,
          day_keys_expected: 7,
          updated_at: new Date().toISOString(),
        };
        await env.HIST.put("meta:retention", JSON.stringify(meta));
        if (result?.list?.length) {
          await updateHealthAndEvents(env, result.list, result.snap);
          await maybeGenerateDailySummary(env, result.list);
        }
      })()
    );
  },
};
