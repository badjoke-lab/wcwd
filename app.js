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
  const n = parseInt(h.slice(2), 16);
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
  const span = (max - min) || 1;

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
 * /api/summary の coingecko を吸収して表示用に整形
 * - 現状の Functions は out.coingecko = { mode, data, http_status?, skipped? } で返す
 * - data は
 *   A) markets 配列（coins/markets）: [{ current_price, market_cap, total_volume, price_change_percentage_24h, sparkline_in_7d:{price:[]} }]
 *   B) simple price オブジェクト: { "worldcoin-wld": { usd, jpy, ... } } みたいな形
 *   C) 文字列（エラー本文等）
 */
function parseCoinGecko(cg) {
  const res = {
    ok: false,
    mode: cg?.mode || "",
    usd: null,
    jpy: null,
    chg24h: null,
    mc: null,
    vol: null,
    prices7d: null,
    note: "",
  };

  if (!cg || typeof cg !== "object") {
    res.note = "CoinGecko: missing";
    return res;
  }
  if (cg.skipped) {
    res.note = String(cg.skipped);
    return res;
  }

  let data = cg.data;

  // data が JSON 文字列で来た場合の救済
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      res.note = `CoinGecko: ${data.slice(0, 120)}`;
      return res;
    }
  }

  // A) markets 配列
  if (Array.isArray(data)) {
    if (!data.length) {
      res.note = "CoinGecko: markets returned 0 items (check coin id).";
      return res;
    }
    const it = data[0] || {};
    res.usd = it.current_price ?? null;
    res.mc = it.market_cap ?? null;
    res.vol = it.total_volume ?? null;
    res.chg24h = it.price_change_percentage_24h ?? it.price_change_percentage_24h_in_currency ?? null;
    res.prices7d = it.sparkline_in_7d?.price || null;
    res.ok = true;

    // この endpoints では JPY が無いことがある
    res.note =
      `CoinGecko mode: ${res.mode || "?"}` +
      (res.jpy == null ? " / JPY not included by current endpoint" : "");
    return res;
  }

  // B) simple price オブジェクト（キーが worldcoin-wld / worldcoin など）
  if (data && typeof data === "object") {
    const key =
      data["worldcoin-wld"] ? "worldcoin-wld" :
      data["worldcoin"] ? "worldcoin" :
      Object.keys(data)[0];

    const s = key ? data[key] : null;
    if (s && typeof s === "object") {
      res.usd = s.usd ?? null;
      res.jpy = s.jpy ?? null;
      res.mc = s.usd_market_cap ?? null;
      res.vol = s.usd_24h_vol ?? null;
      res.chg24h = s.usd_24h_change ?? null;
      // simple price には 7d が無いので prices7d は null のまま
      res.ok = true;
      res.note = `CoinGecko mode: ${res.mode || "?"} / id: ${key || "?"}`;
      return res;
    }
  }

  res.note = "CoinGecko: unrecognized payload";
  return res;
}

async function load() {
  setText("#status", "loading...");
  setText("#errors", "—");
  setText("#raw", "—");

  try {
    const r = await fetch("/api/summary", { cache: "no-store" });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { /* ignore */ }

    if (!r.ok) {
      throw new Error(`HTTP ${r.status}: ${text.slice(0, 160)}`);
    }
    if (!j) {
      throw new Error(`Invalid JSON: ${text.slice(0, 160)}`);
    }

    setText("#status", j.ok ? "OK" : "PARTIAL");
    setText("#raw", JSON.stringify(j, null, 2));
    setText("#errors", (j.errors && j.errors.length) ? j.errors.join("\n") : "—");

    // 1) Network
    const tps = j.rpc?.tps_estimate ?? null;
    setText("#tps", tps != null ? fmtNum(tps) : "—");
    setText("#tx24h", tps != null ? fmtNum(tps * 86400) : "—");

    const gasWei = hexToInt(j.rpc?.gas_price);
    const gasGwei = gasWei != null ? gasWei / 1e9 : null;
    setText("#gasPrice", gasGwei != null ? `${fmtNum(gasGwei)} gwei` : "—");

    // address 系は indexer 無しなので固定で明示
    setText("#newAddr24h", "N/A");
    setNote("#newAddrNote", "Needs indexer API (not in current build).");
    setText("#totalAddr", "N/A");
    setNote("#totalAddrNote", "Needs indexer API (not in current build).");

    // 2) WLD Market (CoinGecko)
    const cg = parseCoinGecko(j.coingecko);
    if (cg.ok) {
      setText("#wldUsd", cg.usd != null ? `$${fmtNum(cg.usd)}` : "—");
      setText("#wldJpy", cg.jpy != null ? `¥${fmtNum(cg.jpy)}` : "—");
      setText("#wldChg24h", cg.chg24h != null ? `${fmtNum(cg.chg24h)}%` : "—");
      setText("#wldMc", cg.mc != null ? `$${fmtNum(cg.mc)}` : "—");
      setText("#wldVol", cg.vol != null ? `$${fmtNum(cg.vol)}` : "—");
      setText("#wldSpark7d", cg.prices7d ? sparkline(cg.prices7d) : "—");
      setText("#chartWld7d", cg.prices7d ? sparkline(cg.prices7d, 40) : "—");
      setNote("#cgNote", cg.note || "CoinGecko OK");
    } else {
      setNote("#cgNote", cg.note || "CoinGecko: unavailable");
      setText("#wldUsd", "—");
      setText("#wldJpy", "—");
      setText("#wldChg24h", "—");
      setText("#wldMc", "—");
      setText("#wldVol", "—");
      setText("#wldSpark7d", "—");
      setText("#chartWld7d", "—");
    }

    // 3) Activity Breakdown（API 側に 아직無いので明示）
    setText("#pctNative", "N/A");
    setText("#pctToken", "N/A");
    setText("#pctContract", "N/A");
    setText("#pctOther", "N/A");
    setNote("#pctTokenNote", "Not implemented (needs tx/log/indexer).");
    setNote("#actNote", "Not implemented in /api/summary yet.");

    // 4) TX 7d trend（未実装）
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
