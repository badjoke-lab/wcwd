/* WCWD frontend (static) — uses History Worker /api/list */

const HISTORY_BASE = (() => {
  const meta = document.querySelector('meta[name="wcwd-history-base"]');
  const v = meta?.getAttribute("content")?.trim();
  return v || "https://wcwd-history.badjoke-lab.workers.dev";
})();

const DEFAULT_INTERVAL_MIN = 15;
const INTERVAL_STORAGE_KEY = "wcwd-interval-min";
const HISTORY_CACHE_KEY = "wcwd-history-cache-v1";
const SAFE_REQUEST_LIMIT = 288;

const UI = {
  status: document.getElementById("status"),
  reload: document.getElementById("reload"),

  tps: document.getElementById("tps"),
  tx24h: document.getElementById("tx24h"),
  gasPrice: document.getElementById("gasPrice"),

  wldUsd: document.getElementById("wldUsd"),
  wldJpy: document.getElementById("wldJpy"),
  wldChg24h: document.getElementById("wldChg24h"),
  wldMc: document.getElementById("wldMc"),
  wldVol: document.getElementById("wldVol"),
  wldSpark7d: document.getElementById("wldSpark7d"),
  chartWld7d: document.getElementById("chartWld7d"),

  pctToken: document.getElementById("pctToken"),
  pctNative: document.getElementById("pctNative"),
  pctContract: document.getElementById("pctContract"),
  pctOther: document.getElementById("pctOther"),
  actNote: document.getElementById("actNote"),

  sparkTps: document.getElementById("sparkTps"),
  sparkGas: document.getElementById("sparkGas"),
  sparkWld: document.getElementById("sparkWld"),
  sparkToken: document.getElementById("sparkToken"),
  noteHistory: document.getElementById("noteHistory"),

  seriesTps7d: document.getElementById("seriesTps7d"),
  seriesWld7d: document.getElementById("seriesWld7d"),
  noteSeriesTps7d: document.getElementById("noteSeriesTps7d"),
  noteSeriesWld7d: document.getElementById("noteSeriesWld7d"),

  alertSpike: document.getElementById("alertSpike"),
  alertDrop: document.getElementById("alertDrop"),
  alertHighGas: document.getElementById("alertHighGas"),

  raw: document.getElementById("raw"),
  errors: document.getElementById("errors"),
};

function isLocalMode() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "" || location.protocol === "file:";
}

function fmtNum(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n);
}

function fmtUsd(n, digits = 6) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${Number(n).toFixed(digits)}`;
}

function fmtJpy(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `¥${Number(n).toFixed(digits)}`;
}

function pct(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(digits)}%`;
}

function loadStoredInterval() {
  const stored = Number(localStorage.getItem(INTERVAL_STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_INTERVAL_MIN;
}

function storeInterval(intervalMin) {
  localStorage.setItem(INTERVAL_STORAGE_KEY, String(intervalMin));
}

function computePointsPerDay(intervalMin) {
  return Math.round((24 * 60) / intervalMin);
}

function loadHistoryCache() {
  const raw = localStorage.getItem(HISTORY_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const hist = Array.isArray(parsed?.hist) ? parsed.hist : [];
    const intervalMin = Number(parsed?.intervalMin);
    return {
      hist,
      intervalMin: Number.isFinite(intervalMin) && intervalMin > 0 ? intervalMin : DEFAULT_INTERVAL_MIN,
      savedAt: parsed?.savedAt || null,
    };
  } catch (e) {
    return null;
  }
}

function storeHistoryCache(hist, intervalMin) {
  const payload = {
    hist,
    intervalMin,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(payload));
}

async function fetchJsonWithMeta(url, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const json = await res.json();
    return { json, headers: res.headers, status: res.status };
  } finally {
    clearTimeout(t);
  }
}

function setError(err) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  UI.errors.textContent = msg;
}

function clearError() {
  UI.errors.textContent = "—";
}

