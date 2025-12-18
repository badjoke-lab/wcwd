// lib/summary.js
// Aggregates World Chain + market + status signals with minimal subrequests.
// Design goal: survive partial failures; never do per-tx subrequests.

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function nowMs() {
  return Date.now();
}

function toHex(n) {
  if (typeof n === "string" && n.startsWith("0x")) return n;
  return "0x" + Number(n).toString(16);
}

function hexToDec(hex) {
  if (!hex) return null;
  return parseInt(hex, 16);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function fetchJson(url, { timeoutMs = 4500, headers = {}, signal } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: signal ?? ctrl.signal,
    });
    const text = await res.text();
    const json = safeJsonParse(text);
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

async function rpcCall(rpcUrl, method, params, { timeoutMs = 4500 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Math.floor(Math.random() * 1000), method, params }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    const json = safeJsonParse(text);
    if (!res.ok || !json) return { ok: false, status: res.status, json, text };
    return { ok: true, status: res.status, json, text };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function sanitizeWorldStatusSample(sample) {
  if (!sample || typeof sample !== "object") return sample;
  if (Array.isArray(sample.services)) {
    sample.services = sample.services.map((s) => {
      if (!s || typeof s !== "object") return s;
      const id = typeof s.id === "string" ? s.id.replaceAll('"', "").trim() : s.id;
      return { ...s, id };
    });
  }
  return sample;
}

function envPresent(env) {
  return {
    RPC: !!env.RPC,
    ETHERSCAN_KEY: !!env.ETHERSCAN_KEY,
    CG_KEY: !!env.CG_KEY,
    WLD_WORLDCHAIN: !!env.WLD_WORLDCHAIN,
  };
}

/**
 * Activity definition (Phase 0):
 * token_pct approx = unique tx with ERC20 Transfer logs / latest block tx_count
 * No per-tx subrequests. Only:
 * - eth_getBlockByNumber(latest,false)
 * - eth_getLogs(from=latest,to=latest,topic=Transfer)
 */
async function getActivitySample(rpcUrl, latestBlockNumberHex, txCount, warnings) {
  if (!latestBlockNumberHex || typeof txCount !== "number") {
    return {
      ok: false,
      data: null,
      reason: "missing_latest_block_or_txcount",
    };
  }

  const logsRes = await rpcCall(rpcUrl, "eth_getLogs", [{
    fromBlock: latestBlockNumberHex,
    toBlock: latestBlockNumberHex,
    topics: [TRANSFER_TOPIC],
  }], { timeoutMs: 4500 });

  if (!logsRes.ok || !logsRes.json?.result || !Array.isArray(logsRes.json.result)) {
    warnings.push({
      src: "rpc",
      where: "eth_getLogs",
      reason: "failed_or_non_array",
    });
    return {
      ok: false,
      data: null,
      reason: "eth_getLogs_failed",
    };
  }

  const logs = logsRes.json.result;
  const txHashes = new Set();
  let tokenContractSample = null;
  for (const lg of logs) {
    if (lg && typeof lg.transactionHash === "string") txHashes.add(lg.transactionHash);
    if (!tokenContractSample && lg && typeof lg.address === "string") tokenContractSample = lg.address;
  }

  const uniqueTokenTxs = txHashes.size;
  const denom = Math.max(1, txCount);
  const tokenPct = (uniqueTokenTxs / denom) * 100;
  const nativePct = 100 - tokenPct;

  // NOTE: this is "approx" by definition; never present as exact truth.
  const data = {
    sample_n: txCount,
    token_pct: tokenPct,
    native_pct: nativePct,
    contract_pct: null,
    other_pct: null,
    create_pct: null,
    token_contract_sample: tokenContractSample,
  };

  const note = `token_pct approx = unique tx with ERC20 Transfer logs / latest block tx_count. logs=${logs.length} unique_token_txs=${uniqueTokenTxs} block=${hexToDec(latestBlockNumberHex)}`;

  return { ok: true, data, note };
}

async function getRpcSection(rpcUrl, warnings) {
  const chainIdRes = await rpcCall(rpcUrl, "eth_chainId", [], { timeoutMs: 3500 });
  const latestRes = await rpcCall(rpcUrl, "eth_getBlockByNumber", ["latest", false], { timeoutMs: 4500 });
  const gasPriceRes = await rpcCall(rpcUrl, "eth_gasPrice", [], { timeoutMs: 3500 });

  // feeHistory is optional; failure should not fail rpc section
  const feeHistoryRes = await rpcCall(rpcUrl, "eth_feeHistory", ["0x5", "latest", [10, 50, 90]], { timeoutMs: 4500 });

  const chainIdHex = chainIdRes.ok ? chainIdRes.json?.result : null;
  const chainIdDec = chainIdHex ? hexToDec(chainIdHex) : null;

  const latest = latestRes.ok ? latestRes.json?.result : null;
  const latestBlockHex = latest?.number ?? null;
  const latestBlockDec = latestBlockHex ? hexToDec(latestBlockHex) : null;

  const latestBlock = latest
    ? {
        number: latestBlockDec,
        timestamp: latest.timestamp ? hexToDec(latest.timestamp) : null,
        tx_count: Array.isArray(latest.transactions) ? latest.transactions.length : (latest.transactions ? latest.transactions.length : null),
        gas_used: latest.gasUsed ? hexToDec(latest.gasUsed) : null,
        gas_limit: latest.gasLimit ? hexToDec(latest.gasLimit) : null,
        base_fee_per_gas: latest.baseFeePerGas ?? null,
      }
    : null;

  const txCount = typeof latestBlock?.tx_count === "number" ? latestBlock.tx_count : null;

  // Activity
  let activity = { ok: false, data: null, note: null, reason: "not_computed" };
  if (latestBlockHex && typeof txCount === "number") {
    const a = await getActivitySample(rpcUrl, latestBlockHex, txCount, warnings);
    activity = { ok: a.ok, data: a.data, note: a.note ?? null, reason: a.ok ? null : a.reason };
  }

  // Fee history shape: keep current API compatibility
  const feeHistory = feeHistoryRes.ok ? feeHistoryRes.json?.result : null;
  if (!feeHistoryRes.ok) {
    warnings.push({ src: "rpc", where: "eth_feeHistory", reason: "failed_optional" });
  }

  // TPS estimate: ultra-light heuristic
  const blockTimeAvgS = 2; // keep as your current (approx). If you later compute, document as approx.
  const tpsEstimate = (typeof txCount === "number") ? Math.round(txCount / clamp(blockTimeAvgS, 1, 60)) : null;

  return {
    ok: !!(chainIdRes.ok && latestRes.ok && gasPriceRes.ok),
    data: {
      chain_id_hex: chainIdHex,
      chain_id_dec: chainIdDec,
      latest_block_hex: latestBlockHex,
      latest_block_dec: latestBlockDec,
      latest_block: latestBlock,
      gas_price: gasPriceRes.ok ? gasPriceRes.json?.result : null,
      fee_history: feeHistory,
      block_time_avg_s: blockTimeAvgS,
      tps_estimate: tpsEstimate,
    },
    activity, // separate internal result
    reasons: {
      chainId: chainIdRes.ok ? null : "eth_chainId_failed",
      latest: latestRes.ok ? null : "eth_getBlockByNumber_failed",
      gasPrice: gasPriceRes.ok ? null : "eth_gasPrice_failed",
    },
  };
}

async function getEtherscanSection({ rpcUrl, etherscanKey, warnings }) {
  if (!etherscanKey) {
    return { ok: false, data: null, reason: "missing_etherscan_key" };
  }

  // NOTE: Your current JSON shows "blockNumber" and "gasPrice" as JSON-RPC objects.
  // If you are proxying JSON-RPC through Etherscan, keep it. If not, leave as null.
  // Here we simply mirror your existing style by calling RPC directly and packaging it similarly.
  const blockNumber = await rpcCall(rpcUrl, "eth_blockNumber", [], { timeoutMs: 3500 });
  const gasPrice = await rpcCall(rpcUrl, "eth_gasPrice", [], { timeoutMs: 3500 });

  // Token supply (WLD) via Etherscan-compatible API (optional).
  // If your existing implementation already hits an Etherscan endpoint, keep its URL.
  // We'll implement a generic Etherscan "token supply" call for the WLD contract address.
  // Requires env.WLD_WORLDCHAIN = contract address, and base URL in env.ETHERSCAN_BASE (optional).
  // If you don't have base, we will not call it.
  return {
    ok: true,
    data: {
      blockNumber: blockNumber.ok ? blockNumber.json : null,
      gasPrice: gasPrice.ok ? gasPrice.json : null,
      // below filled by api/summary.js using real Etherscan URL (kept there to avoid guessing base)
    },
    reason: null,
    warnings: (!blockNumber.ok || !gasPrice.ok) ? ["rpc_fallback_partial"] : [],
  };
}

async function getCoinGeckoSection({ cgKey, warnings }) {
  // If no key, still try public endpoints (but you said env_present true anyway)
  const headers = cgKey ? { "accept": "application/json", "x-cg-demo-api-key": cgKey } : { "accept": "application/json" };

  // Use "simple price" + "market cap" + "vol" + "24h change" (your current shape)
  const simpleUrl =
    "https://api.coingecko.com/api/v3/simple/price?ids=worldcoin-wld&vs_currencies=usd,jpy&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true";
  const chartUrl =
    "https://api.coingecko.com/api/v3/coins/worldcoin-wld/market_chart?vs_currency=usd&days=7&interval=hourly";

  const [simpleRes, chartRes] = await Promise.all([
    fetchJson(simpleUrl, { timeoutMs: 4500, headers }),
    fetchJson(chartUrl, { timeoutMs: 4500, headers }),
  ]);

  const ok = simpleRes.ok && !!simpleRes.json;
  const chartOk = chartRes.ok && !!chartRes.json;

  if (!ok) warnings.push({ src: "coingecko", where: "simple/price", reason: "failed" });
  if (!chartOk) warnings.push({ src: "coingecko", where: "market_chart", reason: "failed" });

  const simple = ok ? {
    usd: simpleRes.json["worldcoin-wld"]?.usd ?? null,
    jpy: simpleRes.json["worldcoin-wld"]?.jpy ?? null,
    usd_market_cap: simpleRes.json["worldcoin-wld"]?.usd_market_cap ?? null,
    usd_24h_vol: simpleRes.json["worldcoin-wld"]?.usd_24h_vol ?? null,
    usd_24h_change: simpleRes.json["worldcoin-wld"]?.usd_24h_change ?? null,
    jpy_market_cap: simpleRes.json["worldcoin-wld"]?.jpy_market_cap ?? null,
    jpy_24h_vol: simpleRes.json["worldcoin-wld"]?.jpy_24h_vol ?? null,
    jpy_24h_change: simpleRes.json["worldcoin-wld"]?.jpy_24h_change ?? null,
  } : null;

  const chart7d_usd = chartOk ? {
    prices: Array.isArray(chartRes.json?.prices)
      ? chartRes.json.prices.map((p) => (Array.isArray(p) ? p[1] : null)).filter((v) => typeof v === "number")
      : [],
  } : { prices: [] };

  return {
    ok: !!simple,
    mode: cgKey ? "demo" : "public",
    coin_id: "worldcoin-wld",
    simple,
    chart7d_usd,
    note: `CoinGecko ${simple ? "ok" : "failed"}. mode=${cgKey ? "demo" : "public"}. coin_id=worldcoin-wld. simple=${!!simple} markets=${chartOk}`,
    http_status: {
      simple: simpleRes.status,
      markets: chartRes.status,
    },
  };
}

async function getWorldStatusSection(warnings) {
  // This assumes you already have a World Status endpoint.
  // Keep URL in env.WORLD_STATUS_URL if you have it; otherwise skip.
  return { ok: false, http_status: 0, sample: null, reason: "missing_world_status_url" };
}

async function getWorldScanSection(warnings) {
  // Same: keep URL in env.WORLDSCAN_HEALTH_URL if you have it; otherwise skip.
  return { ok: false, status: 0, reason: "missing_worldscan_url" };
}

/**
 * Main builder.
 * Keeps your current top-level response keys to avoid breaking UI.
 * Adds warnings/errors as structured objects for Phase 0.
 */
export async function buildSummary(env) {
  const started = nowMs();
  const warnings = [];
  const errors = [];

  const present = envPresent(env);

  // RPC required
  const rpcUrl = env.RPC;
  if (!rpcUrl) {
    return {
      ok: false,
      ts: new Date().toISOString(),
      elapsed_ms: nowMs() - started,
      env_present: present,
      rpc: null,
      etherscan: null,
      coingecko: null,
      activity_sample: null,
      activity_note: null,
      world_status: null,
      worldscan: null,
      errors: [{ src: "env", reason: "missing_RPC" }],
      warnings: [],
    };
  }

  // 1) RPC + Activity (no subrequests)
  const rpcSection = await getRpcSection(rpcUrl, warnings);
  const rpcData = rpcSection.data;

  // Export activity in your current top-level fields
  const activity_sample = rpcSection.activity.ok ? rpcSection.activity.data : null;
  const activity_note = rpcSection.activity.ok ? rpcSection.activity.note : (rpcSection.activity.reason || null);

  // 2) Etherscan (keep your existing object; actual token supply call done in api/summary.js to avoid guessing base URL)
  const etherscan = {
    blockNumber: null,
    gasPrice: null,
    wld_token_supply: null,
    wld_contract: env.WLD_WORLDCHAIN || null,
  };
  try {
    const bn = await rpcCall(rpcUrl, "eth_blockNumber", [], { timeoutMs: 3500 });
    const gp = await rpcCall(rpcUrl, "eth_gasPrice", [], { timeoutMs: 3500 });
    etherscan.blockNumber = bn.ok ? bn.json : null;
    etherscan.gasPrice = gp.ok ? gp.json : null;
  } catch {
    warnings.push({ src: "etherscan", where: "rpc_mirror", reason: "failed" });
  }

  // 3) CoinGecko
  const cg = await getCoinGeckoSection({ cgKey: env.CG_KEY, warnings });

  // 4) World status / Worldscan: filled in api/summary.js if URLs exist (do not guess here)

  const out = {
    ok: true,
    ts: new Date().toISOString(),
    elapsed_ms: nowMs() - started,
    env_present: present,

    // keep current response shape
    rpc: rpcData,
    etherscan,
    coingecko: cg,
    activity_sample,
    activity_note,

    world_status: null,
    worldscan: null,

    errors,
    warnings,
  };

  return out;
}

export function applyWorldStatus(summary, worldStatusJson, httpStatus) {
  const sample = worldStatusJson && typeof worldStatusJson === "object" ? sanitizeWorldStatusSample(worldStatusJson) : null;
  summary.world_status = {
    http_status: httpStatus ?? 0,
    ok: !!sample,
    sample,
  };
  return summary;
}

export function applyWorldscan(summary, ok, status) {
  summary.worldscan = {
    status: status ?? 0,
    ok: !!ok,
  };
  return summary;
}

export async function fetchWorldStatus(url) {
  return fetchJson(url, { timeoutMs: 4500, headers: { accept: "application/json" } });
}

export async function fetchWorldscan(url) {
  return fetchJson(url, { timeoutMs: 4500, headers: { accept: "application/json" } });
}

export async function fetchEtherscanTokenSupply({ baseUrl, apiKey, contract }) {
  if (!baseUrl || !apiKey || !contract) return { ok: false, status: 0, json: null, text: "missing_params" };
  const u = new URL(baseUrl);
  // Etherscan-style: ?module=stats&action=tokensupply&contractaddress=...&apikey=...
  // If your explorer differs, keep baseUrl pointing to the correct endpoint host.
  u.searchParams.set("module", "stats");
  u.searchParams.set("action", "tokensupply");
  u.searchParams.set("contractaddress", contract);
  u.searchParams.set("apikey", apiKey);
  return fetchJson(u.toString(), { timeoutMs: 4500, headers: { accept: "application/json" } });
}
