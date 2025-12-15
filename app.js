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
  if (typeof h !== "string") return null;
  if (!h) return null;
  // 0x... 以外も一応受ける
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
  const arr = (nums || []).filter((n) => typeof n === "number" && Number.isFinite(n));
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

// CoinGecko: summary.js の coingecko.data を吸収（markets配列 or 文字列 or 他）
function parseCoinGecko(cg) {
  const res = {
    ok: false,
    note: "",
    usd: null,
    jpy: null,
    usd_24h_change: null,
    usd_market_cap: null,
    usd_24h_vol: null,
    spark7d: null,
  };

  if (!cg) {
    res.note = "CoinGecko: missing field";
    return res;
  }

  const mode = cg.mode || "?";
  const data = cg.data;

  if (!data) {
    res.note = `CoinGecko: unavailable (mode=${mode})`;
    return res;
  }

  // markets: 配列が基本
  if (Array.isArray(data)) {
    if (data.length === 0) {
      res.note = `CoinGecko: empty data[] (mode=${mode})`;
      return res;
    }
    const m = data[0] || {};
    // /coins/markets の代表的フィールド
    res.usd = (m.current_price ?? null);
    res.usd_market_cap = (m.market_cap ?? null);
    res.usd_24h_vol = (m.total_volume ?? null);
    // 24h変化はこのどれかに入る（環境差があるので吸収）
    res.usd_24h_change =
      (m.price_change_percentage_24h ??
        m.price_change_percentage_24h_in_currency ??
        m.price_change_percentage_24h_in_usd ??
        null);

    const sp = m.sparkline_in_7d && Array.isArray(m.sparkline_in_7d.price)
      ? m.sparkline_in_7d.price
      : null;
    res.spark7d = sp;

    // このビルドのsummary.jsは vs_currency=usd なのでJPYは出ない
    res.jpy = null;

    res.ok = true;
    res.note = `CoinGecko mode: ${mode} / source: coins/markets`;
    return res;
  }

  // もし将来 simple/price 形式の object が入ってきても壊れないように
  if (typeof data === "object") {
    // 例: { worldcoin: { usd, jpy, usd_market_cap, usd_24h_vol, usd_24h_change } }
    const w = data.worldcoin || data;
    res.usd = w.usd ?? w.current_price ?? null;
    res.jpy = w.jpy ?? null;
    res.usd_market_cap = w.usd_market_cap ?? w.market_cap ?? null;
    res.usd_24h_vol = w.usd_24h_vol ?? w.total_volume ?? null;
    res.usd_24h_change = w.usd_24h_change ?? w.price_change_percentage_24h ?? null;
    // sparkline はこの形式では通常ない
    res.spark7d = null;
    res.ok = true;
    res.note = `CoinGecko mode: ${mode} / source: object`;
    return res;
  }

  // 文字列（エラーメッセージ等）
  res.note = `CoinGecko: non-JSON data (mode=${mode})`;
  return res;
}

async function load() {
  setText("#status", "loading...");
  setText("#errors", "—");

  try {
    const r = await fetch("/api/summary", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(`HTTP ${r.status}`);

    // Status 表示：サーバ側 out.ok は errors があると false になる仕様
    setText("#status", j.ok ? "OK" : "PARTIAL");

    // Raw/debug
    setText("#raw", JSON.stringify(j, null, 2));
    setText("#errors", (j.errors && j.errors.length) ? j.errors.join("\n") : "—");

    // 1) Network
    const tps = j.rpc?.tps_estimate ?? null;
    setText("#tps", tps != null ? fmtNum(tps) : "—");
    setText("#tx24h", tps != null ? fmtNum(tps * 86400) : "—");

    const gasWei = hexToInt(j.rpc?.gas_price);
    const gasGwei = gasWei != null ? gasWei / 1e9 : null;
    setText("#gasPrice", gasGwei != null ? `${fmtNum(gasGwei)} gwei` : "—");

    // address系は indexer無しだと取れないので明示
    setText("#newAddr24h", "N/A");
    setNote("#newAddrNote", "No indexer API for address counts in current build.");
    setText("#totalAddr", "N/A");
    setNote("#totalAddrNote", "No indexer API for total address count in current build.");

    // 2) WLD Market (coingecko.data を読む)
    const cgParsed = parseCoinGecko(j.coingecko);
    if (cgParsed.ok) {
      setText("#wldUsd", cgParsed.usd != null ? `$${fmtNum(cgParsed.usd)}` : "—");
      setText("#wldJpy", cgParsed.jpy != null ? `¥${fmtNum(cgParsed.jpy)}` : "N/A");
      setText("#wldChg24h", cgParsed.usd_24h_change != null ? `${fmtNum(cgParsed.usd_24h_change)}%` : "—");
      setText("#wldMc", cgParsed.usd_market_cap != null ? `$${fmtNum(cgParsed.usd_market_cap)}` : "—");
      setText("#wldVol", cgParsed.usd_24h_vol != null ? `$${fmtNum(cgParsed.usd_24h_vol)}` : "—");

      const sp = cgParsed.spark7d;
      setText("#wldSpark7d", sp ? sparkline(sp) : "—");
      setText("#chartWld7d", sp ? sparkline(sp, 40) : "—");

      setNote("#cgNote", cgParsed.note + (cgParsed.jpy == null ? " / JPY not provided by current server query" : ""));
    } else {
      setNote("#cgNote", cgParsed.note || "CoinGecko: unavailable");
    }

    // 3) Activity Breakdown
    // 現状 summary.js は activity_sample を返してないので N/A 扱いにする
    setText("#pctNative", "N/A");
    setText("#pctToken", "N/A");
    setText("#pctContract", "N/A");
    setText("#pctOther", "N/A");
    setNote("#pctTokenNote", "Token/native/contract breakdown needs extra server-side computation or indexer.");
    setNote("#actNote", "Activity breakdown is not implemented in current /api/summary.");

    // 4) Trend Charts
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
