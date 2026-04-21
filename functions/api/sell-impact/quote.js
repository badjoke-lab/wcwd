const NETWORK = "world-chain";
const GT_ACCEPT = "application/json;version=20230203";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "cache-control": "no-store",
    },
  });
}

function num(x) {
  const n = Number.parseFloat(String(x ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseTokenAddrFromId(id) {
  const s = String(id || "");
  const i = s.indexOf("_0x");
  if (i >= 0) return s.slice(i + 1).toLowerCase();
  if (s.startsWith("0x")) return s.toLowerCase();
  return "";
}

function inferReserves(reserveUsd, basePriceUsd, quotePriceUsd) {
  const half = reserveUsd / 2;
  const base = basePriceUsd > 0 ? half / basePriceUsd : 0;
  const quote = quotePriceUsd > 0 ? half / quotePriceUsd : 0;
  return { baseReserve: base, quoteReserve: quote };
}

function quoteImpact({ pool, sellAmount, sellTokenAddr }) {
  const fee = (pool.feeBps || 0) / 10000;
  const sellAddr = String(sellTokenAddr || "").trim().toLowerCase();
  let inSide;
  let outSide;
  if (sellAddr && pool.base.addr === sellAddr) {
    inSide = pool.base;
    outSide = pool.quote;
  } else if (sellAddr && pool.quote.addr === sellAddr) {
    inSide = pool.quote;
    outSide = pool.base;
  } else {
    inSide = pool.quote;
    outSide = pool.base;
  }
  const reserveIn = num(inSide.reserve);
  const reserveOut = num(outSide.reserve);
  if (!(reserveIn > 0 && reserveOut > 0 && sellAmount > 0)) {
    return { ok: false, reason: "no_liquidity_or_bad_input" };
  }
  const amountInEff = sellAmount * (1 - fee);
  const out = (reserveOut * amountInEff) / (reserveIn + amountInEff);
  const priceBefore = reserveOut / reserveIn;
  const priceAfter = (reserveOut - out) / (reserveIn + amountInEff);
  const impact = 1 - priceAfter / priceBefore;
  const outUsd = outSide.priceUsd ? out * outSide.priceUsd : 0;
  return {
    ok: true,
    inSymbol: inSide.symbol,
    outSymbol: outSide.symbol,
    outAmount: out,
    outUsd,
    impact,
    fee,
    priceBefore,
    priceAfter,
    inAddr: inSide.addr,
    outAddr: outSide.addr,
  };
}

async function fetchPoolSnapshot(requestOrigin, poolAddr) {
  const url = new URL(`/api/gt/networks/${NETWORK}/pools/${poolAddr}`, requestOrigin);
  const res = await fetch(url.toString(), { headers: { accept: GT_ACCEPT } });
  if (!res.ok) throw new Error(`pool_http_${res.status}`);
  const j = await res.json();
  const a = j?.data?.attributes || {};
  const r = j?.data?.relationships || {};
  const reserveUsd = num(a.reserve_in_usd);
  const basePriceUsd = num(a.base_token_price_usd);
  const quotePriceUsd = num(a.quote_token_price_usd);
  const baseId = r?.base_token?.data?.id || "";
  const quoteId = r?.quote_token?.data?.id || "";
  const baseAddr = parseTokenAddrFromId(baseId);
  const quoteAddr = parseTokenAddrFromId(quoteId);
  const name = String(a.name || "").trim();
  const m = name.match(/^(.+?)\s*\/\s*(.+?)(?:\s+\d|$)/);
  const symBase = (m?.[1] || "BASE").trim();
  const symQuote = (m?.[2] || "QUOTE").trim();
  let feeBps = 0;
  const pct = num(a.pool_fee_percentage);
  if (pct > 0) feeBps = Math.round(pct * 100);
  if (!feeBps) {
    const mm = name.match(/(\d+(?:\.\d+)?)%/);
    if (mm) feeBps = Math.round(Number(mm[1]) * 100);
  }
  const inferred = inferReserves(reserveUsd, basePriceUsd, quotePriceUsd);
  return {
    poolLabel: name || String(poolAddr || "").toLowerCase(),
    feeBps,
    reserveUsd,
    base: { symbol: symBase, addr: baseAddr, reserve: inferred.baseReserve, priceUsd: basePriceUsd },
    quote: { symbol: symQuote, addr: quoteAddr, reserve: inferred.quoteReserve, priceUsd: quotePriceUsd },
    raw: a,
  };
}

export async function onRequest(context) {
  const { request } = context;
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": request.headers.get("access-control-request-headers") || "content-type",
      },
    });
  }
  if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const tokenAddr = String(body?.tokenAddr || "").trim().toLowerCase();
  const poolAddr = String(body?.poolAddr || "").trim().toLowerCase();
  const sellAmount = Number(body?.sellAmount);
  if (!tokenAddr.startsWith("0x") || tokenAddr.length < 42) return json({ ok: false, error: "bad_token" }, 400);
  if (!poolAddr.startsWith("0x") || poolAddr.length < 42) return json({ ok: false, error: "bad_pool" }, 400);
  if (!(sellAmount > 0)) return json({ ok: false, error: "bad_amount" }, 400);

  try {
    const requestOrigin = new URL(request.url).origin;
    const pool = await fetchPoolSnapshot(requestOrigin, poolAddr);
    const quote = quoteImpact({ pool, sellAmount, sellTokenAddr: tokenAddr });
    return json({ ok: quote.ok, pool, quote, source: "worker-quote-v1" }, quote.ok ? 200 : 422);
  } catch (error) {
    return json({ ok: false, error: error?.message || "quote_failed" }, 502);
  }
}
