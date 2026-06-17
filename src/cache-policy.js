const STATIC_METADATA = new Set([
  "/api/version",
  "/api/retention",
  "/api/world-chain/token-heatmap/meta",
]);
const FAST_READS = new Set([
  "/health",
  "/api/latest",
  "/api/summary",
  "/api/health",
]);
const HISTORY_READS = new Set([
  "/api/list",
  "/api/events",
  "/api/daily",
  "/api/daily/latest",
  "/api/series",
  "/api/sell-impact/watchlist/latest",
  "/api/sell-impact/watchlist/list",
]);

export function routeCacheControl(pathname, method = "GET", status = 200) {
  if (String(method).toUpperCase() !== "GET" || status < 200 || status >= 300) return "no-store";
  if (STATIC_METADATA.has(pathname)) return "public, max-age=300, s-maxage=300, stale-while-revalidate=600";
  if (FAST_READS.has(pathname)) return "public, max-age=15, s-maxage=30, stale-while-revalidate=60";
  if (HISTORY_READS.has(pathname)) return "public, max-age=30, s-maxage=60, stale-while-revalidate=120";
  return "no-store";
}

export function applyRouteCache(response, pathname, method = "GET") {
  const headers = new Headers(response.headers);
  const policy = routeCacheControl(pathname, method, response.status);
  headers.set("cache-control", policy);
  headers.set("x-wcwd-cache-policy", policy === "no-store" ? "no-store" : "bounded-read");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
