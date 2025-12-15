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
  if (!h.startsWith("0x")) return Number(h);
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
  return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
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

function safeJsonStringify(obj, limitChars = 25000) {
  let s = "";
  try {
    s = JSON.stringify(obj, null, 2);
  } catch (e) {
    return `<<stringify failed>> ${String(e?.message || e)}`;
  }
  if (s.length <= limitChars) return s;
  return s.slice(0, limitChars) + "\n…(truncated)…";
}

// CoinGecko data parser (supports your current backend shape: {mode, data})
function parseCoinGecko(cg) {
  // backend: /coins/markets returns Array
  if (cg && Array.isArray(cg.data)) {
    if (cg.data.length === 0) return { ok: false, reason: "CoinGecko returned empty array. Likely wrong coin id (use worldcoin-wld)." };
    const w = cg.data[0] || {};
    const prices = w.sparkline_in_7d?.price;
    return {
      ok: true,
      mode: cg.mode || "markets",
      coin_id: w.id,
      usd: w.current_price,
      jpy: null, // not available in markets(usd) response
      usd_24h_change: w.price_change_percentage_24h,
      usd_market_cap: w.market_cap,
      usd_24h_vol: w.total_volume,
      spark7d: Array.isArray(prices) ? prices : null,
      note: "markets endpoint (vs_currency=usd). JPY needs a second call or simple/price."
    };
  }

  // backend might be changed later to return an object (simple/price style)
  // e.g. { data: {"worldcoin-wld": {...}} } or direct { "worldcoin-wld": {...} }
  const d = cg?.data || cg;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const key = d["worldcoin-wld"] ? "worldcoin-wld" : (d["worldcoin"] ? "worldcoin" : null);
    if (!key) return { ok: false, reason: "CoinGecko object has no worldcoin-wld/worldcoin key." };
    const s = d[key];
    return {
      ok: true,
      mode: cg?.mode || "simple",
      coin_id: key,
      usd: s.usd,
      jpy: s.jpy,
      usd_24h_change: s.usd_24h_change,
      usd_market_cap: s.usd_market_cap,
      usd_24h_vol: s.usd_24h_vol,
      spark7d: null,
      note: "simple/price style response."
    };
  }

  return { ok: false, reason: "CoinGecko data missing." };
}

async function load() {
  setText("#status", "loading...");
  setText("#errors", "—");

  try {
    const r = await fetch("/api/summary", { cache: "no-store" });

    // JSONじゃない/壊れてる時に備える
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { j = null; }

    if (!r.ok || !j) {
      throw new Error(`HTTP ${r.status} / non-JSON body: ${text.slice(0, 200)}`);
    }

    // Status
    const ok = !!j.ok && (!j.errors || j.errors.length === 0);
    setText("#status", ok ? "OK" : "PARTIAL");

    // Errors
    setText("#errors", (j.errors && j.errors.length) ? j.errors.join("\n") : "—");

    // Raw(debug) : でかすぎて固まるのを防ぐ
    setText("#raw", safeJsonStringify(j, 25000));

    // 1) Network
    const tps = j.rpc?.tps_estimate ?? null;
    setText("#tps", tps != null ? fmtNum(tps) : "—");
    setText("#tx24h", tps != null ? fmtNum(tps * 86400) : "—");

    const gasWei = hexToInt(j.rpc?.gas_price);
    const gasGwei = gasWei != null ? gasWei / 1e9 : null;
    setText("#gasPrice", gasGwei != null ? `${fmtNum(gasGwei)} gwei` : "—");

    // address系は現状データ源なし
    setText("#newAddr24h", "N/A");
    setNote("#newAddrNote", "No indexer API for address counts in current build.");
    setText("#totalAddr", "N/A");
    setNote("#totalAddrNote", "No indexer API for total address count in current build.");

    // 2) WLD Market (match backend coingecko.mode/data)
    const cgParsed = parseCoinGecko(j.coingecko || {});
    if (cgParsed.ok) {
      setText("#wldUsd", cgParsed.usd != null ? `$${fmtNum(cgParsed.usd)}` : "—");
      setText("#wldJpy", cgParsed.jpy != null ? `¥${fmtNum(cgParsed.jpy)}` : "—");
      setText("#wldChg24h", cgParsed.usd_24h_change != null ? `${fmtNum(cgParsed.usd_24h_change)}%` : "—");
      setText("#wldMc", cgParsed.usd_market_cap != null ? `$${fmtNum(cgParsed.usd_market_cap)}` : "—");
      setText("#wldVol", cgParsed.usd_24h_vol != null ? `$${fmtNum(cgParsed.usd_24h_vol)}` : "—");

      if (cgParsed.spark7d) {
        setText("#wldSpark7d", sparkline(cgParsed.spark7d));
        setText("#chartWld7d", sparkline(cgParsed.spark7d, 40));
      } else {
        setText("#wldSpark7d", "—");
        setText("#chartWld7d", "—");
      }

      const mode = cgParsed.mode || "?";
      const id = cgParsed.coin_id || "?";
      const extra = cgParsed.note ? ` / ${cgParsed.note}` : "";
      setNote("#cgNote", `CoinGecko mode: ${mode} / id: ${id}${extra}`);
    } else {
      setNote("#cgNote", `CoinGecko: unavailable. ${cgParsed.reason || ""} (Fix: use ids=worldcoin-wld)`);
    }

    // 3) Activity Breakdown : backendが activity_sample を返してないので N/A にする
    setText("#pctNative", "N/A");
    setText("#pctToken", "N/A");
    setText("#pctContract", "N/A");
    setText("#pctOther", "N/A");
    setNote("#pctTokenNote", "Needs indexer/logs to count token transfers.");
    setNote("#actNote", "Activity breakdown not implemented in API response yet.");

    // 4) TX 7d trend : データ源なし
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
  }
}

$("#reload")?.addEventListener("click", load);
load();
