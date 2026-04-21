const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_ACCEPT = "application/json;version=20230203";
const CACHE_TTL_SEC = 30;

function buildCorsHeaders(request) {
  const headers = new Headers();
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  const reqHeaders = request.headers.get("access-control-request-headers");
  if (reqHeaders) headers.set("access-control-allow-headers", reqHeaders);
  return headers;
}

function decorateHeaders(target, source) {
  const headers = new Headers(source || {});
  for (const [key, value] of target.entries()) {
    headers.set(key, value);
  }
  return headers;
}

export async function onRequest(context) {
  const { request, params } = context;
  const method = request.method.toUpperCase();
  if (!["GET", "OPTIONS"].includes(method)) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const corsHeaders = buildCorsHeaders(request);
  if (method === "OPTIONS") {
    corsHeaders.set("cache-control", "no-store");
    corsHeaders.set("x-wcwd-gt-cache", "preflight");
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const pathParam = params?.path;
  const path = Array.isArray(pathParam) ? pathParam.join("/") : (pathParam || "");
  if (!path) {
    const headers = decorateHeaders(corsHeaders, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-wcwd-gt-cache": "miss" });
    return new Response(JSON.stringify({ ok: false, error: "missing_path" }), { status: 400, headers });
  }

  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${GT_BASE}/${path}`);
  upstreamUrl.search = incomingUrl.search;

  const cacheKey = new Request(upstreamUrl.toString(), { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = decorateHeaders(corsHeaders, cached.headers);
    headers.set("x-wcwd-gt-cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { accept: GT_ACCEPT },
      cf: { cacheEverything: false },
    });
  } catch (error) {
    const headers = decorateHeaders(corsHeaders, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-wcwd-gt-cache": "error" });
    return new Response(JSON.stringify({ ok: false, error: "upstream_fetch_failed" }), { status: 502, headers });
  }

  if (upstream.ok) {
    const bodyText = await upstream.text();
    const headers = decorateHeaders(corsHeaders, upstream.headers);
    headers.set("cache-control", `public, max-age=${CACHE_TTL_SEC}`);
    headers.set("x-wcwd-gt-cache", "miss");
    const response = new Response(bodyText, { status: upstream.status, headers });
    await cache.put(cacheKey, response.clone());
    return response;
  }

  if (upstream.status === 429) {
    const stale = await cache.match(cacheKey);
    if (stale) {
      const headers = decorateHeaders(corsHeaders, stale.headers);
      headers.set("x-wcwd-gt-cache", "stale-429");
      return new Response(stale.body, { status: 200, headers });
    }
  }

  const errorText = await upstream.text().catch(() => "");
  const headers = decorateHeaders(corsHeaders, { "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8", "cache-control": "no-store", "x-wcwd-gt-cache": `error-${upstream.status}` });
  return new Response(errorText || JSON.stringify({ ok: false, error: "upstream_error" }), { status: upstream.status, headers });
}
