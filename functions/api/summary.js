export async function onRequestGet({ env, request }) {
  const startedAt = Date.now();

  // ---- env (Cloudflare Pages Functions: use env, NOT process.env) ----
  const RPC = (env.RPC || env.RPC_URL || "").trim();
  const ETHERSCAN_KEY = (env.ETHERSCAN_KEY || "").trim();
  const CG_KEY = (env.CG_KEY || "").trim();

  // WLD (World Chain) token contract (default if not provided)
  const DEFAULT_WLD_WORLDCHAIN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";
  const WLD_WORLDCHAIN = (env.WLD_WORLDCHAIN || DEFAULT_WLD_WORLDCHAIN).trim();

  // CoinGecko coin id (current)
  const CG_COIN_ID = "worldcoin-wld";

  // ERC-20 Transfer topic0
  const TRANSFER_TOPIC0 =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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
      coin_id: CG_COIN_ID,
      simple: null,          // app.js expects this
      chart7d_usd: null,     // app.js expects this.prices (number[])
      note: null,
      http_status: null,
    },
    activity_sample: null,   // app.js expects this
    activity_note: null,
    world_status: {},
    worldscan: {},
    errors: [],
    warnings: [],
  };

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });

  const withTimeout = async (fn, ms, label) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(`timeout:${label}`), ms);
    try {
      return await fn(ac.signal);
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

  // CoinGecko: try demo header then pro header
  const cgFetchJson = async (url, timeoutMs = 8000) => {
    if (!CG_KEY) return { ok: false, status: 0, json: null, mode: null, text: "CG_KEY not set" };

    const demo = await fetchJson(url, { headers: { "x-cg-demo-api-key": CG_KEY } }, timeoutMs);
    if (demo.ok) return { ...demo, mode: "demo" };

    const pro = await fetchJson(url, { headers: { "x-cg-pro-api-key": CG_KEY } }, timeoutMs);
    if (pro.ok) return { ...pro, mode: "pro" };

    return { ...pro, mode: "failed", text: pro.text || demo.text, json: pro.json || demo.json };
  };

  // =========================
  // 1) CORE RPC (critical)
  // =========================
  let rpcHealthy = false;
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
      out.warnings.push(`rpc:eth_maxPriorityFeePerGas:${e.message}`);
    }
    try {
      out.rpc.fee_history = await rpcCall("eth_feeHistory", ["0x5", "latest", [10, 50, 90]]);
    } catch (e) {
      out.rpc.fee_history = null;
      out.warnings.push(`rpc:eth_feeHistory:${e.message}`);
    }

    // Avg block time + TPS estimate (11 blocks)
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

    rpcHealthy = true;
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
    out.warnings.push(`world_status:${e.message}`);
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
    out.warnings.push(`worldscan:${e.message}`);
  }

  // =========================
  // 3.5) Activity sample (REAL: latest block tx hashes -> tx+receipt)
  // =========================
  try {
    if (!rpcHealthy) throw new Error("RPC not healthy");

    const SAMPLE_N = 12;

    // Get latest block (hashes only) to avoid huge payload
    const blk = await rpcCall("eth_getBlockByNumber", ["latest", false], 12000);
    const hashes = Array.isArray(blk?.transactions) ? blk.transactions.slice(0, SAMPLE_N) : [];

    if (!hashes.length) {
      out.activity_sample = null;
      out.activity_note = "No tx hashes available in latest block.";
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

      let eoa = 0;             // tx to EOA
      let contract_other = 0;   // tx to contract but NOT token transfer
      let token = 0;            // tx that emitted ERC20 Transfer
      let create = 0;           // contract creation (to=null)
      let token_contract_sample = null;

      for (const h of hashes) {
        const tx = await rpcCall("eth_getTransactionByHash", [h], 8000);
        const receipt = await rpcCall("eth_getTransactionReceipt", [h], 8000);

        const logs = receipt?.logs || [];
        const hasTransfer = logs.some((lg) => {
          const t = lg?.topics || [];
          return t[0] && String(t[0]).toLowerCase() === TRANSFER_TOPIC0;
        });

        if (hasTransfer) {
          token++;
          if (!token_contract_sample) {
            const lg = logs.find((x) => (x?.topics || [])[0] && String(x.topics[0]).toLowerCase() === TRANSFER_TOPIC0);
            token_contract_sample = lg?.address || null;
          }
          continue; // token tx bucket wins
        }

        const to = tx?.to;
        if (!to) {
          create++;
          continue;
        }

        const c = await isContract(to);
        if (c) contract_other++;
        else eoa++;
      }

      const total = eoa + contract_other + token + create;
      const pct = (x) => total ? (x * 100) / total : null;

      // Keep app.js compatible field names BUT now token_pct is real.
      // (If your UI labels say "Native Transfers", rename in UI to "Tx to EOA".)
      out.activity_sample = {
        sample_n: hashes.length,
        native_pct: pct(eoa),
        contract_pct: pct(contract_other + create), // exclude token
        token_pct: pct(token),
        other_pct: 0,
        create_pct: pct(create),
        token_contract_sample,
      };

      out.activity_note =
        `Computed from latest block tx hashes. token_pct uses receipts(logs topic0=Transfer). ` +
        `native_pct is tx-to-EOA (not strictly value transfer). sample_n=${hashes.length}`;
    }
  } catch (e) {
    out.activity_sample = null;
    out.activity_note = null;
    out.warnings.push(`activity_sample:${e.message}`);
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

      const s = await fetchJson(
        `${base}&module=stats&action=tokensupply&contractaddress=${encodeURIComponent(WLD_WORLDCHAIN)}&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`
      );
      out.etherscan.wld_token_supply = s.json || s.text;
      out.etherscan.wld_contract = WLD_WORLDCHAIN;

      // Optional: recent WLD transfer logs count (indexer-ish, but still via Etherscan logs)
      // Keep it light: only 200 blocks window, max 1000 rows
      try {
        const latestHex = a.json?.result || null;
        const latestDec = hexToInt(latestHex);
        if (typeof latestDec === "number" && latestDec > 300) {
          const from = latestDec - 200;
          const to = latestDec;
          const logsUrl =
            `${base}&module=logs&action=getLogs` +
            `&fromBlock=${from}&toBlock=${to}` +
            `&address=${encodeURIComponent(WLD_WORLDCHAIN)}` +
            `&topic0=${TRANSFER_TOPIC0}` +
            `&page=1&offset=1000` +
            `&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`;

          const lr = await fetchJson(logsUrl, {}, 12000);
          const r = lr.json?.result || [];
          out.etherscan.wld_transfer_logs_recent = {
            http_status: lr.status,
            ok: lr.ok,
            fromBlock: from,
            toBlock: to,
            logs: Array.isArray(r) ? r.length : null,
            sample_txHash: Array.isArray(r) && r[0]?.transactionHash ? r[0].transactionHash : null,
          };
        }
      } catch (e) {
        out.warnings.push(`etherscan:logs_sample:${e.message}`);
      }
    } else {
      out.etherscan.skipped = "ETHERSCAN_KEY not set";
    }
  } catch (e) {
    out.warnings.push(`etherscan:${e.message}`);
  }

  // =========================
  // 5) CoinGecko (KEYED; optional) -> app.js friendly shape
  // =========================
  try {
    if (!CG_KEY) {
      out.coingecko.ok = false;
      out.coingecko.note = "CG_KEY not set";
      out.coingecko.http_status = { simple: null, markets: null };
    } else {
      const simpleUrl =
        "https://api.coingecko.com/api/v3/simple/price" +
        `?ids=${encodeURIComponent(CG_COIN_ID)}` +
        "&vs_currencies=usd,jpy" +
        "&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true";

      const marketsUrl =
        "https://api.coingecko.com/api/v3/coins/markets" +
        "?vs_currency=usd" +
        `&ids=${encodeURIComponent(CG_COIN_ID)}` +
        "&sparkline=true&price_change_percentage=24h";

      const simpleRes = await cgFetchJson(simpleUrl, 8000);
      const marketsRes = await cgFetchJson(marketsUrl, 8000);

      const mode = simpleRes.ok ? simpleRes.mode : (marketsRes.ok ? marketsRes.mode : "failed");
      out.coingecko.mode = mode;

      const simpleRoot = simpleRes.json || null;
      const simple = (simpleRoot && simpleRoot[CG_COIN_ID]) ? simpleRoot[CG_COIN_ID] : null;
      const markets = (Array.isArray(marketsRes.json) && marketsRes.json[0]) ? marketsRes.json[0] : null;

      if (simple || markets) {
        const s = {
          usd: simple?.usd ?? (markets?.current_price ?? null),
          jpy: simple?.jpy ?? null,
          usd_market_cap: simple?.usd_market_cap ?? (markets?.market_cap ?? null),
          usd_24h_vol: simple?.usd_24h_vol ?? (markets?.total_volume ?? null),
          usd_24h_change: (simple?.usd_24h_change ?? null) ?? (markets?.price_change_percentage_24h ?? null),
          jpy_market_cap: simple?.jpy_market_cap ?? null,
          jpy_24h_vol: simple?.jpy_24h_vol ?? null,
          jpy_24h_change: simple?.jpy_24h_change ?? null,
        };

        const prices = Array.isArray(markets?.sparkline_in_7d?.price) ? markets.sparkline_in_7d.price : null;

        out.coingecko.ok = true;
        out.coingecko.simple = s;
        out.coingecko.chart7d_usd = prices ? { prices } : null;
        out.coingecko.note = `CoinGecko ok. mode=${mode}. coin_id=${CG_COIN_ID}. simple=${!!simple} markets=${!!markets}`;
      } else {
        out.coingecko.ok = false;
        out.coingecko.note = `CoinGecko failed. simple_http=${simpleRes.status} markets_http=${marketsRes.status} coin_id=${CG_COIN_ID}`;
      }

      out.coingecko.http_status = {
        simple: simpleRes.status || null,
        markets: marketsRes.status || null,
      };
    }
  } catch (e) {
    out.coingecko.ok = false;
    out.coingecko.note = null;
    out.warnings.push(`coingecko:${e.message}`);
  }

  out.elapsed_ms = Date.now() - startedAt;

  // Overall ok: RPCが死んでる時だけ false にする（warnings では落とさない）
  if (!rpcHealthy) out.ok = false;

  return json(out, 200);
}
