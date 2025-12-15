export async function onRequestGet({ env, request }) {
  const startedAt = Date.now();

  // ---- env (Cloudflare Pages Functions: use env, NOT process.env) ----
  const RPC = (env.RPC || env.RPC_URL || "").trim();
  const ETHERSCAN_KEY = (env.ETHERSCAN_KEY || "").trim();
  const CG_KEY = (env.CG_KEY || "").trim();

  // WLD (World Chain) token contract (default if not provided)
  const DEFAULT_WLD_WORLDCHAIN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";
  const WLD_WORLDCHAIN = (env.WLD_WORLDCHAIN || DEFAULT_WLD_WORLDCHAIN).trim();

  const out = {
    ok: true,
    ts: new Date().toISOString(),
    elapsed_ms: 0,
    env_present: {
      RPC: !!RPC,
      ETHERSCAN_KEY: !!ETHERSCAN_KEY,
      CG_KEY: !!CG_KEY,
      WLD_WORLDCHAIN: !!WLD_WORLDCHAIN,
    },
    rpc: {},
    etherscan: {},
    coingecko: {
      ok: false,
      mode: null,
      coin_id: "worldcoin",
      simple: null,          // <- app.js expects this
      chart7d_usd: null,     // <- app.js expects this.prices (number[])
      note: null,
    },
    activity_sample: null,   // <- app.js expects this
    activity_note: null,
    world_status: {},
    worldscan: {},
    errors: [],
  };

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });

  const withTimeout = async (p, ms, label) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(`timeout:${label}`), ms);
    try {
      return await p(ac.signal);
    } finally {
      clearTimeout(t);
    }
  };

  const fetchJson = async (url, init = {}, timeoutMs = 8000) => {
    return withTimeout(async (signal) => {
      const r = await fetch(url, { ...init, signal });
      const text = await r.text();
      let j = null;
      try { j = JSON.parse(text); } catch { /* ignore */ }
      return { status: r.status, ok: r.ok, text, json: j };
    }, timeoutMs, `fetch:${url}`);
  };

  const rpcCall = async (method, params = [], timeoutMs = 8000) => {
    if (!RPC) throw new Error("Missing env RPC");
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const { status, ok, text, json: j } = await fetchJson(
      RPC,
      { method: "POST", headers: { "content-type": "application/json" }, body },
      timeoutMs
    );
    if (!ok) throw new Error(`RPC HTTP ${status}: ${text.slice(0, 200)}`);
    if (!j) throw new Error(`RPC non-JSON: ${text.slice(0, 200)}`);
    if (j.error) throw new Error(`RPC error: ${JSON.stringify(j.error)}`);
    return j.result;
  };

  const hexToInt = (h) => {
    if (!h || h === "null") return null;
    if (typeof h !== "string") return null;
    return parseInt(h.startsWith("0x") ? h.slice(2) : h, 16);
  };

  // small helper: CoinGecko try demo header then pro header
  const cgFetchJson = async (url, timeoutMs = 8000) => {
    if (!CG_KEY) return { ok: false, status: 0, json: null, mode: null, text: "CG_KEY not set" };

    const demo = await fetchJson(url, { headers: { "x-cg-demo-api-key": CG_KEY } }, timeoutMs);
    if (demo.ok) return { ...demo, mode: "demo" };

    const pro = await fetchJson(url, { headers: { "x-cg-pro-api-key": CG_KEY } }, timeoutMs);
    if (pro.ok) return { ...pro, mode: "pro" };

    // return best effort (prefer pro response body)
    return { ...pro, mode: "failed", text: pro.text || demo.text, json: pro.json || demo.json };
  };

  // =========================
  // 1) CORE RPC
  // =========================
  try {
    const chainIdHex = await rpcCall("eth_chainId");
    out.rpc.chain_id_hex = chainIdHex;
    out.rpc.chain_id_dec = hexToInt(chainIdHex);

    const bnHex = await rpcCall("eth_blockNumber");
    out.rpc.latest_block_hex = bnHex;
    out.rpc.latest_block_dec = hexToInt(bnHex);

    const latestBlock = await rpcCall("eth_getBlockByNumber", ["latest", false]);
    out.rpc.latest_block = {
      number: hexToInt(latestBlock?.number),
      timestamp: hexToInt(latestBlock?.timestamp),
      tx_count: Array.isArray(latestBlock?.transactions) ? latestBlock.transactions.length : null,
      gas_used: hexToInt(latestBlock?.gasUsed),
      gas_limit: hexToInt(latestBlock?.gasLimit),
      base_fee_per_gas: latestBlock?.baseFeePerGas ?? null,
    };

    out.rpc.gas_price = await rpcCall("eth_gasPrice");
    try {
      out.rpc.max_priority_fee = await rpcCall("eth_maxPriorityFeePerGas");
    } catch (e) {
      out.rpc.max_priority_fee = null;
      out.errors.push(`rpc:eth_maxPriorityFeePerGas:${e.message}`);
    }
    try {
      out.rpc.fee_history = await rpcCall("eth_feeHistory", ["0x5", "latest", [10, 50, 90]]);
    } catch (e) {
      out.rpc.fee_history = null;
      out.errors.push(`rpc:eth_feeHistory:${e.message}`);
    }

    // Avg block time + TPS estimate
    const bn = out.rpc.latest_block_dec;
    if (typeof bn === "number" && bn > 12) {
      const nums = Array.from({ length: 11 }, (_, i) => bn - i);
      const blocks = [];
      for (const n of nums) {
        const b = await rpcCall("eth_getBlockByNumber", ["0x" + n.toString(16), false]);
        blocks.push({
          n,
          ts: hexToInt(b?.timestamp) || 0,
          txc: Array.isArray(b?.transactions) ? b.transactions.length : 0,
        });
      }
      blocks.sort((a, b) => a.n - b.n);
      const dts = [];
      const txs = [];
      for (let i = 0; i < blocks.length - 1; i++) {
        dts.push(blocks[i + 1].ts - blocks[i].ts);
        txs.push(blocks[i].txc);
      }
      const avgDt = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : null;
      const avgTxc = txs.length ? txs.reduce((a, b) => a + b, 0) / txs.length : null;
      const tps = avgDt && avgDt > 0 ? (avgTxc / avgDt) : null;

      out.rpc.block_time_avg_s = avgDt;
      out.rpc.tx_per_block_avg = avgTxc;
      out.rpc.tps_estimate = tps;
    }
  } catch (e) {
    out.errors.push(`rpc:${e.message}`);
  }

  // =========================
  // 2) World official status (FREE)
  // =========================
  try {
    const r = await fetchJson("https://status.worldcoin.org/api/services", {}, 8000);
    out.world_status.http_status = r.status;
    out.world_status.ok = r.ok;
    out.world_status.sample = r.json ? r.json : r.text.slice(0, 300);
  } catch (e) {
    out.errors.push(`world_status:${e.message}`);
  }

  // =========================
  // 3) worldscan reachability (FREE)
  // =========================
  try {
    const r = await withTimeout(async (signal) => {
      const res = await fetch("https://worldscan.org/", { method: "HEAD", signal });
      return { status: res.status, ok: res.ok };
    }, 8000, "worldscan_head");
    out.worldscan = r;
  } catch (e) {
    out.errors.push(`worldscan:${e.message}`);
  }

  // =========================
  // 3.5) Activity sample (REAL sample from latest block)
  // =========================
  try {
    // keep it small to avoid timeouts
    const SAMPLE_N = 12;

    const blk = await rpcCall("eth_getBlockByNumber", ["latest", true], 12000);
    const txs = Array.isArray(blk?.transactions) ? blk.transactions.slice(0, SAMPLE_N) : [];
    if (!txs.length) {
      out.activity_sample = null;
      out.activity_note = "No tx objects available in latest block.";
    } else {
      const codeCache = new Map();
      const isContract = async (addr) => {
        if (!addr) return false;
        const a = String(addr).toLowerCase();
        if (codeCache.has(a)) return codeCache.get(a);
        const code = await rpcCall("eth_getCode", [addr, "latest"], 8000);
        const v = !!(code && code !== "0x");
        codeCache.set(a, v);
        return v;
      };

      let native = 0, contract = 0, other = 0;

      // sequential to avoid bursts
      for (const tx of txs) {
        const to = tx?.to;
        if (!to) { contract++; continue; } // contract creation
        const c = await isContract(to);
        if (c) contract++;
        else native++;
      }

      const total = native + contract + other;
      const pct = (x) => total ? (x * 100) / total : null;

      out.activity_sample = {
        sample_n: txs.length,
        native_pct: pct(native),
        contract_pct: pct(contract),
        other_pct: pct(other),
      };
      out.activity_note = `Computed from latest block tx(to) classification with eth_getCode. sample_n=${txs.length}`;
    }
  } catch (e) {
    out.activity_sample = null;
    out.activity_note = null;
    out.errors.push(`activity_sample:${e.message}`);
  }

  // =========================
  // 4) Etherscan v2 (KEYED; optional)
  // =========================
  try {
    if (ETHERSCAN_KEY) {
      const base = "https://api.etherscan.io/v2/api?chainid=480";
      const a = await fetchJson(`${base}&module=proxy&action=eth_blockNumber&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`);
      const g = await fetchJson(`${base}&module=proxy&action=eth_gasPrice&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`);
      out.etherscan.blockNumber = a.json || a.text;
      out.etherscan.gasPrice = g.json || g.text;

      // always attempt WLD supply (default address exists)
      const s = await fetchJson(`${base}&module=stats&action=tokensupply&contractaddress=${encodeURIComponent(WLD_WORLDCHAIN)}&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`);
      out.etherscan.wld_token_supply = s.json || s.text;
      out.etherscan.wld_contract = WLD_WORLDCHAIN;
    } else {
      out.etherscan.skipped = "ETHERSCAN_KEY not set";
    }
  } catch (e) {
    out.errors.push(`etherscan:${e.message}`);
  }

  // =========================
  // 5) CoinGecko (KEYED; optional) -> app.js friendly shape
  // =========================
  try {
    if (!CG_KEY) {
      out.coingecko.ok = false;
      out.coingecko.note = "CG_KEY not set";
    } else {
      // 1) simple/price (best for the exact fields app.js wants)
      const simpleUrl =
        "https://api.coingecko.com/api/v3/simple/price" +
        "?ids=worldcoin&vs_currencies=usd,jpy" +
        "&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true";

      const simpleRes = await cgFetchJson(simpleUrl, 8000);

      // 2) markets (gives 24h change reliably + 7d sparkline)
      const marketsUrl =
        "https://api.coingecko.com/api/v3/coins/markets" +
        "?vs_currency=usd&ids=worldcoin&sparkline=true&price_change_percentage=24h";

      const marketsRes = await cgFetchJson(marketsUrl, 8000);

      // choose mode (prefer the one that worked)
      const mode = simpleRes.ok ? simpleRes.mode : (marketsRes.ok ? marketsRes.mode : "failed");
      out.coingecko.mode = mode;

      const simple = (simpleRes.json && simpleRes.json.worldcoin) ? simpleRes.json.worldcoin : null;
      const markets = (Array.isArray(marketsRes.json) && marketsRes.json[0]) ? marketsRes.json[0] : null;

      // Build app.js expected structure (NO dummy)
      if (simple || markets) {
        const s = {
          usd: simple?.usd ?? (markets?.current_price ?? null),
          jpy: simple?.jpy ?? null,
          usd_market_cap: simple?.usd_market_cap ?? (markets?.market_cap ?? null),
          usd_24h_vol: simple?.usd_24h_vol ?? (markets?.total_volume ?? null),
          // CoinGecko simple sometimes returns null; if so, use markets change%
          usd_24h_change: (simple?.usd_24h_change ?? null) ?? (markets?.price_change_percentage_24h ?? null),
          jpy_market_cap: simple?.jpy_market_cap ?? null,
          jpy_24h_vol: simple?.jpy_24h_vol ?? null,
          jpy_24h_change: simple?.jpy_24h_change ?? null,
        };

        // 7d prices -> from markets sparkline_in_7d.price (array of numbers)
        const prices = Array.isArray(markets?.sparkline_in_7d?.price) ? markets.sparkline_in_7d.price : null;

        out.coingecko.ok = true;
        out.coingecko.simple = s;
        out.coingecko.chart7d_usd = prices ? { prices } : null;
        out.coingecko.note = `CoinGecko ok. mode=${mode}. simple=${!!simple} markets=${!!markets}`;
      } else {
        out.coingecko.ok = false;
        out.coingecko.note =
          `CoinGecko failed. simple_http=${simpleRes.status} markets_http=${marketsRes.status}`;
      }

      // optional debug (small)
      out.coingecko.http_status = {
        simple: simpleRes.status || null,
        markets: marketsRes.status || null,
      };
    }
  } catch (e) {
    out.coingecko.ok = false;
    out.coingecko.note = null;
    out.errors.push(`coingecko:${e.message}`);
  }

  out.elapsed_ms = Date.now() - startedAt;

  // IMPORTANT: return 200 even if partial failures
  if (out.errors.length) out.ok = false;
  return json(out, 200);
}
