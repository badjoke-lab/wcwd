const CHAIN_ID = 480; // World Chain chainid=480

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function rpc(env, method, params = []) {
  const url = env.RPC_URL;
  if (!url) throw new Error("RPC_URL is not set");
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`RPC ${method} error: ${JSON.stringify(j.error)}`);
  return j.result;
}

function hexToInt(h) {
  if (!h) return null;
  return parseInt(h, 16);
}

function weiToGwei(weiHex) {
  const n = BigInt(weiHex);
  // gwei = wei / 1e9
  return Number(n / 1000000000n);
}

async function etherscan(env, url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return j;
}

function ymd(d) {
  // yyyy-MM-dd (UTC)
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function coingecko(env, path) {
  const base = "https://api.coingecko.com/api/v3";
  const url = base + path;

  const key = env.CG_KEY || "";
  const headers = {};
  if (key) headers["x-cg-demo-api-key"] = key;

  let r = await fetch(url, { headers });
  if ((!r.ok || r.status === 401 || r.status === 403) && key) {
    // retry as PRO header
    const h2 = { "x-cg-pro-api-key": key };
    r = await fetch(url, { headers: h2 });
  }
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`CoinGecko HTTP ${r.status}: ${t.slice(0, 120)}`);
  }
  return await r.json();
}

async function activitySample(env, latestBn, blocksToScan = 12, receiptsLimit = 120) {
  // scan recent blocks, classify:
  // native: input==0x and value>0 and to!=null
  // token: receipt logs includes ERC20 Transfer topic
  // contract: input!=0x (and not counted as token)
  // other: contract creation / unknown
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  let txs = [];
  for (let i = 0; i < blocksToScan; i++) {
    const bn = latestBn - i;
    const blk = await rpc(env, "eth_getBlockByNumber", ["0x" + bn.toString(16), true]);
    const arr = (blk && blk.transactions) ? blk.transactions : [];
    for (const tx of arr) {
      txs.push(tx);
      if (txs.length >= receiptsLimit) break;
    }
    if (txs.length >= receiptsLimit) break;
  }

  let native = 0, token = 0, contract = 0, other = 0;
  let checked = 0;

  for (const tx of txs) {
    checked++;

    const to = tx.to;
    const input = tx.input || "0x";
    const valueHex = tx.value || "0x0";
    const isCreate = !to;

    if (isCreate) { other++; continue; }

    const value = BigInt(valueHex);
    const isNative = (input === "0x" && value > 0n);

    if (isNative) { native++; continue; }

    // check receipt for Transfer logs (token transfers)
    const receipt = await rpc(env, "eth_getTransactionReceipt", [tx.hash]).catch(() => null);
    const logs = receipt?.logs || [];
    const hasTransfer = logs.some(l => (l.topics && l.topics[0] && String(l.topics[0]).toLowerCase() === transferTopic));
    if (hasTransfer) { token++; continue; }

    if (input !== "0x") { contract++; continue; }
    other++;
  }

  const total = native + token + contract + other;
  const pct = (x) => total ? (x * 100 / total) : null;

  return {
    sample_txs: total,
    native_pct: pct(native),
    token_pct: pct(token),
    contract_pct: pct(contract),
    other_pct: pct(other),
  };
}

