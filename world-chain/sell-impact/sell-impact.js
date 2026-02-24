/**
 * WCWD Sell Impact (best-effort) — Any token on World Chain
 *
 * Input:
 * - token contract address (0x...)
 * - sell amount (token units)
 *
 * Flow:
 * 1) GET /networks/world-chain/tokens/{tokenAddr}/pools
 * 2) Filter dead pools, rank by 24h volume desc, then liquidity desc, then lower fee
 * 3) Prefer pools that include an anchor asset (USDC.e by default)
 * 4) Pick top pool (user can change)
 * 5) GET /networks/world-chain/pools/{poolAddr}
 * 6) Estimate receive/impact using constant-product approximation (rough gauge)
 *
 * Notes:
 * - GT pool snapshot does NOT provide reserves. We infer reserves from reserve_in_usd + prices (50/50 USD split).
 * - Uniswap v3 concentrated liquidity can differ significantly. This is a rough gauge.
 */

const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_ACCEPT = "application/json;version=20230203";
const NETWORK = "world-chain";

// Preferred exit assets (anchors) on World Chain
// - USDC.e (from USDC.e/WLD pools): 0x79a02482a880bce3f13e09da970dc34db4cd24d1
// - WETH  (from WETH/WLD pools):   0x4200000000000000000000000000000000000006
const ANCHORS = {
  "USDC.e": "0x79a02482a880bce3f13e09da970dc34db4cd24d1",
  "WETH":   "0x4200000000000000000000000000000000000006",
};
let preferredAnchor = "USDC.e";

const CACHE_NS = "wcwd:sellimpact:";
const POOL_TTL_MS = 30_000;
const POOL_LIST_TTL_MS = 30_000;
const QUOTE_TTL_MS = 8_000;

let lastFailAt = 0;
let failCount = 0;
let tokenInputTimer = null;

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

function parseTokenAddrFromId(id){
  // "world-chain_0x...." -> "0x...."
  const s = String(id || "");
  const i = s.indexOf("_0x");
  if (i >= 0) return s.slice(i+1).toLowerCase();
  if (s.startsWith("0x")) return s.toLowerCase();
  return "";
}

function inferReserves(reserveUsd, basePriceUsd, quotePriceUsd){
  const half = reserveUsd / 2;
  const base = (basePriceUsd > 0) ? (half / basePriceUsd) : 0;
  const quote = (quotePriceUsd > 0) ? (half / quotePriceUsd) : 0;
  return { baseReserve: base, quoteReserve: quote };
}

