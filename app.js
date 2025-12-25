/* WCWD frontend (static) — uses History Worker /api/latest and /api/list */

const HISTORY_BASE = (() => {
  const meta = document.querySelector('meta[name="wcwd-history-base"]');
  const v = meta?.getAttribute("content")?.trim();
  return v || "https://wcwd-history.badjoke-lab.workers.dev";
})();

// 15min cron => 24h ~= 96 points
const DAY_POINTS_DEFAULT = 96;
const HISTORY_LIMIT = DAY_POINTS_DEFAULT;

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

async function fetchJson(url, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
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

function avg(nums) {
  const a = (nums || []).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!a.length) return null;
  return a.reduce((s, v) => s + v, 0) / a.length;
}

function median(nums) {
  const a = (nums || []).filter((v) => typeof v === "number" && Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function estimateIntervalMinutes(hist) {
  // Use last up to 20 gaps, median
  if (!Array.isArray(hist) || hist.length < 3) return 15;

  const tail = hist.slice(Math.max(0, hist.length - 25));
  const diffs = [];
  for (let i = 1; i < tail.length; i++) {
    const a = Date.parse(tail[i - 1]?.ts);
    const b = Date.parse(tail[i]?.ts);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      diffs.push((b - a) / 60000);
    }
  }

  const m = median(diffs);
  if (!m) return 15;

  // clamp (just in case)
  return Math.max(1, Math.min(120, m));
}

function renderAlerts(latest, hist) {
  // Compare latest vs avg of recent history (excluding latest)
  const intervalMin = estimateIntervalMinutes(hist);
  const pointsFor3h = Math.max(4, Math.round((3 * 60) / intervalMin)); // keep some minimum

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

  // History (server observed)
  let hist = [];
  let latest = null;

  try {
    hist = await fetchJson(`${HISTORY_BASE}/api/list?limit=${encodeURIComponent(String(HISTORY_LIMIT))}`, { timeoutMs: 8000 });
    latest = await fetchJson(`${HISTORY_BASE}/api/latest`, { timeoutMs: 8000 });
    setStatusText(true);

    const intervalMin = estimateIntervalMinutes(hist);
    UI.noteHistory.textContent = `History OK. points=${hist.length} (~${fmtNum(intervalMin, 0)} min interval) source=${HISTORY_BASE}`;
  } catch (e) {
    errors.push(`History fetch failed: ${(e && e.message) ? e.message : String(e)}`);
    UI.noteHistory.textContent = `History fetch failed. source=${HISTORY_BASE}`;
    setStatusText(false);
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

      UI.raw.textContent = JSON.stringify({ latest, hist_head: hist.slice(0, 3) }, null, 2);
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
      renderAlerts(latest, hist);
    }
  } catch (e) {
    errors.push(`Sparkline failed: ${(e && e.message) ? e.message : String(e)}`);
  }

  if (errors.length) setError(new Error(errors.join("\n")));
}

UI.reload?.addEventListener("click", () => loadAll());

loadAll();
