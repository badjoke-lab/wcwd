export async function onRequestGet({ env, request }) {
  const startedAt = Date.now();

  // ---- env (Cloudflare Pages Functions: use env, NOT process.env) ----
  const RPC = (env.RPC || env.RPC_URL || "").trim();
  const ETHERSCAN_KEY = (env.ETHERSCAN_KEY || "").trim();
  const CG_KEY = (env.CG_KEY || "").trim();
  const WLD_WORLDCHAIN = (env.WLD_WORLDCHAIN || "").trim();

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
    coingecko: {},
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

  // =========================
  // 1) CORE RPC (1-5)
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

    // Fee signals
    out.rpc.gas_price = await rpcCall("eth_gasPrice");
    // maxPriorityFee may not exist on some chains; keep soft-fail
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

    // Avg block time + TPS estimate (last 10 intervals)
    const bn = out.rpc.latest_block_dec;
    if (typeof bn === "number" && bn > 12) {
      const nums = Array.from({ length: 11 }, (_, i) => bn - i);
      // sequential (safe) to avoid burst limits
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
  // 4) Etherscan v2 (KEYED; optional)
  // =========================
  try {
    if (ETHERSCAN_KEY) {
      const base = "https://api.etherscan.io/v2/api?chainid=480";
      const a = await fetchJson(`${base}&module=proxy&action=eth_blockNumber&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`);
      const g = await fetchJson(`${base}&module=proxy&action=eth_gasPrice&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`);
      out.etherscan.blockNumber = a.json || a.text;
      out.etherscan.gasPrice = g.json || g.text;

      if (WLD_WORLDCHAIN) {
        const s = await fetchJson(`${base}&module=stats&action=tokensupply&contractaddress=${encodeURIComponent(WLD_WORLDCHAIN)}&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`);
        out.etherscan.wld_token_supply = s.json || s.text;
      }
    } else {
      out.etherscan.skipped = "ETHERSCAN_KEY not set";
    }
  } catch (e) {
    out.errors.push(`etherscan:${e.message}`);
  }

  // =========================
  // 5) CoinGecko (KEYED; optional)
  // =========================
  try {
    if (CG_KEY) {
      const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=worldcoin&sparkline=true&price_change_percentage=24h";
      // try demo header first, then pro header
      const demo = await fetchJson(url, { headers: { "x-cg-demo-api-key": CG_KEY } }, 8000);
      if (demo.ok) {
        out.coingecko.mode = "demo";
        out.coingecko.data = demo.json || demo.text;
      } else {
        const pro = await fetchJson(url, { headers: { "x-cg-pro-api-key": CG_KEY } }, 8000);
        out.coingecko.mode = pro.ok ? "pro" : "failed";
        out.coingecko.data = pro.json || pro.text || demo.json || demo.text;
        out.coingecko.http_status = pro.status;
      }
    } else {
      out.coingecko.skipped = "CG_KEY not set";
    }
  } catch (e) {
    out.errors.push(`coingecko:${e.message}`);
  }

  out.elapsed_ms = Date.now() - startedAt;

  // IMPORTANT: return 200 even if partial failures (no more 500-blackout)
  if (out.errors.length) out.ok = false;
  return json(out, 200);
}
