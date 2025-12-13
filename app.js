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
};

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
  const cards = [
    {
      title: "TPS",
      value:
        snapshot?.network?.tps != null
          ? snapshot.network.tps.toFixed(2)
          : "--",
    },
    {
      title: "Gas Price (Gwei)",
      value:
        snapshot?.network?.gasPriceGwei != null
          ? snapshot.network.gasPriceGwei.toFixed(2)
          : "--",
    },
    {
      title: "Snapshot",
      value: snapshot?.ts
        ? new Date(snapshot.ts * 1000).toLocaleTimeString()
        : "--",
    },
  ];

  cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "card";
    article.innerHTML = `
      <div class="card-title">${card.title}</div>
      <div class="card-value">${card.value}</div>
    `;
    container.appendChild(article);
  });
}

function renderMarketStats(snapshot) {
  const container = document.getElementById("market-stats");
  container.innerHTML = "";
  const market = snapshot?.market || {};
  const cards = [
    {
      title: "Price (USD)",
      value:
        typeof market.wldUsd === "number"
          ? currencyFormatter.format(market.wldUsd)
          : "--",
    },
    {
      title: "Price (JPY)",
      value:
        typeof market.wldJpy === "number"
          ? jpyFormatter.format(market.wldJpy)
          : "--",
    },
  ];

  cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "card";
    article.innerHTML = `
      <div class="card-title">${card.title}</div>
      <div class="card-value">${card.value}</div>
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

function renderChartPanel(seriesKey, latestElementId, canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);
  const latestEl = document.getElementById(latestElementId);
  const historySeries = state.history?.series || {};
  const data = historySeries[seriesKey] || [];

  if (latestEl) {
    const last = data[data.length - 1];
    latestEl.textContent = last?.[1] != null ? last[1].toFixed(2) : "--";
  }

  drawLineChart(canvas, data, options);
}

function renderPriceChart() {
  const key = state.currentFiat === "JPY" ? "wldJpy" : "wldUsd";
  renderChartPanel(key, "price-latest", "priceChart", {
    color: "#0057ff",
  });
}

function renderAllCharts() {
  renderPriceChart();
  renderChartPanel("tps", "tps-latest", "tpsChart", { color: "#00aa6c" });
  const gasKey =
    (state.history?.series?.gasPriceGwei && "gasPriceGwei") ||
    (state.history?.series?.gasGwei && "gasGwei") ||
    "gasPriceGwei";
  renderChartPanel(gasKey, "gas-latest", "gasChart", {
    color: "#f59e0b",
  });
}

function setHistoryStatus(message = "") {
  const el = document.getElementById("history-status");
  if (!el) return;
  el.textContent = message;
}

// ====== event handlers ======
async function loadHistory(range) {
  setHistoryStatus("Loading history…");
  try {
    const data = await fetchHistory(range);
    state.history = data;
    setHistoryStatus("");
    renderAllCharts();
  } catch (err) {
    console.error("History fetch failed", err);
    setHistoryStatus("History unavailable");
  }
}

async function loadDashboard() {
  const refreshBtn = document.getElementById("refresh-btn");
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Loading...";
  try {
    const [currentResult] = await Promise.allSettled([
      fetchCurrent(),
      loadHistory(state.currentRange),
    ]);

    if (currentResult.status === "fulfilled") {
      state.current = currentResult.value;
      renderNetworkStats(state.current);
      renderMarketStats(state.current);
    } else {
      console.error("Current snapshot error", currentResult.reason);
      renderNetworkStats(null);
      renderMarketStats(null);
    }

    renderActivityBreakdown();
    renderAllCharts();
  } catch (err) {
    console.error("loadDashboard fatal", err);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }
}

function handleFiatToggle(event) {
  const btn = event.target.closest("button[data-fiat]");
  if (!btn) return;
  const fiat = btn.dataset.fiat;
  state.currentFiat = fiat;
  document
    .querySelectorAll("#fiat-toggle button")
    .forEach((b) => b.classList.toggle("active", b === btn));
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
  loadHistory(range);
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

  loadDashboard();
});
