// ====== constants & formatters ======
const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const jpyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const API_BASE = "https://dawn-river-686e.badjoke-lab.workers.dev/api/wcwd";

const state = {
  current: null,
  history: null,
  currentRange: "7d",
  currentFiat: "USD",
  autoRefresh: true,
};

let currentIntervalId = null;
let historyIntervalId = null;

function normalizeTimestamp(ts) {
  if (typeof ts !== "number") return null;
  return ts < 1e12 ? ts * 1000 : ts;
}

function formatTime(ts) {
  const normalized = normalizeTimestamp(ts);
  const value = normalized ?? Date.now();
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function findClosestPoint(points, targetTs, toleranceMs = 2 * 60 * 60 * 1000) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const [ts, value] of points) {
    const normalizedTs = normalizeTimestamp(ts);
    if (normalizedTs == null) continue;
    const diff = Math.abs(normalizedTs - targetTs);
    if (diff <= toleranceMs && diff < bestDiff) {
      bestDiff = diff;
      best = [normalizedTs, value];
    }
  }
  return best;
}

function compute24hDelta(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const latestPoint = points[points.length - 1];
  const latestTs = normalizeTimestamp(latestPoint?.[0]);
  const latestValue = latestPoint?.[1];
  if (latestTs == null || latestValue == null) return null;

  const targetTs = latestTs - 24 * 60 * 60 * 1000;
  const anchor = findClosestPoint(points, targetTs);
  if (!anchor || anchor[1] == null) return null;

  const delta = latestValue - anchor[1];
  const percent = anchor[1] !== 0 ? (delta / anchor[1]) * 100 : null;
  return { delta, percent };
}

// ---- fetch helpers ----
async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

async function fetchCurrent() {
  return fetchJSON("/current");
}

async function fetchHistory(range = "7d") {
  return fetchJSON(`/history?range=${encodeURIComponent(range)}&interval=15m`);
}

// ====== renderers ======
function renderNetworkStats(snapshot) {
  const container = document.getElementById("network-stats");
  container.innerHTML = "";
  const network = snapshot?.network || {};

  const formatCardValue = (value, formatter) => {
    if (value == null) {
      return { display: "--", unavailable: true };
    }
    const formatted = formatter ? formatter(value) : value;
    return { display: formatted, unavailable: false };
  };

  const cards = [
    {
      title: "TPS",
      value: network.tps,
      formatter: (v) => v.toFixed(2),
    },
    {
      title: "24h TX Count (est)",
      value: network.txCount24hEst ?? network.txCount24h,
      formatter: (v) => numberFormatter.format(v),
    },
    {
      title: "New Addresses (est)",
      value: network.newAddressesEst ?? network.newAddresses24hEst,
      formatter: (v) => numberFormatter.format(v),
    },
    {
      title: "Total Addresses (est)",
      value: network.totalAddressesEst,
      formatter: (v) => numberFormatter.format(v),
    },
    {
      title: "Gas Price (Gwei)",
      value: network.gasPriceGwei,
      formatter: (v) => v.toFixed(2),
    },
  ];

  cards.forEach((card) => {
    const { display, unavailable } = formatCardValue(card.value, card.formatter);
    const article = document.createElement("article");
    article.className = "card";
    article.innerHTML = `
      <div class="card-title">${card.title}</div>
      <div class="card-value">${display}</div>
      ${unavailable ? '<div class="muted unavailable-note">Unavailable (source TBD)</div>' : ""}
    `;
    container.appendChild(article);
  });
}

function renderMarketStats(snapshot) {
  const container = document.getElementById("market-stats");
  container.innerHTML = "";
  const market = snapshot?.market || {};
  const isJPY = state.currentFiat === "JPY";
  const formatCardValue = (value, formatter) => {
    if (value == null) return { display: "--", unavailable: true };
    const formatted = formatter ? formatter(value) : value;
    return { display: formatted, unavailable: false };
  };

  const priceValue = isJPY
    ? market.priceJPY ?? market.priceJpy ?? market.wldJpy
    : market.priceUSD ?? market.priceUsd ?? market.wldUsd;
  const marketCapValue = isJPY
    ? market.marketCapJPY ?? market.marketCapJpy
    : market.marketCapUSD ?? market.marketCapUsd;
  const volumeValue = isJPY
    ? market.volume24hJPY ?? market.volume24hJpy
    : market.volume24hUSD ?? market.volume24hUsd;
  const currencyFormatterFn = isJPY
    ? (v) => jpyFormatter.format(v)
    : (v) => currencyFormatter.format(v);

  const cards = [
    {
      title: `Price (${state.currentFiat})`,
      value: priceValue,
      formatter: currencyFormatterFn,
    },
    {
      title: "24h Change",
      value: market.change24hPct,
      formatter: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
    },
    {
      title: `Market Cap (${state.currentFiat})`,
      value: marketCapValue,
      formatter: currencyFormatterFn,
    },
    {
      title: `Volume (24h) (${state.currentFiat})`,
      value: volumeValue,
      formatter: currencyFormatterFn,
    },
  ];

  cards.forEach((card) => {
    const { display, unavailable } = formatCardValue(card.value, card.formatter);
    const article = document.createElement("article");
    article.className = "card";
    article.innerHTML = `
      <div class="card-title">${card.title}</div>
      <div class="card-value">${display}</div>
      ${unavailable ? '<div class="muted unavailable-note">Unavailable (source TBD)</div>' : ""}
    `;
    container.appendChild(article);
  });
}

