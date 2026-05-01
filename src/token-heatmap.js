const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_ACCEPT = "application/json;version=20230203";
const NETWORK = "world-chain";
const LATEST_KEY = "token-heatmap:latest";
const MAX_TOKENS = 40;
const CACHE_TTL_MS = 55 * 60 * 1000;

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

function shortAddr(addr) {
  const s = String(addr || "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function riskState({ liquidityUsd, volume24h, priceChange24h, updatedAt }) {
  if (!liquidityUsd && !volume24h) return "unknown";
  if (!updatedAt) return "unknown";
  if (liquidityUsd < 50000) return "thin-liquidity";
  if (Math.abs(priceChange24h) >= 30 && liquidityUsd < 250000) return "new-or-volatile";
  if (liquidityUsd < 150000) return "thin-liquidity";
  return "healthy";
}

function tokenFromPool(pool) {
  const a = pool?.attributes || {};
  const r = pool?.relationships || {};
  const baseId = r?.base_token?.data?.id || "";
  const quoteId = r?.quote_token?.data?.id || "";
  const baseAddr = parseTokenAddrFromId(baseId);
  const quoteAddr = parseTokenAddrFromId(quoteId);
  const name = String(a.name || a.pool_name || "").trim();
  const pair = name.split(/\s*\/\s*/);
  const baseSymbol = String(pair[0] || "TOKEN").replace(/\s+\d+(?:\.\d+)?%.*$/, "").trim();
  const quoteSymbol = String(pair[1] || "").replace(/\s+\d+(?:\.\d+)?%.*$/, "").trim();
  const volume24h = num(a.volume_usd?.h24);
  const liquidityUsd = num(a.reserve_in_usd);
  const priceChange24h = num(a.price_change_percentage?.h24);
  const fdv = num(a.fdv_usd || a.market_cap_usd);
  const address = baseAddr || quoteAddr;
  if (!address || !baseSymbol) return null;
  const updatedAt = a.updated_at || a.pool_created_at || null;
  const state = riskState({ liquidityUsd, volume24h, priceChange24h, updatedAt });
  return {
    symbol: baseSymbol,
    name: baseSymbol,
    address,
    pool: String(a.address || "").toLowerCase(),
    poolLabel: name || `${baseSymbol}${quoteSymbol ? ` / ${quoteSymbol}` : ""}`,
    priceUsd: num(a.base_token_price_usd),
    change24h: priceChange24h,
    volume24h,
    liquidityUsd,
    fdv,
    riskState: state,
    dataStatus: "fresh",
    updatedAt,
  };
}

function aggregateTokens(pools) {
  const byAddr = new Map();
  for (const pool of pools) {
    const token = tokenFromPool(pool);
    if (!token) continue;
    const key = token.address.toLowerCase();
    const prev = byAddr.get(key);
    if (!prev) {
      byAddr.set(key, token);
      continue;
    }
    prev.volume24h += token.volume24h;
    prev.liquidityUsd += token.liquidityUsd;
    prev.fdv = Math.max(prev.fdv || 0, token.fdv || 0);
    if ((token.volume24h || 0) > (prev.volume24h || 0)) {
      prev.pool = token.pool;
      prev.poolLabel = token.poolLabel;
      prev.priceUsd = token.priceUsd || prev.priceUsd;
      prev.change24h = token.change24h;
      prev.updatedAt = token.updatedAt || prev.updatedAt;
    }
    prev.riskState = riskState(prev);
  }
  return [...byAddr.values()]
    .filter((t) => t.volume24h > 0 || t.liquidityUsd > 0)
    .sort((a, b) => (b.volume24h - a.volume24h) || (b.liquidityUsd - a.liquidityUsd))
    .slice(0, MAX_TOKENS);
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

async function fetchTopPools() {
  const pages = [1, 2, 3];
  const out = [];
  for (const page of pages) {
    const url = `${GT_BASE}/networks/${NETWORK}/pools?page=${page}`;
    const res = await fetch(url, { headers: { accept: GT_ACCEPT } });
    if (!res.ok) throw new Error(`gt_http_${res.status}`);
    const body = await res.json();
    const rows = Array.isArray(body?.data) ? body.data : [];
    out.push(...rows);
  }
  return out;
}

function withStatus(payload, status, extra = {}) {
  return {
    ...payload,
    source: payload?.source || "cached_snapshot",
    status,
    stale: status === "stale",
    degraded: status === "degraded" || status === "stale",
    ...extra,
  };
}

function demoPayload(reason = "no_snapshot") {
  const tokens = [
    { symbol: "WLD", name: "Worldcoin", address: "0x2cfc85d8e48f8eab294be644d9e25c3030863003", pool: "", priceUsd: 0, change24h: 0, volume24h: 0, liquidityUsd: 0, fdv: 0, riskState: "unknown", dataStatus: "demo", updatedAt: null },
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

export async function getTokenHeatmapLatest(env, { refresh = false } = {}) {
  const cached = await readLatest(env);
  if (!refresh && cached && isFresh(cached)) return withStatus(cached, "fresh");

  try {
    const pools = await fetchTopPools();
    const tokens = aggregateTokens(pools);
    const payload = {
      ok: true,
      source: "live_snapshot",
      status: "fresh",
      modeDefaults: { mode: "market", count: MAX_TOKENS },
      updatedAt: new Date().toISOString(),
      count: tokens.length,
      excludedCount: Math.max(0, pools.length - tokens.length),
      tokens,
    };
    await writeLatest(env, payload);
    return payload;
  } catch (error) {
    if (cached) {
      return withStatus(cached, "stale", { reason: error?.message || "refresh_failed" });
    }
    return demoPayload(error?.message || "refresh_failed");
  }
}

export function getTokenHeatmapMeta() {
  return {
    ok: true,
    endpoint: "/api/world-chain/token-heatmap/latest",
    max_tokens: MAX_TOKENS,
    cache_ttl_min: Math.round(CACHE_TTL_MS / 60000),
    storage: "KV latest only",
    history: "none",
    raw_storage: false,
    notes: [
      "Top 40 compact snapshot only.",
      "No D1, no raw upstream body, no cron in HM-4.",
      "Failed refresh returns the last good snapshot as stale when available.",
    ],
  };
}
