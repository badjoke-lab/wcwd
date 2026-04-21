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
 * 5) Prefer POST /api/sell-impact/quote for estimate
 * 6) Prefer POST /api/sell-impact/compare for top-pool comparison
 * 7) Fallback: GET /networks/world-chain/pools/{poolAddr} + constant-product approximation
 */

const GT_BASE = "/api/gt";
const QUOTE_API = "/api/sell-impact/quote";
const COMPARE_API = "/api/sell-impact/compare";
const GT_ACCEPT = "application/json;version=20230203";
const NETWORK = "world-chain";

const ANCHORS = {
  "USDC.e": "0x79a02482a880bce3f13e09da970dc34db4cd24d1",
  WETH: "0x4200000000000000000000000000000000000006",
};
let preferredAnchor = "USDC.e";

const CACHE_NS = "wcwd:sellimpact:";
const POOL_TTL_MS = 30_000;
const POOL_LIST_TTL_MS = 30_000;
const QUOTE_TTL_MS = 8_000;
const COMPARE_TTL_MS = 8_000;

let lastFailAt = 0;
let failCount = 0;
let tokenInputTimer = null;
let loadPoolsSeq = 0;
let estimateSeq = 0;
let pendingEstimateCount = 0;
let pendingPoolsCount = 0;

const FETCH_TIMEOUT_MS = 15_000;

function $(id) { return document.getElementById(id); }
function num(x) {
  const n = Number.parseFloat(String(x ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}
function fmt(n, d = 2) {
  if (!Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
}
function fmtPct(frac) {
  if (!Number.isFinite(Number(frac))) return "—";
  const p = Number(frac) * 100;
  return (p < 1 ? p.toFixed(2) : p.toFixed(1)) + "%";
}
function setErr(msg) { const e = $("err"); if (e) e.textContent = msg || ""; }
function setBusy(type, busy) {
  if (type === "estimate") pendingEstimateCount = Math.max(0, pendingEstimateCount + (busy ? 1 : -1));
  if (type === "pools") pendingPoolsCount = Math.max(0, pendingPoolsCount + (busy ? 1 : -1));
  setButtonsDisabled((pendingEstimateCount + pendingPoolsCount) > 0);
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_NS + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || Date.now() > obj.exp) return null;
    return obj.val;
  } catch {
    return null;
  }
}
function cacheSet(key, val, ttlMs) {
  try {
    localStorage.setItem(CACHE_NS + key, JSON.stringify({ exp: Date.now() + ttlMs, val }));
  } catch {}
}
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

let gtBackoffUntil = 0;

async function fetchJson(url, { signal } = {}) {
  const now0 = Date.now();
  if (now0 < gtBackoffUntil) {
    throw new Error(`HTTP 429 Too Many Requests (backoff active until ${new Date(gtBackoffUntil).toISOString()})`);
  }
  const now = Date.now();
  if (failCount > 0 && (now - lastFailAt) < Math.min(2500, 500 * failCount)) {
    await sleep(Math.min(2500, 500 * failCount));
  }
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(new Error(`Request timeout after ${FETCH_TIMEOUT_MS}ms`)), FETCH_TIMEOUT_MS);
  const onAbort = () => ctl.abort(signal.reason || new Error("Aborted"));
  if (signal) signal.addEventListener("abort", onAbort, { once: true });

  let res;
  try {
    res = await fetch(url, { headers: { Accept: GT_ACCEPT }, signal: ctl.signal });
  } catch (e) {
    if (ctl.signal.aborted) throw new Error(signal?.aborted ? "Request aborted (stale operation)" : `Request timeout after ${FETCH_TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
  if (!res.ok) {
    if (res.status === 429) gtBackoffUntil = Date.now() + 30_000;
    lastFailAt = Date.now();
    failCount = Math.min(6, failCount + 1);
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? ` :: ${txt.slice(0, 200)}` : ""}`);
  }
  if (failCount > 0) failCount = Math.max(0, failCount - 1);
  return await res.json();
}

