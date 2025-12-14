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
  return parseInt(h, 16);
}

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (Math.abs(x) >= 1e9) return (x/1e9).toFixed(2) + "B";
  if (Math.abs(x) >= 1e6) return (x/1e6).toFixed(2) + "M";
  if (Math.abs(x) >= 1e3) return (x/1e3).toFixed(2) + "K";
  if (Math.abs(x) < 1) return x.toPrecision(4);
  return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function sparkline(nums, width=24) {
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

function pushSample(key, v, max=20) {
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
  return xs.reduce((a,b)=>a+b,0) / xs.length;
}

async function load() {
  setText("#status", "loading...");
  setText("#errors", "—");
  try {
    const r = await fetch("/api/summary", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(`HTTP ${r.status}`);

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

    // address系は indexer無しだと取れないので「N/A」を明示
    setText("#newAddr24h", "N/A");
    setNote("#newAddrNote", "No indexer API for address counts in current build.");
    setText("#totalAddr", "N/A");
    setNote("#totalAddrNote", "No indexer API for total address count in current build.");

    // 2) WLD Market
    const cg = j.coingecko || {};
    if (cg.ok && cg.simple) {
      const s = cg.simple;
      setText("#wldUsd", s.usd != null ? `$${fmtNum(s.usd)}` : "—");
      setText("#wldJpy", s.jpy != null ? `¥${fmtNum(s.jpy)}` : "—");
      setText("#wldChg24h", s.usd_24h_change != null ? `${fmtNum(s.usd_24h_change)}%` : "—");
      setText("#wldMc", s.usd_market_cap != null ? `$${fmtNum(s.usd_market_cap)}` : "—");
      setText("#wldVol", s.usd_24h_vol != null ? `$${fmtNum(s.usd_24h_vol)}` : "—");
      setText("#wldSpark7d", cg.chart7d_usd?.prices ? sparkline(cg.chart7d_usd.prices) : "—");
      setText("#chartWld7d", cg.chart7d_usd?.prices ? sparkline(cg.chart7d_usd.prices, 40) : "—");
      setNote("#cgNote", `CoinGecko mode: ${cg.mode || "?"} / id: ${cg.coin_id || "?"}`);
    } else {
      setNote("#cgNote", "CoinGecko: unavailable (key missing / rate limited / error)");
    }

    // 3) Activity (latest block sample)
    const act = j.activity_sample || null;
    if (act) {
      setText("#pctNative", `${fmtNum(act.native_pct)}%`);
      setText("#pctContract", `${fmtNum(act.contract_pct)}%`);
      setText("#pctOther", `${fmtNum(act.other_pct)}%`);
      setText("#pctToken", "N/A");
      setNote("#pctTokenNote", "Token transfers need log/indexer.");
      setNote("#actNote", "Activity breakdown is computed from latest block tx input/value (sample).");
    } else {
      setNote("#actNote", "Activity sample unavailable.");
    }

    // 4) TX 7d trendは未実装（データ源が必要）
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
