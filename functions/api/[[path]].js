const UPSTREAM_BASE = "https://wcwd-history.badjoke-lab.workers.dev/api";

function buildCorsHeaders(request) {
  const headers = new Headers();
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  const reqHeaders = request.headers.get("access-control-request-headers");
  if (reqHeaders) headers.set("access-control-allow-headers", reqHeaders);
  return headers;
}

export async function onRequest({ request, params }) {
  const method = request.method.toUpperCase();
  if (!["GET", "POST", "OPTIONS"].includes(method)) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const corsHeaders = buildCorsHeaders(request);
  if (method === "OPTIONS") {
    corsHeaders.set("cache-control", "no-store");
    corsHeaders.set("x-wcwd-proxy", "pages");
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const pathParam = params?.path;
  const path = Array.isArray(pathParam) ? pathParam.join("/") : (pathParam || "");
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${UPSTREAM_BASE}/${path}`);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");

  let body = null;
  if (method !== "GET" && method !== "HEAD") {
    body = request.body;
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method,
      headers,
      body,
    });
  } catch (error) {
    const errHeaders = buildCorsHeaders(request);
    errHeaders.set("cache-control", "no-store");
    errHeaders.set("x-wcwd-proxy", "pages");
    return new Response(
      JSON.stringify({ ok: false, error: "upstream_fetch_failed" }),
      { status: 502, headers: errHeaders },
    );
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const [key, value] of corsHeaders.entries()) {
    responseHeaders.set(key, value);
  }
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-wcwd-proxy", "pages");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
