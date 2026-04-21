const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_ACCEPT = "application/json;version=20230203";
const NETWORK = "world-chain";
const WATCHLIST_LATEST_KEY = "sellimpact:watchlist:latest";
const WATCHLIST_LIST_KEY = "sellimpact:watchlist:list";
const WATCHLIST_LIST_MAX = 96;
const ANCHORS = {
  "USDC.e": "0x79a02482a880bce3f13e09da970dc34db4cd24d1",
};
const WATCHLIST = [
  { symbol: "WLD", tokenAddr: "0x2cfc85d8e48f8eab294be644d9e25c3030863003" },
  { symbol: "ORO", tokenAddr: "0xcd1e32b86953d79a6ac58e813d2ea7a1790cab63" },
  { symbol: "WDD", tokenAddr: "0xede54d9c024ee80c85ec0a75ed2d8774c7fbac9b" },
  { symbol: "ORB", tokenAddr: "0xf3f92a60e6004f3982f0fde0d43602fc0a30a0db" },
  { symbol: "WNB", tokenAddr: "0x094b7cf98a68c838e081f931b51d5598977cc042" },
];
const TARGETS = [0.01, 0.02, 0.05, 0.10];

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
  if (!(reserveIn > 0 && reserveOut > 0 && sellAmount > 0)) return { ok: false, reason: "no_liquidity_or_bad_input" };
  const amountInEff = sellAmount * (1 - fee);
  const out = (reserveOut * amountInEff) / (reserveIn + amountInEff);
  const priceBefore = reserveOut / reserveIn;
  const priceAfter = (reserveOut - out) / (reserveIn + amountInEff);
  const impact = 1 - priceAfter / priceBefore;
  return { ok: true, impact, outAmount: out, outSymbol: outSide.symbol, inSymbol: inSide.symbol };
}

function maxSellUnder(pool, sellTokenAddr, targetImpact) {
  const sellAddr = String(sellTokenAddr || "").trim().toLowerCase();
  const sellReserve = (sellAddr && pool.base.addr === sellAddr)
    ? pool.base.reserve
    : (sellAddr && pool.quote.addr === sellAddr)
      ? pool.quote.reserve
      : Math.max(pool.base.reserve, pool.quote.reserve);
  let lo = 0;
  let hi = Math.max(1, sellReserve);
  let best = 0;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    const q = quoteImpact({ pool, sellAmount: mid, sellTokenAddr });
    if (!q.ok) {
      hi = mid;
      continue;
    }
    if (q.impact <= targetImpact) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

function buildLadder(pool, tokenAddr) {
  return TARGETS.map((target) => ({ impact_pct: target * 100, max_sell: maxSellUnder(pool, tokenAddr, target) }));
}

async function safeLoadJson(env, key) {
  let raw = null;
  try {
    raw = await env.HIST.get(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchGtJson(path) {
  const url = `${GT_BASE}/${path}`;
  const res = await fetch(url, { headers: { accept: GT_ACCEPT } });
  if (!res.ok) throw new Error(`gt_http_${res.status}`);
  return await res.json();
}

async function listPoolsByToken(tokenAddr, preferredAnchor = "USDC.e") {
  const j = await fetchGtJson(`networks/${NETWORK}/tokens/${tokenAddr}/pools`);
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
      feeBps: (() => {
        const direct = num(a.pool_fee_percentage);
        if (direct > 0) return Math.round(direct * 100);
        const nm = String(a.name || a.pool_name || "").match(/(\d+(?:\.\d+)?)%/);
        return nm ? Math.round(Number(nm[1]) * 100) : 0;
      })(),
      baseAddr: parseTokenAddrFromId(baseId),
      quoteAddr: parseTokenAddrFromId(quoteId),
    };
  }).filter((x) => x.poolAddr && x.reserveUsd > 0 && x.vol24 > 0 && x.feeBps <= 1000);
  pools.sort((a, b) => (b.vol24 - a.vol24) || (b.reserveUsd - a.reserveUsd) || (a.feeBps - b.feeBps));
  const anchorAddr = (ANCHORS[preferredAnchor] || "").toLowerCase();
  const anchored = anchorAddr ? pools.filter((p) => p.baseAddr === anchorAddr || p.quoteAddr === anchorAddr) : [];
  return anchored.length ? anchored : pools;
}

async function fetchPoolSnapshot(poolAddr) {
  const j = await fetchGtJson(`networks/${NETWORK}/pools/${poolAddr}`);
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
    poolAddr: String(poolAddr || "").toLowerCase(),
    poolLabel: name || String(poolAddr || "").toLowerCase(),
    reserveUsd,
    feeBps,
    base: { symbol: symBase, addr: baseAddr, reserve: inferred.baseReserve, priceUsd: basePriceUsd },
    quote: { symbol: symQuote, addr: quoteAddr, reserve: inferred.quoteReserve, priceUsd: quotePriceUsd },
  };
}

