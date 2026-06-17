const SEL_DECIMALS = "0x313ce567";
const SEL_LATEST = "0xfeaf968c";
const WORLDCHAIN_RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public";
const RPC_RESPONSE_MAX_BYTES = 64 * 1024;
const TRUSTED_ORIGINS = new Set([
  "https://wcwd.badjoke-lab.com",
  "https://wcwd.pages.dev",
]);

function responseHeaders(request, initHeaders = {}) {
  const headers = new Headers(initHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("vary", "Origin");
  const origin = request.headers.get("origin");
  if (origin && TRUSTED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
  }
  return headers;
}

function json(request, data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: responseHeaders(request, init.headers),
  });
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function strip0x(value) {
  const text = String(value || "");
  return text.startsWith("0x") ? text.slice(2) : text;
}

function chunks64(hex) {
  const text = strip0x(hex);
  const output = [];
  for (let index = 0; index < text.length; index += 64) output.push(text.slice(index, index + 64));
  return output;
}

function hexToBigInt(hex) {
  const text = strip0x(hex || "0");
  return text ? BigInt(`0x${text}`) : 0n;
}

function hexToSignedBigInt(hex) {
  const value = hexToBigInt(hex);
  const two255 = 1n << 255n;
  const two256 = 1n << 256n;
  return value >= two255 ? value - two256 : value;
}

function formatScaled(answer, decimals) {
  const negative = answer < 0n;
  const value = negative ? -answer : answer;
  const digits = BigInt(decimals);
  const base = 10n ** digits;
  const whole = value / base;
  const fraction = value % base;
  const fractionText = fraction.toString().padStart(Number(digits), "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fractionText ? `.${fractionText}` : ""}`;
}

async function readRpcJson(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > RPC_RESPONSE_MAX_BYTES) {
    throw new Error("rpc_response_too_large");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > RPC_RESPONSE_MAX_BYTES) {
    throw new Error("rpc_response_too_large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("rpc_invalid_json");
  }
}

async function rpcCall(to, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(WORLDCHAIN_RPC_URL, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
    });
    const body = await readRpcJson(response);
    if (!response.ok) throw new Error(`rpc_http_${response.status}`);
    if (body?.error) throw new Error(`rpc_error_${body.error.code || "unknown"}`);
    if (typeof body?.result !== "string") throw new Error("rpc_missing_result");
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function buildUnavailable(error, feed = "") {
  return {
    ok: false,
    source: "wcwd_fixed_worldchain_rpc",
    state: "unavailable",
    generated_at: new Date().toISOString(),
    feed,
    rpc_host: new URL(WORLDCHAIN_RPC_URL).hostname,
    result: null,
    notes: [String(error || "oracle_unavailable")],
    retention: { stored: false, reason: "public_get_is_read_only" },
  };
}

export async function handleOracleFeed(request) {
  const url = new URL(request.url);
  const feed = String(url.searchParams.get("feed") || "").trim();

  if (url.searchParams.has("rpc")) {
    return json(request, buildUnavailable("caller_rpc_not_supported", feed), { status: 400 });
  }
  if (!isAddress(feed)) {
    return json(request, buildUnavailable("invalid_feed_address", feed), { status: 400 });
  }

  try {
    const decimalsHex = await rpcCall(feed, SEL_DECIMALS);
    const decimals = Number(hexToBigInt(chunks64(decimalsHex)[0] || "0"));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      throw new Error("invalid_feed_decimals");
    }

    const latestHex = await rpcCall(feed, SEL_LATEST);
    const chunks = chunks64(latestHex);
    if (chunks.length < 5) throw new Error("invalid_latest_round_data");

    const roundId = hexToBigInt(chunks[0] || "0");
    const answer = hexToSignedBigInt(chunks[1] || "0");
    const startedAt = hexToBigInt(chunks[2] || "0");
    const updatedAt = hexToBigInt(chunks[3] || "0");
    const answeredInRound = hexToBigInt(chunks[4] || "0");
    const updatedAtNumber = Number(updatedAt);
    const ageSeconds = Number.isFinite(updatedAtNumber) && updatedAtNumber > 0
      ? Math.max(0, Math.floor(Date.now() / 1000 - updatedAtNumber))
      : null;
    const state = ageSeconds == null ? "degraded" : ageSeconds > 86400 ? "stale" : "fresh";

    return json(request, {
      ok: true,
      source: "wcwd_fixed_worldchain_rpc",
      state,
      generated_at: new Date().toISOString(),
      feed: feed.toLowerCase(),
      rpc_host: new URL(WORLDCHAIN_RPC_URL).hostname,
      result: {
        decimals,
        roundId: roundId.toString(),
        answer_raw: answer.toString(),
        answer_scaled: formatScaled(answer, decimals),
        startedAt: startedAt.toString(),
        updatedAt: updatedAt.toString(),
        answeredInRound: answeredInRound.toString(),
        age_sec: ageSeconds,
      },
      notes: state === "stale" ? ["feed_updated_at_older_than_24h"] : [],
      retention: { stored: false, reason: "public_get_is_read_only" },
    });
  } catch (error) {
    return json(request, buildUnavailable(error?.name === "AbortError" ? "rpc_timeout" : error?.message, feed));
  }
}
