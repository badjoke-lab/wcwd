/**
 * WCWD read-only history API.
 *
 * Reads existing bounded KV snapshots. It does not collect, append, retain,
 * aggregate, or generate history. There is no public collection route and no
 * scheduled handler.
 *
 * API:
 * - GET  /health
 * - GET  /api/latest
 * - GET  /api/list?limit=96
 * - GET  /api/summary?limit=96&event_limit=20
 * - GET  /api/health
 * - GET  /api/version
 * - GET  /api/events?limit=50
 * - GET  /api/daily?date=YYYY-MM-DD
 * - GET  /api/daily/latest
 * - GET  /api/series?metric=tps&period=7d&step=1h
 * - POST /api/test-notify (ADMIN_TOKEN required)
 */

const INTERVAL_MIN = 15;
const LIST_MAX = Math.ceil((24 * 60) / INTERVAL_MIN) + 2;
const DEFAULT_LIMIT = 96;
const SERIES_RAW_MAX_POINTS = 3000;
const SERIES_PERIOD_DAYS = { "7d": 7 };
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
  for (const [key, value] of extraHeaders.entries()) headers.set(key, value);
  return headers;
}

function json(data, init = {}, corsOrigin = "*") {
  const headers = mergeHeaders(baseHeaders(corsOrigin), init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function errorJson(where, error, status = 500, corsOrigin = "*") {
  return json({ ok: false, error, where }, { status }, corsOrigin);
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function formatDateUTC(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDayKeys(days) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const keys = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() - index);
    keys.push(`snap:day:${formatDateUTC(day)}`);
  }
  return keys;
}

async function safeLoadJson(env, key) {
  try {
    const raw = await env.HIST.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read or parse ${key}`, error);
    return null;
  }
}

async function safeLoadList(env) {
  const parsed = await safeLoadJson(env, "snap:list");
  return Array.isArray(parsed) ? parsed : [];
}

async function safeLoadLatest(env) {
  const parsed = await safeLoadJson(env, "snap:latest");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed;
}

async function safeLoadEvents(env) {
  const parsed = await safeLoadJson(env, EVENTS_KEY);
  return Array.isArray(parsed) ? parsed : [];
}

async function getLatestSnapshot(env) {
  const list = await safeLoadList(env);
  if (list.length) return list[list.length - 1];
  return safeLoadLatest(env);
}

async function getRecentList(env, limit) {
  const list = await safeLoadList(env);
  return list.length <= limit ? list : list.slice(list.length - limit);
}

async function loadDaySnapshots(env, days) {
  const snapshots = [];
  for (const key of buildDayKeys(days)) {
    const parsed = await safeLoadJson(env, key);
    if (!Array.isArray(parsed)) continue;
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || typeof entry.ts !== "string") continue;
      const tsMs = Date.parse(entry.ts);
      if (!Number.isFinite(tsMs)) continue;
      snapshots.push({ ts: entry.ts, tsMs, data: entry });
    }
  }
  snapshots.sort((a, b) => a.tsMs - b.tsMs);
  return snapshots;
}

function extractMetricValue(metric, data) {
  const value = data?.[metric];
  return Number.isFinite(value) ? value : null;
}

function buildRawPoints(snapshots, metric) {
  const points = [];
  for (const snapshot of snapshots) {
    const value = extractMetricValue(metric, snapshot.data);
    if (value == null) continue;
    points.push({ ts: new Date(snapshot.tsMs).toISOString(), v: value });
  }
  return points.length > SERIES_RAW_MAX_POINTS
    ? points.slice(points.length - SERIES_RAW_MAX_POINTS)
    : points;
}

function buildHourlyPoints(snapshots, metric) {
  const buckets = new Map();
  for (const snapshot of snapshots) {
    const value = extractMetricValue(metric, snapshot.data);
    if (value == null) continue;
    const bucketStart = Math.floor(snapshot.tsMs / 3600000) * 3600000;
    const values = buckets.get(bucketStart) || [];
    values.push(value);
    buckets.set(bucketStart, values);
  }
  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([bucketStart, values]) => ({
      ts: new Date(bucketStart).toISOString(),
      v: values.reduce((sum, value) => sum + value, 0) / values.length,
      n: values.length,
    }));
}

function computeFreshness(latest, intervalMin = INTERVAL_MIN) {
  if (!latest || typeof latest !== "object" || typeof latest.ts !== "string") {
    return {
      ok: false,
      state: "empty",
      age_ms: null,
      age_min: null,
      expected_interval_min: intervalMin,
      snapshot_ts: null,
    };
  }
  const tsMs = Date.parse(latest.ts);
  if (!Number.isFinite(tsMs)) {
    return {
      ok: false,
      state: "invalid",
      age_ms: null,
      age_min: null,
      expected_interval_min: intervalMin,
      snapshot_ts: latest.ts,
    };
  }
  const ageMs = Math.max(0, Date.now() - tsMs);
  const delayedMs = intervalMin * 2 * 60 * 1000;
  const staleMs = intervalMin * 4 * 60 * 1000;
  let state = "fresh";
  if (ageMs > staleMs) state = "stale";
  else if (ageMs > delayedMs) state = "delayed";
  return {
    ok: true,
    state,
    age_ms: ageMs,
    age_min: Number((ageMs / 60000).toFixed(2)),
    expected_interval_min: intervalMin,
    snapshot_ts: latest.ts,
  };
}

function buildDashboardState({ latest, health, freshness }) {
  if (latest?.summary_ok === false) return "degraded";
  if (freshness?.state === "stale") return "stale";
  if (freshness?.state === "delayed") return "delayed";
  if (health?.level === "WARN" || health?.level === "ALERT") return "degraded";
  return "ok";
}

function buildDegradedReasons({ latest, health, freshness }) {
  const reasons = [];
  if (latest?.summary_ok === false) reasons.push("latest_summary_fetch_failed");
  if (freshness?.state === "delayed") reasons.push("history_delayed");
  if (freshness?.state === "stale") reasons.push("history_stale");
  if (health?.level === "WARN" || health?.level === "ALERT") {
    reasons.push(`health_${String(health.level).toLowerCase()}`);
  }
  return reasons;
}

async function buildSummaryPayload(env, limit, eventLimit) {
  const history = await getRecentList(env, limit);
  const latest = history[history.length - 1] || (await safeLoadLatest(env));
  const healthRaw = await safeLoadJson(env, HEALTH_KEY);
  const health = healthRaw ? { ok: true, ...healthRaw } : null;
  const allEvents = await safeLoadEvents(env);
  const events = allEvents.length > eventLimit
    ? allEvents.slice(allEvents.length - eventLimit)
    : allEvents;
  const dailyRaw = await safeLoadJson(env, DAILY_LATEST_KEY);
  const daily = dailyRaw ? { ok: true, ...dailyRaw } : null;
  const freshness = computeFreshness(latest, INTERVAL_MIN);
  const dashboardState = buildDashboardState({ latest, health: healthRaw, freshness });
  const degradedReasons = buildDegradedReasons({ latest, health: healthRaw, freshness });
  const retention = await safeLoadJson(env, "meta:retention");
  const generatedAt = new Date().toISOString();
  return {
    ok: true,
    generated_at: generatedAt,
    interval_min: INTERVAL_MIN,
    latest: latest ?? null,
    history,
    health,
    events,
    daily,
    version: {
      ok: true,
      worker_version: env.WORKER_VERSION || UNKNOWN_VERSION,
      deployed_at: env.DEPLOYED_AT || generatedAt,
    },
    freshness,
    dashboard_state: dashboardState,
    degraded: dashboardState !== "ok",
    degraded_reasons: degradedReasons,
    retention,
  };
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatNumber(value, digits = 0) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function buildAlertMessage(type, latest, averageValue) {
  const timestamp = typeof latest?.ts === "string" ? latest.ts : new Date().toISOString();
  if (type === "gas_high") {
    return `[WCWD] Gas high: ${formatNumber(latest?.gas_gwei, 6)} (avg ${formatNumber(averageValue, 6)}) interval=${INTERVAL_MIN}m ts=${timestamp}\nhttps://wcwd.badjoke-lab.com/`;
  }
  if (type === "tps_spike" || type === "tps_drop") {
    const label = type === "tps_spike" ? "TPS spike" : "TPS drop";
    return `[WCWD] ${label}: ${formatNumber(latest?.tps, 0)} (avg ${formatNumber(averageValue, 0)}) interval=${INTERVAL_MIN}m ts=${timestamp}\nhttps://wcwd.badjoke-lab.com/`;
  }
  return `[WCWD] Test alert: ${type} interval=${INTERVAL_MIN}m ts=${timestamp}\nhttps://wcwd.badjoke-lab.com/`;
}

async function sendAuthenticatedTestAlert(env, type, latest, averageValue) {
  if (!env.DISCORD_WEBHOOK_URL) return { ok: false, skipped: "webhook_unset" };
  const key = ALERT_TYPES[type];
  const nowMs = Date.now();
  const lastSentRaw = await env.HIST.get(key);
  const lastSent = Number(lastSentRaw);
  if (Number.isFinite(lastSent) && nowMs - lastSent < ALERT_DEBOUNCE_MS) {
    return { ok: false, skipped: "debounced" };
  }
  const response = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: buildAlertMessage(type, latest, averageValue) }),
  });
  if (!response.ok) return { ok: false, skipped: `http_${response.status}` };
  await env.HIST.put(key, String(nowMs));
  return { ok: true };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const origin = "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: baseHeaders(origin) });
    }

    try {
      if (pathname === "/health") {
        return json({ ok: true, ts: new Date().toISOString() }, {}, origin);
      }

      if (pathname === "/api/latest") {
        if (request.method !== "GET") return errorJson("latest", "method_not_allowed", 405, origin);
        const latest = await getLatestSnapshot(env);
        if (!latest) return json({ ok: false, reason: "no_data" }, {}, origin);
        return json(latest, {}, origin);
      }

      if (pathname === "/api/summary") {
        if (request.method !== "GET") return errorJson("summary", "method_not_allowed", 405, origin);
        const limit = clampInt(url.searchParams.get("limit"), 1, LIST_MAX, DEFAULT_LIMIT);
        const eventLimit = clampInt(url.searchParams.get("event_limit"), 1, EVENTS_MAX, 20);
        const summary = await buildSummaryPayload(env, limit, eventLimit);
        return json(summary, {
          headers: {
            "x-wcwd-summary-state": summary.dashboard_state,
            "x-wcwd-generated-at": summary.generated_at,
          },
        }, origin);
      }

      if (pathname === "/api/version") {
        if (request.method !== "GET") return errorJson("version", "method_not_allowed", 405, origin);
        return json({
          ok: true,
          worker_version: env.WORKER_VERSION || UNKNOWN_VERSION,
          deployed_at: env.DEPLOYED_AT || new Date().toISOString(),
        }, {}, origin);
      }

      if (pathname === "/api/list") {
        if (request.method !== "GET") return errorJson("list", "method_not_allowed", 405, origin);
        const limit = clampInt(url.searchParams.get("limit"), 1, LIST_MAX, DEFAULT_LIMIT);
        return json(await getRecentList(env, limit), {}, origin);
      }

      if (pathname === "/api/health") {
        if (request.method !== "GET") return errorJson("health", "method_not_allowed", 405, origin);
        const health = await safeLoadJson(env, HEALTH_KEY);
        if (!health) {
          return json({
            ok: true,
            level: "UNKNOWN",
            reasons: [],
            latest: null,
            baseline: { tps_3h: null, gas_3h: null },
            interval_min: INTERVAL_MIN,
            ts: new Date().toISOString(),
            reason: "no_data",
          }, {}, origin);
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
          return json({
            ok: true,
            date: null,
            health: { counts: { NORMAL: 0, WARN: 0, ALERT: 0 }, mode: "NORMAL" },
            tps: { max: null, min: null },
            gas: { max: null },
            wld: { usd_change: null, jpy_change: null },
            interval_min: INTERVAL_MIN,
            ts: new Date().toISOString(),
            reason: "no_data",
          }, {}, origin);
        }
        return json({ ok: true, ...daily }, {}, origin);
      }

      if (pathname === "/api/daily") {
        if (request.method !== "GET") return errorJson("daily", "method_not_allowed", 405, origin);
        const date = url.searchParams.get("date") || "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorJson("daily", "invalid_date", 400, origin);
        const daily = await safeLoadJson(env, `daily:${date}`);
        if (!daily) return json({ ok: true, reason: "no_data", date }, {}, origin);
        return json({ ok: true, ...daily }, {}, origin);
      }

      if (pathname === "/api/series") {
        if (request.method !== "GET") return errorJson("series", "method_not_allowed", 405, origin);
        const metric = url.searchParams.get("metric") || "";
        const period = url.searchParams.get("period") || "7d";
        const step = url.searchParams.get("step") || "1h";
        if (!SERIES_METRICS.has(metric)) return errorJson("series", "invalid_metric", 400, origin);
        const days = SERIES_PERIOD_DAYS[period];
        if (!days) return errorJson("series", "invalid_period", 400, origin);
        if (step !== "1h" && step !== "raw") return errorJson("series", "invalid_step", 400, origin);
        const snapshots = await loadDaySnapshots(env, days);
        const points = step === "raw"
          ? buildRawPoints(snapshots, metric)
          : buildHourlyPoints(snapshots, metric);
        const aggregation = step === "raw" ? "raw" : "avg";
        return json({
          ok: true,
          metric,
          period,
          step,
          agg: aggregation,
          interval_min: INTERVAL_MIN,
          points,
        }, { headers: { "x-wcwd-series-agg": aggregation } }, origin);
      }

      if (pathname === "/api/test-notify") {
        if (request.method !== "POST") return errorJson("test_notify", "method_not_allowed", 405, origin);
        if (!env.ADMIN_TOKEN) return errorJson("test_notify", "not_found", 404, origin);
        if ((request.headers.get("authorization") || "") !== `Bearer ${env.ADMIN_TOKEN}`) {
          return errorJson("test_notify", "unauthorized", 401, origin);
        }
        const type = url.searchParams.get("type") || "";
        if (!ALERT_TYPES[type]) return errorJson("test_notify", "invalid_type", 400, origin);
        const list = await safeLoadList(env);
        const latest = list[list.length - 1] || (await safeLoadLatest(env));
        if (!latest) return errorJson("test_notify", "no_data", 404, origin);
        const recent = list.slice(Math.max(0, list.length - 13), Math.max(0, list.length - 1));
        const averageValue = type === "gas_high"
          ? average(recent.map((entry) => entry?.gas_gwei))
          : average(recent.map((entry) => entry?.tps));
        const result = await sendAuthenticatedTestAlert(env, type, latest, averageValue ?? 0);
        return json({ ok: result.ok || result.skipped === "webhook_unset", result }, {}, origin);
      }

      return errorJson("router", "not_found", 404, origin);
    } catch (error) {
      return errorJson("fetch", error?.message ?? "unknown_error", 500, origin);
    }
  },
};
