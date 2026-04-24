const ECO_UI = {
  hotList: document.getElementById("ecoHotList"),
  hotEmpty: document.getElementById("ecoHotEmpty"),
  newList: document.getElementById("ecoNewList"),
  newEmpty: document.getElementById("ecoNewEmpty"),
  list: document.getElementById("ecoList"),
  empty: document.getElementById("ecoEmpty"),
  search: document.getElementById("ecoSearch"),
  category: document.getElementById("ecoCategory"),
  showUnverified: document.getElementById("ecoShowUnverified"),
  tagState: document.getElementById("ecoTagState"),
  error: document.getElementById("ecoError"),
  tabs: Array.from(document.querySelectorAll("[data-eco-type]")),
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
  if (!ECO_UI.error) return;
  ECO_UI.error.textContent = message || "";
  ECO_UI.error.style.display = message ? "block" : "none";
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
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

function matchesQuery(item, query) {
  if (!query) return true;
  const q = normalizeText(query);
  const haystack = [
    item?.name,
    item?.symbol,
    item?.description,
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ].map(normalizeText).join(" ");
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
  ECO_UI.tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.ecoType === typeTab));
}

function updateTagState() {
  if (!ECO_UI.tagState) return;
  ECO_UI.tagState.textContent = ECO_STATE.tag ? `Tag filter: ${ECO_STATE.tag}` : "Tag filter: none";
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
    anchor.rel = "noopener noreferrer";
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

function visibleItems() {
  return ECO_ITEMS.filter((item) => (
    matchesType(item, ECO_STATE.typeTab)
    && matchesCategory(item, ECO_STATE.category)
    && matchesTag(item, ECO_STATE.tag)
    && matchesQuery(item, ECO_STATE.query)
    && (ECO_STATE.showUnverified || isWorldChainVerified(item))
  ));
}

function renderHotList() {
  if (!ECO_UI.hotList || !ECO_UI.hotEmpty) return;
  ECO_UI.hotList.innerHTML = "";
  const hotItems = ECO_ITEMS.filter((item) => item?.hot)
    .filter((item) => ECO_STATE.showUnverified || isWorldChainVerified(item))
    .sort((a, b) => (a.hot_rank ?? 999) - (b.hot_rank ?? 999))
    .slice(0, 5);
  ECO_UI.hotEmpty.style.display = hotItems.length ? "none" : "block";
  hotItems.forEach((item) => ECO_UI.hotList.appendChild(renderEcoCard(item)));
}

function renderNewList() {
  if (!ECO_UI.newList || !ECO_UI.newEmpty) return;
  ECO_UI.newList.innerHTML = "";
  const newItems = ECO_ITEMS
    .filter((item) => ECO_STATE.showUnverified || isWorldChainVerified(item))
    .slice()
    .sort((a, b) => (b.added_at || "").localeCompare(a.added_at || ""))
    .slice(0, 5);
  ECO_UI.newEmpty.style.display = newItems.length ? "none" : "block";
  newItems.forEach((item) => ECO_UI.newList.appendChild(renderEcoCard(item)));
}

function renderEcosystem() {
  if (!ECO_UI.list || !ECO_UI.empty) return;
  setActiveTab(ECO_STATE.typeTab);
  updateTagState();
  renderHotList();
  renderNewList();
  ECO_UI.list.innerHTML = "";

  const filtered = visibleItems();
  ECO_UI.empty.style.display = filtered.length ? "none" : "block";
  filtered.forEach((item) => ECO_UI.list.appendChild(renderEcoCard(item)));
}

function updateEcoCategories() {
  if (!ECO_UI.category) return;
  const categories = Array.from(new Set(ECO_ITEMS.map((item) => item?.category).filter(Boolean))).sort();
  ECO_UI.category.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All categories";
  ECO_UI.category.appendChild(allOpt);
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    ECO_UI.category.appendChild(opt);
  });
  if (!categories.includes(ECO_STATE.category)) ECO_STATE.category = "all";
  ECO_UI.category.value = ECO_STATE.category;
}

function bindEcoControls() {
  ECO_UI.tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      ECO_STATE.typeTab = btn.dataset.ecoType || "all";
      renderEcosystem();
    });
  });
  ECO_UI.search?.addEventListener("input", (event) => {
    ECO_STATE.query = event.target.value.trim();
    renderEcosystem();
  });
  ECO_UI.category?.addEventListener("change", (event) => {
    ECO_STATE.category = event.target.value || "all";
    renderEcosystem();
  });
  ECO_UI.showUnverified?.addEventListener("change", (event) => {
    ECO_STATE.showUnverified = event.target.checked;
    renderEcosystem();
  });
}

async function loadEcosystem() {
  if (!ECO_UI.list || !ECO_UI.empty) return;
  setEcoError("");
  ECO_UI.list.textContent = "Loading...";
  ECO_UI.empty.style.display = "none";
  try {
    const res = await fetch("/ecosystem.json", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("ecosystem.json must be an array");
    ECO_ITEMS = json;
    updateEcoCategories();
    renderEcosystem();
  } catch (error) {
    setEcoError(`Ecosystem unavailable: ${error?.message || String(error)}`);
    ECO_ITEMS = [];
    ECO_UI.list.innerHTML = "";
    if (ECO_UI.hotList) ECO_UI.hotList.innerHTML = "";
    if (ECO_UI.hotEmpty) ECO_UI.hotEmpty.style.display = "block";
    if (ECO_UI.newList) ECO_UI.newList.innerHTML = "";
    if (ECO_UI.newEmpty) ECO_UI.newEmpty.style.display = "block";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindEcoControls();
  loadEcosystem();
});
