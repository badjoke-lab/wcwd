var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/summary.js
async function onRequestGet({ env, request }) {
  const startedAt = Date.now();
  const RPC = (env.RPC || env.RPC_URL || "").trim();
  const ETHERSCAN_KEY = (env.ETHERSCAN_KEY || "").trim();
  const CG_KEY = (env.CG_KEY || "").trim();
  const DEFAULT_WLD_WORLDCHAIN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";
  const WLD_WORLDCHAIN = (env.WLD_WORLDCHAIN || DEFAULT_WLD_WORLDCHAIN).trim();
  const CG_COIN_ID = "worldcoin-wld";
  const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const out = {
    ok: true,
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    elapsed_ms: 0,
    env_present: {
      RPC: !!RPC,
      ETHERSCAN_KEY: !!ETHERSCAN_KEY,
      CG_KEY: !!CG_KEY,
      WLD_WORLDCHAIN: !!WLD_WORLDCHAIN
    },
    rpc: {},
    etherscan: {},
    coingecko: {
      ok: false,
      mode: null,
      coin_id: CG_COIN_ID,
      simple: null,
      // app.js expects this
      chart7d_usd: null,
      // app.js expects this.prices (number[])
      note: null,
      http_status: null
    },
    activity_sample: null,
    // app.js expects this
    activity_note: null,
    world_status: {},
    worldscan: {},
    errors: [],
    warnings: []
  };
  const json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  }), "json");
  const withTimeout = /* @__PURE__ */ __name(async (fn, ms, label) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(`timeout:${label}`), ms);
    try {
      return await fn(ac.signal);
    } finally {
      clearTimeout(t);
    }
  }, "withTimeout");
  const fetchJson = /* @__PURE__ */ __name(async (url, init = {}, timeoutMs = 8e3) => {
    return withTimeout(async (signal) => {
      const r = await fetch(url, { ...init, signal });
      const text = await r.text();
      let j = null;
      try {
        j = JSON.parse(text);
      } catch {
      }
      return { status: r.status, ok: r.ok, text, json: j };
    }, timeoutMs, `fetch:${url}`);
  }, "fetchJson");
  const rpcCall = /* @__PURE__ */ __name(async (method, params = [], timeoutMs = 8e3) => {
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
  }, "rpcCall");
  const hexToInt = /* @__PURE__ */ __name((h) => {
    if (!h || h === "null") return null;
    if (typeof h !== "string") return null;
    return parseInt(h.startsWith("0x") ? h.slice(2) : h, 16);
  }, "hexToInt");
  const cgFetchJson = /* @__PURE__ */ __name(async (url, timeoutMs = 8e3) => {
    if (!CG_KEY) return { ok: false, status: 0, json: null, mode: null, text: "CG_KEY not set" };
    const demo = await fetchJson(url, { headers: { "x-cg-demo-api-key": CG_KEY } }, timeoutMs);
    if (demo.ok) return { ...demo, mode: "demo" };
    const pro = await fetchJson(url, { headers: { "x-cg-pro-api-key": CG_KEY } }, timeoutMs);
    if (pro.ok) return { ...pro, mode: "pro" };
    return { ...pro, mode: "failed", text: pro.text || demo.text, json: pro.json || demo.json };
  }, "cgFetchJson");
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
      base_fee_per_gas: latestBlock?.baseFeePerGas ?? null
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
    const bn = out.rpc.latest_block_dec;
    if (typeof bn === "number" && bn > 12) {
      const nums = Array.from({ length: 11 }, (_, i) => bn - i);
      const blocks = [];
      for (const n of nums) {
        const b = await rpcCall("eth_getBlockByNumber", ["0x" + n.toString(16), false]);
        blocks.push({
          n,
          ts: hexToInt(b?.timestamp) || 0,
          txc: Array.isArray(b?.transactions) ? b.transactions.length : 0
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
      const tps = avgDt && avgDt > 0 ? avgTxc / avgDt : null;
      out.rpc.block_time_avg_s = avgDt;
      out.rpc.tx_per_block_avg = avgTxc;
      out.rpc.tps_estimate = tps;
    }
    rpcHealthy = true;
  } catch (e) {
    out.errors.push(`rpc:${e.message}`);
  }
  try {
    const r = await fetchJson("https://status.worldcoin.org/api/services", {}, 8e3);
    out.world_status.http_status = r.status;
    out.world_status.ok = r.ok;
    out.world_status.sample = r.json ? r.json : r.text.slice(0, 300);
  } catch (e) {
    out.warnings.push(`world_status:${e.message}`);
  }
  try {
    const r = await withTimeout(async (signal) => {
      const res = await fetch("https://worldscan.org/", { method: "HEAD", signal });
      return { status: res.status, ok: res.ok };
    }, 8e3, "worldscan_head");
    out.worldscan = r;
  } catch (e) {
    out.warnings.push(`worldscan:${e.message}`);
  }
  try {
    if (!rpcHealthy) throw new Error("RPC not healthy");
    const SAMPLE_N = 12;
    const blk = await rpcCall("eth_getBlockByNumber", ["latest", false], 12e3);
    const hashes = Array.isArray(blk?.transactions) ? blk.transactions.slice(0, SAMPLE_N) : [];
    if (!hashes.length) {
      out.activity_sample = null;
      out.activity_note = "No tx hashes available in latest block.";
    } else {
      const codeCache = /* @__PURE__ */ new Map();
      const isContract = /* @__PURE__ */ __name(async (addr) => {
        if (!addr) return false;
        const a = String(addr).toLowerCase();
        if (codeCache.has(a)) return codeCache.get(a);
        const code = await rpcCall("eth_getCode", [addr, "latest"], 8e3);
        const v = !!(code && code !== "0x");
        codeCache.set(a, v);
        return v;
      }, "isContract");
      let eoa = 0;
      let contract_other = 0;
      let token = 0;
      let create = 0;
      let token_contract_sample = null;
      for (const h of hashes) {
        const tx = await rpcCall("eth_getTransactionByHash", [h], 8e3);
        const receipt = await rpcCall("eth_getTransactionReceipt", [h], 8e3);
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
          continue;
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
      const pct = /* @__PURE__ */ __name((x) => total ? x * 100 / total : null, "pct");
      out.activity_sample = {
        sample_n: hashes.length,
        native_pct: pct(eoa),
        contract_pct: pct(contract_other + create),
        // exclude token
        token_pct: pct(token),
        other_pct: 0,
        create_pct: pct(create),
        token_contract_sample
      };
      out.activity_note = `Computed from latest block tx hashes. token_pct uses receipts(logs topic0=Transfer). native_pct is tx-to-EOA (not strictly value transfer). sample_n=${hashes.length}`;
    }
  } catch (e) {
    out.activity_sample = null;
    out.activity_note = null;
    out.warnings.push(`activity_sample:${e.message}`);
  }
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
      try {
        const latestHex = a.json?.result || null;
        const latestDec = hexToInt(latestHex);
        if (typeof latestDec === "number" && latestDec > 300) {
          const from = latestDec - 200;
          const to = latestDec;
          const logsUrl = `${base}&module=logs&action=getLogs&fromBlock=${from}&toBlock=${to}&address=${encodeURIComponent(WLD_WORLDCHAIN)}&topic0=${TRANSFER_TOPIC0}&page=1&offset=1000&apikey=${encodeURIComponent(ETHERSCAN_KEY)}`;
          const lr = await fetchJson(logsUrl, {}, 12e3);
          const r = lr.json?.result || [];
          out.etherscan.wld_transfer_logs_recent = {
            http_status: lr.status,
            ok: lr.ok,
            fromBlock: from,
            toBlock: to,
            logs: Array.isArray(r) ? r.length : null,
            sample_txHash: Array.isArray(r) && r[0]?.transactionHash ? r[0].transactionHash : null
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
  try {
    if (!CG_KEY) {
      out.coingecko.ok = false;
      out.coingecko.note = "CG_KEY not set";
      out.coingecko.http_status = { simple: null, markets: null };
    } else {
      const simpleUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(CG_COIN_ID)}&vs_currencies=usd,jpy&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
      const marketsUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(CG_COIN_ID)}&sparkline=true&price_change_percentage=24h`;
      const simpleRes = await cgFetchJson(simpleUrl, 8e3);
      const marketsRes = await cgFetchJson(marketsUrl, 8e3);
      const mode = simpleRes.ok ? simpleRes.mode : marketsRes.ok ? marketsRes.mode : "failed";
      out.coingecko.mode = mode;
      const simpleRoot = simpleRes.json || null;
      const simple = simpleRoot && simpleRoot[CG_COIN_ID] ? simpleRoot[CG_COIN_ID] : null;
      const markets = Array.isArray(marketsRes.json) && marketsRes.json[0] ? marketsRes.json[0] : null;
      if (simple || markets) {
        const s = {
          usd: simple?.usd ?? (markets?.current_price ?? null),
          jpy: simple?.jpy ?? null,
          usd_market_cap: simple?.usd_market_cap ?? (markets?.market_cap ?? null),
          usd_24h_vol: simple?.usd_24h_vol ?? (markets?.total_volume ?? null),
          usd_24h_change: simple?.usd_24h_change ?? null ?? (markets?.price_change_percentage_24h ?? null),
          jpy_market_cap: simple?.jpy_market_cap ?? null,
          jpy_24h_vol: simple?.jpy_24h_vol ?? null,
          jpy_24h_change: simple?.jpy_24h_change ?? null
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
        markets: marketsRes.status || null
      };
    }
  } catch (e) {
    out.coingecko.ok = false;
    out.coingecko.note = null;
    out.warnings.push(`coingecko:${e.message}`);
  }
  out.elapsed_ms = Date.now() - startedAt;
  if (!rpcHealthy) out.ok = false;
  return json(out, 200);
}
__name(onRequestGet, "onRequestGet");

// ../.wrangler/tmp/pages-Q7kuiW/functionsRoutes-0.24287138994009294.mjs
var routes = [
  {
    routePath: "/api/summary",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  }
];

// ../../.nvm/versions/node/v20.19.4/lib/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../.nvm/versions/node/v20.19.4/lib/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../../.nvm/versions/node/v20.19.4/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../.nvm/versions/node/v20.19.4/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-nSQPuE/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../../.nvm/versions/node/v20.19.4/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-nSQPuE/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.47118681802526385.mjs.map
