/**
 * WCWD Sell Impact (best-effort)
 * GeckoTerminal pool snapshot → constant-product approximation
 *
 * GeckoTerminal /pools response provides:
 * - name: "USDC.e / WLD 0.3%"
 * - pool_fee_percentage: "0.3"
 * - reserve_in_usd
 * - base_token_price_usd / quote_token_price_usd
 *
 * It does NOT provide token reserves. We infer reserves from reserve_in_usd and prices (50/50 USD split).
 * This is a rough gauge, especially for Uniswap v3 concentrated liquidity.
 */

const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_ACCEPT = "application/json;version=20230203";
const NETWORK = "world-chain";

const POOLS = {
  "0xc19bc89ac024426f5a23c5bb8bc91d8017c90684": { feeBps: 30,  label: "USDC.e/WLD 0.3%" },
  "0x610e319b3a3ab56a0ed5562927d37c233774ba39": { feeBps: 100, label: "USDC.e/WLD 1%" },
  "0x02371da6173cf95623da4189e68912233cc7107c": { feeBps: 5,   label: "USDC.e/WLD 0.05%" },
};

const CACHE_NS = "wcwd:sellimpact:";
const POOL_TTL_MS = 30_000;
const QUOTE_TTL_MS = 8_000;

let lastFailAt = 0;
let failCount = 0;

function $(id){ return document.getElementById(id); }
function num(x){ const n = Number(x); return Number.isFinite(n) ? n : 0; }

function fmt(n, d=2){
  if (!Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
}
function fmtPct(frac){
  if (!Number.isFinite(Number(frac))) return "—";
  const p = Number(frac) * 100;
  return (p < 1 ? p.toFixed(2) : p.toFixed(1)) + "%";
}
function setErr(msg){ const e = $("err"); if (e) e.textContent = msg || ""; }

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
  const now = Date.now();
  if (failCount > 0 && (now - lastFailAt) < Math.min(2500, 500 * failCount)){
    await sleep(Math.min(2500, 500 * failCount));
  }
  const res = await fetch(url, { headers: { "Accept": GT_ACCEPT } });
  if (!res.ok){
    lastFailAt = Date.now();
    failCount = Math.min(6, failCount + 1);
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? " :: " + txt.slice(0,200) : ""}`);
  }
  if (failCount > 0) failCount = Math.max(0, failCount - 1);
  return await res.json();
}

function parsePairSymbols(poolName){
  // "USDC.e / WLD 0.3%" -> ["USDC.e","WLD"]
  const s = String(poolName || "");
  const m = s.match(/^(.+?)\s*\/\s*(.+?)(?:\s+\d|$)/);
  if (!m) return ["USDC.e","WLD"];
  const a = (m[1] || "").trim();
  const b = (m[2] || "").trim();
  return [a || "USDC.e", b || "WLD"];
}

function inferReserves(reserveUsd, basePriceUsd, quotePriceUsd){
  // assume ~50/50 USD value split
  const half = reserveUsd / 2;
  const base = (basePriceUsd > 0) ? (half / basePriceUsd) : 0;
  const quote = (quotePriceUsd > 0) ? (half / quotePriceUsd) : 0;
  return { baseReserve: base, quoteReserve: quote };
}

async function getPoolSnapshot(poolAddr){
  const ck = `pool:${poolAddr}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  const url = `${GT_BASE}/networks/${NETWORK}/pools/${poolAddr}`;
  const j = await fetchJson(url);
  const a = (j && j.data && j.data.attributes) ? j.data.attributes : {};

  const reserveUsd = num(a.reserve_in_usd);
  const basePriceUsd = num(a.base_token_price_usd);
  const quotePriceUsd = num(a.quote_token_price_usd);

  const [symBase, symQuote] = parsePairSymbols(a.name || "");

  // fee
  let feeBps = (POOLS[poolAddr] && POOLS[poolAddr].feeBps) || 0;
  if (!feeBps){
    const pct = num(a.pool_fee_percentage);
    if (pct > 0) feeBps = Math.round(pct * 100); // 0.3% -> 30 bps
  }

  const inferred = inferReserves(reserveUsd, basePriceUsd, quotePriceUsd);

  const out = {
    poolLabel: (POOLS[poolAddr] && POOLS[poolAddr].label) || String(a.name || poolAddr),
    feeBps,
    reserveUsd,
    base: { symbol: symBase, reserve: inferred.baseReserve, priceUsd: basePriceUsd },
    quote:{ symbol: symQuote, reserve: inferred.quoteReserve, priceUsd: quotePriceUsd },
    raw: a
  };

  cacheSet(ck, out, POOL_TTL_MS);
  return out;
}

