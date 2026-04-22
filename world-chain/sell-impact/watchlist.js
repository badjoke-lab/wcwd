const WATCHLIST_LATEST_API = "/api/sell-impact/watchlist/latest";
const WATCHLIST_HISTORY_LIMIT = 12;
const WATCHLIST_LIST_API = `/api/sell-impact/watchlist/list?limit=${WATCHLIST_HISTORY_LIMIT}`;
const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function siFmtNumber(n, d = 2) {
  if (!Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildSparkline(values) {
  const points = values.filter((v) => Number.isFinite(v));
  if (!points.length) return "—";
  if (points.length === 1) return SPARK_CHARS[4];
  const min = Math.min(...points);
  const max = Math.max(...points);
  if (max === min) return SPARK_CHARS[4].repeat(points.length);
  return points.map((value) => {
    const idx = Math.max(0, Math.min(SPARK_CHARS.length - 1, Math.round(((value - min) / (max - min)) * (SPARK_CHARS.length - 1))));
    return SPARK_CHARS[idx];
  }).join("");
}

function buildHistoryMap(historyPayload) {
  const snapshots = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
  const map = new Map();
  snapshots.forEach((snapshot) => {
    const ts = snapshot?.ts || "";
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
    items.forEach((item) => {
      const symbol = String(item?.symbol || "").trim();
      if (!symbol) return;
      if (!map.has(symbol)) map.set(symbol, []);
      map.get(symbol).push({
        ts,
        selected: finiteNumber(item?.selected_5pct_max),
        conservative: finiteNumber(item?.conservative_5pct_max),
      });
    });
  });
  return { map, snapshotCount: snapshots.length };
}

function summarizeTrend(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return { spark: "—", text: "history unavailable" };
  }
  const values = entries.map((entry) => entry.conservative).filter((value) => Number.isFinite(value));
  if (!values.length) {
    return { spark: "—", text: "history unavailable" };
  }
  const first = values[0];
  const last = values[values.length - 1];
  const spark = buildSparkline(values);
  if (values.length < 2 || !Number.isFinite(first) || !Number.isFinite(last) || first === 0) {
    return { spark, text: `latest ${siFmtNumber(last, 6)}` };
  }
  const deltaPct = ((last - first) / first) * 100;
  const arrow = deltaPct > 2 ? "↑" : deltaPct < -2 ? "↓" : "→";
  return {
    spark,
    text: `${arrow} ${siFmtNumber(first, 6)} → ${siFmtNumber(last, 6)} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`,
  };
}

function renderWatchlistEmpty(metaEl, listEl, message) {
  metaEl.textContent = message;
  listEl.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "snapshot-empty";
  empty.textContent = "Enter a token above for a manual estimate, or wait for the next scheduled watchlist snapshot.";
  listEl.appendChild(empty);
}

function renderSellImpactWatchlist(latestPayload, historyPayload, errorMessage = "") {
  const metaEl = document.getElementById("watchlistMeta");
  const listEl = document.getElementById("watchlistList");
  if (!metaEl || !listEl) return;

  if (errorMessage) {
    renderWatchlistEmpty(metaEl, listEl, `Watchlist snapshot unavailable: ${errorMessage}`);
    return;
  }

  const items = Array.isArray(latestPayload?.items) ? latestPayload.items : [];
  if (!items.length) {
    renderWatchlistEmpty(metaEl, listEl, "Watchlist snapshot not ready yet.");
    return;
  }

  const history = buildHistoryMap(historyPayload);
  const approxMinutes = history.snapshotCount * 15;
  metaEl.textContent = `Latest watchlist snapshot: ${latestPayload?.ts || "—"} · tracked tokens: ${items.length} · history window: ${history.snapshotCount} snapshots (~${approxMinutes} min)`;
  listEl.innerHTML = "";
  listEl.className = "snapshot-grid";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "snapshot-card";
    if (!item?.ok) {
      const top = document.createElement("div");
      top.className = "snapshot-top";
      const symbol = document.createElement("div");
      symbol.className = "snapshot-symbol";
      symbol.textContent = item?.symbol || "—";
      const status = document.createElement("div");
      status.className = "snapshot-value";
      status.textContent = "—";
      top.appendChild(symbol);
      top.appendChild(status);
      const note = document.createElement("div");
      note.className = "snapshot-sub";
      note.textContent = `Unavailable (${item?.error || "unknown_error"})`;
      card.appendChild(top);
      card.appendChild(note);
      listEl.appendChild(card);
      return;
    }

    const entries = history.map.get(item.symbol) || [];
    const trend = summarizeTrend(entries);

    const top = document.createElement("div");
    top.className = "snapshot-top";

    const symbol = document.createElement("div");
    symbol.className = "snapshot-symbol";
    symbol.textContent = item.symbol;

    const conservative = document.createElement("div");
    conservative.className = "snapshot-value";
    conservative.textContent = siFmtNumber(item.conservative_5pct_max, 6);

    top.appendChild(symbol);
    top.appendChild(conservative);

    const sub = document.createElement("div");
    sub.className = "snapshot-sub";
    sub.textContent = `Conservative 5% max · selected ${siFmtNumber(item.selected_5pct_max, 6)}`;

    const trendEl = document.createElement("div");
    trendEl.className = "snapshot-trend";
    trendEl.textContent = `3h trend ${trend.spark} ${trend.text}`;

    const pool = document.createElement("div");
    pool.className = "snapshot-pool";
    pool.textContent = item?.selected_pool?.poolLabel || "Pool unknown";

    card.appendChild(top);
    card.appendChild(sub);
    card.appendChild(trendEl);
    card.appendChild(pool);
    listEl.appendChild(card);
  });
}

async function loadSellImpactWatchlist() {
  try {
    const [latestRes, historyRes] = await Promise.all([
      fetch(WATCHLIST_LATEST_API, { headers: { accept: "application/json" } }),
      fetch(WATCHLIST_LIST_API, { headers: { accept: "application/json" } }),
    ]);
    if (!latestRes.ok) throw new Error(`latest HTTP ${latestRes.status}`);
    const latestJson = await latestRes.json();
    const historyJson = historyRes.ok ? await historyRes.json() : { ok: false, items: [] };
    renderSellImpactWatchlist(latestJson, historyJson);
  } catch (error) {
    renderSellImpactWatchlist(null, null, error?.message || "watchlist_fetch_failed");
  }
}

document.addEventListener("DOMContentLoaded", loadSellImpactWatchlist);
