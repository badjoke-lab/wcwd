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

function renderHomeWatchlist(payload, errorMessage = "") {
  const metaEl = document.getElementById("homeSellImpactMeta");
  const listEl = document.getElementById("homeSellImpactList");
  if (!metaEl || !listEl) return;

  if (errorMessage) {
    metaEl.textContent = `Sell Impact snapshot unavailable: ${errorMessage}`;
    listEl.textContent = "—";
    return;
  }

  const items = Array.isArray(payload?.items) ? payload.items.filter((item) => item?.ok) : [];
  if (!items.length) {
    metaEl.textContent = "Sell Impact snapshot not ready yet.";
    listEl.textContent = "—";
    return;
  }

  metaEl.textContent = `Latest snapshot: ${payload?.ts || "—"} · tracked hot tokens: ${items.length}`;
  listEl.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "metric";

    const symbol = document.createElement("div");
    symbol.className = "k";
    symbol.textContent = item.symbol || "—";

    const conservative = document.createElement("div");
    conservative.className = "v";
    conservative.textContent = homeFmtNumber(item.conservative_5pct_max, 6);

    const note = document.createElement("div");
    note.className = "n";
    note.textContent = `Conservative 5% max · selected ${homeFmtNumber(item.selected_5pct_max, 6)} · ${item?.selected_pool?.poolLabel || "pool unknown"}`;

    card.appendChild(symbol);
    card.appendChild(conservative);
    card.appendChild(note);
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