async function buildWatchlistItem(item) {
  try {
    const pools = await listPoolsByToken(item.tokenAddr, "USDC.e");
    const top = pools.slice(0, 3);
    if (!top.length) {
      return { symbol: item.symbol, tokenAddr: item.tokenAddr, ok: false, error: "no_pools" };
    }
    const snapshots = [];
    for (const candidate of top) {
      try {
        const pool = await fetchPoolSnapshot(candidate.poolAddr);
        snapshots.push(pool);
      } catch {
        // skip broken pool
      }
    }
    if (!snapshots.length) {
      return { symbol: item.symbol, tokenAddr: item.tokenAddr, ok: false, error: "no_snapshots" };
    }
    const selected = snapshots[0];
    const selectedLadder = buildLadder(selected, item.tokenAddr);
    const conservative = TARGETS.map((target) => {
      const values = snapshots.map((pool) => maxSellUnder(pool, item.tokenAddr, target)).filter((v) => Number.isFinite(v));
      return { impact_pct: target * 100, max_sell: values.length ? Math.min(...values) : null };
    });
    const selected5 = selectedLadder.find((x) => x.impact_pct === 5)?.max_sell ?? null;
    const conservative5 = conservative.find((x) => x.impact_pct === 5)?.max_sell ?? null;
    return {
      symbol: item.symbol,
      tokenAddr: item.tokenAddr,
      ok: true,
      selected_pool: { poolAddr: selected.poolAddr, poolLabel: selected.poolLabel, reserveUsd: selected.reserveUsd },
      selected_5pct_max: selected5,
      conservative_5pct_max: conservative5,
      selected_ladder: selectedLadder,
      conservative,
    };
  } catch (error) {
    return { symbol: item.symbol, tokenAddr: item.tokenAddr, ok: false, error: error?.message || "watchlist_failed" };
  }
}

export async function updateSellImpactWatchlist(env) {
  const ts = new Date().toISOString();
  const items = [];
  for (const item of WATCHLIST) {
    items.push(await buildWatchlistItem(item));
  }
  const payload = { ok: true, ts, items };
  await env.HIST.put(WATCHLIST_LATEST_KEY, JSON.stringify(payload));
  const existing = (await safeLoadJson(env, WATCHLIST_LIST_KEY)) || [];
  const next = Array.isArray(existing) ? existing.concat(payload) : [payload];
  const trimmed = next.length > WATCHLIST_LIST_MAX ? next.slice(next.length - WATCHLIST_LIST_MAX) : next;
  await env.HIST.put(WATCHLIST_LIST_KEY, JSON.stringify(trimmed));
  return payload;
}

export async function getSellImpactWatchlistLatest(env) {
  return await safeLoadJson(env, WATCHLIST_LATEST_KEY);
}

export async function getSellImpactWatchlistList(env, limit = 24) {
  const list = (await safeLoadJson(env, WATCHLIST_LIST_KEY)) || [];
  if (!Array.isArray(list)) return [];
  if (list.length <= limit) return list;
  return list.slice(list.length - limit);
}