function quoteImpact({ pool, sellAmount, sellSymbol="WLD" }){
  const fee = (pool.feeBps || 0) / 10_000;

  let inSide, outSide;
  if (pool.base.symbol === sellSymbol){
    inSide = pool.base; outSide = pool.quote;
  } else if (pool.quote.symbol === sellSymbol){
    inSide = pool.quote; outSide = pool.base;
  } else {
    // fallback: assume quote is sell token
    inSide = pool.quote; outSide = pool.base;
  }

  const reserveIn = num(inSide.reserve);
  const reserveOut = num(outSide.reserve);
  if (!(reserveIn > 0 && reserveOut > 0 && sellAmount > 0)){
    return { ok:false, reason:"no_liquidity_or_bad_input" };
  }

  const amountIn = sellAmount;
  const amountInEff = amountIn * (1 - fee);

  const out = (reserveOut * amountInEff) / (reserveIn + amountInEff);

  const priceBefore = reserveOut / reserveIn;
  const priceAfter  = (reserveOut - out) / (reserveIn + amountInEff);
  const impact = 1 - (priceAfter / priceBefore);

  const outUsd = outSide.priceUsd ? (out * outSide.priceUsd) : 0;

  return {
    ok:true,
    inSymbol: inSide.symbol,
    outSymbol: outSide.symbol,
    outAmount: out,
    outUsd,
    impact,
    fee,
    priceBefore,
    priceAfter
  };
}

function riskLabel(impact){
  if (!Number.isFinite(impact)) return { label:"—", level:"muted" };
  if (impact < 0.005) return { label:"Safe", level:"ok" };
  if (impact < 0.02)  return { label:"Caution", level:"warn" };
  return { label:"Danger", level:"bad" };
}

