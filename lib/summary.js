// lib/summary.js
// Aggregates World Chain + market + status signals with minimal subrequests.
// Design goal: survive partial failures; never do per-tx subrequests.

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function nowMs() {
  return Date.now();
}

function hexToDec(hex) {
  if (!hex) return null;
  return parseInt(hex, 16);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pushWarn(warnings, src, where, reason) {
  warnings.push({ src, where, reason });
}

function pushErr(errors, src, where, reason) {
  errors.push({ src, where, reason });
}

// ★okの定義を固定（Phase 0）
// - errors が 0 かつ warnings が 0 のときだけ ok:true
export function finalizeOk(summary) {
  const e = Array.isArray(summary?.errors) ? summary.errors : [];
  const w = Array.isArray(summary?.warnings) ? summary.warnings : [];
  summary.ok = (e.length === 0 && w.length === 0);
  return summary.ok;
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
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.floor(Math.random() * 1000),
        method,
        params,
      }),
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
    return { ok: false, data: null, reason: "missing_latest_block_or_txcount" };
  }

  const logsRes = await rpcCall(
    rpcUrl,
    "eth_getLogs",
    [
      {
        fromBlock: latestBlockNumberHex,
        toBlock: latestBlockNumberHex,
        topics: [TRANSFER_TOPIC],
      },
    ],
    { timeoutMs: 4500 }
  );

  if (!logsRes.ok || !logsRes.json?.result || !Array.isArray(logsRes.json.result)) {
    pushWarn(warnings, "rpc", "eth_getLogs", "failed_or_non_array");
    return { ok: false, data: null, reason: "eth_getLogs_failed" };
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

  const data = {
    sample_n: txCount,
    token_pct: tokenPct,
    native_pct: nativePct,
    contract_pct: null,
    other_pct: null,
    create_pct: null,
    token_contract_sample: tokenContractSample,
  };

  const note = `token_pct approx = unique tx with ERC20 Transfer logs / latest block tx_count. logs=${logs.length} unique_token_txs=${uniqueTokenTxs} block=${hexToDec(
    latestBlockNumberHex
  )}`;

  return { ok: true, data, note };
}

async function getRpcSection(rpcUrl, warnings, errors) {
  const chainIdRes = await rpcCall(rpcUrl, "eth_chainId", [], { timeoutMs: 3500 });
  const latestRes = await rpcCall(rpcUrl, "eth_getBlockByNumber", ["latest", false], { timeoutMs: 4500 });
  const gasPriceRes = await rpcCall(rpcUrl, "eth_gasPrice", [], { timeoutMs: 3500 });

  // feeHistory is optional; failure should not fail rpc section (warning only)
  const feeHistoryRes = await rpcCall(
    rpcUrl,
    "eth_feeHistory",
    ["0x5", "latest", [10, 50, 90]],
    { timeoutMs: 4500 }
  );

  // REQUIRED RPC failures -> errors (Phase 0)
  if (!chainIdRes.ok) pushErr(errors, "rpc", "eth_chainId", "failed");
  if (!latestRes.ok) pushErr(errors, "rpc", "eth_getBlockByNumber", "failed");
  if (!gasPriceRes.ok) pushErr(errors, "rpc", "eth_gasPrice", "failed");

  const chainIdHex = chainIdRes.ok ? chainIdRes.json?.result : null;
  const chainIdDec = chainIdHex ? hexToDec(chainIdHex) : null;

  const latest = latestRes.ok ? latestRes.json?.result : null;
  const latestBlockHex = latest?.number ?? null;
  const latestBlockDec = latestBlockHex ? hexToDec(latestBlockHex) : null;

  const latestBlock = latest
    ? {
        number: latestBlockDec,
        timestamp: latest.timestamp ? hexToDec(latest.timestamp) : null,
        tx_count: Array.isArray(latest.transactions)
          ? latest.transactions.length
          : (latest.transactions ? latest.transactions.length : null),
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
    pushWarn(warnings, "rpc", "eth_feeHistory", "failed_optional");
  }

  // TPS estimate: ultra-light heuristic
  const blockTimeAvgS = 2; // approx
  const tpsEstimate =
    typeof txCount === "number" ? Math.round(txCount / clamp(blockTimeAvgS, 1, 60)) : null;

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
    activity,
  };
}

