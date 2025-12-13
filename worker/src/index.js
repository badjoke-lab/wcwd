const INTERVAL_SEC = 15 * 60;
const HISTORY_PREFIX = "wcwd:snap:15m:";
const MAX_POINTS_PER_DAY = 96; // 96 points/day for 15m interval
const DEDUPE_WINDOW_SEC = 8 * 60; // skip if within 8 minutes
const DEFAULT_RPC = "https://worldchain-mainnet.public.blastapi.io";

const baseHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...baseHeaders,
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: baseHeaders,
  });
}

function formatDay(date) {
  const iso = date.toISOString();
  return iso.slice(0, 10); // YYYY-MM-DD in UTC
}

function round(value, digits = 2) {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

async function rpcCall(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) {
    throw new Error(`RPC ${method} failed with status ${res.status}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`RPC ${method} error: ${data.error.message || data.error}`);
  }
  return data.result;
}

function withNetworkDefaults(network = {}) {
  return {
    tps: null,
    gasPriceGwei: null,
    txCount24h: null,
    newAddressesEst: null,
    totalAddressesEst: null,
    ...network,
  };
}

function withActivityDefaults(activity = {}) {
  return {
    nativeTransferPct: null,
    tokenTransferPct: null,
    contractCallPct: null,
    otherPct: null,
    ...activity,
  };
}

function withMarketDefaults(market = {}) {
  return {
    priceUSD: null,
    priceJPY: null,
    change24hPct: null,
    marketCapUSD: null,
    marketCapJPY: null,
    volume24hUSD: null,
    volume24hJPY: null,
    wldUsd: null,
    wldJpy: null,
    ...market,
  };
}

function computeActivityBreakdown(transactions = []) {
  const counts = {
    native: 0,
    token: 0,
    contract: 0,
    other: 0,
  };

  transactions.forEach((tx) => {
    const input = (tx.input || "").toLowerCase();
    if (!input || input === "0x") {
      counts.native += 1;
    } else if (input.startsWith("0xa9059cbb")) {
      counts.token += 1;
    } else if (input.length > 2) {
      counts.contract += 1;
    } else {
      counts.other += 1;
    }
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  return withActivityDefaults({
    nativeTransferPct: round((counts.native / total) * 100, 2),
    tokenTransferPct: round((counts.token / total) * 100, 2),
    contractCallPct: round((counts.contract / total) * 100, 2),
    otherPct: round((counts.other / total) * 100, 2),
  });
}

async function fetchNetworkSnapshot(env) {
  const rpcUrl = env.WORLDCHAIN_RPC_ENDPOINT || DEFAULT_RPC;
  const latestHex = await rpcCall(rpcUrl, "eth_blockNumber");
  const latest = parseInt(latestHex, 16);
  const sampleBlocks = 10;
  const blocks = [];

  for (let i = 0; i < sampleBlocks; i++) {
    const numHex = "0x" + (latest - i).toString(16);
    const block = await rpcCall(rpcUrl, "eth_getBlockByNumber", [numHex, true]);
    if (block) {
      blocks.push(block);
    }
  }

  if (!blocks.length) {
    throw new Error("No blocks fetched for TPS calculation");
  }

  // sort ascending
  blocks.sort((a, b) => parseInt(a.number, 16) - parseInt(b.number, 16));

  const timestamps = blocks.map((b) => parseInt(b.timestamp, 16));
  const txCounts = blocks.map((b) => (b.transactions ? b.transactions.length : 0));
  const totalTx = txCounts.reduce((a, b) => a + b, 0);
  const timeDelta = Math.max(1, timestamps[timestamps.length - 1] - timestamps[0]);
  const tps = round(totalTx / timeDelta, 2);
  const txCount24h = Math.round(tps * 86400);

  const transactions = blocks.flatMap((b) => b.transactions || []);
  const addresses = new Set();
  transactions.forEach((tx) => {
    if (tx.from) addresses.add(tx.from.toLowerCase());
    if (tx.to) addresses.add(tx.to.toLowerCase());
  });
  const newAddressesEst = addresses.size || null;

  const activity = computeActivityBreakdown(transactions);

  const gasHex = await rpcCall(rpcUrl, "eth_gasPrice");
  const gasPriceGwei = round(parseInt(gasHex, 16) / 1e9, 2);

  return {
    metrics: withNetworkDefaults({
      tps,
      txCount24h,
      newAddressesEst,
      totalAddressesEst: null,
      gasPriceGwei,
    }),
    activity,
  };
}

async function fetchMarketSnapshot() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=worldcoin&vs_currencies=usd,jpy&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true";
  const res = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!res.ok) {
    throw new Error(`Price fetch failed with status ${res.status}`);
  }
  const data = await res.json();
  const entry = data["worldcoin"] || {};
  return withMarketDefaults({
    priceUSD: typeof entry.usd === "number" ? entry.usd : null,
    priceJPY: typeof entry.jpy === "number" ? entry.jpy : null,
    change24hPct:
      typeof entry.usd_24h_change === "number" ? round(entry.usd_24h_change, 2) : null,
    marketCapUSD:
      typeof entry.usd_market_cap === "number" ? round(entry.usd_market_cap, 0) : null,
    marketCapJPY:
      typeof entry.jpy_market_cap === "number" ? round(entry.jpy_market_cap, 0) : null,
    volume24hUSD:
      typeof entry.usd_24h_vol === "number" ? round(entry.usd_24h_vol, 0) : null,
    volume24hJPY:
      typeof entry.jpy_24h_vol === "number" ? round(entry.jpy_24h_vol, 0) : null,
    wldUsd: typeof entry.usd === "number" ? entry.usd : null,
    wldJpy: typeof entry.jpy === "number" ? entry.jpy : null,
  });
}

async function buildCurrentSnapshot(env) {
  const [networkResult, market] = await Promise.all([
    fetchNetworkSnapshot(env),
    fetchMarketSnapshot(),
  ]);

  const ts = Math.floor(Date.now() / 1000);

  return {
    ok: true,
    ts,
    network: withNetworkDefaults(networkResult?.metrics || networkResult),
    market: withMarketDefaults(market),
    activity: withActivityDefaults(networkResult?.activity),
  };
}

async function saveLatestSnapshot(env, snapshot) {
  const payload = {
    ...snapshot,
    savedAt: Math.floor(Date.now() / 1000),
  };

  try {
    await env.WCWD_HISTORY.put("current:latest", JSON.stringify(payload));
  } catch (err) {
    console.error("KV put failed for current:latest", err);
  }

  return payload;
}

async function appendSnapshot(env) {
  let snapshot;
  try {
    snapshot = await buildCurrentSnapshot(env);
  } catch (err) {
    console.error("Failed to build snapshot", err);
    return;
  }

  await saveLatestSnapshot(env, snapshot);

  const day = formatDay(new Date(snapshot.ts * 1000));
  const key = `${HISTORY_PREFIX}${day}`;
  let stored;
  try {
    stored = await env.WCWD_HISTORY.get(key);
  } catch (err) {
    console.error("KV get failed", err);
    return;
  }

  let value;
  if (stored) {
    try {
      value = JSON.parse(stored);
    } catch (err) {
      console.error("KV parse failed, resetting", err);
    }
  }

  if (!value || typeof value !== "object" || !Array.isArray(value.points)) {
    value = { v: 1, intervalSec: INTERVAL_SEC, day, points: [] };
  }

  const points = value.points;
  const last = points[points.length - 1];
  if (last && snapshot.ts - last.ts < DEDUPE_WINDOW_SEC) {
    return; // within dedupe window
  }

  points.push({
    ts: snapshot.ts,
    network: snapshot.network,
    market: snapshot.market,
  });

  if (points.length > MAX_POINTS_PER_DAY) {
    points.splice(0, points.length - MAX_POINTS_PER_DAY); // trim oldest
  }

  const payload = JSON.stringify({
    v: 1,
    intervalSec: INTERVAL_SEC,
    day,
    points,
  });

  try {
    await env.WCWD_HISTORY.put(key, payload);
  } catch (err) {
    console.error("KV put failed", err);
  }
}

function aggregateSeries(points) {
  const series = {
    tps: [],
    gasPriceGwei: [],
    priceUSD: [],
    priceJPY: [],
  };

  points
    .filter((p) => p && typeof p.ts === "number")
    .sort((a, b) => a.ts - b.ts)
    .forEach((p) => {
      if (p.network && typeof p.network.tps === "number") {
        series.tps.push([p.ts, p.network.tps]);
      }
      if (p.network && typeof p.network.gasPriceGwei === "number") {
        series.gasPriceGwei.push([p.ts, p.network.gasPriceGwei]);
      }
      const priceUSD =
        p.market && typeof p.market.priceUSD === "number"
          ? p.market.priceUSD
          : p.market && typeof p.market.wldUsd === "number"
          ? p.market.wldUsd
          : null;
      if (typeof priceUSD === "number") {
        series.priceUSD.push([p.ts, priceUSD]);
      }

      const priceJPY =
        p.market && typeof p.market.priceJPY === "number"
          ? p.market.priceJPY
          : p.market && typeof p.market.wldJpy === "number"
          ? p.market.wldJpy
          : null;
      if (typeof priceJPY === "number") {
        series.priceJPY.push([p.ts, priceJPY]);
      }
    });

  return series;
}

async function handleCurrent(env) {
  try {
    const snapshot = await buildCurrentSnapshot(env);
    const latest = await saveLatestSnapshot(env, snapshot);
    return jsonResponse(latest);
  } catch (err) {
    console.error("snapshot build failed", { reason: String(err) });

    let fallback;
    try {
      const stored = await env.WCWD_HISTORY.get("current:latest");
      if (stored) {
        fallback = JSON.parse(stored);
      }
    } catch (kvErr) {
      console.error("fallback snapshot fetch failed", kvErr);
    }

    if (fallback && typeof fallback === "object") {
      const normalized = {
        ok: true,
        ...fallback,
        network: withNetworkDefaults(fallback.network),
        market: withMarketDefaults(fallback.market),
        activity: withActivityDefaults(fallback.activity),
      };
      return jsonResponse({ ...normalized, stale: true });
    }

    return jsonResponse({
      ok: false,
      error: {
        code: "SNAPSHOT_BUILD_FAILED",
        message: String(err),
      },
    });
  }
}

async function handleHistory(request, env) {
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "7d";
  const interval = url.searchParams.get("interval") || "15m";

  if (interval !== "15m") {
    return jsonResponse({ error: "Unsupported interval" }, 400);
  }

  if (range !== "7d" && range !== "30d") {
    return jsonResponse({ error: "Invalid range" }, 400);
  }

  const days = range === "30d" ? 30 : 7;
  const now = new Date();
  const promises = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - i,
    ));
    const key = `${HISTORY_PREFIX}${formatDay(d)}`;
    promises.push(env.WCWD_HISTORY.get(key));
  }

  const results = await Promise.all(promises);
  const points = [];

  results.forEach((entry) => {
    if (!entry) return;
    try {
      const parsed = JSON.parse(entry);
      if (parsed && Array.isArray(parsed.points)) {
        points.push(...parsed.points);
      }
    } catch (err) {
      console.error("Failed to parse history entry", err);
    }
  });

  const series = aggregateSeries(points);

  return jsonResponse({
    range,
    intervalSec: INTERVAL_SEC,
    series,
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/wcwd/current") {
      return handleCurrent(env);
    }

    if (request.method === "GET" && url.pathname === "/api/wcwd/history") {
      return handleHistory(request, env);
    }

    return new Response("Not found", { status: 404, headers: baseHeaders });
  },

  async scheduled(event, env, ctx) {
    await appendSnapshot(env);
  },
};
