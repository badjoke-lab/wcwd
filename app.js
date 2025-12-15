// WCWD Skeleton app.js
// Version bump to make it obvious in DevTools which file is running.
const APP_VERSION = "2025-12-15.2";

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
  if (h === null || h === undefined) return null;
  if (typeof h === "number" && Number.isFinite(h)) return h;
  if (typeof h !== "string") return null;
  if (h === "" || h === "null") return null;
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
  return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function sparkline(nums, width = 24) {
  const arr = (nums || []).map(Number).filter((n) => Number.isFinite(n));
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
  const xs = (arr || []).map((o) => Number(o.v)).filter((n) => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * CoinGecko response can be 2 shapes depending on /api/summary implementation:
 *  A) "simple" shape (simple/price):  coingecko.simple = { usd, usd_market_cap, ... }
 *  B) "markets" shape (coins/markets): coingecko.data = [ { current_price, market_cap, total_volume, ...,
 *                                                          sparkline_in_7d: { price: [...] } } ]
 * We normalize into:
 *  { ok, mode, simple, spark_prices_7d }
 */
function normalizeCoinGecko(cg) {
  if (!cg) return { ok: false };

  // A) simple shape already normalized by backend
  if (cg.simple && typeof cg.simple === "object") {
    return {
      ok: true,
      mode: cg.mode || "simple",
      simple: cg.simple,
      spark_prices_7d: cg.chart7d_usd?.prices || null,
      coin_id: cg.coin_id || "worldcoin",
    };
  }

  // B) markets shape (backend puts the whole JSON into cg.data)
  const arr = Array.isArray(cg.data) ? cg.data : null;
  const row = arr && arr.length ? arr[0] : null;
  if (row && typeof row === "object") {
    const simple = {
      usd: row.current_price ?? null,
      usd_market_cap: row.market_cap ?? null,
      usd_24h_vol: row.total_volume ?? null,
      usd_24h_change: row.price_change_percentage_24h ?? null,
      // JPY may not be present in markets (vs_currency fixed to usd in backend)
      jpy: null,
      jpy_market_cap: null,
      jpy_24h_vol: null,
      jpy_24h_change: null,
    };
    const spark = row.sparkline_in_7d?.price || null;
    return {
      ok: true,
      mode: cg.mode || "markets",
      simple,
      spark_prices_7d: Array.isArray(spark) ? spark : null,
      coin_id: row.id || "worldcoin",
    };
  }

  return { ok: false };
}

async function load() {
  setText("#status", "loading...");
  setText("#errors", "—");

  // Optional: show version in console for cache debugging
  console.log(`[WCWD] app.js version ${APP_VERSION}`);

  try {
    // cache-bust to avoid any intermediate caching
    const url = `/api/summary?ts=${Date.now()}`;
    const r = await fetch(url, { cache: "no-store" });

    // Be robust: sometimes r.json() fails if edge returns HTML
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { /* ignore */ }

    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${r.statusText} :: ${text.slice(0, 200)}`);
    }
    if (!j) throw new Error(`Non-JSON response :: ${text.slice(0, 200)}`);

    setText("#status", j.ok ? "OK" : "PARTIAL");

    // Errors list
    const errs = (j.errors && j.errors.length) ? j.errors.join("\n") : "—";
    setText("#errors", errs);

    // Raw/debug (truncate to avoid a 10km page)
    const rawStr = JSON.stringify(j, null, 2);
    const RAW_MAX = 18000;
    setText("#raw", rawStr.length > RAW_MAX ? rawStr.slice(0, RAW_MAX) + "\n…(truncated)" : rawStr);

    // 1) Network Stats
    const tps = j.rpc?.tps_estimate ?? null;
    setText("#tps", tps != null ? fmtNum(tps) : "—");
    setText("#tx24h", tps != null ? fmtNum(tps * 86400) : "—");

    const gasWei = hexToInt(j.rpc?.gas_price);
    const gasGwei = gasWei != null ? gasWei / 1e9 : null;
    setText("#gasPrice", gasGwei != null ? `${fmtNum(gasGwei)} gwei` : "—");

    // Address metrics not available without an indexer -> show explicit N/A
    setText("#newAddr24h", "N/A");
    setNote("#newAddrNote", "Address counts require an indexer API (not in this build).");
    setText("#totalAddr", "N/A");
    setNote("#totalAddrNote", "Total address count requires an indexer API (not in this build).");

    // 2) WLD Market Stats (normalize both backend shapes)
    const cgN = normalizeCoinGecko(j.coingecko);
    if (cgN.ok) {
      const s = cgN.simple || {};
      setText("#wldUsd", s.usd != null ? `$${fmtNum(s.usd)}` : "—");
      setText("#wldJpy", s.jpy != null ? `¥${fmtNum(s.jpy)}` : "—");

      setText(
        "#wldChg24h",
        (s.usd_24h_change !== null && s.usd_24h_change !== undefined)
          ? `${fmtNum(s.usd_24h_change)}%`
          : "N/A"
      );

      setText("#wldMc", s.usd_market_cap != null ? `$${fmtNum(s.usd_market_cap)}` : "—");
      setText("#wldVol", s.usd_24h_vol != null ? `$${fmtNum(s.usd_24h_vol)}` : "—");

      const sp = cgN.spark_prices_7d;
      setText("#wldSpark7d", sp ? sparkline(sp, 24) : "—");
      setText("#chartWld7d", sp ? sparkline(sp, 40) : "—");

      setNote("#cgNote", `CoinGecko mode: ${cgN.mode} / id: ${cgN.coin_id} / app.js: ${APP_VERSION}`);
    } else {
      setNote("#cgNote", "CoinGecko: unavailable (missing key / rate limited / backend error).");
    }

    // 3) Activity Breakdown
    const act = j.activity_sample || null;
    if (act) {
      setText("#pctNative", `${fmtNum(act.native_pct)}%`);
      setText("#pctContract", `${fmtNum(act.contract_pct)}%`);
      setText("#pctOther", `${fmtNum(act.other_pct)}%`);
      setText("#pctToken", "N/A");
      setNote("#pctTokenNote", "Token transfers need logs / indexer.");
      setNote("#actNote", "Activity breakdown is computed from latest block tx input/value (sample).");
    } else {
      setText("#pctNative", "N/A");
      setText("#pctContract", "N/A");
      setText("#pctOther", "N/A");
      setText("#pctToken", "N/A");
      setNote("#pctTokenNote", "Not available in this build.");
      setNote("#actNote", "Activity breakdown not implemented in /api/summary yet.");
    }

    // 4) Trend Charts
    setText("#chartTx7d", "N/A");
    setNote("#chartTxNote", "Needs daily tx-count API / indexer (not in this build).");

    // 5) Alerts (local rolling average)
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
    console.error(e);
  }
}

$("#reload")?.addEventListener("click", load);
load();
