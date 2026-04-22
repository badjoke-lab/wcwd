const HOME_WATCHLIST_API = (() => {
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "" || location.protocol === "file:";
  if (!isLocal) return "/api/sell-impact/watchlist/latest";
  const meta = document.querySelector('meta[name="wcwd-history-base"]');
  const base = meta?.getAttribute("content")?.trim() || "https://wcwd-history.badjoke-lab.workers.dev";
  return `${base}/api/sell-impact/watchlist/latest`;
})();

function homeFmtNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function renderHomeEmpty(metaEl, listEl, message) {
  metaEl.textContent = message;
  listEl.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "snapshot-empty";
  empty.textContent = "Open Sell Impact for full compare, depth ladder, and watchlist details.";
  listEl.appendChild(empty);
}

function renderHomeWatchlist(payload, errorMessage = "") {
  const metaEl = document.getElementById("homeSellImpactMeta");
  const listEl = document.getElementById("homeSellImpactList");
  if (!metaEl || !listEl) return;

  if (errorMessage) {
    renderHomeEmpty(metaEl, listEl, `Sell Impact snapshot unavailable: ${errorMessage}`);
    return;
  }

  const items = Array.isArray(payload?.items) ? payload.items.filter((item) => item?.ok) : [];
  if (!items.length) {
    renderHomeEmpty(metaEl, listEl, "Sell Impact snapshot not ready yet.");
    return;
  }

  metaEl.textContent = `Latest snapshot: ${payload?.ts || "—"} · tracked hot tokens: ${items.length}`;
  listEl.innerHTML = "";
  listEl.className = "snapshot-grid";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "snapshot-card";

    const top = document.createElement("div");
    top.className = "snapshot-top";

    const symbol = document.createElement("div");
    symbol.className = "snapshot-symbol";
    symbol.textContent = item.symbol || "—";

    const conservative = document.createElement("div");
    conservative.className = "snapshot-value";
    conservative.textContent = homeFmtNumber(item.conservative_5pct_max, 6);

    top.appendChild(symbol);
    top.appendChild(conservative);

    const sub = document.createElement("div");
    sub.className = "snapshot-sub";
    sub.textContent = `Conservative 5% max`;

    const selected = document.createElement("div");
    selected.className = "snapshot-trend";
    selected.textContent = `Selected 5% ${homeFmtNumber(item.selected_5pct_max, 6)}`;

    const pool = document.createElement("div");
    pool.className = "snapshot-pool";
    pool.textContent = item?.selected_pool?.poolLabel || "Pool unknown";

    card.appendChild(top);
    card.appendChild(sub);
    card.appendChild(selected);
    card.appendChild(pool);
    listEl.appendChild(card);
  });
}

async function loadHomeWatchlist() {
  try {
    const res = await fetch(HOME_WATCHLIST_API, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    renderHomeWatchlist(json);
  } catch (error) {
    renderHomeWatchlist(null, error?.message || "watchlist_fetch_failed");
  }
}

document.addEventListener("DOMContentLoaded", loadHomeWatchlist);
