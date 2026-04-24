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

function buildSellImpactHref(item) {
  const url = new URL("/world-chain/sell-impact/", location.origin);
  if (item?.tokenAddr) url.searchParams.set("token", item.tokenAddr);
  const conservative = Number(item?.conservative_5pct_max);
  if (Number.isFinite(conservative) && conservative > 0) {
    url.searchParams.set("amt", String(conservative));
  }
  return `${url.pathname}${url.search}`;
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

  const allItems = Array.isArray(payload?.items) ? payload.items.filter((item) => item?.ok) : [];
  const items = allItems.slice(0, 3);
  if (!items.length) {
    renderHomeEmpty(metaEl, listEl, "Sell Impact snapshot not ready yet.");
    return;
  }

  metaEl.textContent = `Latest snapshot: ${payload?.ts || "—"} · showing top ${items.length} of ${allItems.length} tracked hot tokens`;
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

    const footer = document.createElement("div");
    footer.className = "snapshot-footer";

    const cta = document.createElement("a");
    cta.className = "snapshot-link";
    cta.href = buildSellImpactHref(item);
    cta.textContent = "Open in Sell Impact";

    footer.appendChild(cta);

    card.appendChild(top);
    card.appendChild(sub);
    card.appendChild(selected);
    card.appendChild(pool);
    card.appendChild(footer);
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