function riskLabel(impact){
  if (!Number.isFinite(impact)) return { label:"—", level:"muted" };
  if (impact < 0.005) return { label:"Safe", level:"ok" };
  if (impact < 0.02)  return { label:"Caution", level:"warn" };
  return { label:"Danger", level:"bad" };
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

function setButtonsDisabled(disabled){
  const ids = ["btnEstimate","btnMaxUnder","btnSplit","btnMaxUnder2","btnSplit2","btnMax1","btnMax2","btnMax5"];
  for (const id of ids){
    const el = $(id);
    if (el) el.disabled = !!disabled;
  }
}

async function listPoolsByToken(tokenAddr){
  const addr = String(tokenAddr || "").trim().toLowerCase();
  if (!addr.startsWith("0x") || addr.length < 42) throw new Error("Bad token address");

  const ck = `pools:${addr}:${preferredAnchor}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  const url = `${GT_BASE}/networks/${NETWORK}/tokens/${addr}/pools`;
  const j = await fetchJson(url);

  const data = Array.isArray(j?.data) ? j.data : [];
  const pools = data.map(d => {
    const a = d?.attributes || {};
    const r = d?.relationships || {};
    const baseId = r?.base_token?.data?.id || "";
    const quoteId = r?.quote_token?.data?.id || "";
    return {
      poolAddr: String(a.address || "").toLowerCase(),
      name: String(a.name || a.pool_name || "").trim(),
      reserveUsd: num(a.reserve_in_usd),
      vol24: num(a.volume_usd?.h24),
      feePct: num(a.pool_fee_percentage),
      feeBps: Math.round(num(a.pool_fee_percentage) * 100),
      dexId: String(r?.dex?.data?.id || ""),
      baseAddr: parseTokenAddrFromId(baseId),
      quoteAddr: parseTokenAddrFromId(quoteId),
    };
  }).filter(x =>
    x.poolAddr &&
    x.reserveUsd > 0 &&
    x.vol24 > 0 &&     // dead pools out
    x.feeBps <= 1000   // >10% out
  );

  // Rank: 24h volume desc, then liquidity desc, then lower fee
  pools.sort((a,b) => (b.vol24 - a.vol24) || (b.reserveUsd - a.reserveUsd) || (a.feeBps - b.feeBps));

  // Prefer anchor-containing pools
  const anchorAddr = (ANCHORS[preferredAnchor] || "").toLowerCase();
  const anchored = anchorAddr ? pools.filter(p => (p.baseAddr === anchorAddr) || (p.quoteAddr === anchorAddr)) : [];
  const finalPools = anchored.length ? anchored : pools;

  cacheSet(ck, finalPools, POOL_LIST_TTL_MS);
  return finalPools;
}

function setPoolOptions(pools){
  const sel = $("poolSel");
  if (!sel) return;

  sel.innerHTML = "";
  if (!pools.length){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No pools found";
    sel.appendChild(opt);
    return;
  }

  for (const p of pools.slice(0, 20)){
    const opt = document.createElement("option");
    opt.value = p.poolAddr;
    const dex = p.dexId ? ` · ${p.dexId}` : "";
    opt.textContent = `${p.name || p.poolAddr} (24h $${fmt(p.vol24,0)} · liq $${fmt(p.reserveUsd,0)} · fee ${fmt(p.feePct,2)}%${dex})`;
    sel.appendChild(opt);
  }
}

async function getPoolSnapshot(poolAddr){
  const addr = String(poolAddr || "").toLowerCase();
  const ck = `pool:${addr}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  const url = `${GT_BASE}/networks/${NETWORK}/pools/${addr}`;
  const j = await fetchJson(url);

  const a = j?.data?.attributes || {};
  const r = j?.data?.relationships || {};

  const reserveUsd = num(a.reserve_in_usd);
  const basePriceUsd = num(a.base_token_price_usd);
  const quotePriceUsd = num(a.quote_token_price_usd);

  const baseId = r?.base_token?.data?.id || "";
  const quoteId = r?.quote_token?.data?.id || "";
  const baseAddr = parseTokenAddrFromId(baseId);
  const quoteAddr = parseTokenAddrFromId(quoteId);

  const name = String(a.name || "").trim();
  const m = name.match(/^(.+?)\s*\/\s*(.+?)(?:\s+\d|$)/);
  const symBase = (m?.[1] || "BASE").trim();
  const symQuote = (m?.[2] || "QUOTE").trim();

  let feeBps = 0;
  const pct = num(a.pool_fee_percentage);
  if (pct > 0) feeBps = Math.round(pct * 100);
  if (!feeBps){
    const mm = name.match(/(\d+(?:\.\d+)?)%/);
    if (mm) feeBps = Math.round(Number(mm[1]) * 100);
  }

  const inferred = inferReserves(reserveUsd, basePriceUsd, quotePriceUsd);

  const out = {
    poolLabel: name || addr,
    feeBps,
    reserveUsd,
    base: { symbol: symBase, addr: baseAddr, reserve: inferred.baseReserve, priceUsd: basePriceUsd },
    quote:{ symbol: symQuote, addr: quoteAddr, reserve: inferred.quoteReserve, priceUsd: quotePriceUsd },
    raw: a
  };

  cacheSet(ck, out, POOL_TTL_MS);
  return out;
}

function quoteImpact({ pool, sellAmount, sellTokenAddr }){
  const fee = (pool.feeBps || 0) / 10_000;
  const sellAddr = String(sellTokenAddr || "").trim().toLowerCase();

  let inSide, outSide;
  if (sellAddr && pool.base.addr === sellAddr){
    inSide = pool.base; outSide = pool.quote;
  } else if (sellAddr && pool.quote.addr === sellAddr){
    inSide = pool.quote; outSide = pool.base;
  } else {
    inSide = pool.quote; outSide = pool.base; // fallback
  }

  const reserveIn = num(inSide.reserve);
  const reserveOut = num(outSide.reserve);
  if (!(reserveIn > 0 && reserveOut > 0 && sellAmount > 0)){
    return { ok:false, reason:"no_liquidity_or_bad_input" };
  }

  const amountInEff = sellAmount * (1 - fee);
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
    priceAfter,
    inAddr: inSide.addr,
    outAddr: outSide.addr
  };
}

