import baseWorker from "./worker.js";
import { updateSellImpactWatchlist, getSellImpactWatchlistLatest, getSellImpactWatchlistList } from "./sellimpact-watchlist.js";
import { RETENTION, buildRetentionMetadata, enforceBaseRetention, writeRetentionMetadata, clampLimit } from "./retention.js";

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
