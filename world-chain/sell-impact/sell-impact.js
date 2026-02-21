/**
 * WCWD Sell Impact (best-effort)
 * - Pulls GeckoTerminal pool snapshot
 * - Approximates impact via constant-product math (rough gauge)
 * - Adds short TTL cache + backoff to avoid hammering free endpoints
 */

// --- config ---
const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_ACCEPT = "application/json;version=20230203"; // per GT docs (versioned accept)
const NETWORK = "world-chain";

// Known pools (Uniswap V3 World Chain)
const POOLS = {
  "0xc19bc89ac024426f5a23c5bb8bc91d8017c90684": { feeBps: 30, label: "USDC.e/WLD 0.3%" },
  "0x610e319b3a3ab56a0ed5562927d37c233774ba39": { feeBps: 100, label: "USDC.e/WLD 1%" },
  "0x02371da6173cf95623da4189e68912233cc7107c": { feeBps: 5, label: "USDC.e/WLD 0.05%" },
};

// TTL cache (localStorage)
const CACHE_NS = "wcwd:sellimpact:";
const POOL_TTL_MS = 30_000;
const QUOTE_TTL_MS = 8_000;

// simple in-memory backoff
let lastFailAt = 0;
let failCount = 0;

function $(id){ return document.getElementById(id); }
function fmt(n, d=2){
  if (!isFinite(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
}
function fmtPct(p){
  if (!isFinite(p)) return "—";
  return (p*100).toFixed(p < 0.01 ? 2 : 1) + "%";
}

function setErr(msg){
  $("err").textContent = msg || "";
}

function cacheGet(key){
  try{
    const raw = localStorage.getItem(CACHE_NS + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || Date.now() > obj.exp) return null;
    return obj.val;
  }catch{ return null; }
}
function cacheSet(key, val, ttlMs){
  try{
    localStorage.setItem(CACHE_NS + key, JSON.stringify({ exp: Date.now() + ttlMs, val }));
  }catch{}
}

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url){
  // light backoff if we recently failed
  const now = Date.now();
  if (failCount > 0 && (now - lastFailAt) < Math.min(2500, 500 * failCount)){
    await sleep(Math.min(2500, 500 * failCount));
  }

  const res = await fetch(url, {
    headers: {
      "Accept": GT_ACCEPT,
    }
  });
  if (!res.ok){
    lastFailAt = Date.now();
    failCount = Math.min(6, failCount + 1);
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? " :: " + txt.slice(0,200) : ""}`);
  }
  // success: reduce fail pressure gradually
  if (failCount > 0) failCount = Math.max(0, failCount - 1);
  return await res.json();
}

/**
 * Pull pool snapshot from GeckoTerminal
 * Returns normalized object:
 * { poolLabel, feeBps, reserveUsd, base:{symbol, reserve, priceUsd}, quote:{...} }
 */
async function getPoolSnapshot(poolAddr){
  const ck = `pool:${poolAddr}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  const url = `${GT_BASE}/networks/${NETWORK}/pools/${poolAddr}`;
  const j = await fetchJson(url);

  // The API schema can evolve; read defensively.
  const a = (j && j.data && j.data.attributes) ? j.data.attributes : {};
  const out = {
    poolLabel: (POOLS[poolAddr] && POOLS[poolAddr].label) || poolAddr,
    feeBps: (POOLS[poolAddr] && POOLS[poolAddr].feeBps) || 0,
    reserveUsd: num(a.reserve_in_usd),
    base: {
      symbol: a.base_token_symbol || "BASE",
      reserve: num(a.base_token_reserve),
      priceUsd: num(a.base_token_price_usd),
    },
    quote: {
      symbol: a.quote_token_symbol || "QUOTE",
      reserve: num(a.quote_token_reserve),
      priceUsd: num(a.quote_token_price_usd),
    }
  };

  // If reserves missing but reserveUsd + prices exist, approximate reserves (very rough)
  if ((!out.base.reserve || !out.quote.reserve) && out.reserveUsd && out.base.priceUsd && out.quote.priceUsd){
    // assume ~50/50 USD split
    const half = out.reserveUsd / 2;
    if (!out.base.reserve) out.base.reserve = half / out.base.priceUsd;
    if (!out.quote.reserve) out.quote.reserve = half / out.quote.priceUsd;
  }

  cacheSet(ck, out, POOL_TTL_MS);
  return out;
}

function num(x){
  const n = Number(x);
  return isFinite(n) ? n : 0;
}

/**
 * quoteImpact
 * - sellTokenSymbol: "WLD" expected
 * - For WLD→USDC.e, we interpret which side is WLD using pool symbols
 */
function quoteImpact({ pool, sellAmount, sellSymbol="WLD", targetOutSymbol="USDC.e" }){
  const fee = (pool.feeBps || 0) / 10_000;

  // Decide which side is input/output by symbol match
  let inSide = null, outSide = null;

  if (pool.base.symbol === sellSymbol){
    inSide = pool.base; outSide = pool.quote;
  } else if (pool.quote.symbol === sellSymbol){
    inSide = pool.quote; outSide = pool.base;
  } else {
    // fallback: assume quote is WLD
    inSide = pool.quote; outSide = pool.base;
  }

  const reserveIn = num(inSide.reserve);
  const reserveOut = num(outSide.reserve);

  if (!(reserveIn > 0 && reserveOut > 0 && sellAmount > 0)){
    return { ok:false, reason:"no_liquidity_or_bad_input" };
  }

  const amountIn = sellAmount;
  const amountInEff = amountIn * (1 - fee);

  // constant-product (x*y=k) swap
  const out = (reserveOut * amountInEff) / (reserveIn + amountInEff);

  const priceBefore = reserveOut / reserveIn;
  const priceAfter  = (reserveOut - out) / (reserveIn + amountInEff);
  const impact = 1 - (priceAfter / priceBefore); // ~0..1

  // estimate USD receive using out token price if available
  const outUsd = outSide.priceUsd ? out * outSide.priceUsd : 0;
  const avgPrice = out / amountIn; // out per in

  return {
    ok:true,
    poolSideIn: inSide.symbol,
    poolSideOut: outSide.symbol,
    outAmount: out,
    outUsd,
    impact,
    fee,
    priceBefore,
    priceAfter,
    avgPrice
  };
}

function riskLabel(impact){
  if (!isFinite(impact)) return { label:"—", level:"muted" };
  if (impact < 0.005) return { label:"Safe", level:"ok" };
  if (impact < 0.02)  return { label:"Caution", level:"warn" };
  return { label:"Danger", level:"bad" };
}

function maxSellUnder(pool, targetImpact){
  // binary search sellAmount in WLD
  const hi = Math.max(1, pool.quote.symbol === "WLD" ? pool.quote.reserve : pool.base.reserve); // cap by WLD reserve-ish
  let lo = 0;
  let best = 0;

  for (let i=0; i<28; i++){
    const mid = (lo + hi)/2;
    const q = quoteImpact({ pool, sellAmount: mid, sellSymbol:"WLD" });
    if (!q.ok){
      hi = mid;
      continue;
    }
    if (q.impact <= targetImpact){
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

function splitCompare(pool, total, parts){
  let sumOut = 0;
  let curPool = JSON.parse(JSON.stringify(pool)); // copy reserves
  const per = total / parts;

  for (let i=0;i<parts;i++){
    const q = quoteImpact({ pool: curPool, sellAmount: per, sellSymbol:"WLD" });
    if (!q.ok) return { ok:false };
    sumOut += q.outAmount;

    // mutate reserves in/out to simulate sequential swaps
    // determine sides
    const fee = (curPool.feeBps || 0) / 10_000;
    const eff = per * (1 - fee);

    // identify in/out side
    let inIsBase = (curPool.base.symbol === "WLD");
    if (!(curPool.base.symbol === "WLD" || curPool.quote.symbol === "WLD")) inIsBase = false; // fallback quote=WLD

    if (inIsBase){
      curPool.base.reserve += eff;
      curPool.quote.reserve -= q.outAmount;
    } else {
      curPool.quote.reserve += eff;
      curPool.base.reserve -= q.outAmount;
    }
  }
  return { ok:true, outAmount: sumOut };
}

function pillSet(el, txt){
  el.textContent = txt;
}

function riskPillStyle(el, level){
  el.classList.remove("pill-ok","pill-warn","pill-bad");
  if (level === "ok") el.classList.add("pill-ok");
  if (level === "warn") el.classList.add("pill-warn");
  if (level === "bad") el.classList.add("pill-bad");
}

// Add minimal pill styles if not present in common.css
(function ensurePillStyles(){
  const css = `
.pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid rgba(0,0,0,.12);font-size:12px}
.pill-ok{border-color:rgba(0,128,0,.25)}
.pill-warn{border-color:rgba(200,140,0,.35)}
.pill-bad{border-color:rgba(200,0,0,.35)}
.input,.select{width:100%;padding:10px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:#fff}
.btn{padding:10px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:#111;color:#fff;cursor:pointer}
.btn-ghost{background:#fff;color:#111}
.code{padding:10px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:rgba(0,0,0,.03)}
`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
})();

function quoteCacheKey(poolAddr, amt){
  return `quote:${poolAddr}:${String(amt)}`;
}

async function runEstimate(){
  setErr("");
  const amt = Number(String($("amountWld").value).trim());
  const poolAddr = $("poolSel").value;

  if (!(amt > 0)){
    setErr("Enter a positive WLD amount.");
    return;
  }

  try{
    const pool = await getPoolSnapshot(poolAddr);

    // quote cache (tiny TTL) to reduce repeated clicking
    const qk = quoteCacheKey(poolAddr, amt);
    const qc = cacheGet(qk);
    let q = qc;
    if (!q){
      q = quoteImpact({ pool, sellAmount: amt, sellSymbol:"WLD", targetOutSymbol:"USDC.e" });
      cacheSet(qk, q, QUOTE_TTL_MS);
    }

    if (!q.ok){
      setErr("No liquidity or missing pool data (try another pool).");
      $("debug").textContent = JSON.stringify({ pool, q }, null, 2);
      return;
    }

    $("outUsd").textContent = q.outUsd ? `$${fmt(q.outUsd, 2)}` : `${fmt(q.outAmount, 4)} ${q.poolSideOut}`;
    $("impact").textContent = fmtPct(q.impact);

    const r = riskLabel(q.impact);
    pillSet($("riskPill"), `Risk: ${r.label}`);
    riskPillStyle($("riskPill"), r.level);

    pillSet($("poolPill"), `Pool: ${pool.poolLabel}`);
    pillSet($("liqPill"), `Liquidity: ${pool.reserveUsd ? "$" + fmt(pool.reserveUsd,0) : "—"}`);

    $("debug").textContent = JSON.stringify({ pool, q }, null, 2);
  }catch(e){
    setErr(`API error: ${e.message || String(e)}`);
  }
}

async function runMaxUnder(){
  setErr("");
  const poolAddr = $("poolSel").value;

  const targetStr = prompt("Target impact (%). Example: 1 for 1%", "1");
  if (targetStr == null) return;
  const targetPct = Number(targetStr);
  if (!(targetPct > 0)){
    setErr("Invalid target.");
    return;
  }
  const targetImpact = targetPct / 100;

  try{
    const pool = await getPoolSnapshot(poolAddr);
    const best = maxSellUnder(pool, targetImpact);
    alert(`Max sell under ${targetPct}% impact ≈ ${fmt(best, 2)} WLD (best-effort)`);
  }catch(e){
    setErr(`API error: ${e.message || String(e)}`);
  }
}

async function runSplit(){
  setErr("");
  const amt = Number(String($("amountWld").value).trim());
  const poolAddr = $("poolSel").value;
  if (!(amt > 0)){
    setErr("Enter a positive WLD amount.");
    return;
  }
  try{
    const pool = await getPoolSnapshot(poolAddr);

    const once = quoteImpact({ pool, sellAmount: amt, sellSymbol:"WLD" });
    const s10 = splitCompare(pool, amt, 10);
    const s50 = splitCompare(pool, amt, 50);

    if (!once.ok || !s10.ok || !s50.ok){
      setErr("Split compare failed due to missing liquidity data.");
      return;
    }

    const outOnce = once.outUsd || 0;
    const out10 = (pool.base.symbol === "USDC.e" ? s10.outAmount * pool.base.priceUsd : s10.outAmount * pool.quote.priceUsd) || 0;
    const out50 = (pool.base.symbol === "USDC.e" ? s50.outAmount * pool.base.priceUsd : s50.outAmount * pool.quote.priceUsd) || 0;

    alert(
      `Split compare (best-effort)\n` +
      `• Sell once:  $${fmt(outOnce,2)}\n` +
      `• Split 10:   $${fmt(out10,2)}\n` +
      `• Split 50:   $${fmt(out50,2)}`
    );
  }catch(e){
    setErr(`API error: ${e.message || String(e)}`);
  }
}

function init(){
  $("btnEstimate").addEventListener("click", runEstimate);
  $("btnMaxUnder").addEventListener("click", runMaxUnder);
  $("btnSplit").addEventListener("click", runSplit);

  // auto estimate once
  runEstimate().catch(()=>{});
}

document.addEventListener("DOMContentLoaded", init);
