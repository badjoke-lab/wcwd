const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_ACCEPT = "application/json;version=20230203";
const NETWORK = "world-chain";
const LATEST_KEY = "token-heatmap:latest";
const MAX_TOKENS = 40;
const CACHE_TTL_MS = 55 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6500;
const PAGE_COUNT = 3;

function num(value) {
  const n = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseTokenAddrFromId(id) {
  const s = String(id || "");
  const i = s.indexOf("_0x");
  if (i >= 0) return s.slice(i + 1).toLowerCase();
  if (s.startsWith("0x")) return s.toLowerCase();
  return "";
}

function cleanSymbol(value) {
  return String(value || "TOKEN")
    .replace(/\s+\d+(?:\.\d+)?%.*$/, "")
    .trim() || "TOKEN";
}

function parsePairName(name) {
  const pair = String(name || "").split(/\s*\/\s*/);
  return {
    baseSymbol: cleanSymbol(pair[0]),
    quoteSymbol: cleanSymbol(pair[1] || ""),
  };
}

function capValue(marketCapUsd, fdvUsd) {
  if (marketCapUsd > 0) return { capUsd: marketCapUsd, capSource: "market_cap_usd" };
  if (fdvUsd > 0) return { capUsd: fdvUsd, capSource: "fdv_usd" };
  return { capUsd: 0, capSource: "missing" };
}

function riskState({ liquidityUsd, volume24h, priceChange24h, updatedAt }) {
  if (!liquidityUsd && !volume24h) return "unknown";
  if (!updatedAt) return "unknown";
  if (liquidityUsd < 50000) return "thin-liquidity";
  if (Math.abs(priceChange24h) >= 30 && liquidityUsd < 250000) return "new-or-volatile";
  if (liquidityUsd < 150000) return "thin-liquidity";
  return "healthy";
}

function normalizePool(pool) {
  const a = pool?.attributes || {};
  const r = pool?.relationships || {};
  const baseAddr = parseTokenAddrFromId(r?.base_token?.data?.id || "");
  const quoteAddr = parseTokenAddrFromId(r?.quote_token?.data?.id || "");
  const name = String(a.name || a.pool_name || "").trim();
  const { baseSymbol, quoteSymbol } = parsePairName(name);
  const volume24h = num(a.volume_usd?.h24);
  const liquidityUsd = num(a.reserve_in_usd);
  const priceChange24h = num(a.price_change_percentage?.h24);
  const marketCapUsd = num(a.market_cap_usd);
  const fdvUsd = num(a.fdv_usd);
  const cap = capValue(marketCapUsd, fdvUsd);
  const updatedAt = a.updated_at || a.pool_created_at || null;
  if (!baseAddr || !baseSymbol) return null;
  return {
    symbol: baseSymbol,
    name: baseSymbol,
    address: baseAddr,
    quoteAddress: quoteAddr,
    pool: String(a.address || "").toLowerCase(),
    poolLabel: name || `${baseSymbol}${quoteSymbol ? ` / ${quoteSymbol}` : ""}`,
    priceUsd: num(a.base_token_price_usd),
    change24h: priceChange24h,
    volume24h,
    liquidityUsd,
    marketCapUsd,
    fdvUsd,
    capUsd: cap.capUsd,
    capSource: cap.capSource,
    // Backward compatibility for old frontend snapshots.
    fdv: cap.capUsd,
    riskState: riskState({ liquidityUsd, volume24h, priceChange24h, updatedAt }),
    dataStatus: "fresh",
    updatedAt,
  };
}

function mergeToken(prev, next) {
  const merged = { ...prev };
  merged.volume24h += next.volume24h;
  merged.liquidityUsd += next.liquidityUsd;
  merged.marketCapUsd = Math.max(merged.marketCapUsd || 0, next.marketCapUsd || 0);
  merged.fdvUsd = Math.max(merged.fdvUsd || 0, next.fdvUsd || 0);
  const cap = capValue(merged.marketCapUsd, merged.fdvUsd);
  merged.capUsd = cap.capUsd;
  merged.capSource = cap.capSource;
  merged.fdv = merged.capUsd;
  const nextIsBetterPool = (next.volume24h > prev._bestPoolVolume) ||
    (next.volume24h === prev._bestPoolVolume && next.liquidityUsd > prev._bestPoolLiquidity);
  if (nextIsBetterPool) {
    merged.pool = next.pool;
    merged.poolLabel = next.poolLabel;
    merged.priceUsd = next.priceUsd || merged.priceUsd;
    merged.change24h = next.change24h;
    merged.updatedAt = next.updatedAt || merged.updatedAt;
    merged._bestPoolVolume = next.volume24h;
    merged._bestPoolLiquidity = next.liquidityUsd;
  }
  merged.riskState = riskState({
    liquidityUsd: merged.liquidityUsd,
    volume24h: merged.volume24h,
    priceChange24h: merged.change24h,
    updatedAt: merged.updatedAt,
  });
  return merged;
}

function stripInternal(token) {
  const { _bestPoolVolume, _bestPoolLiquidity, quoteAddress, ...rest } = token;
  return rest;
}

function aggregateTokens(pools) {
  const byAddr = new Map();
  for (const pool of pools) {
    const token = normalizePool(pool);
    if (!token) continue;
    const key = token.address.toLowerCase();
    const withInternal = {
      ...token,
      _bestPoolVolume: token.volume24h,
      _bestPoolLiquidity: token.liquidityUsd,
    };
    const prev = byAddr.get(key);
    byAddr.set(key, prev ? mergeToken(prev, withInternal) : withInternal);
  }
  return [...byAddr.values()]
    .filter((t) => t.capUsd > 0 || t.volume24h > 0 || t.liquidityUsd > 0)
    .sort((a, b) => (b.capUsd - a.capUsd) || (b.volume24h - a.volume24h) || (b.liquidityUsd - a.liquidityUsd))
    .slice(0, MAX_TOKENS)
    .map(stripInternal);
}

async function readLatest(env) {
  try {
    const raw = await env.HIST.get(LATEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeLatest(env, payload) {
  await env.HIST.put(LATEST_KEY, JSON.stringify(payload));
}

function isFresh(payload) {
  const ts = Date.parse(payload?.updatedAt || "");
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < CACHE_TTL_MS;
}

async function fetchGtJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${GT_BASE}/${path}`, {
      headers: { accept: GT_ACCEPT },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`gt_http_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTopPools() {
  const pools = [];
  const errors = [];
  for (let page = 1; page <= PAGE_COUNT; page += 1) {
    try {
      const body = await fetchGtJson(`networks/${NETWORK}/pools?page=${page}`);
      const rows = Array.isArray(body?.data) ? body.data : [];
      pools.push(...rows);
    } catch (error) {
      errors.push(`page_${page}:${error?.message || "fetch_failed"}`);
      if (page === 1) throw new Error(errors.join(","));
      break;
    }
  }
  return { pools, errors };
}

function classifyStatus({ tokens, errors }) {
  if (!tokens.length) return "degraded";
  if (errors.length) return "partial";
  return "fresh";
}

function withStatus(payload, status, extra = {}) {
  return {
    ...payload,
    source: payload?.source || "cached_snapshot",
    status,
    stale: status === "stale",
    degraded: status === "degraded" || status === "stale" || status === "partial",
    ...extra,
  };
}

function demoPayload(reason = "no_snapshot") {
  const tokens = [
    { symbol: "WLD", name: "Worldcoin", address: "0x2cfc85d8e48f8eab294be644d9e25c3030863003", pool: "", priceUsd: 0, change24h: 0, volume24h: 0, liquidityUsd: 0, marketCapUsd: 0, fdvUsd: 0, capUsd: 0, capSource: "missing", fdv: 0, riskState: "unknown", dataStatus: "demo", updatedAt: null },
  ];
  return {
    ok: true,
    source: "demo_fallback",
    status: "demo",
    stale: false,
    degraded: true,
    reason,
    modeDefaults: { mode: "market", count: MAX_TOKENS },
    updatedAt: new Date().toISOString(),
    count: tokens.length,
    excludedCount: 0,
    tokens,
  };
}

export async function getTokenHeatmapLatest(env) {
  const cached = await readLatest(env);
  if (cached && isFresh(cached)) return withStatus(cached, cached.status || "fresh", { source: "cached_snapshot" });

  try {
    const { pools, errors } = await fetchTopPools();
    const tokens = aggregateTokens(pools);
    if (!tokens.length) throw new Error("no_drawable_tokens");
    const status = classifyStatus({ tokens, errors });
    const payload = {
      ok: true,
      source: "live_snapshot",
      status,
      stale: false,
      degraded: status !== "fresh",
      reason: errors.length ? errors.join(",") : "ok",
      modeDefaults: { mode: "market", count: MAX_TOKENS },
      metricDefaults: { area: "capUsd", color: "change24h", cap_source_order: ["market_cap_usd", "fdv_usd"] },
      updatedAt: new Date().toISOString(),
      count: tokens.length,
      excludedCount: Math.max(0, pools.length - tokens.length),
      upstream: { pages_requested: PAGE_COUNT, pools_seen: pools.length, errors },
      tokens,
    };
    await writeLatest(env, payload);
    return payload;
  } catch (error) {
    if (cached) {
      return withStatus(cached, "stale", { source: "cached_snapshot", reason: error?.message || "refresh_failed" });
    }
    return demoPayload(error?.message || "refresh_failed");
  }
}

export function getTokenHeatmapMeta() {
  return {
    ok: true,
    endpoint: "/api/world-chain/token-heatmap/latest",
    max_tokens: MAX_TOKENS,
    default_area_metric: "capUsd",
    cap_source_order: ["market_cap_usd", "fdv_usd"],
    cache_ttl_min: Math.round(CACHE_TTL_MS / 60000),
    upstream: {
      source: "GeckoTerminal public API",
      network: NETWORK,
      pages_requested: PAGE_COUNT,
      timeout_ms: FETCH_TIMEOUT_MS,
    },
    storage: "KV latest only",
    history: "none",
    raw_storage: false,
    public_refresh: false,
    notes: [
      "Market mode area uses market_cap_usd when available, then fdv_usd.",
      "Top 40 compact snapshot only.",
      "No D1, no raw upstream body, no cron in HM-15.",
      "Public refresh query is disabled to avoid external API abuse.",
      "Failed refresh returns the last good snapshot as stale when available.",
    ],
  };
}
