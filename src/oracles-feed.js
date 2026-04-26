const SEL_DECIMALS = "0x313ce567";
const SEL_LATEST = "0xfeaf968c";

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function strip0x(value) {
  const s = String(value || "");
  return s.startsWith("0x") ? s.slice(2) : s;
}

function chunks64(hex) {
  const s = strip0x(hex);
  const out = [];
  for (let i = 0; i < s.length; i += 64) out.push(s.slice(i, i + 64));
  return out;
}

function hexToBigInt(hex) {
  const s = strip0x(hex || "0");
  if (!s) return 0n;
  return BigInt("0x" + s);
}

function hexToSignedBigInt(hex) {
  const x = hexToBigInt(hex);
  const two255 = 1n << 255n;
  const two256 = 1n << 256n;
  return x >= two255 ? x - two256 : x;
}

function formatScaled(answer, decimals) {
  const neg = answer < 0n;
  const value = neg ? -answer : answer;
  const d = BigInt(decimals);
  const base = 10n ** d;
  const whole = value / base;
  const frac = value % base;
  let fracText = frac.toString().padStart(Number(d), "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${fracText ? "." + fracText : ""}`;
}

function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function parseRpcUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return { ok: false, error: "rpc_must_be_https" };
    if (isBlockedHost(url.hostname)) return { ok: false, error: "rpc_host_blocked" };
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: "invalid_rpc_url" };
  }
}

async function rpcCall(rpcUrl, to, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok) throw new Error(`http_${res.status}`);
    if (body?.error) throw new Error(`rpc_error_${body.error.code || "unknown"}`);
    if (typeof body?.result !== "string") throw new Error("missing_result");
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function buildUnavailable(error, input = {}) {
  return {
    ok: false,
    source: "same-origin",
    state: "unavailable",
    generated_at: new Date().toISOString(),
    feed: input.feed || "",
    rpc_host: input.rpc_host || "",
    result: null,
    notes: [String(error || "oracle_unavailable")],
    retention: { recent_points: 0, stored: false },
  };
}

export async function handleOracleFeed(request) {
  const url = new URL(request.url);
  const feed = String(url.searchParams.get("feed") || "").trim();
  const rpcParsed = parseRpcUrl(url.searchParams.get("rpc"));
  const rpcHost = rpcParsed.ok ? new URL(rpcParsed.url).hostname : "";

  if (!isAddress(feed)) {
    return json(buildUnavailable("invalid_feed_address", { feed, rpc_host: rpcHost }), { status: 400 });
  }
  if (!rpcParsed.ok) {
    return json(buildUnavailable(rpcParsed.error, { feed, rpc_host: rpcHost }), { status: 400 });
  }

  try {
    const decHex = await rpcCall(rpcParsed.url, feed, SEL_DECIMALS);
    const decimals = Number(hexToBigInt(chunks64(decHex)[0] || "0"));
    const latestHex = await rpcCall(rpcParsed.url, feed, SEL_LATEST);
    const c = chunks64(latestHex);
    const roundId = hexToBigInt(c[0] || "0");
    const answer = hexToSignedBigInt(c[1] || "0");
    const startedAt = hexToBigInt(c[2] || "0");
    const updatedAt = hexToBigInt(c[3] || "0");
    const answeredInRound = hexToBigInt(c[4] || "0");
    const updatedAtNum = Number(updatedAt);
    const ageSec = Number.isFinite(updatedAtNum) && updatedAtNum > 0 ? Math.max(0, Math.floor(Date.now() / 1000 - updatedAtNum)) : null;
    const state = ageSec == null ? "degraded" : ageSec > 86400 ? "stale" : "fresh";

    return json({
      ok: true,
      source: "same-origin",
      state,
      generated_at: new Date().toISOString(),
      feed: feed.toLowerCase(),
      rpc_host: rpcHost,
      result: {
        decimals,
        roundId: roundId.toString(),
        answer_raw: answer.toString(),
        answer_scaled: formatScaled(answer, decimals),
        startedAt: startedAt.toString(),
        updatedAt: updatedAt.toString(),
        answeredInRound: answeredInRound.toString(),
        age_sec: ageSec,
      },
      notes: state === "stale" ? ["feed_updated_at_older_than_24h"] : [],
      retention: { recent_points: 0, stored: false },
    });
  } catch (error) {
    return json(buildUnavailable(error?.message || "oracle_fetch_failed", { feed, rpc_host: rpcHost }), { status: 200 });
  }
}
