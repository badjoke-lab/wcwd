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

// ---- local samples (NOT dummy): stored in browser only ----
function pushSample(key, v, max = 240) {
  const k = "wcwd_" + key;
  const arr = JSON.parse(localStorage.getItem(k) || "[]");
  arr.push({ t: Date.now(), v });
  while (arr.length > max) arr.shift();
  localStorage.setItem(k, JSON.stringify(arr));
  return arr;
}

function filterWindow(arr, ms) {
  const now = Date.now();
  return (arr || []).filter(o => o && typeof o.t === "number" && (now - o.t) <= ms);
}

function avgOf(arr) {
  const xs = (arr || []).map(o => Number(o.v)).filter(n => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function lastOf(arr) {
  if (!arr || !arr.length) return null;
  const v = Number(arr[arr.length - 1].v);
  return Number.isFinite(v) ? v : null;
}

function decisionBadge(ok) {
  return ok ? "YES" : "NO";
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

    // Indexer無しだと取れないので N/A を明示（ここは仕様）
    setText("#newAddr24h", "N/A");
    setNote("#newAddrNote", "Needs an indexer API (not available in this build).");
    setText("#totalAddr", "N/A");
    setNote("#totalAddrNote", "Needs an indexer API (not available in this build).");

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
      setNote("#cgNote", `CoinGecko: ${cg.coin_id || "?"} / mode=${cg.mode || "?"}`);
    } else {
      setNote("#cgNote", cg.note || "CoinGecko: unavailable");
    }

    // 3) Activity (latest block approx)
    const act = j.activity_sample || null;
    if (act) {
      // IMPORTANT:
      // native_pct is "non-token share" (temporary label in backend)
      setText("#pctNative", act.native_pct != null ? `${fmtNum(act.native_pct)}%` : "—");
      setText("#pctContract", act.contract_pct != null ? `${fmtNum(act.contract_pct)}%` : "—");
      setText("#pctOther", act.other_pct != null ? `${fmtNum(act.other_pct)}%` : "—");

      // SHOW token_pct (was incorrectly hardcoded to N/A)
      setText("#pctToken", act.token_pct != null ? `${fmtNum(act.token_pct)}%` : "—");
      setNote(
        "#pctTokenNote",
        act.token_pct != null
          ? "Approx: latest-block token-tx share (unique tx with ERC-20 Transfer logs / block tx_count)."
          : "Token share unavailable in this build."
      );

      setNote("#actNote", j.activity_note || "Activity computed from latest block (approx).");
    } else {
      setText("#pctNative", "—");
      setText("#pctContract", "—");
      setText("#pctOther", "—");
      setText("#pctToken", "—");
      setNote("#pctTokenNote", "Activity sample unavailable.");
      setNote("#actNote", "Activity sample unavailable.");
    }

    // 4) Trend Charts
    // WLD 7d is already from CoinGecko; TX 7d: show LOCAL OBSERVED trend (not global)
    const SEVEN_DAYS = 7 * 24 * 3600 * 1000;
    if (tps != null) {
      const tpsSamples = pushSample("tps", tps, 240);
      const win = filterWindow(tpsSamples, SEVEN_DAYS);
      const series = win.map(o => Number(o.v)).filter(n => Number.isFinite(n));
      setText("#chartTx7d", series.length >= 2 ? sparkline(series, 40) : "—");
      setNote("#chartTxNote", series.length >= 2
        ? `Local observed TPS trend (samples=${series.length}).`
        : "Local TX trend: need more samples (reload a few times).");
    } else {
      setText("#chartTx7d", "—");
      setNote("#chartTxNote", "TX trend unavailable (TPS missing).");
    }

    // 5) Alerts (local rolling avg) — MUST show WAIT/NO instead of “—”
    // Rule: compare CURRENT value against AVERAGE of PREVIOUS samples (exclude current)
    const MIN_BASE = 3; // need at least 3 prior points to judge
    if (tps != null) {
      const all = JSON.parse(localStorage.getItem("wcwd_tps") || "[]");
      const last = lastOf(all);
      const prior = all.slice(0, Math.max(0, all.length - 1));
      const priorAvg = avgOf(prior);

      if (prior.length < MIN_BASE || priorAvg == null || last == null) {
        setText("#alertSpike", "WAIT");
        setText("#alertDrop", "WAIT");
      } else {
        setText("#alertSpike", decisionBadge(last > priorAvg * 1.4));
        setText("#alertDrop", decisionBadge(last < priorAvg * 0.7));
      }
    } else {
      setText("#alertSpike", "—");
      setText("#alertDrop", "—");
    }

    if (gasGwei != null) {
      const updated = pushSample("gas", gasGwei, 240);
      const last = lastOf(updated);
      const prior = updated.slice(0, Math.max(0, updated.length - 1));
      const priorAvg = avgOf(prior);

      if (prior.length < MIN_BASE || priorAvg == null || last == null) {
        setText("#alertHighGas", "WAIT");
      } else {
        setText("#alertHighGas", decisionBadge(last > priorAvg * 1.5));
      }
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