export async function onRequest(context) {
  const env = context.env;

  try {
    const debug = [];

    // ----- RPC core -----
    const bnHex = await rpc(env, "eth_blockNumber", []);
    const latestBn = hexToInt(bnHex);
    debug.push(`latestBn=${latestBn}`);

    // TPS estimate (last 10 intervals)
    const N = 11;
    const blocks = [];
    for (let i = 0; i < N; i++) {
      const bn = latestBn - i;
      const blk = await rpc(env, "eth_getBlockByNumber", ["0x" + bn.toString(16), false]);
      const ts = hexToInt(blk.timestamp);
      const txc = (blk.transactions || []).length;
      blocks.push({ bn, ts, txc });
    }
    blocks.sort((a,b)=>a.bn-b.bn);
    const dts = [];
    const txs = [];
    for (let i = 0; i < blocks.length - 1; i++) {
      dts.push(blocks[i+1].ts - blocks[i].ts);
      txs.push(blocks[i].txc);
    }
    const avgDt = dts.reduce((a,b)=>a+b,0) / dts.length;
    const avgTx = txs.reduce((a,b)=>a+b,0) / txs.length;
    const tps = avgDt > 0 ? (avgTx / avgDt) : null;

    const gasWeiHex = await rpc(env, "eth_gasPrice", []);
    const gasGwei = (gasWeiHex ? weiToGwei(gasWeiHex) : null);

    // ----- Etherscan (keyed) -----
    const esKey = env.ETHERSCAN_KEY;
    if (!esKey) throw new Error("ETHERSCAN_KEY is not set");

    // last 8 days ranges (UTC)
    const now = new Date();
    const end = ymd(now);
    const start7 = ymd(new Date(now.getTime() - 7*24*3600*1000));
    const start8 = ymd(new Date(now.getTime() - 8*24*3600*1000));

    const esBase = "https://api.etherscan.io/v2/api";

    const tx7d = await etherscan(env, `${esBase}?chainid=${CHAIN_ID}&module=stats&action=dailytx&startdate=${start8}&enddate=${end}&sort=asc&apikey=${esKey}`);
    const na7d = await etherscan(env, `${esBase}?chainid=${CHAIN_ID}&module=stats&action=dailynewaddress&startdate=${start8}&enddate=${end}&sort=asc&apikey=${esKey}`);

    // pick latest day as "24h" proxy
    const txArr = Array.isArray(tx7d.result) ? tx7d.result : [];
    const naArr = Array.isArray(na7d.result) ? na7d.result : [];

    const lastTx = txArr.length ? Number(txArr[txArr.length-1].transactionCount || txArr[txArr.length-1].value || 0) : null;
    const lastNa = naArr.length ? Number(naArr[naArr.length-1].newAddressCount || naArr[naArr.length-1].value || 0) : null;

    // total addresses estimate by summing daily new addresses since launch-ish date
    // World Chain mainnet launch around 2024-10-18 (UTC) (estimate window)
    const launch = "2024-10-18";
    const naAll = await etherscan(env, `${esBase}?chainid=${CHAIN_ID}&module=stats&action=dailynewaddress&startdate=${launch}&enddate=${end}&sort=asc&apikey=${esKey}`);
    const naAllArr = Array.isArray(naAll.result) ? naAll.result : [];
    const totalAddrEst = naAllArr.reduce((s, x) => {
      const v = Number(x.newAddressCount || x.value || 0);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);

    // ----- CoinGecko (keyed) -----
    const cgKey = env.CG_KEY;
    if (!cgKey) throw new Error("CG_KEY is not set");

    const price = await coingecko(env, `/simple/price?ids=worldcoin&vs_currencies=usd,jpy&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`);
    const p = price.worldcoin || {};

    const chart7d = await coingecko(env, `/coins/worldcoin/market_chart?vs_currency=usd&days=7`);
    const prices7d = Array.isArray(chart7d.prices) ? chart7d.prices.map(a => Number(a[1])).filter(n => Number.isFinite(n)) : [];

    // ----- Activity breakdown (sample) -----
    const activity = await activitySample(env, latestBn, 12, 120);

    // ----- Trends (tx 7d) -----
    const tx7dSeries = txArr.slice(-7).map(x => Number(x.transactionCount || x.value || 0)).filter(n => Number.isFinite(n));

    // ----- Alerts -----
    // spike/drop: compare 10-block TPS vs 100-block TPS (rough)
    const baselineBlocks = [];
    for (let i = 0; i < 21; i++) {
      const bn = latestBn - i;
      const blk = await rpc(env, "eth_getBlockByNumber", ["0x" + bn.toString(16), false]);
      baselineBlocks.push({ ts: hexToInt(blk.timestamp), txc: (blk.transactions||[]).length });
    }
    baselineBlocks.sort((a,b)=>a.ts-b.ts);
    const baseDt = baselineBlocks[baselineBlocks.length-1].ts - baselineBlocks[0].ts;
    const baseTx = baselineBlocks.slice(0,-1).reduce((s,b)=>s+b.txc,0);
    const tpsBase = baseDt>0 ? (baseTx/baseDt) : null;

    const spike = (tps!=null && tpsBase!=null) ? (tps > 1.4 * tpsBase) : false;
    const drop  = (tps!=null && tpsBase!=null) ? (tps < 0.7 * tpsBase) : false;

    // high gas: compare current gas vs latest day avg gas price (Etherscan has dailyavggasprice; optional)
    let highGas = false;
    try {
      const gasDaily = await etherscan(env, `${esBase}?chainid=${CHAIN_ID}&module=stats&action=dailyavggasprice&startdate=${start7}&enddate=${end}&sort=asc&apikey=${esKey}`);
      const gArr = Array.isArray(gasDaily.result) ? gasDaily.result : [];
      const lastG = gArr.length ? Number(gArr[gArr.length-1].avgGasPrice || gArr[gArr.length-1].value || 0) : 0;
      // lastG is in Wei (per etherscan style). Compare in gwei.
      const lastGgwei = lastG ? (lastG / 1e9) : 0;
      highGas = (gasGwei!=null && lastGgwei>0) ? (gasGwei > 1.5 * lastGgwei) : false;
    } catch (_) {}

    return json({
      network: {
        tps_estimate: tps,
        gas_gwei: gasGwei,
        tx_24h: (lastTx!=null ? Math.round(lastTx).toLocaleString() : null),
        new_addresses_24h: (lastNa!=null ? Math.round(lastNa).toLocaleString() : null),
        total_addresses_est: totalAddrEst ? totalAddrEst.toLocaleString() : null,
      },
      market: {
        price_usd: (typeof p.usd === "number" ? p.usd : null),
        price_jpy: (typeof p.jpy === "number" ? p.jpy : null),
        change_24h_pct: (typeof p.usd_24h_change === "number" ? p.usd_24h_change : null),
        market_cap_usd: (typeof p.usd_market_cap === "number" ? p.usd_market_cap : null),
        volume_24h_usd: (typeof p.usd_24h_vol === "number" ? p.usd_24h_vol : null),
        price_7d_usd: prices7d.slice(-40), // keep it light
      },
      activity,
      trends: {
        wld_7d_usd: prices7d.slice(-40),
        tx_7d: tx7dSeries.slice(-7),
      },
      alerts: { spike, drop, high_gas: highGas },
      debug: debug.join(" | "),
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}