async function getCoinGeckoSection({ cgKey, warnings }) {
  // CoinGecko demo key header: x-cg-demo-api-key
  const headers = cgKey
    ? { accept: "application/json", "x-cg-demo-api-key": cgKey }
    : { accept: "application/json" };

  const simpleUrl =
    "https://api.coingecko.com/api/v3/simple/price?ids=worldcoin-wld&vs_currencies=usd,jpy&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true";
  const chartUrl =
    "https://api.coingecko.com/api/v3/coins/worldcoin-wld/market_chart?vs_currency=usd&days=7&interval=hourly";

  const [simpleRes, chartRes] = await Promise.all([
    fetchJson(simpleUrl, { timeoutMs: 4500, headers }),
    fetchJson(chartUrl, { timeoutMs: 4500, headers }),
  ]);

  const simpleOk = simpleRes.ok && !!simpleRes.json;
  const chartOk = chartRes.ok && !!chartRes.json;

  if (!simpleOk) pushWarn(warnings, "coingecko", "simple/price", `failed (status=${simpleRes.status})`);
  if (!chartOk) pushWarn(warnings, "coingecko", "market_chart", `failed (status=${chartRes.status})`);

  const simple = simpleOk
    ? {
        usd: simpleRes.json["worldcoin-wld"]?.usd ?? null,
        jpy: simpleRes.json["worldcoin-wld"]?.jpy ?? null,
        usd_market_cap: simpleRes.json["worldcoin-wld"]?.usd_market_cap ?? null,
        usd_24h_vol: simpleRes.json["worldcoin-wld"]?.usd_24h_vol ?? null,
        usd_24h_change: simpleRes.json["worldcoin-wld"]?.usd_24h_change ?? null,
        jpy_market_cap: simpleRes.json["worldcoin-wld"]?.jpy_market_cap ?? null,
        jpy_24h_vol: simpleRes.json["worldcoin-wld"]?.jpy_24h_vol ?? null,
        jpy_24h_change: simpleRes.json["worldcoin-wld"]?.jpy_24h_change ?? null,
      }
    : null;

  const chart7d_usd = chartOk
    ? {
        prices: Array.isArray(chartRes.json?.prices)
          ? chartRes.json.prices
              .map((p) => (Array.isArray(p) ? p[1] : null))
              .filter((v) => typeof v === "number")
          : [],
      }
    : { prices: [] };

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

/**
 * Main builder.
 * Keeps your current top-level response keys to avoid breaking UI.
 * errors/warnings を集約し、ok は finalizeOk で決定（★重要）
 */
export async function buildSummary(env) {
  const started = nowMs();
  const warnings = [];
  const errors = [];

  const present = envPresent(env);

  // RPC required
  const rpcUrl = env.RPC;
  if (!rpcUrl) {
    const out = {
      ok: false,
      ts: new Date().toISOString(),
      elapsed_ms: nowMs() - started,
      env_present: present,
      rpc: null,
      etherscan: null,
      coingecko: null,
      activity_sample: null,
      activity_note: null,
      world_status: { http_status: 0, ok: false, sample: null },
      worldscan: { status: 0, ok: false },
      errors: [{ src: "env", where: "RPC", reason: "missing_RPC" }],
      warnings: [],
    };
    finalizeOk(out);
    return out;
  }

  // 1) RPC + Activity
  const rpcSection = await getRpcSection(rpcUrl, warnings, errors);
  const rpcData = rpcSection.data;

  const activity_sample = rpcSection.activity.ok ? rpcSection.activity.data : null;
  const activity_note = rpcSection.activity.ok
    ? rpcSection.activity.note
    : (rpcSection.activity.reason || null);

  // 2) Etherscan (RPC mirror only; tokensupply is optional and fetched in functions/api/summary.js)
  const etherscan = {
    blockNumber: null,
    gasPrice: null,
    wld_token_supply: null,
    wld_contract: env.WLD_WORLDCHAIN || null,
  };

  const bn = await rpcCall(rpcUrl, "eth_blockNumber", [], { timeoutMs: 3500 });
  const gp = await rpcCall(rpcUrl, "eth_gasPrice", [], { timeoutMs: 3500 });

  etherscan.blockNumber = bn.ok ? bn.json : null;
  etherscan.gasPrice = gp.ok ? gp.json : null;

  if (!bn.ok) pushWarn(warnings, "etherscan", "rpc_mirror_blockNumber", "failed");
  if (!gp.ok) pushWarn(warnings, "etherscan", "rpc_mirror_gasPrice", "failed");

  // 3) CoinGecko
  const cg = await getCoinGeckoSection({ cgKey: env.CG_KEY, warnings });

  // world_status / worldscan are filled (or shaped) in functions/api/summary.js
  const out = {
    ok: true, // ★仮。最後に finalizeOk で確定する
    ts: new Date().toISOString(),
    elapsed_ms: nowMs() - started,
    env_present: present,

    rpc: rpcData,
    etherscan,
    coingecko: cg,
    activity_sample,
    activity_note,

    world_status: { http_status: 0, ok: false, sample: null },
    worldscan: { status: 0, ok: false },

    errors,
    warnings,
  };

  finalizeOk(out);
  return out;
}

export function applyWorldStatus(summary, worldStatusJson, httpStatus) {
  const sample =
    worldStatusJson && typeof worldStatusJson === "object"
      ? sanitizeWorldStatusSample(worldStatusJson)
      : null;
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
  if (!baseUrl || !apiKey || !contract) {
    return { ok: false, status: 0, json: null, text: "missing_params" };
  }
  const u = new URL(baseUrl);
  u.searchParams.set("module", "stats");
  u.searchParams.set("action", "tokensupply");
  u.searchParams.set("contractaddress", contract);
  u.searchParams.set("apikey", apiKey);
  return fetchJson(u.toString(), { timeoutMs: 4500, headers: { accept: "application/json" } });
}
