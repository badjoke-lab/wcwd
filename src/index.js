import baseWorker from "./worker.js";
import { updateSellImpactWatchlist, getSellImpactWatchlistLatest, getSellImpactWatchlistList } from "./sellimpact-watchlist.js";
import { RETENTION, buildRetentionMetadata, enforceBaseRetention, writeRetentionMetadata, clampLimit } from "./retention.js";
import { handleWormholeViz } from "./viz-wormhole.js";
import { handleOracleFeed } from "./oracles-feed.js";

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "content-type,authorization");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-max-age", "86400");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function errorJson(where, error, status = 500) {
  return json({ ok: false, where, error }, { status });
}

function cloneRequestWithUrl(request, nextUrl) {
  return new Request(nextUrl.toString(), request);
}

async function readJsonResponse(response) {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function normalizeState(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (raw === "ok" || raw === "fresh" || raw === "normal") return "fresh";
  if (raw === "delayed") return "delayed";
  if (raw === "stale") return "stale";
  if (raw === "degraded" || raw === "partial" || raw === "warn" || raw === "alert") return "degraded";
  if (raw === "error" || raw === "unavailable" || raw === "empty" || raw === "invalid" || raw === "no data") return "unavailable";
  return "unknown";
}

function hasUsableLatest(body) {
  return !!body?.latest && typeof body.latest === "object" && !Array.isArray(body.latest);
}

function buildNormalizedDashboardState(body) {
  if (!body || typeof body !== "object") return "unavailable";
  if (!hasUsableLatest(body) && (!Array.isArray(body.history) || body.history.length === 0)) return "unavailable";
  const freshnessState = normalizeState(body?.freshness?.state);
  const dashboardState = normalizeState(body?.dashboard_state || body?.status || freshnessState);
  if (body?.latest?.summary_ok === false) return "degraded";
  if (dashboardState !== "unknown") return dashboardState;
  return freshnessState !== "unknown" ? freshnessState : "fresh";
}

function buildNormalizedReasons(body, state) {
  const reasons = Array.isArray(body?.degraded_reasons) ? [...body.degraded_reasons] : [];
  if (body?.latest?.summary_ok === false && !reasons.includes("latest_summary_fetch_failed")) {
    reasons.push("latest_summary_fetch_failed");
  }
  if (state === "delayed" && !reasons.includes("history_delayed")) reasons.push("history_delayed");
  if (state === "stale" && !reasons.includes("history_stale")) reasons.push("history_stale");
  if (state === "unavailable" && !reasons.includes("summary_unavailable")) reasons.push("summary_unavailable");
  return reasons;
}

async function proxyWithClampedQuery(request, env, ctx, url, clampSpec, enhanceJson) {
  if (request.method !== "GET") return baseWorker.fetch(request, env, ctx);
  const safe = clampLimit(url.searchParams.get(clampSpec.param), clampSpec);
  url.searchParams.set(clampSpec.param, String(safe));
  const response = await baseWorker.fetch(cloneRequestWithUrl(request, url), env, ctx);
  const body = await readJsonResponse(response);
  if (!body || typeof body !== "object") return response;
  const nextBody = enhanceJson ? enhanceJson(body, safe, url) : body;
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set(`x-wcwd-${clampSpec.param}-limit`, String(safe));
  return new Response(JSON.stringify(nextBody, null, 2), { status: response.status, headers });
}

function addSummaryRetention(body, limit, url) {
  const eventLimit = clampLimit(url.searchParams.get("event_limit"), {
    min: 1,
    max: RETENTION.events.hard_max_items,
    fallback: RETENTION.events.recommended_items,
  });
  const dashboardState = buildNormalizedDashboardState(body);
  const freshness = body?.freshness && typeof body.freshness === "object"
    ? { ...body.freshness, state: normalizeState(body.freshness.state) }
    : body?.freshness;
  return {
    ...body,
    limit,
    event_limit: eventLimit,
    freshness,
    dashboard_state: dashboardState,
    degraded: dashboardState !== "fresh",
    degraded_reasons: buildNormalizedReasons(body, dashboardState),
    retention: buildRetentionMetadata({
      source: "summary_proxy",
      request_limit: limit,
      event_limit: eventLimit,
    }),
  };
}

function addListRetention(body, limit) {
  return {
    ...body,
    limit,
    retention: RETENTION.summary_list,
  };
}

function addEventsRetention(body, limit) {
  return {
    ...body,
    limit,
    retention: RETENTION.events,
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type,authorization",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-max-age": "86400",
        },
      });
    }

    if (pathname === "/api/oracles/feed") {
      if (request.method !== "GET") return errorJson("oracles_feed", "method_not_allowed", 405);
      return handleOracleFeed(request, env);
    }

    if (pathname === "/api/viz/wormhole") {
      if (request.method !== "GET") return errorJson("viz_wormhole", "method_not_allowed", 405);
      return handleWormholeViz({ request, env, ctx, baseWorker });
    }

    if (pathname === "/api/retention") {
      if (request.method !== "GET") return errorJson("retention", "method_not_allowed", 405);
      const metadata = await writeRetentionMetadata(env, { source: "api" });
      return json(metadata);
    }

    if (pathname === "/api/retention/enforce") {
      if (request.method !== "POST") return errorJson("retention_enforce", "method_not_allowed", 405);
      const result = await enforceBaseRetention(env);
      return json(result);
    }

    if (pathname === "/api/summary") {
      const eventLimit = clampLimit(url.searchParams.get("event_limit"), {
        min: 1,
        max: RETENTION.events.hard_max_items,
        fallback: RETENTION.events.recommended_items,
      });
      url.searchParams.set("event_limit", String(eventLimit));
      return proxyWithClampedQuery(
        request,
        env,
        ctx,
        url,
        {
          param: "limit",
          min: 1,
          max: RETENTION.summary_list.hard_max_points,
          fallback: RETENTION.summary_list.recommended_points,
        },
        addSummaryRetention,
      );
    }

    if (pathname === "/api/list") {
      return proxyWithClampedQuery(
        request,
        env,
        ctx,
        url,
        {
          param: "limit",
          min: 1,
          max: RETENTION.summary_list.hard_max_points,
          fallback: RETENTION.summary_list.recommended_points,
        },
        addListRetention,
      );
    }

    if (pathname === "/api/events") {
      return proxyWithClampedQuery(
        request,
        env,
        ctx,
        url,
        {
          param: "limit",
          min: 1,
          max: RETENTION.events.hard_max_items,
          fallback: RETENTION.events.recommended_items,
        },
        addEventsRetention,
      );
    }

    if (pathname === "/api/sell-impact/watchlist/latest") {
      if (request.method !== "GET") return errorJson("sellimpact_watchlist_latest", "method_not_allowed", 405);
      const latest = await getSellImpactWatchlistLatest(env);
      if (!latest) return json({ ok: true, reason: "no_data", items: [] });
      return json(latest);
    }

    if (pathname === "/api/sell-impact/watchlist/list") {
      if (request.method !== "GET") return errorJson("sellimpact_watchlist_list", "method_not_allowed", 405);
      const limit = clampLimit(url.searchParams.get("limit"), {
        min: 1,
        max: RETENTION.sellimpact_watchlist.list_points,
        fallback: 24,
      });
      const list = await getSellImpactWatchlistList(env, limit);
      return json({ ok: true, items: list, limit, retention: RETENTION.sellimpact_watchlist });
    }

    if (pathname === "/api/sell-impact/watchlist/run") {
      if (request.method !== "POST") return errorJson("sellimpact_watchlist_run", "method_not_allowed", 405);
      const payload = await updateSellImpactWatchlist(env);
      return json(payload);
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    if (baseWorker?.scheduled) {
      await baseWorker.scheduled(event, env, ctx);
    }
    ctx.waitUntil(updateSellImpactWatchlist(env));
    ctx.waitUntil(enforceBaseRetention(env));
  },
};
