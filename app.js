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

// -------- CoinGecko extractor (robust) --------
// Supports both:
// A) markets endpoint array in out.coingecko.data (id/current_price/market_cap/total_volume/.../sparkline_in_7d.price)
// B) simple/price object in out.coingecko.data or out.coingecko.simple (worldcoin:{usd,jpy,usd_market_cap,...})
function extractCoinGecko(cg) {
  if (!cg || typeof cg !== "object") return { ok: false, reason: "missing" };

  // If server stored raw in cg.data
  const data = cg.data;

  // A) markets array
  if (Array.isArray(data) && data.length) {
    const m = data[0] || {};
    const prices = m?.sparkline_in_7d?.price;
    return {
      ok: true,
      source: "markets",
      mode: cg.mode || null,
      coin_id: m.id || cg.coin_id || null,
      usd: m.current_price ?? null,
      jpy: null, // markets is single vs_currency (usd) in current server code
      usd_24h_change: m.price_change_percentage_24h ?? null,
      usd_market_cap: m.market_cap ?? null,
      usd_24h_vol: m.total_volume ?? null,
      chart7d_prices: Array.isArray(prices) ? prices : null,
    };
  }

  // B) simple/price object
  // common shapes:
  //  - data.worldcoin.usd / data.worldcoin.jpy
  //  - cg.simple.worldcoin.usd ...
  const simple = cg.simple || data;
  if (simple && typeof simple === "object" && simple.worldcoin && typeof simple.worldcoin === "object") {
    const s = simple.worldcoin;
    return {
      ok: true,
      source: "simple",
      mode: cg.mode || null,
      coin_id: "worldcoin",
      usd: s.usd ?? null,
      jpy: s.jpy ?? null,
      usd_24h_change: s.usd_24h_change ?? null,
      usd_market_cap: s.usd_market_cap ?? null,
      usd_24h_vol: s.usd_24h_vol ?? null,
      chart7d_prices: null,
    };
  }

  return { ok: false, reason: "unrecognized shape", mode: cg.mode || null };
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

    // 2) WLD Market (fix: match current API shape)
    const cgInfo = extractCoinGecko(j.coingecko);
    if (cgInfo.ok) {
      setText("#wldUsd", cgInfo.usd != null ? `$${fmtNum(cgInfo.usd)}` : "—");

      if (cgInfo.jpy != null) {
        setText("#wldJpy", `¥${fmtNum(cgInfo.jpy)}`);
      } else {
        setText("#wldJpy", "N/A");
      }

      setText("#wldChg24h", cgInfo.usd_24h_change != null ? `${fmtNum(cgInfo.usd_24h_change)}%` : "—");
      setText("#wldMc", cgInfo.usd_market_cap != null ? `$${fmtNum(cgInfo.usd_market_cap)}` : "—");
      setText("#wldVol", cgInfo.usd_24h_vol != null ? `$${fmtNum(cgInfo.usd_24h_vol)}` : "—");

      if (cgInfo.chart7d_prices) {
        setText("#wldSpark7d", sparkline(cgInfo.chart7d_prices));
        setText("#chartWld7d", sparkline(cgInfo.chart7d_prices, 40));
      } else {
        setText("#wldSpark7d", "—");
        setText("#chartWld7d", "—");
      }

      const parts = [
        `CoinGecko source: ${cgInfo.source}`,
        `mode: ${cgInfo.mode || "?"}`,
        `id: ${cgInfo.coin_id || "?"}`,
      ];
      if (cgInfo.source === "markets" && cgInfo.jpy == null) {
        parts.push("JPY: not provided by current endpoint");
      }
      setNote("#cgNote", parts.join(" / "));
    } else {
      const env = j.env_present || {};
      const why = env.CG_KEY ? (cgInfo.reason || "error") : "key missing";
      setNote("#cgNote", `CoinGecko: unavailable (${why})`);
      setText("#wldUsd", "—");
      setText("#wldJpy", "—");
      setText("#wldChg24h", "—");
      setText("#wldMc", "—");
      setText("#wldVol", "—");
      setText("#wldSpark7d", "—");
      setText("#chartWld7d", "—");
    }

    // 3) Activity Breakdown
    // 現行の /api/summary では activity_sample を返していないので明示的に N/A にする
    setText("#pctNative", "N/A");
    setText("#pctToken", "N/A");
    setText("#pctContract", "N/A");
    setText("#pctOther", "N/A");
    setNote("#pctTokenNote", "Token transfers need log/indexer.");
    setNote("#actNote", "Not available in current build (needs tx/log/indexer data).");

    // 4) TX 7d trend は未実装
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
