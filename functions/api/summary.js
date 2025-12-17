export async function onRequestGet({ env, request }) {
  const startedAt = Date.now();

  // ---- env (Cloudflare Pages Functions: use env, NOT process.env) ----
  const RPC = (env.RPC || env.RPC_URL || "").trim();
  const ETHERSCAN_KEY = (env.ETHERSCAN_KEY || "").trim();
  const CG_KEY = (env.CG_KEY || "").trim();

  // WLD (World Chain) token contract (default if not provided)
  const DEFAULT_WLD_WORLDCHAIN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";
  const WLD_WORLDCHAIN = (env.WLD_WORLDCHAIN || DEFAULT_WLD_WORLDCHAIN).trim();

  // CoinGecko coin id candidates (fallback)
  const CG_COIN_IDS = ["worldcoin-wld", "worldcoin"];

  // ERC-20 Transfer topic0
  const TRANSFER_TOPIC0 =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  // subrequest budget (Cloudflare cap is ~50; keep buffer)
  const SUBREQ_BUDGET = Number(env.SUBREQ_BUDGET || 40);
  let subreqCount = 0;

  const out = {
    ok: true,
    ts: new Date().toISOString(),
    elapsed_ms: 0,
    env_present: {
      RPC: !!RPC,
      ETHERSCAN_KEY: !!ETHERSCAN_KEY,
      CG_KEY: !!CG_KEY,
      // NOTE: default exists so this is always true; keep for UI but add override flag too
      WLD_WORLDCHAIN: !!WLD_WORLDCHAIN,
      WLD_WORLDCHAIN_OVERRIDE: !!(env.WLD_WORLDCHAIN && String(env.WLD_WORLDCHAIN).trim()),
    },
    rpc: {},
    etherscan: {},
    coingecko: {
      ok: false,
      mode: null,
      coin_id: null,
      simple: null,       // app.js expects this
      chart7d_usd: null,  // app.js expects this.prices (number[])
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
    if (subreqCount >= SUBREQ_BUDGET) {
      throw new Error(`Too many subrequests (budget=${SUBREQ_BUDGET})`);
    }
    subreqCount++;

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
  let latestBlockObj = null;
  let latestBlockHex = null;

  try {
    const chainIdHex = await rpcCall("eth_chainId");
    out.rpc.chain_id_hex = chainIdHex;
    out.rpc.chain_id_dec = hexToInt(chainIdHex);

    const bnHex = await rpcCall("eth_blockNumber");
    out.rpc.latest_block_hex = bnHex;
    out.rpc.latest_block_dec = hexToInt(bnHex);

    // keep this light: latest block summary only
    latestBlockObj = await rpcCall("eth_getBlockByNumber", ["latest", false]);
    latestBlockHex = latestBlockObj?.number || bnHex;

    out.rpc.latest_block = {
      number: hexToInt(latestBlockObj?.number),
      timestamp: hexToInt(latestBlockObj?.timestamp),
      tx_count: Array.isArray(latestBlockObj?.transactions) ? latestBlockObj.transactions.length : null,
      gas_used: hexToInt(latestBlockObj?.gasUsed),
      gas_limit: hexToInt(latestBlockObj?.gasLimit),
      base_fee_per_gas: latestBlockObj?.baseFeePerGas ?? null,
    };

    out.rpc.gas_price = await rpcCall("eth_gasPrice");

    // optional RPCs (may not exist)
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

    // NOTE: TPS estimation via 11 blocks was removed to avoid subrequest explosion.
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
      if (subreqCount >= SUBREQ_BUDGET) throw new Error(`Too many subrequests (budget=${SUBREQ_BUDGET})`);
      subreqCount++;
      const res = await fetch("https://worldscan.org/", { method: "HEAD", signal });
      return { status: res.status, ok: res.ok };
    }, 8000, "worldscan_head");
    out.worldscan = r;
  } catch (e) {
    out.warnings.push(`worldscan:${e.message}`);
  }

  // =========================
  // 3.5) Activity sample (REAL: tx hashes -> receipt only)
  // =========================
  try {
    if (!rpcHealthy) throw new Error("RPC not healthy");

    const url = new URL(request.url);
    const SAMPLE_N = Math.max(3, Math.min(12, Number(url.searchParams.get("sample_n") || 12)));

    const hashes = Array.isArray(latestBlockObj?.transactions)
      ? latestBlockObj.transactions.slice(0, SAMPLE_N)
      : [];

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

      let eoa = 0;             // tx to EOA (receipt.to)
      let contract_other = 0;   // tx to contract but NOT token transfer
      let token = 0;            // tx that emitted ERC20 Transfer
      let create = 0;           // contract creation (receipt.to = null)
      let token_contract_sample = null;

      for (const h of hashes) {
        const receipt = await rpcCall("eth_getTransactionReceipt", [h], 10000);

        const logs = receipt?.logs || [];
        const hasTransfer = Array.isArray(logs) && logs.some((lg) => {
          const t = lg?.topics || [];
          return t[0] && String(t[0]).toLowerCase() === TRANSFER_TOPIC0;
        });

        if (hasTransfer) {
          token++;
          if (!token_contract_sample) {
            const lg = logs.find((x) => (x?.topics || [])[0] && String(x.topics[0]).toLowerCase() === TRANSFER_TOPIC0);
            token_contract_sample = lg?.address || null;
          }
          continue;
        }

        const to = receipt?.to;
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

      // Provide multiple key names for UI compatibility
      const tokenPct = pct(token);

      out.activity_sample = {
        sample_n: hashes.length,

        // old-ish keys
        native_pct: pct(eoa),
        contract_pct: pct(contract_other + create),
        other_pct: 0,

        // NEW + alias keys for Token Transfers UI
        token_pct: tokenPct,
        token_transfer_pct: tokenPct,
        token_transfers_pct: tokenPct,

        create_pct: pct(create),
        token_contract_sample,
      };

      out.activity_note =
        `Computed from latest block tx receipts. token_% uses receipt.logs topic0=Transfer. ` +
        `native_pct=tx-to-EOA(approx). sample_n=${hashes.length}`;
    }
  } catch (e) {
    out.activity_sample = null;
    out.activity_note = null;
    out.warnings.push(`activity_sample:${e.message}`);
  }

  // =========================
  // 4) Etherscan v2 (KEYED; optional) - keep it light
  // =========================
  try {
    if (!ETHERSCAN_KEY) {
      out.etherscan.skipped = "ETHERSCAN_KEY not set";
    } else {
      const base = "https://api.etherscan.io/v2/api?chainid=480";

      // token supply only (RPC already has gas/block)
      const s = await fetchJson(
        `${base}&module=stats&action=tokensupply&contractaddress=${encodeURIComponent(WLD_WORLDCHAIN)}&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`,
        {},
        12000
      );
      out.etherscan.wld_token_supply = s.json || s.text;
      out.etherscan.wld_contract = WLD_WORLDCHAIN;

      // recent WLD transfer logs count (200 blocks window, max 1000 rows)
      try {
        const latestDec = out.rpc.latest_block_dec;
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
      let pickedId = null;
      let pickedMode = null;

      for (const id of CG_COIN_IDS) {
        const simpleUrl =
          "https://api.coingecko.com/api/v3/simple/price" +
          `?ids=${encodeURIComponent(id)}` +
          "&vs_currencies=usd,jpy" +
          "&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true";

        const marketsUrl =
          "https://api.coingecko.com/api/v3/coins/markets" +
          "?vs_currency=usd" +
          `&ids=${encodeURIComponent(id)}` +
          "&sparkline=true&price_change_percentage=24h";

        const simpleRes = await cgFetchJson(simpleUrl, 10000);
        const marketsRes = await cgFetchJson(marketsUrl, 10000);

        const mode = simpleRes.ok ? simpleRes.mode : (marketsRes.ok ? marketsRes.mode : "failed");

        const simpleRoot = simpleRes.json || null;
        const simple = (simpleRoot && simpleRoot[id]) ? simpleRoot[id] : null;
        const markets = (Array.isArray(marketsRes.json) && marketsRes.json[0]) ? marketsRes.json[0] : null;

        if (simple || markets) {
          pickedId = id;
          pickedMode = mode;

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

          const prices = Array.isArray(markets?.sparkline_in_7d?.price)
            ? markets.sparkline_in_7d.price
            : null;

          out.coingecko.ok = true;
          out.coingecko.coin_id = pickedId;
          out.coingecko.mode = pickedMode;
          out.coingecko.simple = s;
          out.coingecko.chart7d_usd = prices ? { prices } : null;
          out.coingecko.note = `CoinGecko ok. mode=${pickedMode}. coin_id=${pickedId}. simple=${!!simple} markets=${!!markets}`;
          out.coingecko.http_status = {
            simple: simpleRes.status || null,
            markets: marketsRes.status || null,
          };
          break;
        } else {
          // try next id
          out.coingecko.http_status = {
            simple: simpleRes.status || null,
            markets: marketsRes.status || null,
          };
        }
      }

      if (!pickedId && !out.coingecko.ok) {
        out.coingecko.note = `CoinGecko failed for ids=${CG_COIN_IDS.join(",")}.`;
      }
    }
  } catch (e) {
    out.coingecko.ok = false;
    out.coingecko.note = null;
    out.warnings.push(`coingecko:${e.message}`);
  }

  out.elapsed_ms = Date.now() - startedAt;

  // Overall ok: RPCが死んでる時だけ false にする（warnings では落とさない）
  if (!rpcHealthy) out.ok = false;

  // debug
  out.rpc._subreq_count = subreqCount;
  out.rpc._subreq_budget = SUBREQ_BUDGET;

  return json(out, 200);
}
