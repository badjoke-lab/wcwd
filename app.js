/* WCWD frontend (static) — prefers History Worker summary API */

const WORKER_BASE = "https://wcwd-history.badjoke-lab.workers.dev";

function isLocalMode() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "" || location.protocol === "file:";
}

const API_BASE = (() => {
  if (isLocalMode()) {
    const meta = document.querySelector('meta[name="wcwd-history-base"]');
    const v = meta?.getAttribute("content")?.trim();
    return v || WORKER_BASE;
  }
  return "";
})();

const DEFAULT_INTERVAL_MIN = 15;
const INTERVAL_STORAGE_KEY = "wcwd-interval-min";
const HISTORY_CACHE_KEY = "wcwd-history-cache-v1";
const SAFE_REQUEST_LIMIT = 288;
const UNKNOWN_VERSION = "unknown";

const UI = {
  status: document.getElementById("status"),
  reload: document.getElementById("reload"),

  healthLevel: document.getElementById("healthLevel"),
  healthReasons: document.getElementById("healthReasons"),
  healthBaseline: document.getElementById("healthBaseline"),

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

  eventsList: document.getElementById("eventsList"),

  dailyDate: document.getElementById("dailyDate"),
  dailyHealth: document.getElementById("dailyHealth"),
  dailyTpsMax: document.getElementById("dailyTpsMax"),
  dailyTpsMin: document.getElementById("dailyTpsMin"),
  dailyGasMax: document.getElementById("dailyGasMax"),
  dailyWldUsdChange: document.getElementById("dailyWldUsdChange"),
  dailyWldJpyChange: document.getElementById("dailyWldJpyChange"),

  ecoHotList: document.getElementById("ecoHotList"),
  ecoHotEmpty: document.getElementById("ecoHotEmpty"),
  ecoNewList: document.getElementById("ecoNewList"),
  ecoNewEmpty: document.getElementById("ecoNewEmpty"),
  ecoList: document.getElementById("ecoList"),
  ecoEmpty: document.getElementById("ecoEmpty"),
  ecoSearch: document.getElementById("ecoSearch"),
  ecoCategory: document.getElementById("ecoCategory"),
  ecoShowUnverified: document.getElementById("ecoShowUnverified"),
  ecoTagState: document.getElementById("ecoTagState"),
  ecoError: document.getElementById("ecoError"),
  ecoTabs: Array.from(document.querySelectorAll("[data-eco-type]")),

  raw: document.getElementById("raw"),
  errors: document.getElementById("errors"),
};

const ECO_STATE = {
  typeTab: "all",
  query: "",
  category: "all",
  tag: "",
  showUnverified: false,
};

let ECO_ITEMS = [];

function setEcoError(message) {
  if (!UI.ecoError) return;
  UI.ecoError.textContent = message || "";
  UI.ecoError.style.display = message ? "block" : "none";
}

function ecoTypeLabel(type) {
  if (type === "token") return "Token";
  if (type === "dapp") return "dApp";
  if (type === "infra") return "Infra";
  if (type === "oracle") return "Oracle";
  if (type === "offchain") return "Offchain";
  return "—";
}

function isWorldChainVerified(item) {
  const contracts = Array.isArray(item?.contracts) ? item.contracts : [];
  const hasWorldChainContract = contracts.some((c) => Number(c?.chainId) === 480);
  const explorer = normalizeText(item?.links?.explorer);
  const hasWorldscanAddress = explorer.includes("worldscan.org/address/");
  const offchainVerified = item?.type === "offchain" && item?.offchain_verified === true;
  return hasWorldChainContract || hasWorldscanAddress || offchainVerified;
}

function verificationStatus(item) {
  if (item?.type === "offchain" && item?.offchain_verified === true) {
    return { label: "Offchain (World official)", className: "offchain" };
  }
  if (isWorldChainVerified(item)) {
    return { label: "Verified on World Chain", className: "verified" };
  }
  return { label: "Unverified / Cross-chain", className: "unverified" };
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function matchesQuery(item, query) {
  if (!query) return true;
  const q = normalizeText(query);
  const haystack = [item?.name, item?.symbol, item?.description, ...(Array.isArray(item?.tags) ? item.tags : [])].map(normalizeText).join(" ");
  return haystack.includes(q);
}

function matchesCategory(item, category) {
  if (!category || category === "all") return true;
  return item?.category === category;
}

function matchesType(item, typeTab) {
  if (!typeTab || typeTab === "all") return true;
  return item?.type === typeTab;
}

function matchesTag(item, tag) {
  if (!tag) return true;
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  return tags.includes(tag);
}

function setActiveTab(typeTab) {
  if (!UI.ecoTabs?.length) return;
  UI.ecoTabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.ecoType === typeTab));
}

