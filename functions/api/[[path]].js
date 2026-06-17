const UPSTREAM_ORIGIN = "https://wcwd-history.badjoke-lab.workers.dev";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TRUSTED_ORIGINS = new Set([
  "https://wcwd.badjoke-lab.com",
  "https://wcwd.pages.dev",
]);
const ALLOWED_GET_PATHS = new Set([
  "latest",
  "summary",
  "version",
  "list",
  "health",
  "events",
  "daily",
  "daily/latest",
  "series",
  "retention",
  "sell-impact/watchlist/latest",
  "sell-impact/watchlist/list",
  "world-chain/token-heatmap/latest",
  "world-chain/token-heatmap/meta",
  "viz/wormhole",
  "oracles/feed",
  "paymaster/preflight",
]);

function requestOrigin(request) {
  return String(request.headers.get("origin") || "").trim();
}

function isTrustedOrigin(request) {
  const origin = requestOrigin(request);
  return !origin || TRUSTED_ORIGINS.has(origin);
}

function proxyHeaders(request, pagesVersion, extra = {}) {
  const headers = new Headers(extra);
  const origin = requestOrigin(request);
  if (origin && TRUSTED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
  }
  headers.set("vary", "Origin");
  headers.set("x-wcwd-proxy", "pages");
  headers.set("x-wcwd-pages-version", pagesVersion);
  headers.set("cache-control", "no-store");
  return headers;
}

function json(request, pagesVersion, data, status) {
  const headers = proxyHeaders(request, pagesVersion, {
    "content-type": "application/json; charset=utf-8",
  });
  return new Response(JSON.stringify(data), { status, headers });
}

function normalizePath(params) {
  const value = params?.path;
  const path = Array.isArray(value) ? value.join("/") : String(value || "");
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    return "";
  }
  return path;
}

async function readLimitedBody(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error("upstream_response_too_large");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("upstream_response_too_large");
  }
  return bytes;
}

export async function onRequest({ request, params, env }) {
  const pagesVersion = env?.CF_PAGES_COMMIT_SHA || "unknown";
  const method = request.method.toUpperCase();

  if (!isTrustedOrigin(request)) {
    return json(request, pagesVersion, { ok: false, error: "origin_not_allowed" }, 403);
  }

  if (method === "OPTIONS") {
    const requestedMethod = String(request.headers.get("access-control-request-method") || "GET").toUpperCase();
    if (requestedMethod !== "GET") {
      return json(request, pagesVersion, { ok: false, error: "method_not_allowed" }, 405);
    }
    const headers = proxyHeaders(request, pagesVersion);
    headers.set("access-control-allow-methods", "GET, OPTIONS");
    headers.set("access-control-allow-headers", "accept, if-none-match");
    headers.set("access-control-max-age", "600");
    return new Response(null, { status: 204, headers });
  }

  if (method !== "GET") {
    return json(request, pagesVersion, { ok: false, error: "method_not_allowed" }, 405);
  }

  const path = normalizePath(params);
  if (!ALLOWED_GET_PATHS.has(path)) {
    return json(request, pagesVersion, { ok: false, error: "route_not_allowed" }, 404);
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`/api/${path}`, UPSTREAM_ORIGIN);
  targetUrl.search = incomingUrl.search;

  const forwardedHeaders = new Headers({ accept: "application/json" });
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) forwardedHeaders.set("if-none-match", ifNoneMatch.slice(0, 256));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: forwardedHeaders,
      redirect: "error",
      signal: controller.signal,
    });
    const body = await readLimitedBody(upstream);
    const responseHeaders = proxyHeaders(request, pagesVersion);
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType.slice(0, 128));
    const etag = upstream.headers.get("etag");
    if (etag) responseHeaders.set("etag", etag.slice(0, 256));
    return new Response(body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const reason = error?.name === "AbortError" ? "upstream_timeout" : error?.message || "upstream_fetch_failed";
    return json(request, pagesVersion, { ok: false, error: reason }, 502);
  } finally {
    clearTimeout(timer);
  }
}