async function fetchWorkerQuote(tokenAddr, poolAddr, sellAmount) {
  const cacheKey = `worker-quote:${String(poolAddr || "")}:${String(tokenAddr || "")}:${String(sellAmount)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const res = await fetch(QUOTE_API, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ tokenAddr, poolAddr, sellAmount }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`QUOTE_API_${res.status}${txt ? ` :: ${txt.slice(0, 160)}` : ""}`);
  }
  const json = await res.json();
  if (!json?.ok || !json?.quote?.ok) throw new Error("QUOTE_API_INVALID");
  cacheSet(cacheKey, json, QUOTE_TTL_MS);
  return json;
}

async function fetchWorkerCompare(tokenAddr, sellAmount, maxPools = 3) {
  const cacheKey = `worker-compare:${String(tokenAddr || "")}:${String(sellAmount)}:${String(maxPools)}:${preferredAnchor}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const res = await fetch(COMPARE_API, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ tokenAddr, sellAmount, maxPools, preferredAnchor }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`COMPARE_API_${res.status}${txt ? ` :: ${txt.slice(0, 160)}` : ""}`);
  }
  const json = await res.json();
  if (!json?.ok || !Array.isArray(json?.pools)) throw new Error("COMPARE_API_INVALID");
  cacheSet(cacheKey, json, COMPARE_TTL_MS);
  return json;
}

function parseTokenAddrFromId(id) {
  const s = String(id || "");
  const i = s.indexOf("_0x");
  if (i >= 0) return s.slice(i + 1).toLowerCase();
  if (s.startsWith("0x")) return s.toLowerCase();
  return "";
}

function inferReserves(reserveUsd, basePriceUsd, quotePriceUsd) {
  const half = reserveUsd / 2;
  const base = basePriceUsd > 0 ? half / basePriceUsd : 0;
  const quote = quotePriceUsd > 0 ? half / quotePriceUsd : 0;
  return { baseReserve: base, quoteReserve: quote };
}

function riskLabel(impact) {
  if (!Number.isFinite(impact)) return { label: "—", level: "muted" };
  if (impact < 0.005) return { label: "Safe", level: "ok" };
  if (impact < 0.02) return { label: "Caution", level: "warn" };
  return { label: "Danger", level: "bad" };
}

function pillSet(el, txt) { if (el) el.textContent = txt; }
function riskPillStyle(el, level) {
  if (!el) return;
  el.classList.remove("pill-ok", "pill-warn", "pill-bad");
  if (level === "ok") el.classList.add("pill-ok");
  if (level === "warn") el.classList.add("pill-warn");
  if (level === "bad") el.classList.add("pill-bad");
}
(function ensurePillStyles() {
  const css = `
.pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid rgba(0,0,0,.12);font-size:12px}
.pill-ok{border-color:rgba(0,128,0,.25)}
.pill-warn{border-color:rgba(200,140,0,.35)}
.pill-bad{border-color:rgba(200,0,0,.35)}
`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
}());

function setButtonsDisabled(disabled) {
  const ids = ["btnEstimate", "btnMaxUnder", "btnSplit", "btnMaxUnder2", "btnSplit2", "btnMax1", "btnMax2", "btnMax5"];
  for (const id of ids) {
    const el = $(id);
    if (el) el.disabled = !!disabled;
  }
}