function updateTagState() {
  if (!UI.ecoTagState) return;
  UI.ecoTagState.textContent = ECO_STATE.tag ? `Tag filter: ${ECO_STATE.tag}` : "Tag filter: none";
}

function renderEcoLinks(links) {
  const container = document.createElement("div");
  container.className = "eco-links";
  const linkDefs = [["Official", links?.official], ["App", links?.app], ["Docs", links?.docs], ["Explorer", links?.explorer]];
  for (const [label, url] of linkDefs) {
    if (!url) continue;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.textContent = label;
    container.appendChild(anchor);
  }
  return container;
}

function renderEcoCard(item) {
  const card = document.createElement("div");
  card.className = "eco-card";

  const title = document.createElement("h4");
  title.textContent = item?.symbol ? `${item.name} (${item.symbol})` : item?.name || "—";
  card.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "eco-meta";
  const badge = document.createElement("span");
  badge.className = "eco-badge";
  badge.textContent = ecoTypeLabel(item?.type);
  const cat = document.createElement("span");
  cat.className = "note";
  cat.textContent = item?.category || "—";
  const status = verificationStatus(item);
  const statusBadge = document.createElement("span");
  statusBadge.className = `eco-status ${status.className}`;
  statusBadge.textContent = status.label;
  meta.appendChild(badge);
  meta.appendChild(cat);
  meta.appendChild(statusBadge);
  card.appendChild(meta);

  if (item?.description) {
    const desc = document.createElement("div");
    desc.className = "note";
    desc.textContent = item.description;
    card.appendChild(desc);
  }

  const tags = Array.isArray(item?.tags) ? item.tags : [];
  if (tags.length) {
    const tagWrap = document.createElement("div");
    tagWrap.className = "eco-tags";
    tags.forEach((tag) => {
      const tagBtn = document.createElement("button");
      tagBtn.type = "button";
      tagBtn.className = "eco-tag";
      tagBtn.textContent = tag;
      if (ECO_STATE.tag === tag) tagBtn.classList.add("active");
      tagBtn.addEventListener("click", () => {
        ECO_STATE.tag = ECO_STATE.tag === tag ? "" : tag;
        updateTagState();
        renderEcosystem();
      });
      tagWrap.appendChild(tagBtn);
    });
    card.appendChild(tagWrap);
  }

  const links = renderEcoLinks(item?.links || {});
  if (links.childElementCount) card.appendChild(links);
  return card;
}

function renderHotList() {
  if (!UI.ecoHotList || !UI.ecoHotEmpty) return;
  UI.ecoHotList.innerHTML = "";
  const hotItems = ECO_ITEMS.filter((item) => item?.hot)
    .filter((item) => ECO_STATE.showUnverified || isWorldChainVerified(item))
    .sort((a, b) => (a.hot_rank ?? 999) - (b.hot_rank ?? 999))
    .slice(0, 5);
  if (!hotItems.length) {
    UI.ecoHotEmpty.style.display = "block";
    return;
  }
  UI.ecoHotEmpty.style.display = "none";
  hotItems.forEach((item) => UI.ecoHotList.appendChild(renderEcoCard(item)));
}

function renderNewList() {
  if (!UI.ecoNewList || !UI.ecoNewEmpty) return;
  UI.ecoNewList.innerHTML = "";
  const newItems = ECO_ITEMS
    .filter((item) => ECO_STATE.showUnverified || isWorldChainVerified(item))
    .slice()
    .sort((a, b) => (b.added_at || "").localeCompare(a.added_at || ""))
    .slice(0, 5);
  if (!newItems.length) {
    UI.ecoNewEmpty.style.display = "block";
    return;
  }
  UI.ecoNewEmpty.style.display = "none";
  newItems.forEach((item) => UI.ecoNewList.appendChild(renderEcoCard(item)));
}

