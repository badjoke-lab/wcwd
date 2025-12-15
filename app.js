const $ = (sel) => document.querySelector(sel);

function setText(sel, v) {
  const el = $(sel);
  if (!el) return;
  el.textContent = (v === undefined || v === null || v === "") ? "—" : String(v);
}

function setNote(sel, v) {
  const el = $(sel);
  if (!el) return;
  el.textContent = v ? String(v) : "";
}

function hexToInt(h) {
  if (!h || typeof h !== "string") return null;
  if (!h.startsWith("0x")) {
    const n = Number(h);
    return Number.isFinite(n) ? n : null;
  }
  const n = parseInt(h, 16);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (Math.abs(x) >= 1e12) return (x / 1e12).toFixed(2) + "T";
  if (Math.abs(x) >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (Math.abs(x) >= 1e6) return (x / 1e6).toFixed(2) + "M";
  if (Math.abs(x) >= 1e3) return (x / 1e3).toFixed(2) + "K";
  if (Math.abs(x) < 1) return x.toPrecision(4);
  return x.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function sparkline(nums, width = 24) {
  const arr = (nums || []).filter(n => typeof n === "number" && Number.isFinite(n));
  if (arr.length < 2) return "—";
  const blocks = "▁▂▃▄▅▆▇█";
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const span = max - min || 1;
  const step = Math.max(1, Math.floor(arr.length / width));
  let out = "";
  for (let i = 0; i < arr.length; i += step) {
    const v = arr[i];
    const idx = Math.max(0, Math.min(7, Math.floor(((v - min) / span) * 7)));
    out += blocks[idx];
  }
  return out;
}

function pushSample(key, v, max = 20) {
  const k = "wcwd_" + key;
  const arr = JSON.parse(localStorage.getItem(k) || "[]");
  arr.push({ t: Date.now(), v });
  while (arr.length > max) arr.shift();
  localStorage.setItem(k, JSON.stringify(arr));
  return arr;
}

function avgSamples(arr) {
  const xs = (arr || []).map(o => Number(o.v)).filter(n => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function safeJsonStringify(obj, maxChars = 20000) {
  let s;
  try {
    s = JSON.stringify(obj, null, 2);
  } catch (e) {
    s = String(obj);
  }
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `\n…(trimmed ${s.length - maxChars} chars)`;
}

/**
 * `/api/summary` の coingecko は現状こう:
 *   coingecko: { mode: "demo"|"pro"|..., data: <array|object|string>, http_status? }
 *
 * - data が配列: /coins/markets の結果（USD中心、sparkline_in_7dあり）
 * - data がオブジェクト: /simple/price の結果（worldcoin.usd/jpy 等）
 */
function parseCoinGecko(cg) {
  const out = {
    mode: cg?.mode || null,
    usd: null,
    jpy: null,
    chg24: null,
    mc: null,
    vol: null,
    spark7d: null,
    note: ""
  };

  if (!cg) {
    out.note = "CoinGecko: missing in /api/summary";
    return out;
  }
  if (cg.skipped) {
    out.note = `CoinGecko: ${cg.skipped}`;
    return out;
  }

  const d = cg.data;

  // 1) /coins/markets 形式（配列）
  if (Array.isArray(d)) {
    if (!d.length) {
      out.note = `CoinGecko: empty data (mode=${cg.mode || "?"}).`;
      return out;
    }
    const x = d[0] || {};
    out.usd = (x.current_price ?? null);
    out.chg24 = (x.price_change_percentage_24h ?? x.price_change_percentage_24h_in_currency ?? null);
    out.mc = (x.market_cap ?? null);
    out.vol = (x.total_volume ?? null);
    out.spark7d = (x.sparkline_in_7d && Array.isArray(x.sparkline_in_7d.price)) ? x.sparkline_in_7d.price : null;

    // このエンドポイントは vs_currency=usd の場合 JPY は出ない（サーバがUSD-onlyで取ってる限り）
    out.note = `CoinGecko: markets endpoint (mode=${cg.mode || "?"}). JPY requires simple/price with vs_currencies=jpy.`;
    return out;
  }

  // 2) /simple/price 形式（オブジェクト）
  if (d && typeof d === "object") {
    // 典型: { worldcoin: { usd, jpy, usd_market_cap, usd_24h_vol, usd_24h_change, ... } }
    const wc = d.worldcoin || d.Worldcoin || null;
    if (wc && typeof wc === "object") {
      out.usd = (wc.usd ?? null);
      out.jpy = (wc.jpy ?? null);
      out.chg24 = (wc.usd_24h_change ?? null);
      out.mc = (wc.usd_market_cap ?? null);
      out.vol = (wc.usd_24h_vol ?? null);
      out.note = `CoinGecko: simple/price endpoint (mode=${cg.mode || "?"}).`;
      return out;
    }

    out.note = `CoinGecko: unrecognized object shape (mode=${cg.mode || "?"}).`;
    return out;
  }

  // 3) 文字列など（エラー本文が入ってる可能性）
  out.note = `CoinGecko: non-json or unexpected (mode=${cg.mode || "?"}).`;
  return out;
}

async function load() {
  setText("#status", "loading...");
  setText("#errors", "—");

  try {
    const r = await fetch("/api/summary", { cache: "no-store" });
    const text = await r.text();

    let j = null;
    try { j = JSON.parse(text); } catch { /* ignore */ }

    if (!r.ok || !j) {
      throw new Error(`HTTP ${r.status} (non-JSON or fetch failed)`);
    }

    // Status
    const hasErr = Array.isArray(j.errors) && j.errors.length;
    setText("#status", j.ok ? "OK" : (hasErr ? "PARTIAL" : "OK"));

    // Errors + Raw
    setText("#errors", hasErr ? j.errors.join("\n") : "—");
    setText("#raw", safeJsonStringify(j, 25000));

    // 1) Network Stats
    const tps = (j.rpc && typeof j.rpc.tps_estimate === "number") ? j.rpc.tps_estimate : null;
    setText("#tps", tps != null ? fmtNum(tps) : "—");
    setText("#tx24h", tps != null ? fmtNum(tps * 86400) : "—");

    const gasWei = hexToInt(j.rpc?.gas_price);
    const gasGwei = (gasWei != null) ? gasWei / 1e9 : null;
    setText("#gasPrice", gasGwei != null ? `${fmtNum(gasGwei)} gwei` : "—");

    // address系（現状 indexer がないので N/A）
    setText("#newAddr24h", "N/A");
    setNote("#newAddrNote", "No indexer API for address counts in current build.");
    setText("#totalAddr", "N/A");
    setNote("#totalAddrNote", "No indexer API for total address count in current build.");

    // 2) WLD Market Stats (CoinGecko)
    const cg = parseCoinGecko(j.coingecko);

    setText("#wldUsd", cg.usd != null ? `$${fmtNum(cg.usd)}` : "—");
    setText("#wldJpy", cg.jpy != null ? `¥${fmtNum(cg.jpy)}` : "—");
    setText("#wldChg24h", cg.chg24 != null ? `${fmtNum(cg.chg24)}%` : "—");
    setText("#wldMc", cg.mc != null ? `$${fmtNum(cg.mc)}` : "—");
    setText("#wldVol", cg.vol != null ? `$${fmtNum(cg.vol)}` : "—");

    const sp = Array.isArray(cg.spark7d) ? cg.spark7d : null;
    setText("#wldSpark7d", sp ? sparkline(sp, 24) : "—");
    setText("#chartWld7d", sp ? sparkline(sp, 40) : "—");

    setNote("#cgNote", cg.note || "");

    // 3) Activity Breakdown
    // Functions が activity_sample を返してないので、現状は N/A を明示
    setText("#pctNative", "N/A");
    setText("#pctToken", "N/A");
    setText("#pctContract", "N/A");
    setText("#pctOther", "N/A");
    setNote("#pctTokenNote", "Needs tx logs/indexer or server-side classification.");
    setNote("#actNote", "Activity breakdown is not included in /api/summary yet.");

    // 4) Trend Charts（TX 7d はデータ源が必要）
    setText("#chartTx7d", "N/A");
    setNote("#chartTxNote", "Needs daily tx-count API / indexer.");

    // 5) Alerts (local rolling avg)
    if (tps != null) {
      const samples = pushSample("tps", tps);
      const avg = avgSamples(samples);
      setText("#alertSpike", (avg && tps > avg * 1.4) ? "YES" : "—");
      setText("#alertDrop", (avg && tps < avg * 0.7) ? "YES" : "—");
    } else {
      setText("#alertSpike", "—");
      setText("#alertDrop", "—");
    }

    if (gasGwei != null) {
      const gs = pushSample("gas", gasGwei);
      const gavg = avgSamples(gs);
      setText("#alertHighGas", (gavg && gasGwei > gavg * 1.5) ? "YES" : "—");
    } else {
      setText("#alertHighGas", "—");
    }

  } catch (e) {
    setText("#status", "ERROR");
    setText("#errors", String(e && e.message ? e.message : e));
    // 失敗時も raw を出せるなら出す（軽く）
    try { setText("#raw", String(e)); } catch {}
    console.error(e);
  }
}

$("#reload")?.addEventListener("click", load);
load();
