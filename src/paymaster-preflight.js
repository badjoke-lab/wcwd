const WORLDCHAIN_RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public";
const MAX_BYTES = 65536;
const TRUSTED_ORIGINS = new Set(["https://wcwd.badjoke-lab.com", "https://wcwd.pages.dev"]);

function headersFor(request, extra = {}) {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("vary", "Origin");
  const origin = request.headers.get("origin");
  if (origin && TRUSTED_ORIGINS.has(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(request, data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), { ...init, headers: headersFor(request, init.headers) });
}

async function parseRpcResponse(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error("rpc_response_too_large");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error("rpc_response_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("rpc_invalid_json");
  }
}

async function rpcCall(method, params = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(WORLDCHAIN_RPC_URL, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = await parseRpcResponse(response);
    if (!response.ok) throw new Error(`rpc_http_${response.status}`);
    if (body?.error) throw new Error(`rpc_error_${body.error.code || "unknown"}`);
    if (body?.result == null) throw new Error("rpc_missing_result");
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function toGwei(value) {
  try {
    return Number(BigInt(value || "0x0")) / 1e9;
  } catch {
    return null;
  }
}

function payload({ ok, state, rpc = null, notes = [] }) {
  return {
    ok,
    source: "wcwd_fixed_worldchain_rpc",
    state,
    generated_at: new Date().toISOString(),
    rpc,
    sponsor: {
      provided: false,
      valid: false,
      host: "",
      note: "server_side_sponsor_url_checks_disabled",
    },
    notes: Array.from(new Set(notes.map(String).filter(Boolean))),
    retention: { stored: false, reason: "public_get_is_read_only" },
  };
}

export async function handlePaymasterPreflight(request) {
  const url = new URL(request.url);
  if (url.searchParams.has("rpc") || url.searchParams.has("sponsor")) {
    return json(request, payload({
      ok: false,
      state: "unavailable",
      notes: ["caller_external_urls_not_supported"],
    }), { status: 400 });
  }

  const host = new URL(WORLDCHAIN_RPC_URL).hostname;
  try {
    const chainId = await rpcCall("eth_chainId");
    const gasPrice = await rpcCall("eth_gasPrice");
    const gasPriceGwei = toGwei(gasPrice);
    const expectedChainId = "0x1e0";
    const chainMatches = String(chainId || "").toLowerCase() === expectedChainId;
    const notes = [];
    if (!chainMatches) notes.push("unexpected_chain_id");
    if (gasPriceGwei == null) notes.push("invalid_gas_price");
    const ok = chainMatches && gasPriceGwei != null;
    return json(request, payload({
      ok,
      state: ok ? "fresh" : "degraded",
      rpc: { host, chainId, expectedChainId, chainMatches, gasPrice, gasPriceGwei, ok },
      notes,
    }));
  } catch (error) {
    const reason = error?.name === "AbortError" ? "rpc_timeout" : error?.message || "rpc_failed";
    return json(request, payload({
      ok: false,
      state: "unavailable",
      rpc: { host, ok: false, error: reason },
      notes: [reason],
    }));
  }
}