function renderEcosystem() {
  if (!UI.ecoList || !UI.ecoEmpty) return;
  setActiveTab(ECO_STATE.typeTab);
  updateTagState();
  renderHotList();
  renderNewList();
  UI.ecoList.innerHTML = "";

  const filtered = ECO_ITEMS.filter((item) => (
    matchesType(item, ECO_STATE.typeTab)
    && matchesCategory(item, ECO_STATE.category)
    && matchesTag(item, ECO_STATE.tag)
    && matchesQuery(item, ECO_STATE.query)
    && (ECO_STATE.showUnverified || isWorldChainVerified(item))
  ));

  if (!filtered.length) {
    UI.ecoEmpty.style.display = "block";
    return;
  }
  UI.ecoEmpty.style.display = "none";
  filtered.forEach((item) => UI.ecoList.appendChild(renderEcoCard(item)));
}

function updateEcoCategories() {
  if (!UI.ecoCategory) return;
  const categories = Array.from(new Set(ECO_ITEMS.map((item) => item?.category).filter(Boolean))).sort();
  UI.ecoCategory.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All categories";
  UI.ecoCategory.appendChild(allOpt);
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    UI.ecoCategory.appendChild(opt);
  });
  if (!categories.includes(ECO_STATE.category)) ECO_STATE.category = "all";
  UI.ecoCategory.value = ECO_STATE.category;
}

function bindEcoControls() {
  if (UI.ecoTabs?.length) {
    UI.ecoTabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        ECO_STATE.typeTab = btn.dataset.ecoType || "all";
        renderEcosystem();
      });
    });
  }
  if (UI.ecoSearch) {
    UI.ecoSearch.addEventListener("input", (event) => {
      ECO_STATE.query = event.target.value.trim();
      renderEcosystem();
    });
  }
  if (UI.ecoCategory) {
    UI.ecoCategory.addEventListener("change", (event) => {
      ECO_STATE.category = event.target.value || "all";
      renderEcosystem();
    });
  }
  if (UI.ecoShowUnverified) {
    UI.ecoShowUnverified.addEventListener("change", (event) => {
      ECO_STATE.showUnverified = event.target.checked;
      renderEcosystem();
    });
  }
}

async function loadEcosystem() {
  if (!UI.ecoList || !UI.ecoEmpty) return;
  setEcoError("");
  UI.ecoList.textContent = "Loading...";
  UI.ecoEmpty.style.display = "none";
  try {
    const res = await fetch("./ecosystem.json", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("ecosystem.json must be an array");
    ECO_ITEMS = json;
    updateEcoCategories();
    renderEcosystem();
  } catch (e) {
    setEcoError(`Ecosystem unavailable: ${(e && e.message) ? e.message : String(e)}`);
    ECO_ITEMS = [];
    UI.ecoList.innerHTML = "";
    if (UI.ecoHotList) UI.ecoHotList.innerHTML = "";
    if (UI.ecoHotEmpty) UI.ecoHotEmpty.style.display = "block";
    if (UI.ecoNewList) UI.ecoNewList.innerHTML = "";
    if (UI.ecoNewEmpty) UI.ecoNewEmpty.style.display = "block";
  }
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

function shortSha(sha) {
  if (!sha) return UNKNOWN_VERSION;
  const trimmed = String(sha).trim();
  if (!trimmed || trimmed === UNKNOWN_VERSION) return UNKNOWN_VERSION;
  return trimmed.length > 7 ? trimmed.slice(0, 7) : trimmed;
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
  } catch {
    return null;
  }
}

function storeHistoryCache(hist, intervalMin) {
  const payload = { hist, intervalMin, savedAt: new Date().toISOString() };
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

function normalizeEventsPayload(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.events)) return value.events;
  return [];
}

function computeFreshnessStateFromLatest(latest, intervalMin) {
  const ts = typeof latest?.ts === "string" ? latest.ts : "";
  const tsMs = Date.parse(ts);
  if (!Number.isFinite(tsMs)) return "empty";
  const ageMs = Math.max(0, Date.now() - tsMs);
  if (ageMs > intervalMin * 4 * 60 * 1000) return "stale";
  if (ageMs > intervalMin * 2 * 60 * 1000) return "delayed";
  return "fresh";
}

function deriveDashboardState({ latest, health, explicitState, intervalMin }) {
  const hint = String(explicitState || "").toLowerCase();
  if (hint === "stale" || hint === "delayed" || hint === "degraded") return hint;
  if (latest?.summary_ok === false) return "degraded";
  if (health?.level === "WARN" || health?.level === "ALERT") return "degraded";
  const freshness = computeFreshnessStateFromLatest(latest, intervalMin);
  if (freshness === "stale" || freshness === "delayed") return freshness;
  return "ok";
}

function setError(err) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  UI.errors.textContent = msg;
}

function clearError() {
  UI.errors.textContent = "—";
}