function drawSparkline(canvas, series) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const arr = (series || []).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (arr.length < 2) {
    ctx.globalAlpha = 0.35;
    ctx.fillText("—", 8, Math.floor(h / 2));
    ctx.globalAlpha = 1.0;
    return;
  }

  let min = Math.min(...arr);
  let max = Math.max(...arr);
  if (min === max) {
    min = min - 1;
    max = max + 1;
  }

  const padX = 2;
  const padY = 6;
  const xStep = (w - padX * 2) / (arr.length - 1);

  const yOf = (v) => {
    const t = (v - min) / (max - min);
    return h - padY - t * (h - padY * 2);
  };

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111";
  ctx.beginPath();
  for (let i = 0; i < arr.length; i++) {
    const x = padX + i * xStep;
    const y = yOf(arr[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

async function loadSeries(metric, canvas, noteEl, errors, intervalMin) {
  const url = `${HISTORY_BASE}/api/series?metric=${metric}&period=7d&step=1h`;
  try {
    const { json, headers } = await fetchJsonWithMeta(url, { timeoutMs: 8000 });
    const points = Array.isArray(json?.points) ? json.points : [];
    const agg = json?.agg || headers.get("x-wcwd-series-agg") || "avg";
    const step = json?.step || "1h";
    const intervalHeader = Number(headers.get("x-wcwd-interval-min"));
    const intervalJson = Number(json?.interval_min);
    const intervalValue = Number.isFinite(intervalJson)
      ? intervalJson
      : (Number.isFinite(intervalHeader) ? intervalHeader : intervalMin);
    if (noteEl) {
      noteEl.textContent = `7d series OK. metric=${metric} step=${step} agg=${agg} interval=${fmtNum(intervalValue, 0)}m points=${points.length} source=wcwd-history`;
    }
    drawSparkline(canvas, points.map((p) => p?.v));
    return { metric, agg, step, interval_min: intervalValue, points };
  } catch (e) {
    errors.push(`7d series fetch failed (${metric}): ${(e && e.message) ? e.message : String(e)}`);
    if (noteEl) {
      noteEl.textContent = `7d series unavailable. metric=${metric} step=1h agg=avg interval=${fmtNum(intervalMin, 0)}m source=wcwd-history`;
    }
    drawSparkline(canvas, []);
    return null;
  }
}

function avg(nums) {
  const a = (nums || []).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!a.length) return null;
  return a.reduce((s, v) => s + v, 0) / a.length;
}

function renderAlerts(latest, hist, intervalMin) {
  // Compare latest vs avg of recent history (excluding latest)
  const pointsFor3h = Math.max(6, Math.round((3 * 60) / intervalMin));

  const seriesTps = hist.map((x) => x.tps).filter(Number.isFinite);
  const seriesGas = hist.map((x) => x.gas_gwei).filter(Number.isFinite);

  const baseTps = avg(seriesTps.slice(Math.max(0, seriesTps.length - pointsFor3h - 1), Math.max(0, seriesTps.length - 1)));
  const baseGas = avg(seriesGas.slice(Math.max(0, seriesGas.length - pointsFor3h - 1), Math.max(0, seriesGas.length - 1)));

  const curTps = latest?.tps;
  const curGas = latest?.gas_gwei;

  if (baseTps && Number.isFinite(curTps)) {
    const ratio = curTps / baseTps;
    UI.alertSpike.textContent = ratio >= 1.25 ? `⚠︎ ${fmtNum(curTps, 0)} (avg ${fmtNum(baseTps, 0)})` : "—";
    UI.alertDrop.textContent = ratio <= 0.75 ? `⚠︎ ${fmtNum(curTps, 0)} (avg ${fmtNum(baseTps, 0)})` : "—";
  } else {
    UI.alertSpike.textContent = "—";
    UI.alertDrop.textContent = "—";
  }

  if (baseGas && Number.isFinite(curGas)) {
    UI.alertHighGas.textContent = curGas >= baseGas * 1.5 ? `⚠︎ ${fmtNum(curGas, 6)} (avg ${fmtNum(baseGas, 6)})` : "—";
  } else {
    UI.alertHighGas.textContent = "—";
  }
}

function setStatusText(histOk) {
  if (isLocalMode()) UI.status.textContent = histOk ? "LOCAL (history-only)" : "LOCAL (no history)";
  else UI.status.textContent = histOk ? "OK" : "DEGRADED";
}

async function loadAll() {
  clearError();
  UI.raw.textContent = "—";
  setStatusText(false);

  const errors = [];
  const isLite = new URLSearchParams(location.search).get("lite") === "1";
  const seriesMeta = {};

  // History (server observed)
  let hist = [];
  let latest = null;
  let meta = null;
  let intervalMin = loadStoredInterval();
  let source = HISTORY_BASE;
  let historyOk = false;

  try {
    const { json, headers } = await fetchJsonWithMeta(`${HISTORY_BASE}/api/list?limit=${SAFE_REQUEST_LIMIT}`, { timeoutMs: 8000 });
    const headerInterval = Number(headers.get("x-wcwd-interval-min"));
    intervalMin = Number.isFinite(headerInterval) && headerInterval > 0 ? headerInterval : DEFAULT_INTERVAL_MIN;
    storeInterval(intervalMin);

    if (Array.isArray(json)) {
      hist = json;
    } else {
      hist = json?.items || json?.data || [];
      meta = json?.meta ?? null;
    }
    historyOk = true;
    storeHistoryCache(hist, intervalMin);
  } catch (e) {
    errors.push(`History fetch failed: ${(e && e.message) ? e.message : String(e)}`);
    const cached = loadHistoryCache();
    if (cached?.hist?.length) {
      hist = cached.hist;
      intervalMin = cached.intervalMin;
      source = "cache";
    }
  }

  const maxPoints24h = computePointsPerDay(intervalMin);
  const usePoints = isLite ? Math.max(12, Math.floor(maxPoints24h / 2)) : maxPoints24h;
  if (hist.length > usePoints) {
    hist = hist.slice(-usePoints);
  }
  latest = hist[hist.length - 1] || null;
  setStatusText(historyOk);

  if (latest) {
    const okLabel = source === "cache" ? "History OK (cache)." : "History OK.";
    UI.noteHistory.textContent = `${okLabel} points=${hist.length} interval=${fmtNum(intervalMin, 0)}min mode=${isLite ? "lite" : "full"} source=${source}`;
  } else {
    UI.noteHistory.textContent = `History unavailable. points=${hist.length} interval=${fmtNum(intervalMin, 0)}min mode=${isLite ? "lite" : "full"} source=${source} — Try again later / enable ?lite=1 / reduce points`;
  }

  // Render from history latest
  try {
    if (latest) {
      UI.tps.textContent = fmtNum(latest.tps, 0);
      UI.tx24h.textContent = latest.tps ? fmtNum(latest.tps * 86400, 0) : "—";

      // gas_gwei is usually tiny (0.00x). Keep high precision.
      UI.gasPrice.textContent = fmtNum(latest.gas_gwei, 9);

      UI.wldUsd.textContent = latest.wld_usd != null ? fmtUsd(latest.wld_usd, 6) : "—";
      UI.wldJpy.textContent = latest.wld_jpy != null ? fmtJpy(latest.wld_jpy, 2) : "—";

      // change/mcap/vol/sparkline are not in history snapshot -> leave as "—"
      UI.wldChg24h.textContent = "—";
      UI.wldMc.textContent = "—";
      UI.wldVol.textContent = "—";
      UI.wldSpark7d.textContent = "—";
      UI.chartWld7d.textContent = "—";

      // Activity (approx from snapshot)
      const tokenPct = latest.token_pct;
      const nativePct = latest.native_pct;
      UI.pctToken.textContent = tokenPct != null ? pct(tokenPct, 3) : "—";
      UI.pctNative.textContent = nativePct != null ? pct(nativePct, 3) : "—";

      // contract/other not available in history snapshots
      UI.pctContract.textContent = "—";
      UI.pctOther.textContent = "—";

    }
  } catch (e) {
    errors.push(`Render failed: ${(e && e.message) ? e.message : String(e)}`);
  }

  // Trends charts + alerts
  try {
    if (hist && hist.length) {
      drawSparkline(UI.sparkTps, hist.map((x) => x.tps));
      drawSparkline(UI.sparkGas, hist.map((x) => x.gas_gwei));
      drawSparkline(UI.sparkWld, hist.map((x) => x.wld_usd));
      drawSparkline(UI.sparkToken, hist.map((x) => x.token_pct));
      renderAlerts(latest, hist, intervalMin);
    }
  } catch (e) {
    errors.push(`Sparkline failed: ${(e && e.message) ? e.message : String(e)}`);
  }

  try {
    const tpsSeries = await loadSeries("tps", UI.seriesTps7d, UI.noteSeriesTps7d, errors, intervalMin);
    if (tpsSeries) seriesMeta.tps = { points: tpsSeries.points.length, agg: tpsSeries.agg, step: tpsSeries.step };
    const wldSeries = await loadSeries("wld_usd", UI.seriesWld7d, UI.noteSeriesWld7d, errors, intervalMin);
    if (wldSeries) seriesMeta.wld_usd = { points: wldSeries.points.length, agg: wldSeries.agg, step: wldSeries.step };
  } catch (e) {
    errors.push(`7d series render failed: ${(e && e.message) ? e.message : String(e)}`);
  }

  try {
    UI.raw.textContent = JSON.stringify(
      {
        latest,
        hist_head: hist.slice(0, 3),
        intervalMin,
        maxPoints24h,
        usePoints,
        mode: isLite ? "lite" : "full",
        source,
        meta,
        series: seriesMeta,
      },
      null,
      2,
    );
  } catch (e) {
    errors.push(`Debug render failed: ${(e && e.message) ? e.message : String(e)}`);
  }

  if (errors.length) setError(new Error(errors.join("\n")));
}

UI.reload?.addEventListener("click", () => loadAll());

loadAll();
