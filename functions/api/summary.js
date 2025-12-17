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
      simple: null,        // app.js expects this
      chart7d_usd: null,   // keep null for now (save subrequests)
      note: null,
      http_status: null,
    },
    activity_sample: null, // app.js expects this
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

  // CoinGecko: keep it LIGHT.
  // Try demo header once; if it fails with auth-ish error, try pro header once.
  const cgFetchJsonLight = async (url, timeoutMs = 8000) => {
    if (!CG_KEY) return { ok: false, status: 0, json: null, mode: null, text: "CG_KEY not set" };

    const demo = await fetchJson(url, { headers: { "x-cg-demo-api-key": CG_KEY } }, timeoutMs);
    if (demo.ok) return { ...demo, mode: "demo" };

    // If demo fails, attempt pro once (still only 2 fetch max)
    const pro = await fetchJson(url, { headers: { "x-cg-pro-api-key": CG_KEY } }, timeoutMs);
    if (pro.ok) return { ...pro, mode: "pro" };

    return { ...pro, mode: "failed", text: pro.text || demo.text, json: pro.json || demo.json };
  };

  // =========================
  // 1) CORE RPC (critical) - keep it light
  // =========================
  let rpcHealthy = false;
  let latestBlockRaw = null; // reuse for activity sample
  try {
    const chainIdHex = await rpcCall("eth_chainId");
    out.rpc.chain_id_hex = chainIdHex;
    out.rpc.chain_id_dec = hexToInt(chainIdHex);

    const bnHex = await rpcCall("eth_blockNumber");
    out.rpc.latest_block_hex = bnHex;
    out.rpc.latest_block_dec = hexToInt(bnHex);

    latestBlockRaw = await rpcCall("eth_getBlockByNumber", ["latest", false]);
    out.rpc.latest_block = {
      number: hexToInt(latestBlockRaw?.number),
      timestamp: hexToInt(latestBlockRaw?.timestamp),
      tx_count: Array.isArray(latestBlockRaw?.transactions) ? latestBlockRaw.transactions.length : null,
      gas_used: hexToInt(latestBlockRaw?.gasUsed),
      gas_limit: hexToInt(latestBlockRaw?.gasLimit),
      base_fee_per_gas: latestBlockRaw?.baseFeePerGas ?? null,
    };

    out.rpc.gas_price = await rpcCall("eth_gasPrice");

    // Optional (1 call each). Keep but tolerate failure.
    try {
      out.rpc.max_priority_fee = await rpcCall("eth_maxPriorityFeePerGas");
    } catch (e) {
      out.rpc.max_priority_fee = null;
      out.warnings.push(`rpc:eth_maxPriorityFeePerGas:${e.message}`);
    }

    // OPTIONAL: feeHistory is useful but not critical; keep small.
    try {
      out.rpc.fee_history = await rpcCall("eth_feeHistory", ["0x3", "latest", [10, 50, 90]]);
    } catch (e) {
      out.rpc.fee_history = null;
      out.warnings.push(`rpc:eth_feeHistory:${e.message}`);
    }

    // TPS estimate: keep LIGHT (2 blocks only)
    // (Old version used 11 blocks -> too many subrequests)
    try {
      const bn = out.rpc.latest_block_dec;
      if (typeof bn === "number" && bn > 30) {
        const back = 20;
        const b0 = latestBlockRaw;
        const b1 = await rpcCall("eth_getBlockByNumber", ["0x" + (bn - back).toString(16), false], 8000);

        const t0 = hexToInt(b0?.timestamp);
        const t1 = hexToInt(b1?.timestamp);
        const dt = (typeof t0 === "number" && typeof t1 === "number") ? (t0 - t1) : null;

        const tx0 = Array.isArray(b0?.transactions) ? b0.transactions.length : null;
        const tx1 = Array.isArray(b1?.transactions) ? b1.transactions.length : null;

        if (dt && dt > 0 && typeof tx0 === "number" && typeof tx1 === "number") {
          const blocks = back;
          const avgDt = dt / blocks;
          const avgTxc = (tx0 + tx1) / 2;
          out.rpc.block_time_avg_s = avgDt;
          out.rpc.tx_per_block_avg = avgTxc;
          out.rpc.tps_estimate = avgDt > 0 ? (avgTxc / avgDt) : null;
          out.rpc.tps_note = `Light TPS estimate using latest and latest-${back}.`;
        }
      }
    } catch (e) {
      out.warnings.push(`rpc:tps_estimate:${e.message}`);
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
  // 3.5) Activity sample (LIGHT + REAL):
  // - only receipts for first N tx hashes
  // - provides token_pct (Token Transfers %)
  // - does NOT do eth_getCode / eth_getTransactionByHash (too many subrequests)
  // =========================
  try {
    if (!rpcHealthy) throw new Error("RPC not healthy");

    const SAMPLE_N = 12;
    const hashes = Array.isArray(latestBlockRaw?.transactions)
      ? latestBlockRaw.transactions.slice(0, SAMPLE_N)
      : [];

    if (!hashes.length) {
      out.activity_sample = null;
      out.activity_note = "No tx hashes available in latest block.";
    } else {
      let token = 0;
      let token_contract_sample = null;

      for (const h of hashes) {
        const receipt = await rpcCall("eth_getTransactionReceipt", [h], 8000);
        const logs = receipt?.logs || [];

        const transferLog = logs.find((lg) => {
          const t = lg?.topics || [];
          return t[0] && String(t[0]).toLowerCase() === TRANSFER_TOPIC0;
        });

        if (transferLog) {
          token++;
          if (!token_contract_sample) token_contract_sample = transferLog.address || null;
        }
      }

      const total = hashes.length;
      const pct = (x) => total ? (x * 100) / total : null;

      out.activity_sample = {
        sample_n: total,
        // Keep these keys for app.js compatibility; we only guarantee token_pct now.
        native_pct: null,
        contract_pct: null,
        token_pct: pct(token),     // <- Token Transfers (%)
        other_pct: null,
        create_pct: null,
        token_contract_sample,
      };

      out.activity_note =
        `Computed from latest block tx hashes. token_pct uses receipts(logs topic0=Transfer). ` +
        `To avoid Cloudflare subrequest limits, native/contract breakdown is disabled in this lightweight mode. sample_n=${total}`;
    }
  } catch (e) {
    out.activity_sample = null;
    out.activity_note = null;
    out.warnings.push(`activity_sample:${e.message}`);
  }

  // =========================
  // 4) Etherscan v2 (KEYED; optional) - keep LIGHT
  // =========================
  try {
    if (ETHERSCAN_KEY) {
      const base = "https://api.etherscan.io/v2/api?chainid=480";

      const a = await fetchJson(`${base}&module=proxy&action=eth_blockNumber&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`, {}, 8000);
      const g = await fetchJson(`${base}&module=proxy&action=eth_gasPrice&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`, {}, 8000);

      out.etherscan.blockNumber = a.json || a.text;
      out.etherscan.gasPrice = g.json || g.text;

      const s = await fetchJson(
        `${base}&module=stats&action=tokensupply&contractaddress=${encodeURIComponent(WLD_WORLDCHAIN)}&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`,
        {},
        8000
      );
      out.etherscan.wld_token_supply = s.json || s.text;
      out.etherscan.wld_contract = WLD_WORLDCHAIN;
    } else {
      out.etherscan.skipped = "ETHERSCAN_KEY not set";
    }
  } catch (e) {
    out.warnings.push(`etherscan:${e.message}`);
  }

  // =========================
  // 5) CoinGecko (KEYED; optional) - keep LIGHT (simple/price only)
  // =========================
  try {
    if (!CG_KEY) {
      out.coingecko.ok = false;
      out.coingecko.note = "CG_KEY not set";
      out.coingecko.http_status = { simple: null };
    } else {
      const simpleUrl =
        "https://api.coingecko.com/api/v3/simple/price" +
        `?ids=${encodeURIComponent(CG_COIN_ID)}` +
        "&vs_currencies=usd,jpy" +
        "&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true";

      const res = await cgFetchJsonLight(simpleUrl, 8000);

      out.coingecko.mode = res.mode || null;
      out.coingecko.http_status = { simple: res.status || null };

      const root = res.json || null;
      const simple = (root && root[CG_COIN_ID]) ? root[CG_COIN_ID] : null;

      if (res.ok && simple) {
        out.coingecko.ok = true;
        out.coingecko.simple = {
          usd: simple?.usd ?? null,
          jpy: simple?.jpy ?? null,
          usd_market_cap: simple?.usd_market_cap ?? null,
          usd_24h_vol: simple?.usd_24h_vol ?? null,
          usd_24h_change: simple?.usd_24h_change ?? null,
          jpy_market_cap: simple?.jpy_market_cap ?? null,
          jpy_24h_vol: simple?.jpy_24h_vol ?? null,
          jpy_24h_change: simple?.jpy_24h_change ?? null,
        };
        out.coingecko.chart7d_usd = null; // intentionally disabled for subrequest safety
        out.coingecko.note = `CoinGecko ok (light). mode=${out.coingecko.mode}. coin_id=${CG_COIN_ID}.`;
      } else {
        out.coingecko.ok = false;
        out.coingecko.simple = null;
        out.coingecko.chart7d_usd = null;
        out.coingecko.note = `CoinGecko failed (light). http=${res.status} mode=${res.mode} coin_id=${CG_COIN_ID}.`;
      }
    }
  } catch (e) {
    out.coingecko.ok = false;
    out.coingecko.note = null;
    out.warnings.push(`coingecko:${e.message}`);
  }

  out.elapsed_ms = Date.now() - startedAt;

  // Overall ok: RPC が死んでる時だけ false（warnings では落とさない）
  if (!rpcHealthy) out.ok = false;

  return json(out, 200);
}