function renderCompare(compare, currentPoolAddr, errorMessage = "") {
  const summaryEl = $("compareSummary");
  const listEl = $("compareList");
  if (!summaryEl || !listEl) return;
  if (errorMessage) {
    summaryEl.textContent = `Pool compare unavailable right now: ${errorMessage}`;
    listEl.textContent = "—";
    return;
  }
  if (!compare?.ok || !Array.isArray(compare?.pools) || !compare.pools.length) {
    summaryEl.textContent = "Pool compare unavailable.";
    listEl.textContent = "—";
    return;
  }
  const bestOut = compare?.summary?.best_out_pool;
  const bestImpact = compare?.summary?.best_impact_pool;
  const summaryParts = [];
  if (bestOut) summaryParts.push(`Best out: ${bestOut.poolLabel} → ${bestOut.outSymbol} ${fmt(bestOut.outAmount, 6)} (${fmtPct(bestOut.impact)} impact)`);
  if (bestImpact) summaryParts.push(`Best impact: ${bestImpact.poolLabel} → ${fmtPct(bestImpact.impact)} impact`);
  summaryEl.textContent = summaryParts.join(" · ") || "Pool compare ready.";
  listEl.innerHTML = "";
  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "8px";
  compare.pools.forEach((pool) => {
    const row = document.createElement("div");
    const selected = String(currentPoolAddr || "").toLowerCase() === String(pool.poolAddr || "").toLowerCase() ? " [selected]" : "";
    row.textContent = `${pool.poolLabel}${selected} · out ${fmt(pool.outAmount, 6)} ${pool.outSymbol} · impact ${fmtPct(pool.impact)} · liq $${fmt(pool.reserveUsd, 0)}`;
    list.appendChild(row);
  });
  listEl.appendChild(list);
}