function setStatusText(state = "ok", histOk = false) {
  if (!UI.status) return;
  if (!histOk) {
    UI.status.textContent = isLocalMode() ? "LOCAL (NO DATA)" : "NO DATA";
    return;
  }
  const labelMap = { ok: "OK", delayed: "DELAYED", stale: "STALE", degraded: "DEGRADED" };
  const label = labelMap[String(state || "ok").toLowerCase()] || "OK";
  UI.status.textContent = isLocalMode() ? `LOCAL (${label})` : label;
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
    min -= 1;
    max += 1;
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
  for (let i = 0; i < arr.length; i += 1) {
    const x = padX + i * xStep;
    const y = yOf(arr[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

async function loadSeries(metric, canvas, noteEl, errors, intervalMin) {
  const url = `${API_BASE}/api/series?metric=${metric}&period=7d&step=1h`;
  try {
    const { json, headers } = await fetchJsonWithMeta(url, { timeoutMs: 8000 });
    const points = Array.isArray(json?.points) ? json.points : [];
    const agg = json?.agg || headers.get("x-wcwd-series-agg") || "avg";
    const step = json?.step || "1h";
    const intervalHeader = Number(headers.get("x-wcwd-interval-min"));
    const intervalJson = Number(json?.interval_min);
    const intervalValue = Number.isFinite(intervalJson) ? intervalJson : (Number.isFinite(intervalHeader) ? intervalHeader : intervalMin);
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

function healthLabel(level) {
  if (level === "ALERT") return "🚨 Alert";
  if (level === "WARN") return "⚠️ Warn";
  if (level === "NORMAL") return "✅ Normal";
  if (level === "UNKNOWN") return "Unknown";
  return "—";
}

function renderHealth(health) {
  if (!health || typeof health !== "object") {
    UI.healthLevel.textContent = "—";
    UI.healthReasons.textContent = "—";
    UI.healthBaseline.textContent = "—";
    return;
  }
  UI.healthLevel.textContent = healthLabel(health.level);
  const reasons = Array.isArray(health.reasons) ? health.reasons.slice(0, 3) : [];
  UI.healthReasons.textContent = reasons.length ? reasons.join("\n") : "—";
  const tpsBase = fmtNum(health?.baseline?.tps_3h, 2);
  const gasBase = fmtNum(health?.baseline?.gas_3h, 6);
  UI.healthBaseline.textContent = `baseline (3h avg): tps=${tpsBase} gas=${gasBase}`;
}

function renderEvents(events) {
  if (!UI.eventsList) return;
  UI.eventsList.innerHTML = "";
  if (!Array.isArray(events) || !events.length) {
    const empty = document.createElement("div");
    empty.className = "note";
    empty.textContent = "No events yet";
    UI.eventsList.appendChild(empty);
    return;
  }
  const list = document.createElement("ul");
  list.className = "mono";
  for (const event of events) {
    const item = document.createElement("li");
    const ts = event?.ts || "—";
    const level = event?.level || "—";
    const msg = event?.msg || "—";
    item.textContent = `${ts} [${level}] ${msg}`;
    list.appendChild(item);
  }
  UI.eventsList.appendChild(list);
}

function renderDaily(summary) {
  if (!summary || typeof summary !== "object") {
    UI.dailyDate.textContent = "—";
    UI.dailyHealth.textContent = "—";
    UI.dailyTpsMax.textContent = "—";
    UI.dailyTpsMin.textContent = "—";
    UI.dailyGasMax.textContent = "—";
    UI.dailyWldUsdChange.textContent = "—";
    UI.dailyWldJpyChange.textContent = "—";
    return;
  }
  UI.dailyDate.textContent = summary.date || "—";
  const health = summary?.health;
  if (health?.mode) {
    const counts = health.counts || {};
    UI.dailyHealth.textContent = `${health.mode} (N:${counts.NORMAL ?? 0} W:${counts.WARN ?? 0} A:${counts.ALERT ?? 0})`;
  } else {
    UI.dailyHealth.textContent = "—";
  }
  UI.dailyTpsMax.textContent = fmtNum(summary?.tps?.max, 0);
  UI.dailyTpsMin.textContent = fmtNum(summary?.tps?.min, 0);
  UI.dailyGasMax.textContent = fmtNum(summary?.gas?.max, 6);
  UI.dailyWldUsdChange.textContent = fmtUsd(summary?.wld?.usd_change, 6);
  UI.dailyWldJpyChange.textContent = fmtJpy(summary?.wld?.jpy_change, 2);
}

async function loadAll() {
  clearError();
  UI.raw.textContent = "—";
  const errors = [];
  const isLite = new URLSearchParams(location.search).get("lite") === "1";
  const seriesMeta = {};
  let health = null;
  let events = [];
  let daily = null;
  let pagesVersion = null;
  let workerVersion = null;
  let historyNoteBase = "";
  let versionNote = "";
  let dashboardState = "ok";
  let summaryStateHint = "";

  let hist = [];
  let latest = null;
  let meta = null;
  let intervalMin = loadStoredInterval();
  let source = isLocalMode() ? "worker-direct" : "pages-proxy";
  let historyOk = false;
  let summaryUsed = false;
  let historyFromCache = false;

  const applyHistoryNote = () => {
    const parts = [historyNoteBase, versionNote].filter(Boolean);
    UI.noteHistory.textContent = parts.join(" ");
  };

  setStatusText("ok", false);

  try {
    const { json, headers } = await fetchJsonWithMeta(`${API_BASE}/api/summary?limit=${SAFE_REQUEST_LIMIT}&event_limit=50`, { timeoutMs: 8000 });
    const headerInterval = Number(headers.get("x-wcwd-interval-min"));
    const pagesHeader = headers.get("x-wcwd-pages-version");
    pagesVersion = pagesHeader || pagesVersion;
    intervalMin = Number.isFinite(Number(json?.interval_min)) && Number(json?.interval_min) > 0
      ? Number(json.interval_min)
      : (Number.isFinite(headerInterval) && headerInterval > 0 ? headerInterval : intervalMin);
    storeInterval(intervalMin);

    hist = Array.isArray(json?.history) ? json.history : [];
    latest = hist[hist.length - 1] || (json?.latest && typeof json.latest === "object" ? json.latest : null);
    if (!hist.length && latest) hist = [latest];
    historyOk = !!latest || hist.length > 0;
    if (hist.length) storeHistoryCache(hist, intervalMin);

    health = json?.health && typeof json.health === "object" ? json.health : null;
    events = normalizeEventsPayload(json?.events);
    daily = json?.daily && typeof json.daily === "object" ? json.daily : null;
    workerVersion = json?.version?.worker_version || workerVersion;
    summaryStateHint = String(json?.dashboard_state || json?.freshness?.state || "").toLowerCase();
    dashboardState = deriveDashboardState({ latest, health, explicitState: summaryStateHint, intervalMin });
    meta = {
      summary_generated_at: json?.generated_at || null,
      retention: json?.retention || null,
      freshness: json?.freshness || null,
    };
    source = isLocalMode() ? "worker-direct-summary" : "pages-proxy-summary";
    summaryUsed = historyOk;
  } catch (e) {
    errors.push(`Summary fetch failed: ${(e && e.message) ? e.message : String(e)}`);
  }

  if (!summaryUsed) {
    source = isLocalMode() ? "worker-direct" : "pages-proxy";
    try {
      const { json, headers } = await fetchJsonWithMeta(`${API_BASE}/api/list?limit=${SAFE_REQUEST_LIMIT}`, { timeoutMs: 8000 });
      const headerInterval = Number(headers.get("x-wcwd-interval-min"));
      const proxyHeader = headers.get("x-wcwd-proxy");
      const pagesHeader = headers.get("x-wcwd-pages-version");
      if (proxyHeader && proxyHeader.toLowerCase() === "pages") source = "pages-proxy";
      else if (!isLocalMode()) source = "worker-direct";
      pagesVersion = pagesHeader || pagesVersion;
      intervalMin = Number.isFinite(headerInterval) && headerInterval > 0 ? headerInterval : intervalMin;
      storeInterval(intervalMin);
      if (Array.isArray(json)) {
        hist = json;
      } else {
        hist = json?.items || json?.data || [];
        meta = json?.meta ?? meta;
      }
      historyOk = true;
      storeHistoryCache(hist, intervalMin);
    } catch (e) {
      errors.push(`History fetch failed: ${(e && e.message) ? e.message : String(e)}`);
      const cached = loadHistoryCache();
      if (cached?.hist?.length) {
        hist = cached.hist;
        intervalMin = cached.intervalMin;
        historyFromCache = true;
        source = `${source}-cache`;
      }
    }
  }

  const maxPoints24h = computePointsPerDay(intervalMin);
  const usePoints = isLite ? Math.max(12, Math.floor(maxPoints24h / 2)) : maxPoints24h;
  if (hist.length > usePoints) hist = hist.slice(-usePoints);
  latest = hist[hist.length - 1] || latest || null;
  historyOk = !!latest || hist.length > 0;

  if (latest) {
    UI.tps.textContent = fmtNum(latest.tps, 0);
    UI.tx24h.textContent = latest.tps ? fmtNum(latest.tps * 86400, 0) : "—";
    UI.gasPrice.textContent = fmtNum(latest.gas_gwei, 9);
    UI.wldUsd.textContent = latest.wld_usd != null ? fmtUsd(latest.wld_usd, 6) : "—";
    UI.wldJpy.textContent = latest.wld_jpy != null ? fmtJpy(latest.wld_jpy, 2) : "—";
    UI.wldChg24h.textContent = "—";
    UI.wldMc.textContent = "—";
    UI.wldVol.textContent = "—";
    UI.wldSpark7d.textContent = "—";
    UI.chartWld7d.textContent = "—";
    UI.pctToken.textContent = latest.token_pct != null ? pct(latest.token_pct, 3) : "—";
    UI.pctNative.textContent = latest.native_pct != null ? pct(latest.native_pct, 3) : "—";
    UI.pctContract.textContent = "—";
    UI.pctOther.textContent = "—";
  }

  try {
    if (hist.length) {
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

  if (!health) {
    try {
      const { json } = await fetchJsonWithMeta(`${API_BASE}/api/health`, { timeoutMs: 8000 });
      health = json;
    } catch (e) {
      errors.push(`Health fetch failed: ${(e && e.message) ? e.message : String(e)}`);
    }
  }
  renderHealth(health);

  if (!events.length) {
    try {
      const { json } = await fetchJsonWithMeta(`${API_BASE}/api/events?limit=50`, { timeoutMs: 8000 });
      events = normalizeEventsPayload(json);
    } catch (e) {
      errors.push(`Events fetch failed: ${(e && e.message) ? e.message : String(e)}`);
    }
  }
  renderEvents(events);

  if (!daily) {
    try {
      const { json } = await fetchJsonWithMeta(`${API_BASE}/api/daily/latest`, { timeoutMs: 8000 });
      daily = json;
    } catch (e) {
      errors.push(`Daily summary fetch failed: ${(e && e.message) ? e.message : String(e)}`);
    }
  }
  renderDaily(daily);

  if (!workerVersion) {
    try {
      const { json, headers } = await fetchJsonWithMeta(`${API_BASE}/api/version`, { timeoutMs: 6000 });
      workerVersion = json?.worker_version || workerVersion;
      pagesVersion = pagesVersion || headers.get("x-wcwd-pages-version");
    } catch (e) {
      errors.push(`Version fetch failed: ${(e && e.message) ? e.message : String(e)}`);
    }
  }

  dashboardState = deriveDashboardState({ latest, health, explicitState: summaryStateHint, intervalMin });
  setStatusText(dashboardState, historyOk);

  if (isLocalMode() && !pagesVersion) pagesVersion = "local";
  versionNote = `pages=${shortSha(pagesVersion)} worker=${shortSha(workerVersion)}`;

  if (latest) {
    const okLabel = summaryUsed ? "Summary OK." : historyFromCache ? "History OK (cache)." : "History OK.";
    historyNoteBase = `${okLabel} points=${hist.length} interval=${fmtNum(intervalMin, 0)}min mode=${isLite ? "lite" : "full"} state=${dashboardState} source=${source}`;
  } else {
    historyNoteBase = `History unavailable. points=${hist.length} interval=${fmtNum(intervalMin, 0)}min mode=${isLite ? "lite" : "full"} state=no_data source=${source} — Try again later / enable ?lite=1 / reduce points`;
  }
  applyHistoryNote();

  try {
    UI.raw.textContent = JSON.stringify({
      latest,
      hist_head: hist.slice(0, 3),
      intervalMin,
      maxPoints24h,
      usePoints,
      mode: isLite ? "lite" : "full",
      source,
      summaryUsed,
      dashboardState,
      meta,
      series: seriesMeta,
      health,
      events: events.slice(0, 3),
      daily,
    }, null, 2);
  } catch (e) {
    errors.push(`Debug render failed: ${(e && e.message) ? e.message : String(e)}`);
  }

  if (errors.length) setError(new Error(errors.join("\n")));
}

UI.reload?.addEventListener("click", () => loadAll());

loadAll();
bindEcoControls();
loadEcosystem();