function maxSellUnder(pool, targetImpact){
  const wldReserve = (pool.base.symbol === "WLD") ? pool.base.reserve :
                     (pool.quote.symbol === "WLD") ? pool.quote.reserve :
                     Math.max(pool.base.reserve, pool.quote.reserve);
  let lo = 0, hi = Math.max(1, wldReserve);
  let best = 0;

  for (let i=0; i<28; i++){
    const mid = (lo + hi) / 2;
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
  const per = total / parts;
  let sumOut = 0;

  const cur = JSON.parse(JSON.stringify(pool));
  for (let i=0; i<parts; i++){
    const q = quoteImpact({ pool: cur, sellAmount: per, sellSymbol:"WLD" });
    if (!q.ok) return { ok:false };

    sumOut += q.outAmount;

    const fee = (cur.feeBps || 0) / 10_000;
    const eff = per * (1 - fee);

    const inIsBase = (cur.base.symbol === "WLD");
    if (inIsBase){
      cur.base.reserve += eff;
      cur.quote.reserve -= q.outAmount;
    } else {
      cur.quote.reserve += eff;
      cur.base.reserve -= q.outAmount;
    }
  }
  return { ok:true, outAmount: sumOut };
}

function pillSet(el, txt){ if (el) el.textContent = txt; }
function riskPillStyle(el, level){
  if (!el) return;
  el.classList.remove("pill-ok","pill-warn","pill-bad");
  if (level === "ok") el.classList.add("pill-ok");
  if (level === "warn") el.classList.add("pill-warn");
  if (level === "bad") el.classList.add("pill-bad");
}

(function ensurePillStyles(){
  const css = `
.pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid rgba(0,0,0,.12);font-size:12px}
.pill-ok{border-color:rgba(0,128,0,.25)}
.pill-warn{border-color:rgba(200,140,0,.35)}
.pill-bad{border-color:rgba(200,0,0,.35)}
`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
})();

function quoteCacheKey(poolAddr, amt){ return `quote:${poolAddr}:${String(amt)}`; }

function setButtonsDisabled(disabled){
  const ids = ["btnEstimate","btnMaxUnder","btnSplit","btnMaxUnder2","btnSplit2"];
  for (const id of ids){
    const el = $(id);
    if (el) el.disabled = !!disabled;
  }
}

async function runEstimate(){
  setErr("");
  setButtonsDisabled(true);

  const amt = Number(String($("amountWld")?.value || "").trim());
  const poolAddr = $("poolSel")?.value;

  if (!(amt > 0) || !poolAddr){
    setErr("Enter a positive WLD amount.");
    setButtonsDisabled(false);
    return;
  }

  try{
    const pool = await getPoolSnapshot(poolAddr);

    const qk = quoteCacheKey(poolAddr, amt);
    const qc = cacheGet(qk);
    let q = qc;
    if (!q){
      q = quoteImpact({ pool, sellAmount: amt, sellSymbol:"WLD" });
      cacheSet(qk, q, QUOTE_TTL_MS);
    }

    if (!q.ok){
      setErr("No liquidity or missing pool data (try another pool).");
      const dbg = $("debug"); if (dbg) dbg.textContent = JSON.stringify({ pool, q }, null, 2);
      return;
    }

    const outUsdEl = $("outUsd");
    if (outUsdEl) outUsdEl.textContent = q.outUsd ? `$${fmt(q.outUsd, 2)}` : `${fmt(q.outAmount, 6)} ${q.outSymbol}`;
    const impactEl = $("impact");
    if (impactEl) impactEl.textContent = fmtPct(q.impact);

    const r = riskLabel(q.impact);
    pillSet($("riskPill"), `Risk: ${r.label}`);
    riskPillStyle($("riskPill"), r.level);

    pillSet($("poolPill"), `Pool: ${pool.poolLabel}`);
    pillSet($("liqPill"), `Liquidity: ${pool.reserveUsd ? "$" + fmt(pool.reserveUsd,0) : "—"}`);

    const dbg = $("debug");
    if (dbg) dbg.textContent = JSON.stringify({ pool, q }, null, 2);
  }catch(e){
    setErr(`API error: ${e.message || String(e)}`);
  }finally{
    setButtonsDisabled(false);
  }
}

async function runMaxUnderUI(){
  setErr("");
  setButtonsDisabled(true);

  const poolAddr = $("poolSel")?.value;
  const targetPct = Number(String($("maxImpactPct")?.value || "").trim());
  const outEl = $("maxOut");

  if (!poolAddr || !(targetPct > 0)){
    if (outEl) outEl.textContent = "Invalid target.";
    setButtonsDisabled(false);
    return;
  }

  try{
    const pool = await getPoolSnapshot(poolAddr);
    const best = maxSellUnder(pool, targetPct / 100);
    if (outEl) outEl.textContent = `Max sell under ${fmt(targetPct,2)}% impact ≈ ${fmt(best, 2)} WLD (best-effort)`;
  }catch(e){
    if (outEl) outEl.textContent = `API error: ${e.message || String(e)}`;
  }finally{
    setButtonsDisabled(false);
  }
}

async function runSplitUI(){
  setErr("");
  setButtonsDisabled(true);

  const amt = Number(String($("amountWld")?.value || "").trim());
  const poolAddr = $("poolSel")?.value;
  const outEl = $("splitOut");

  if (!poolAddr || !(amt > 0)){
    if (outEl) outEl.textContent = "Enter a positive WLD amount.";
    setButtonsDisabled(false);
    return;
  }

  try{
    const pool = await getPoolSnapshot(poolAddr);

    const once = quoteImpact({ pool, sellAmount: amt, sellSymbol:"WLD" });
    const s10 = splitCompare(pool, amt, 10);
    const s50 = splitCompare(pool, amt, 50);

    if (!once.ok || !s10.ok || !s50.ok){
      if (outEl) outEl.textContent = "Split compare failed (missing data).";
      return;
    }

    const outPrice = (once.outSymbol === pool.base.symbol) ? pool.base.priceUsd :
                     (once.outSymbol === pool.quote.symbol) ? pool.quote.priceUsd : 0;

    const onceUsd = once.outUsd || (outPrice ? once.outAmount * outPrice : 0);
    const s10Usd = outPrice ? s10.outAmount * outPrice : 0;
    const s50Usd = outPrice ? s50.outAmount * outPrice : 0;

    if (outEl) outEl.textContent =
      `Once: $${fmt(onceUsd,2)} · Split10: $${fmt(s10Usd,2)} · Split50: $${fmt(s50Usd,2)} (best-effort)`;
  }catch(e){
    if (outEl) outEl.textContent = `API error: ${e.message || String(e)}`;
  }finally{
    setButtonsDisabled(false);
  }
}

function init(){
  $("btnEstimate")?.addEventListener("click", runEstimate);
  $("btnMaxUnder")?.addEventListener("click", runMaxUnderUI);
  $("btnSplit")?.addEventListener("click", runSplitUI);
  $("btnMaxUnder2")?.addEventListener("click", runMaxUnderUI);
  $("btnSplit2")?.addEventListener("click", runSplitUI);
  runEstimate().catch(()=>{});
}
document.addEventListener("DOMContentLoaded", init);
