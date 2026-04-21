const NETWORK = "world-chain";
const GT_ACCEPT = "application/json;version=20230203";
const ANCHORS = {
  "USDC.e": "0x79a02482a880bce3f13e09da970dc34db4cd24d1",
  WETH: "0x4200000000000000000000000000000000000006",
};

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
    inAddr: inSide.addr,
    outAddr: outSide.addr,
  };
}

async function fetchGtJson(requestOrigin, path) {
  const url = new URL(`/api/gt/${path}`, requestOrigin);
  const res = await fetch(url.toString(), { headers: { accept: GT_ACCEPT } });
  if (!res.ok) throw new Error(`gt_http_${res.status}`);
  return await res.json();
}

async function listPoolsByToken(requestOrigin, tokenAddr, preferredAnchor) {
  const j = await fetchGtJson(requestOrigin, `networks/${NETWORK}/tokens/${tokenAddr}/pools`);
  const data = Array.isArray(j?.data) ? j.data : [];
  const pools = data.map((d) => {
    const a = d?.attributes || {};
    const r = d?.relationships || {};
    const baseId = r?.base_token?.data?.id || "";
    const quoteId = r?.quote_token?.data?.id || "";
    return {
      poolAddr: String(a.address || "").toLowerCase(),
      name: String(a.name || a.pool_name || "").trim(),
      reserveUsd: num(a.reserve_in_usd),
      vol24: num(a.volume_usd?.h24),
      feePct: (() => {
        const direct = num(a.pool_fee_percentage);
        if (direct > 0) return direct;
        const nm = String(a.name || a.pool_name || "").match(/(\d+(?:\.\d+)?)%/);
        return nm ? Number(nm[1]) : 0;
      })(),
      feeBps: (() => {
        const direct = num(a.pool_fee_percentage);
        if (direct > 0) return Math.round(direct * 100);
        const nm = String(a.name || a.pool_name || "").match(/(\d+(?:\.\d+)?)%/);
        return nm ? Math.round(Number(nm[1]) * 100) : 0;
      })(),
      dexId: String(r?.dex?.data?.id || ""),
      baseAddr: parseTokenAddrFromId(baseId),
      quoteAddr: parseTokenAddrFromId(quoteId),
    };
  }).filter((x) => x.poolAddr && x.reserveUsd > 0 && x.vol24 > 0 && x.feeBps <= 1000);

  pools.sort((a, b) => (b.vol24 - a.vol24) || (b.reserveUsd - a.reserveUsd) || (a.feeBps - b.feeBps));
  const anchorAddr = (ANCHORS[preferredAnchor] || "").toLowerCase();
  const anchored = anchorAddr ? pools.filter((p) => p.baseAddr === anchorAddr || p.quoteAddr === anchorAddr) : [];
  return anchored.length ? anchored : pools;
}

async function fetchPoolSnapshot(requestOrigin, poolAddr) {
  const j = await fetchGtJson(requestOrigin, `networks/${NETWORK}/pools/${poolAddr}`);
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
  const sellAmount = Number(body?.sellAmount);
  const preferredAnchor = String(body?.preferredAnchor || "USDC.e").trim();
  const maxPools = Math.min(5, Math.max(2, Number(body?.maxPools) || 3));
  if (!tokenAddr.startsWith("0x") || tokenAddr.length < 42) return json({ ok: false, error: "bad_token" }, 400);
  if (!(sellAmount > 0)) return json({ ok: false, error: "bad_amount" }, 400);

  try {
    const requestOrigin = new URL(request.url).origin;
    const candidates = await listPoolsByToken(requestOrigin, tokenAddr, preferredAnchor);
    const selected = candidates.slice(0, maxPools);
    const evaluated = [];
    for (const candidate of selected) {
      try {
        const pool = await fetchPoolSnapshot(requestOrigin, candidate.poolAddr);
        const quote = quoteImpact({ pool, sellAmount, sellTokenAddr: tokenAddr });
        if (!quote.ok) continue;
        evaluated.push({
          poolAddr: candidate.poolAddr,
          poolLabel: pool.poolLabel,
          reserveUsd: pool.reserveUsd,
          vol24: candidate.vol24,
          feeBps: pool.feeBps,
          dexId: candidate.dexId,
          outSymbol: quote.outSymbol,
          outAmount: quote.outAmount,
          outUsd: quote.outUsd,
          impact: quote.impact,
        });
      } catch (error) {
        // skip broken candidate
      }
    }
    if (!evaluated.length) return json({ ok: false, error: "no_viable_pools" }, 422);

    const bestOut = evaluated.slice().sort((a, b) => (b.outUsd - a.outUsd) || (a.impact - b.impact))[0];
    const bestImpact = evaluated.slice().sort((a, b) => (a.impact - b.impact) || (b.outUsd - a.outUsd))[0];

    return json({
      ok: true,
      tokenAddr,
      sellAmount,
      preferredAnchor,
      pools: evaluated,
      summary: {
        best_out_pool: bestOut,
        best_impact_pool: bestImpact,
      },
      source: "worker-compare-v1",
    });
  } catch (error) {
    return json({ ok: false, error: error?.message || "compare_failed" }, 502);
  }
}
