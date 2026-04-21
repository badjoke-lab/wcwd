const WATCHLIST_LATEST_API = "/api/sell-impact/watchlist/latest";

function siFmtNumber(n, d = 2) {
  if (!Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
}

function renderSellImpactWatchlist(payload, errorMessage = "") {
  const metaEl = document.getElementById("watchlistMeta");
  const listEl = document.getElementById("watchlistList");
  if (!metaEl || !listEl) return;

  if (errorMessage) {
    metaEl.textContent = `Watchlist snapshot unavailable: ${errorMessage}`;
    listEl.textContent = "—";
    return;
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) {
    metaEl.textContent = "Watchlist snapshot not ready yet.";
    listEl.textContent = "—";
    return;
  }

  metaEl.textContent = `Latest watchlist snapshot: ${payload?.ts || "—"} · tracked tokens: ${items.length}`;
  listEl.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "8px";

  items.forEach((item) => {
    const row = document.createElement("div");
    if (!item?.ok) {
      row.textContent = `${item?.symbol || "—"} · unavailable (${item?.error || "unknown_error"})`;
      wrap.appendChild(row);
      return;
    }
    row.textContent = `${item.symbol} · selected 5% ${siFmtNumber(item.selected_5pct_max, 6)} · conservative 5% ${siFmtNumber(item.conservative_5pct_max, 6)} · pool ${item?.selected_pool?.poolLabel || "—"}`;
    wrap.appendChild(row);
  });

  listEl.appendChild(wrap);
}

async function loadSellImpactWatchlist() {
  try {
    const res = await fetch(WATCHLIST_LATEST_API, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    renderSellImpactWatchlist(json);
  } catch (error) {
    renderSellImpactWatchlist(null, error?.message || "watchlist_fetch_failed");
  }
}

document.addEventListener("DOMContentLoaded", loadSellImpactWatchlist);
