(() => {
  "use strict";
  const API = "/api/world-chain/token-heatmap/latest";
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
  const state = { tokens: [], mode: "market", snapshot: null };
  const $ = (id) => document.getElementById(id);
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = (value) => value >= 1e9 ? `$${(value / 1e9).toFixed(2)}B` : value >= 1e6 ? `$${(value / 1e6).toFixed(2)}M` : value >= 1e3 ? `$${(value / 1e3).toFixed(1)}K` : `$${num(value).toFixed(2)}`;
  const safe = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function token(value) {
    const address = String(value?.address || "").trim().toLowerCase();
    const symbol = String(value?.symbol || "").trim();
    const name = String(value?.name || "").trim();
    const sourceUrl = String(value?.sourceUrl || "").trim();
    const capUsd = num(value?.capUsd);
    const volume24h = num(value?.volume24h);
    const liquidityUsd = num(value?.liquidityUsd);
    if (!ADDRESS.test(address) || Number(value?.chainId) !== 480 || !symbol || !name || !sourceUrl.startsWith("https://") || !value?.updatedAt) return null;
    if (![capUsd, volume24h, liquidityUsd].some((metric) => metric > 0)) return null;
    return { ...value, id: address, chainId: 480, address, sourceUrl, symbol, name, capUsd, volume24h, liquidityUsd, change24h: num(value?.change24h) };
  }

  function metric(value) {
    return state.mode === "liquidity" || state.mode === "risk" ? value.liquidityUsd : value.capUsd || value.volume24h;
  }

  function tileColor(value) {
    if (state.mode === "risk") return value.riskState === "healthy" ? "#2f7d46" : value.riskState === "stale" ? "#777" : "#b47a23";
    if (state.mode === "liquidity") return value.liquidityUsd >= 1e6 ? "#2f7d46" : value.liquidityUsd >= 1.5e5 ? "#b47a23" : "#a94442";
    return Math.abs(value.change24h) < 0.5 ? "#b6b6b6" : value.change24h > 0 ? "#2f7d46" : "#a94442";
  }

  function status() {
    const snapshot = state.snapshot || {};
    $("statusCount").textContent = state.tokens.length ? `${state.tokens.length} verified tokens` : "No verified snapshot";
    $("statusMode").textContent = state.mode[0].toUpperCase() + state.mode.slice(1);
    $("statusSource").textContent = snapshot?.source?.provider || "Unavailable";
    $("statusUpdated").textContent = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString() : "—";
    $("statusReason").textContent = snapshot.reason || "no_reviewed_snapshot";
    $("statusPill").textContent = snapshot.status || "unavailable";
    $("statusPill").className = `heatmap-pill ${snapshot.status || "unavailable"}`;
    $("apiNote").textContent = state.tokens.length
      ? `${snapshot.stale ? "Stale" : "Reviewed"} stored snapshot. No public refresh or synthetic fallback is used.`
      : "No reviewed snapshot is available. WCWD does not substitute demo or generated token values.";
    $("apiDebug").textContent = `Endpoint: ${API}\nMode: read-only snapshot\nIndexing: disabled\nSynthetic fallback: disabled`;
  }

  function canvas() {
    const viewport = $("heatmapViewport");
    const target = $("heatmapTiles");
    const overlay = $("heatmapOverlay");
    const width = Math.max(320, viewport.clientWidth | 0);
    const height = Math.max(320, viewport.clientHeight | 0);
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    for (const item of [target, overlay]) {
      item.width = width * ratio;
      item.height = height * ratio;
      item.style.width = `${width}px`;
      item.style.height = `${height}px`;
      item.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    const context = target.getContext("2d");
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#f7f7f7";
    context.fillRect(0, 0, width, height);
    if (!state.tokens.length) {
      context.fillStyle = "#555";
      context.font = "600 14px system-ui";
      context.fillText("No reviewed token snapshot available.", 16, 30);
      return;
    }
    const sorted = state.tokens.slice().sort((a, b) => metric(b) - metric(a));
    const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length * width / height)));
    const rows = Math.ceil(sorted.length / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    sorted.forEach((value, index) => {
      const x = index % columns * cellWidth;
      const y = Math.floor(index / columns) * cellHeight;
      const color = tileColor(value);
      context.fillStyle = color;
      context.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
      context.fillStyle = ["#b6b6b6"].includes(color) ? "#111" : "#fff";
      context.font = "700 13px system-ui";
      context.fillText(value.symbol, x + 10, y + 22, cellWidth - 18);
      context.font = "500 10px system-ui";
      context.fillText(money(metric(value)), x + 10, y + 39, cellWidth - 18);
    });
  }

  function details() {
    const value = state.tokens[0];
    $("selectedDetail").innerHTML = value ? `<div class="selected-symbol">${safe(value.symbol)}</div><div class="selected-name">${safe(value.name)}</div><div class="detail-row"><span>Contract</span><strong>${safe(value.address)}</strong></div><div class="detail-row"><span>Chain</span><strong>World Chain (480)</strong></div><div class="detail-row"><span>Source</span><strong><a href="${safe(value.sourceUrl)}" target="_blank" rel="noopener noreferrer">reviewed snapshot</a></strong></div><div class="detail-row"><span>Observed</span><strong>${safe(new Date(value.updatedAt).toLocaleString())}</strong></div><div class="detail-row"><span>Reported cap</span><strong>${money(value.capUsd)}</strong></div><div class="detail-row"><span>24h volume</span><strong>${money(value.volume24h)}</strong></div><div class="detail-row"><span>Liquidity</span><strong>${money(value.liquidityUsd)}</strong></div>` : "No reviewed token is available to inspect.";
    const ranked = state.tokens.slice().sort((a, b) => metric(b) - metric(a)).slice(0, 12);
    $("miniRanking").innerHTML = ranked.length ? ranked.map((item, index) => `<div class="ranking-row"><div class="ranking-rank">#${index + 1}</div><div><div class="ranking-symbol">${safe(item.symbol)}</div><div class="ranking-sub">${safe(item.name)}</div></div><div class="ranking-value">${money(metric(item))}</div></div>`).join("") : '<p class="muted small">No reviewed tokens available.</p>';
  }

  function render() { status(); canvas(); details(); }

  async function load() {
    try {
      const response = await fetch(API, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`http_${response.status}`);
      state.snapshot = await response.json();
      state.tokens = state.snapshot?.available && Array.isArray(state.snapshot.tokens) ? state.snapshot.tokens.map(token).filter(Boolean) : [];
    } catch (error) {
      state.snapshot = { available: false, status: "unavailable", reason: error?.message || "request_failed" };
      state.tokens = [];
    }
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".mode-btn").forEach((button) => button.addEventListener("click", () => {
      state.mode = button.dataset.mode || "market";
      document.querySelectorAll(".mode-btn").forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    }));
    $("resetZoom")?.addEventListener("click", canvas);
    new ResizeObserver(canvas).observe($("heatmapViewport"));
    load();
  });
})();