async function listPoolsByToken(tokenAddr, { signal } = {}) {
  const addr = String(tokenAddr || "").trim().toLowerCase();
  if (!addr.startsWith("0x") || addr.length < 42) throw new Error("Bad token address");

  const ck = `pools:${addr}:${preferredAnchor}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  const url = `${GT_BASE}/networks/${NETWORK}/tokens/${addr}/pools`;
  const j = await fetchJson(url, { signal });

  const data = Array.isArray(j?.data) ? j.data : [];
  const pools = data.map((d) => {
    const a = d?.attributes || {};
    const r = d?.relationships || {};
    const baseId = r?.base_token?.data?.id || "";
    const quoteId = r?.quote_token?.data?.id || "";
    return {
      poolAddr: String(a.address || "").toLowerCase(),
      name: String(a.name || a.pool_name || "").trim(),
      reserveUsd: num(a.reserve_in_usd),
      vol24: num(a.volume_usd?.h24),
      feePct: (() => {
        const direct = num(a.pool_fee_percentage);
        if (direct > 0) return direct;
        const nm = String(a.name || a.pool_name || "").match(/(\d+(?:\.\d+)?)%/);
        return nm ? Number(nm[1]) : 0;
      })(),
      feeBps: (() => {
        const direct = num(a.pool_fee_percentage);
        if (direct > 0) return Math.round(direct * 100);
        const nm = String(a.name || a.pool_name || "").match(/(\d+(?:\.\d+)?)%/);
        return nm ? Math.round(Number(nm[1]) * 100) : 0;
      })(),
      dexId: String(r?.dex?.data?.id || ""),
      baseAddr: parseTokenAddrFromId(baseId),
      quoteAddr: parseTokenAddrFromId(quoteId),
    };
  }).filter((x) => x.poolAddr && x.reserveUsd > 0 && x.vol24 > 0 && x.feeBps <= 1000);

  pools.sort((a, b) => (b.vol24 - a.vol24) || (b.reserveUsd - a.reserveUsd) || (a.feeBps - b.feeBps));

  const anchorAddr = (ANCHORS[preferredAnchor] || "").toLowerCase();
  const anchored = anchorAddr ? pools.filter((p) => p.baseAddr === anchorAddr || p.quoteAddr === anchorAddr) : [];
  const finalPools = anchored.length ? anchored : pools;

  cacheSet(ck, finalPools, POOL_LIST_TTL_MS);
  return finalPools;
}

function setPoolOptions(pools) {
  const sel = $("poolSel");
  if (!sel) return;
  sel.innerHTML = "";
  if (!pools.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No pools found";
    sel.appendChild(opt);
    return;
  }

  for (const p of pools.slice(0, 20)) {
    const opt = document.createElement("option");
    opt.value = p.poolAddr;
    const dex = p.dexId ? ` · ${p.dexId}` : "";
    opt.textContent = `${p.name || p.poolAddr} (24h $${fmt(p.vol24, 0)} · liq $${fmt(p.reserveUsd, 0)} · fee ${Number.isFinite(p.feePct) ? p.feePct.toFixed(2) : "?"}%${dex})`;
    sel.appendChild(opt);
  }

  try {
    const desired = String(window.__sellImpactDesiredPool || "").trim();
    if (desired) sel.value = desired;
    if (!sel.value) {
      const first = Array.from(sel.options || []).find((o) => o && o.value && !o.disabled);
      if (first) sel.value = first.value;
    }
  } catch (e) {}
}

async function getPoolSnapshot(poolAddr) {
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
  if (!feeBps) {
    const mm = name.match(/(\d+(?:\.\d+)?)%/);
    if (mm) feeBps = Math.round(Number(mm[1]) * 100);
  }
  const inferred = inferReserves(reserveUsd, basePriceUsd, quotePriceUsd);
  const out = {
    poolLabel: name || addr,
    feeBps,
    reserveUsd,
    base: { symbol: symBase, addr: baseAddr, reserve: inferred.baseReserve, priceUsd: basePriceUsd },
    quote: { symbol: symQuote, addr: quoteAddr, reserve: inferred.quoteReserve, priceUsd: quotePriceUsd },
    raw: a,
  };
  cacheSet(ck, out, POOL_TTL_MS);
  return out;
}

function quoteImpact({ pool, sellAmount, sellTokenAddr }) {
  const fee = (pool.feeBps || 0) / 10000;
  const sellAddr = String(sellTokenAddr || "").trim().toLowerCase();
  let inSide;
  let outSide;
  if (sellAddr && pool.base.addr === sellAddr) {
    inSide = pool.base;
    outSide = pool.quote;
  } else if (sellAddr && pool.quote.addr === sellAddr) {
    inSide = pool.quote;
    outSide = pool.base;
  } else {
    inSide = pool.quote;
    outSide = pool.base;
  }

  const reserveIn = num(inSide.reserve);
  const reserveOut = num(outSide.reserve);
  if (!(reserveIn > 0 && reserveOut > 0 && sellAmount > 0)) {
    return { ok: false, reason: "no_liquidity_or_bad_input" };
  }

  const amountInEff = sellAmount * (1 - fee);
  const outAmount = (reserveOut * amountInEff) / (reserveIn + amountInEff);
  const priceBefore = reserveOut / reserveIn;
  const priceAfter = (reserveOut - outAmount) / (reserveIn + amountInEff);
  const impact = 1 - (priceAfter / priceBefore);
  const outUsd = outSide.priceUsd ? outAmount * outSide.priceUsd : 0;

  return {
    ok: true,
    inSymbol: inSide.symbol,
    outSymbol: outSide.symbol,
    outAmount,
    outUsd,
    impact,
    fee,
    priceBefore,
    priceAfter,
    inAddr: inSide.addr,
    outAddr: outSide.addr,
  };
}

function maxSellUnder(pool, sellTokenAddr, targetImpact) {
  const sellAddr = String(sellTokenAddr || "").trim().toLowerCase();
  const sellReserve = (sellAddr && pool.base.addr === sellAddr)
    ? pool.base.reserve
    : (sellAddr && pool.quote.addr === sellAddr)
      ? pool.quote.reserve
      : Math.max(pool.base.reserve, pool.quote.reserve);
  let lo = 0;
  let hi = Math.max(1, sellReserve);
  let best = 0;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    const q = quoteImpact({ pool, sellAmount: mid, sellTokenAddr });
    if (!q.ok) {
      hi = mid;
      continue;
    }
    if (q.impact <= targetImpact) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

function splitCompare(pool, sellTokenAddr, total, parts) {
  const per = total / parts;
  let sumOut = 0;
  const cur = JSON.parse(JSON.stringify(pool));
  const sellAddr = String(sellTokenAddr || "").trim().toLowerCase();
  for (let i = 0; i < parts; i += 1) {
    const q = quoteImpact({ pool: cur, sellAmount: per, sellTokenAddr: sellAddr });
    if (!q.ok) return { ok: false };
    sumOut += q.outAmount;
    const fee = (cur.feeBps || 0) / 10000;
    const eff = per * (1 - fee);
    const inIsBase = sellAddr && cur.base.addr === sellAddr;
    if (inIsBase) {
      cur.base.reserve += eff;
      cur.quote.reserve -= q.outAmount;
    } else {
      cur.quote.reserve += eff;
      cur.base.reserve -= q.outAmount;
    }
  }
  return { ok: true, outAmount: sumOut };
}

function updateConclusionCard({ best5, impact, inSymbol, outSymbol }) {
  const rec = $("recMax5");
  const rs = $("riskSummary");
  const note = $("conclusionNote");
  if (rec) rec.textContent = Number.isFinite(best5) ? `${fmt(best5, 6)} ${inSymbol}` : "—";
  if (rs) {
    if (!Number.isFinite(impact)) rs.textContent = "—";
    else if (impact >= 0.5) rs.textContent = `DON’T (${fmtPct(impact)} impact)`;
    else if (impact >= 0.2) rs.textContent = `High (${fmtPct(impact)} impact)`;
    else if (impact >= 0.05) rs.textContent = `Caution (${fmtPct(impact)} impact)`;
    else rs.textContent = `OK (${fmtPct(impact)} impact)`;
  }
  if (note) {
    note.textContent = Number.isFinite(best5)
      ? `5% impact max is an estimate. Receive asset depends on selected pool (${outSymbol}).`
      : `Best-effort estimate. Receive asset depends on selected pool (${outSymbol}).`;
  }
}

function quoteCacheKey(poolAddr, tokenAddr, amt) {
  return `quote:${String(poolAddr || "")}:${String(tokenAddr || "")}:${String(amt)}`;
}

async function loadPoolsForToken() {
  const reqId = ++loadPoolsSeq;
  setBusy("pools", true);
  try {
    setErr("");
    const addr = $("tokenAddr")?.value || "";
    if (!String(addr).trim()) {
      if (reqId === loadPoolsSeq) setPoolOptions([]);
      setErr("Enter token address to load pools.");
      return;
    }
    const pools = await listPoolsByToken(addr);
    if (reqId !== loadPoolsSeq) return;
    setPoolOptions(pools);
    if (!pools.length) setErr("No pools found for this token.");
  } catch (e) {
    console.error("loadPoolsForToken failed", e);
    if (reqId !== loadPoolsSeq) return;
    setPoolOptions([]);
    setErr(`Pool lookup error: ${e.message || String(e)}`);
  } finally {
    setBusy("pools", false);
  }
}

function scheduleReloadPools() {
  if (tokenInputTimer) clearTimeout(tokenInputTimer);
  tokenInputTimer = setTimeout(() => {
    loadPoolsForToken().then(() => runEstimate()).catch(() => {});
  }, 300);
}

async function runEstimate() {
  const reqId = ++estimateSeq;
  setErr("");
  setBusy("estimate", true);

  const tokenAddr = String($("tokenAddr")?.value || "").trim().toLowerCase();
  const amt = Number(String($("amountWld")?.value || "").trim());
  const poolAddr = $("poolSel")?.value;

  if (!tokenAddr.startsWith("0x") || tokenAddr.length < 42) {
    setErr("Enter a valid token address (0x...).");
    setBusy("estimate", false);
    return;
  }
  if (!(amt > 0)) {
    setErr("Enter a positive sell amount.");
    setBusy("estimate", false);
    return;
  }
  if (!poolAddr) {
    setErr("No pool selected.");
    setBusy("estimate", false);
    return;
  }

  try {
    let pool;
    let q;
    let source = "worker-quote-v1";
    try {
      const workerQuote = await fetchWorkerQuote(tokenAddr, poolAddr, amt);
      pool = workerQuote.pool;
      q = workerQuote.quote;
    } catch (workerErr) {
      source = "fallback-local-v1";
      const fallbackPool = await getPoolSnapshot(poolAddr);
      const qk = quoteCacheKey(poolAddr, tokenAddr, amt);
      const qc = cacheGet(qk);
      q = qc;
      if (!q) {
        q = quoteImpact({ pool: fallbackPool, sellAmount: amt, sellTokenAddr: tokenAddr });
        cacheSet(qk, q, QUOTE_TTL_MS);
      }
      pool = fallbackPool;
    }

    if (!q?.ok) {
      setErr("Cannot quote with current data (try a different pool).");
      const dbg = $("debug");
      if (dbg) dbg.textContent = JSON.stringify({ pool, q, source }, null, 2);
      setBusy("estimate", false);
      return;
    }
    if (reqId !== estimateSeq) {
      setBusy("estimate", false);
      return;
    }

    const outUsdEl = $("outUsd");
    if (outUsdEl) {
      const isUsdLike = /USDC|USD/i.test(q.outSymbol || "");
      outUsdEl.textContent = isUsdLike ? `$${fmt(q.outAmount, 2)}` : `${fmt(q.outAmount, 6)} ${q.outSymbol}`;
    }
    const impactEl = $("impact");
    if (impactEl) impactEl.textContent = fmtPct(q.impact);

    const r = riskLabel(q.impact);
    pillSet($("riskPill"), `Risk: ${r.label}`);
    riskPillStyle($("riskPill"), r.level);
    pillSet($("poolPill"), `Pool: ${pool.poolLabel} (anchor ${preferredAnchor})`);
    pillSet($("liqPill"), `Liquidity: ${pool.reserveUsd ? `$${fmt(pool.reserveUsd, 0)}` : "—"}`);

    const best5 = maxSellUnder(pool, tokenAddr, 0.05);
    updateConclusionCard({ best5, impact: q.impact, inSymbol: q.inSymbol, outSymbol: q.outSymbol });

    try {
      const compare = await fetchWorkerCompare(tokenAddr, amt, 3);
      renderCompare(compare, poolAddr);
    } catch (compareErr) {
      renderCompare(null, poolAddr, compareErr?.message || "compare_failed");
    }

    const dbg = $("debug");
    if (dbg) dbg.textContent = JSON.stringify({ pool, q, source }, null, 2);
  } catch (e) {
    console.error("runEstimate failed", e);
    setErr(`API error: ${e.message || String(e)}`);
  } finally {
    setBusy("estimate", false);
  }
}

async function runMaxUnderUI() {
  setErr("");
  setButtonsDisabled(true);
  const tokenAddr = String($("tokenAddr")?.value || "").trim().toLowerCase();
  const poolAddr = $("poolSel")?.value;
  const targetPct = Number(String($("maxImpactPct")?.value || "").trim());
  const outEl = $("maxOut");
  const rec = $("recMax5");

  if (!tokenAddr.startsWith("0x") || tokenAddr.length < 42) {
    if (outEl) outEl.textContent = "Invalid token address.";
    setButtonsDisabled(false);
    return;
  }
  if (!poolAddr || !(targetPct > 0)) {
    if (outEl) outEl.textContent = "Invalid target or pool.";
    setButtonsDisabled(false);
    return;
  }

  try {
    const pool = await getPoolSnapshot(poolAddr);
    const best = maxSellUnder(pool, tokenAddr, targetPct / 100);
    if (outEl) outEl.textContent = `Max sell under ${fmt(targetPct, 2)}% impact ≈ ${fmt(best, 6)} (token units, best-effort)`;
    if (rec && Math.abs(targetPct - 5) < 1e-9) rec.textContent = `${fmt(best, 6)} (token units)`;
  } catch (e) {
    if (outEl) outEl.textContent = `API error: ${e.message || String(e)}`;
  } finally {
    setButtonsDisabled(false);
  }
}

async function runSplitUI() {
  setErr("");
  setButtonsDisabled(true);
  const tokenAddr = String($("tokenAddr")?.value || "").trim().toLowerCase();
  const poolAddr = $("poolSel")?.value;
  const amt = Number(String($("amountWld")?.value || "").trim());
  const outEl = $("splitOut");

  if (!tokenAddr.startsWith("0x") || tokenAddr.length < 42) {
    if (outEl) outEl.textContent = "Invalid token address.";
    setButtonsDisabled(false);
    return;
  }
  if (!poolAddr || !(amt > 0)) {
    if (outEl) outEl.textContent = "Enter amount and select pool.";
    setButtonsDisabled(false);
    return;
  }

  try {
    const pool = await getPoolSnapshot(poolAddr);
    const once = quoteImpact({ pool, sellAmount: amt, sellTokenAddr: tokenAddr });
    const s10 = splitCompare(pool, tokenAddr, amt, 10);
    const s50 = splitCompare(pool, tokenAddr, amt, 50);
    if (!once.ok || !s10.ok || !s50.ok) {
      if (outEl) outEl.textContent = "Split compare failed (missing data).";
      return;
    }
    const outPrice = once.outSymbol === pool.base.symbol ? pool.base.priceUsd : once.outSymbol === pool.quote.symbol ? pool.quote.priceUsd : 0;
    const onceUsd = once.outUsd || (outPrice ? once.outAmount * outPrice : 0);
    const s10Usd = outPrice ? s10.outAmount * outPrice : 0;
    const s50Usd = outPrice ? s50.outAmount * outPrice : 0;
    const d10 = s10Usd - onceUsd;
    const d50 = s50Usd - onceUsd;
    const same10 = Math.abs(d10) < 0.01;
    const same50 = Math.abs(d50) < 0.01;
    const s10line = same10 ? `Split10: $${fmt(s10Usd, 2)} (≈ same)` : `Split10: $${fmt(s10Usd, 2)} (${d10 >= 0 ? "+" : "-"}$${fmt(Math.abs(d10), 2)})`;
    const s50line = same50 ? `Split50: $${fmt(s50Usd, 2)} (≈ same)` : `Split50: $${fmt(s50Usd, 2)} (${d50 >= 0 ? "+" : "-"}$${fmt(Math.abs(d50), 2)})`;
    if (outEl) outEl.textContent = `Once: $${fmt(onceUsd, 2)} · ${s10line} · ${s50line} (best-effort)`;
  } catch (e) {
    if (outEl) outEl.textContent = `API error: ${e.message || String(e)}`;
  } finally {
    setButtonsDisabled(false);
  }
}

function getQueryParams() {
  const sp = new URLSearchParams(location.search);
  return {
    token: (sp.get("token") || "").trim(),
    amt: (sp.get("amt") || "").trim(),
    pool: (sp.get("pool") || "").trim(),
  };
}

function setQueryParams({ token, amt, pool }) {
  const sp = new URLSearchParams(location.search);
  if (token !== undefined) {
    if (String(token).trim()) sp.set("token", String(token).trim());
    else sp.delete("token");
  }
  if (amt !== undefined) {
    if (String(amt).trim()) sp.set("amt", String(amt).trim());
    else sp.delete("amt");
  }
  if (pool !== undefined) {
    if (String(pool).trim()) sp.set("pool", String(pool).trim());
    else sp.delete("pool");
  }
  const q = sp.toString();
  const url = q ? `${location.pathname}?${q}` : location.pathname;
  history.replaceState(null, "", url);
}

function bindExamples() {
  const wrap = $("exExamples");
  if (!wrap) return;
  wrap.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest && e.target.closest("button[data-ex-token]");
    if (!btn) return;
    const token = String(btn.getAttribute("data-ex-token") || "").trim();
    const amt = String(btn.getAttribute("data-ex-amt") || "1000").trim();
    const t = $("tokenAddr");
    const a = $("amountWld");
    if (t) t.value = token;
    if (a) a.value = amt;
    setQueryParams({ token, amt, pool: "" });
    Promise.resolve().then(() => loadPoolsForToken()).then(() => runEstimate()).catch((err) => {
      console.error("Examples flow failed", err);
      setErr(`Examples flow failed: ${err?.message || String(err)}`);
    });
  });
}

function init() {
  bindExamples();
  renderCompare(null, "", "run an estimate to compare top pools");
  const qp = getQueryParams();
  window.__sellImpactDesiredPool = qp.pool || "";
  const tokenEl = $("tokenAddr");
  const amtEl = $("amountWld");
  if (qp.token && tokenEl) tokenEl.value = qp.token;
  if (qp.amt && amtEl) amtEl.value = qp.amt;

  $("btnEstimate")?.addEventListener("click", runEstimate);
  $("btnMaxUnder")?.addEventListener("click", runMaxUnderUI);
  $("btnSplit")?.addEventListener("click", runSplitUI);
  $("btnMaxUnder2")?.addEventListener("click", runMaxUnderUI);
  $("btnSplit2")?.addEventListener("click", runSplitUI);
  $("btnMax1")?.addEventListener("click", () => { const i = $("maxImpactPct"); if (i) i.value = "1"; runMaxUnderUI(); });
  $("btnMax2")?.addEventListener("click", () => { const i = $("maxImpactPct"); if (i) i.value = "2"; runMaxUnderUI(); });
  $("btnMax5")?.addEventListener("click", () => { const i = $("maxImpactPct"); if (i) i.value = "5"; runMaxUnderUI(); });

  $("tokenAddr")?.addEventListener("input", () => {
    const token = String($("tokenAddr")?.value || "").trim();
    const amt = String($("amountWld")?.value || "").trim();
    setQueryParams({ token, amt, pool: "" });
    scheduleReloadPools();
  });
  $("tokenAddr")?.addEventListener("change", () => {
    const token = String($("tokenAddr")?.value || "").trim();
    const amt = String($("amountWld")?.value || "").trim();
    setQueryParams({ token, amt, pool: "" });
    loadPoolsForToken().then(() => runEstimate()).catch((err) => {
      console.error("token change flow failed", err);
      setErr(`Token change failed: ${err?.message || String(err)}`);
    });
  });
  $("amountWld")?.addEventListener("input", () => {
    const token = String($("tokenAddr")?.value || "").trim();
    const amt = String($("amountWld")?.value || "").trim();
    if (token) setQueryParams({ token, amt, pool: "" });
    runEstimate().catch((err) => {
      console.error("amount input estimate failed", err);
      setErr(`Estimate failed: ${err?.message || String(err)}`);
    });
  });
  $("amountWld")?.addEventListener("change", () => {
    const token = String($("tokenAddr")?.value || "").trim();
    const amt = String($("amountWld")?.value || "").trim();
    if (token) setQueryParams({ token, amt, pool: "" });
    runEstimate().catch((err) => {
      console.error("amount change estimate failed", err);
      setErr(`Estimate failed: ${err?.message || String(err)}`);
    });
  });
  $("poolSel")?.addEventListener("change", () => {
    const token = String($("tokenAddr")?.value || "").trim();
    const amt = String($("amountWld")?.value || "").trim();
    const pool = String($("poolSel")?.value || "").trim();
    if (token) setQueryParams({ token, amt, pool });
    runEstimate().catch((err) => {
      console.error("pool change estimate failed", err);
      setErr(`Estimate failed: ${err?.message || String(err)}`);
    });
  });

  if (String($("tokenAddr")?.value || "").trim()) {
    loadPoolsForToken().then(() => runEstimate()).catch((err) => {
      console.error("initial load flow failed", err);
      setErr(`Initial load failed: ${err?.message || String(err)}`);
    });
  } else {
    setErr("Enter token address to load pools.");
  }

  if (qp.token) {
    loadPoolsForToken().then(() => {
      if (qp.pool && $("poolSel")) $("poolSel").value = qp.pool;
    }).then(() => runEstimate()).catch((err) => {
      console.error("deep-link boot failed", err);
      setErr(`Deep-link boot failed: ${err?.message || String(err)}`);
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