function maxSellUnder(pool, sellTokenAddr, targetImpact){
  const sellAddr = String(sellTokenAddr || "").trim().toLowerCase();
  const sellReserve = (sellAddr && pool.base.addr === sellAddr) ? pool.base.reserve :
                      (sellAddr && pool.quote.addr === sellAddr) ? pool.quote.reserve :
                      Math.max(pool.base.reserve, pool.quote.reserve);

  let lo = 0, hi = Math.max(1, sellReserve);
  let best = 0;

  for (let i=0; i<28; i++){
    const mid = (lo + hi) / 2;
    const q = quoteImpact({ pool, sellAmount: mid, sellTokenAddr });
    if (!q.ok){ hi = mid; continue; }
    if (q.impact <= targetImpact){ best = mid; lo = mid; }
    else { hi = mid; }
  }
  return best;
}

function splitCompare(pool, sellTokenAddr, total, parts){
  const per = total / parts;
  let sumOut = 0;

  const cur = JSON.parse(JSON.stringify(pool));
  const sellAddr = String(sellTokenAddr || "").trim().toLowerCase();

  for (let i=0; i<parts; i++){
    const q = quoteImpact({ pool: cur, sellAmount: per, sellTokenAddr: sellAddr });
    if (!q.ok) return { ok:false };

    sumOut += q.outAmount;

    const fee = (cur.feeBps || 0) / 10_000;
    const eff = per * (1 - fee);

    const inIsBase = (sellAddr && cur.base.addr === sellAddr);
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


function updateConclusionCard({ best5, impact, inSymbol, outSymbol }){
  const rec = document.getElementById("recMax5");
  const rs  = document.getElementById("riskSummary");
  const note = document.getElementById("conclusionNote");

  if (rec) rec.textContent = Number.isFinite(best5) ? `${fmt(best5, 6)} ${inSymbol}` : "—";

  if (rs){
    if (!Number.isFinite(impact)) rs.textContent = "—";
    else if (impact >= 0.5) rs.textContent = `DON’T (${fmtPct(impact)} impact)`;
    else if (impact >= 0.2) rs.textContent = `High (${fmtPct(impact)} impact)`;
    else if (impact >= 0.05) rs.textContent = `Caution (${fmtPct(impact)} impact)`;
    else rs.textContent = `OK (${fmtPct(impact)} impact)`;
  }

  if (note){
    note.textContent = Number.isFinite(best5)
      ? `5% impact max is an estimate. Receive asset depends on selected pool (${outSymbol}).`
      : `Best-effort estimate. Receive asset depends on selected pool (${outSymbol}).`;
  }
}


function quoteCacheKey(poolAddr, tokenAddr, amt){
  return `quote:${String(poolAddr||"")}:${String(tokenAddr||"")}:${String(amt)}`;
}

async function loadPoolsForToken(){
  try{
    setErr("");
    const addr = $("tokenAddr")?.value || "";
    if (!String(addr).trim()){
      setPoolOptions([]);
      setErr("Enter token address to load pools.");
      return;
    }
    const pools = await listPoolsByToken(addr);
    setPoolOptions(pools);
    if (!pools.length){
      setErr("No pools found for this token.");
    }
  }catch(e){
    setPoolOptions([]);
    setErr(`Pool lookup error: ${e.message || String(e)}`);
  }
}

function scheduleReloadPools(){
  if (tokenInputTimer) clearTimeout(tokenInputTimer);
  tokenInputTimer = setTimeout(() => {
    loadPoolsForToken().then(() => runEstimate()).catch(()=>{});
  }, 300);
}

async function runEstimate(){
  setErr("");
  setButtonsDisabled(true);

  const tokenAddr = String($("tokenAddr")?.value || "").trim().toLowerCase();
  const amt = Number(String($("amountWld")?.value || "").trim());
  const poolAddr = $("poolSel")?.value;

  if (!tokenAddr.startsWith("0x") || tokenAddr.length < 42){
    setErr("Enter a valid token address (0x...).");
    setButtonsDisabled(false);
    return;
  }
  if (!(amt > 0)){
    setErr("Enter a positive sell amount.");
    setButtonsDisabled(false);
    return;
  }
  if (!poolAddr){
    setErr("No pool selected.");
    setButtonsDisabled(false);
    return;
  }

  try{
    const pool = await getPoolSnapshot(poolAddr);

    const qk = quoteCacheKey(poolAddr, tokenAddr, amt);
    const qc = cacheGet(qk);
    let q = qc;
    if (!q){
      q = quoteImpact({ pool, sellAmount: amt, sellTokenAddr: tokenAddr });
      cacheSet(qk, q, QUOTE_TTL_MS);
    }

    if (!q.ok){
      setErr("Cannot quote with current data (try a different pool).");
      const dbg = $("debug"); if (dbg) dbg.textContent = JSON.stringify({ pool, q }, null, 2);
      return;
    }

    const outUsdEl = $("outUsd");
    if (outUsdEl){
      const isUsdLike = /USDC|USD/i.test(q.outSymbol || "");
      outUsdEl.textContent = isUsdLike ? `$${fmt(q.outAmount, 2)}` : `${fmt(q.outAmount, 6)} ${q.outSymbol}`;
    }
    const impactEl = $("impact");
    if (impactEl) impactEl.textContent = fmtPct(q.impact);

    const r = riskLabel(q.impact);
    pillSet($("riskPill"), `Risk: ${r.label}`);
    riskPillStyle($("riskPill"), r.level);

    pillSet($("poolPill"), `Pool: ${pool.poolLabel} (anchor ${preferredAnchor})`);
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

  const tokenAddr = String($("tokenAddr")?.value || "").trim().toLowerCase();
  const poolAddr = $("poolSel")?.value;
  const targetPct = Number(String($("maxImpactPct")?.value || "").trim());
  const outEl = $("maxOut");
  const rec = document.getElementById("recMax5");

  if (!tokenAddr.startsWith("0x") || tokenAddr.length < 42){
    if (outEl) outEl.textContent = "Invalid token address.";
    setButtonsDisabled(false);
    return;
  }
  if (!poolAddr || !(targetPct > 0)){
    if (outEl) outEl.textContent = "Invalid target or pool.";
    setButtonsDisabled(false);
    return;
  }

  try{
    const pool = await getPoolSnapshot(poolAddr);
    const best = maxSellUnder(pool, tokenAddr, targetPct / 100);
    if (outEl) outEl.textContent = `Max sell under ${fmt(targetPct,2)}% impact ≈ ${fmt(best, 6)} (token units, best-effort)`;
    if (rec && Math.abs(targetPct - 5) < 1e-9) rec.textContent = `${fmt(best, 6)} (token units)`;
  }catch(e){
    if (outEl) outEl.textContent = `API error: ${e.message || String(e)}`;
  }finally{
    setButtonsDisabled(false);
  }
}

async function runSplitUI(){
  setErr("");
  setButtonsDisabled(true);

  const tokenAddr = String($("tokenAddr")?.value || "").trim().toLowerCase();
  const poolAddr = $("poolSel")?.value;
  const amt = Number(String($("amountWld")?.value || "").trim());
  const outEl = $("splitOut");

  if (!tokenAddr.startsWith("0x") || tokenAddr.length < 42){
    if (outEl) outEl.textContent = "Invalid token address.";
    setButtonsDisabled(false);
    return;
  }
  if (!poolAddr || !(amt > 0)){
    if (outEl) outEl.textContent = "Enter amount and select pool.";
    setButtonsDisabled(false);
    return;
  }

  try{
    const pool = await getPoolSnapshot(poolAddr);

    const once = quoteImpact({ pool, sellAmount: amt, sellTokenAddr: tokenAddr });
    const s10 = splitCompare(pool, tokenAddr, amt, 10);
    const s50 = splitCompare(pool, tokenAddr, amt, 50);

    if (!once.ok || !s10.ok || !s50.ok){
      if (outEl) outEl.textContent = "Split compare failed (missing data).";
      return;
    }

    const outPrice = (once.outSymbol === pool.base.symbol) ? pool.base.priceUsd :
                     (once.outSymbol === pool.quote.symbol) ? pool.quote.priceUsd : 0;

    const onceUsd = once.outUsd || (outPrice ? once.outAmount * outPrice : 0);
    const s10Usd = outPrice ? s10.outAmount * outPrice : 0;
    const s50Usd = outPrice ? s50.outAmount * outPrice : 0;

    const d10 = s10Usd - onceUsd;
    const d50 = s50Usd - onceUsd;
    const same10 = Math.abs(d10) < 0.01;
    const same50 = Math.abs(d50) < 0.01;

    const s10line = same10 ? `Split10: $${fmt(s10Usd,2)} (≈ same)` :
      `Split10: $${fmt(s10Usd,2)} (${d10>=0?"+":"-"}$${fmt(Math.abs(d10),2)})`;
    const s50line = same50 ? `Split50: $${fmt(s50Usd,2)} (≈ same)` :
      `Split50: $${fmt(s50Usd,2)} (${d50>=0?"+":"-"}$${fmt(Math.abs(d50),2)})`;

    if (outEl) outEl.textContent = `Once: $${fmt(onceUsd,2)} · ${s10line} · ${s50line} (best-effort)`;
  }catch(e){
    if (outEl) outEl.textContent = `API error: ${e.message || String(e)}`;
  }finally{
    setButtonsDisabled(false);
  }
}

function init(){
  // Wire buttons (if present)
  $("btnEstimate")?.addEventListener("click", runEstimate);
  $("btnMaxUnder")?.addEventListener("click", runMaxUnderUI);
  $("btnSplit")?.addEventListener("click", runSplitUI);
  $("btnMaxUnder2")?.addEventListener("click", runMaxUnderUI);
  $("btnSplit2")?.addEventListener("click", runSplitUI);

  $("btnMax1")?.addEventListener("click", () => { const i=$("maxImpactPct"); if(i){ i.value="1"; } runMaxUnderUI(); });
  $("btnMax2")?.addEventListener("click", () => { const i=$("maxImpactPct"); if(i){ i.value="2"; } runMaxUnderUI(); });
  $("btnMax5")?.addEventListener("click", () => { const i=$("maxImpactPct"); if(i){ i.value="5"; } runMaxUnderUI(); });

  // tokenAddr input: reload pool list + estimate
  $("tokenAddr")?.addEventListener("input", scheduleReloadPools);
  $("tokenAddr")?.addEventListener("change", () => { loadPoolsForToken().then(()=>runEstimate()).catch(()=>{}); });

  $("poolSel")?.addEventListener("change", () => runEstimate().catch(()=>{}));

  // initial: if token already present, load + estimate
  if (String($("tokenAddr")?.value || "").trim()){
    loadPoolsForToken().then(()=>runEstimate()).catch(()=>{});
  } else {
    // show instruction
    setErr("Enter token address to load pools.");
  }
}

document.addEventListener("DOMContentLoaded", init);