function renderActivityBreakdown() {
  const container = document.getElementById("activity-breakdown");
  container.innerHTML = "";
  const article = document.createElement("article");
  article.className = "card";
  article.innerHTML = `
    <div class="card-title">Recent Activity</div>
    <div class="card-value">--</div>
    <div class="muted">Activity details unavailable in snapshot.</div>
  `;
  container.appendChild(article);
}

function drawLineChart(canvas, points, options = {}) {
  const { color = "#0057ff", lineWidth = 2, gridColor = "rgba(0,0,0,0.05)" } = options;
  const emptyOverlay = canvas.parentElement?.querySelector(".chart-empty");
  if (!canvas || !canvas.getContext) return;

  const hasData = Array.isArray(points) && points.length > 0;
  if (emptyOverlay) {
    emptyOverlay.style.display = hasData ? "none" : "grid";
  }
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!hasData) return;

  const values = points.map(([, v]) => v);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const padding = (maxY - minY) * 0.1 || 1;
  const yMin = minY - padding;
  const yMax = maxY + padding;
  const yRange = yMax - yMin || 1;

  const minX = points[0][0];
  const maxX = points[points.length - 1][0];
  const xRange = maxX - minX || 1;

  // grid (horizontal lines)
  const gridLines = 4;
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridLines; i++) {
    const y = (rect.height / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  points.forEach(([x, y], idx) => {
    const px = ((x - minX) / xRange) * rect.width;
    const py = rect.height - ((y - yMin) / yRange) * rect.height;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function renderChartPanel(seriesKey, ids, options = {}) {
  const { latestId, canvasId, deltaId, deltaPercentId } = ids;
  const canvas = document.getElementById(canvasId);
  const latestEl = document.getElementById(latestId);
  const deltaEl = deltaId ? document.getElementById(deltaId) : null;
  const deltaPercentEl = deltaPercentId
    ? document.getElementById(deltaPercentId)
    : null;
  const historySeries = state.history?.series || {};
  const data = historySeries[seriesKey] || [];

  if (latestEl) {
    const last = data[data.length - 1];
    latestEl.textContent = last?.[1] != null ? last[1].toFixed(2) : "--";
  }

  const delta = compute24hDelta(data);
  if (deltaEl) {
    if (delta) {
      const sign = delta.delta > 0 ? "+" : "";
      deltaEl.textContent = `${sign}${delta.delta.toFixed(2)}`;
    } else {
      deltaEl.textContent = "—";
    }
  }

  if (deltaPercentEl) {
    if (delta && delta.percent != null) {
      const sign = delta.percent > 0 ? "+" : "";
      deltaPercentEl.textContent = `${sign}${delta.percent.toFixed(2)}%`;
    } else {
      deltaPercentEl.textContent = "—";
    }
  }

  drawLineChart(canvas, data, options);
}

function renderPriceChart() {
  const series = state.history?.series || {};
  const key = (() => {
    if (state.currentFiat === "JPY") {
      if (series.priceJPY) return "priceJPY";
      if (series.wldJpy) return "wldJpy";
      return "priceJPY";
    }
    if (series.priceUSD) return "priceUSD";
    if (series.wldUsd) return "wldUsd";
    return "priceUSD";
  })();
  renderChartPanel(
    key,
    {
      latestId: "price-latest",
      deltaId: "price-delta",
      deltaPercentId: "price-delta-percent",
      canvasId: "priceChart",
    },
    {
      color: "#0057ff",
    }
  );
}

function renderAllCharts() {
  renderPriceChart();
  renderChartPanel(
    "tps",
    {
      latestId: "tps-latest",
      deltaId: "tps-delta",
      deltaPercentId: "tps-delta-percent",
      canvasId: "tpsChart",
    },
    { color: "#00aa6c" }
  );
  const gasKey =
    (state.history?.series?.gasPriceGwei && "gasPriceGwei") ||
    (state.history?.series?.gasGwei && "gasGwei") ||
    "gasPriceGwei";
  renderChartPanel(
    gasKey,
    {
      latestId: "gas-latest",
      deltaId: "gas-delta",
      deltaPercentId: "gas-delta-percent",
      canvasId: "gasChart",
    },
    {
      color: "#f59e0b",
    }
  );
}

function setHistoryStatus(message = "") {
  const el = document.getElementById("history-status");
  if (!el) return;
  el.textContent = message;
}

function setCurrentStatus(message = "") {
  const el = document.getElementById("current-status");
  if (!el) return;
  el.textContent = message;
}

function updateTrendTimestamps() {
  const currentEl = document.getElementById("updated-current");
  const historyEl = document.getElementById("updated-history");
  if (currentEl) {
    const ts = state.current?.ts;
    currentEl.textContent = `Current: ${ts ? formatTime(ts * 1000) : formatTime(Date.now())}`;
  }

  if (historyEl) {
    const series = state.history?.series || {};
    let latestTs = null;
    Object.values(series).forEach((points) => {
      if (!Array.isArray(points) || points.length === 0) return;
      const ts = normalizeTimestamp(points[points.length - 1][0]);
      if (ts != null && (latestTs == null || ts > latestTs)) latestTs = ts;
    });
    historyEl.textContent = `History latest: ${latestTs ? formatTime(latestTs) : "--"}`;
  }
}

// ====== event handlers ======
async function loadHistory(range, { showLoading = false } = {}) {
  if (showLoading) {
    setHistoryStatus("Loading history…");
  }
  try {
    const data = await fetchHistory(range);
    state.history = data;
    setHistoryStatus("");
    renderAllCharts();
  } catch (err) {
    console.error("History fetch failed", err);
    setHistoryStatus("History refresh failed; showing previous data.");
  } finally {
    updateTrendTimestamps();
  }
}

async function refreshCurrentSnapshot() {
  try {
    const data = await fetchCurrent();
    state.current = data;
    renderNetworkStats(state.current);
    renderMarketStats(state.current);
    setCurrentStatus("");
  } catch (err) {
    console.error("Current snapshot error", err);
    setCurrentStatus("Current data refresh failed; showing previous snapshot.");
    if (state.current) {
      renderNetworkStats(state.current);
      renderMarketStats(state.current);
    } else {
      renderNetworkStats(null);
      renderMarketStats(null);
    }
  } finally {
    updateTrendTimestamps();
  }
}

async function loadDashboard() {
  const refreshBtn = document.getElementById("refresh-btn");
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading...";
  try {
    await Promise.all([
      refreshCurrentSnapshot(),
      loadHistory(state.currentRange, { showLoading: true }),
    ]);
    renderActivityBreakdown();
    renderAllCharts();
  } catch (err) {
    console.error("loadDashboard fatal", err);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }
}

function clearAutoTimers() {
  if (currentIntervalId) {
    clearInterval(currentIntervalId);
    currentIntervalId = null;
  }
  if (historyIntervalId) {
    clearInterval(historyIntervalId);
    historyIntervalId = null;
  }
}

function applyAutoRefresh() {
  clearAutoTimers();
  const autoToggle = document.getElementById("auto-toggle");
  if (autoToggle) autoToggle.checked = state.autoRefresh;
  if (!state.autoRefresh) return;

  currentIntervalId = setInterval(() => {
    refreshCurrentSnapshot();
  }, 60 * 1000);

  historyIntervalId = setInterval(() => {
    loadHistory(state.currentRange);
  }, 5 * 60 * 1000);
}

function handleFiatToggle(event) {
  const btn = event.target.closest("button[data-fiat]");
  if (!btn) return;
  const fiat = btn.dataset.fiat;
  state.currentFiat = fiat;
  document
    .querySelectorAll("#fiat-toggle button")
    .forEach((b) => b.classList.toggle("active", b === btn));
  renderMarketStats(state.current);
  renderPriceChart();
}

function handleRangeToggle(event) {
  const btn = event.target.closest("button[data-range]");
  if (!btn) return;
  const range = btn.dataset.range;
  if (range === state.currentRange) return;
  state.currentRange = range;
  document
    .querySelectorAll("#range-toggle button")
    .forEach((b) => b.classList.toggle("active", b === btn));
  loadHistory(range, { showLoading: true });
}

function handleAutoToggle(event) {
  state.autoRefresh = event.target.checked;
  applyAutoRefresh();
}

// ====== bootstrap ======
window.addEventListener("load", () => {
  renderNetworkStats(null);
  renderMarketStats(null);
  renderActivityBreakdown();
  renderAllCharts();

  const refreshBtn = document.getElementById("refresh-btn");
  refreshBtn.addEventListener("click", loadDashboard);

  document
    .getElementById("fiat-toggle")
    .addEventListener("click", handleFiatToggle);
  document
    .getElementById("range-toggle")
    .addEventListener("click", handleRangeToggle);
  document
    .getElementById("auto-toggle")
    .addEventListener("change", handleAutoToggle);

  loadDashboard();
  applyAutoRefresh();
});
