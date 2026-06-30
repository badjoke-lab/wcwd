const LATEST_KEY = "token-heatmap:latest";
const MAX_TOKENS = 40;
const STALE_AFTER_MS = 60 * 60 * 1000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validTimestamp(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeToken(token) {
  const address = String(token?.address || "").trim().toLowerCase();
  const symbol = String(token?.symbol || "").trim();
  const name = String(token?.name || "").trim();
  const sourceUrl = String(token?.sourceUrl || token?.source?.url || "").trim();
  const updatedAt = validTimestamp(token?.updatedAt);
  if (!ADDRESS.test(address) || Number(token?.chainId) !== 480 || !symbol || !name || !sourceUrl.startsWith("https://") || !updatedAt) return null;
  const metrics = {
    priceUsd: finite(token.priceUsd),
    change24h: finite(token.change24h),
    volume24h: finite(token.volume24h),
    liquidityUsd: finite(token.liquidityUsd),
    marketCapUsd: finite(token.marketCapUsd),
    fdvUsd: finite(token.fdvUsd),
    capUsd: finite(token.capUsd),
  };
  if (![metrics.capUsd, metrics.volume24h, metrics.liquidityUsd].some((value) => Number.isFinite(value) && value > 0)) return null;
  return {
    symbol,
    name,
    chainId: 480,
    address,
    sourceUrl,
    pool: ADDRESS.test(String(token?.pool || "")) ? String(token.pool).toLowerCase() : null,
    ...metrics,
    capSource: ["market_cap_usd", "fdv_usd"].includes(token?.capSource) ? token.capSource : "missing",
    riskState: String(token?.riskState || "unknown"),
    dataStatus: String(token?.dataStatus || token?.status || "unknown"),
    updatedAt,
  };
}

async function readSnapshot(env) {
  if (!env?.HIST || typeof env.HIST.get !== "function") return null;
  try {
    const raw = await env.HIST.get(LATEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function unavailable(reason) {
  return {
    ok: true,
    available: false,
    source: null,
    status: "unavailable",
    stale: false,
    reason,
    updatedAt: null,
    count: 0,
    tokens: [],
  };
}

export async function getTokenHeatmapLatest(env) {
  const stored = await readSnapshot(env);
  if (!stored || !Array.isArray(stored.tokens)) return unavailable("no_reviewed_snapshot");
  const observedAt = validTimestamp(stored.updatedAt);
  if (!observedAt) return unavailable("snapshot_timestamp_invalid");
  const source = stored.source || {};
  if (!String(source.provider || "").trim() || !String(source.url || "").startsWith("https://")) {
    return unavailable("snapshot_source_invalid");
  }
  const tokens = stored.tokens.map(normalizeToken).filter(Boolean).slice(0, MAX_TOKENS);
  if (!tokens.length) return unavailable("snapshot_has_no_verified_tokens");
  const stale = Date.now() - Date.parse(observedAt) > STALE_AFTER_MS;
  return {
    ok: true,
    available: true,
    source: {
      provider: String(source.provider),
      url: String(source.url),
      mode: "stored reviewed snapshot",
    },
    status: stale ? "stale" : "fresh",
    stale,
    reason: stale ? "snapshot_older_than_one_hour" : "ok",
    updatedAt: observedAt,
    count: tokens.length,
    tokens,
  };
}

export function getTokenHeatmapMeta() {
  return {
    ok: true,
    public_mode: "read_only_snapshot",
    indexable: false,
    max_tokens: MAX_TOKENS,
    stale_after_min: STALE_AFTER_MS / 60000,
    source_required: true,
    contract_address_required: true,
    timestamp_required: true,
    synthetic_fallback: false,
    public_refresh: false,
    history: "none",
  };
}
