(function () {
  "use strict";

  const PAGE_SIZE = 50;
  const MAX_COMPARE = 5;
  const CATEGORIES = ["all", "finance", "games", "social", "utility", "shopping", "ai", "other"];

  const byId = (id) => document.getElementById(id);
  const fmtNum = (v) => Number.isFinite(v) ? new Intl.NumberFormat("en-US").format(v) : "—";
  const safe = (v) => (v === null || v === undefined || v === "") ? "—" : String(v);

  const state = {
    apps: [],
    filtered: [],
    page: 1,
    search: "",
    sortKey: "rank7d",
    sortDir: "asc",
    category: "all",
    hotOnly: false,
    newOnly: false,
    dropOnly: false,
    selected: new Set(),
    compareOpen: false,
    hasRankAll: false,
    hasValueAll: false,
  };

  function showStatus(type, msg) {
    const mount = byId("stateMount");
    mount.innerHTML = "";
    if (!msg) return;
    const div = document.createElement("div");
    div.className = "status " + (type || "info");
    div.textContent = msg;
    mount.appendChild(div);
  }

  function numberOrNull(v) {
    return Number.isFinite(v) ? v : null;
  }

  function deltaText(delta) {
    if (!Number.isFinite(delta)) return "—";
    if (delta < 0) return `↑${Math.abs(delta)}`;
    if (delta > 0) return `↓${delta}`;
    return "0";
  }

  function deltaClass(delta) {
    if (!Number.isFinite(delta) || delta === 0) return "delta-flat";
    return delta < 0 ? "delta-up" : "delta-down";
  }

  function buildOptions() {
    const sortSel = byId("sortKey");
    sortSel.innerHTML = "";
    const items = [
      { value: "rank7d", label: "rank7d" },
      { value: "value7d", label: "value7d" },
      { value: "deltaRank7d", label: "deltaRank7d" },
    ];
    if (state.hasRankAll) items.push({ value: "rankAll", label: "rankAll" });
    if (state.hasValueAll) items.push({ value: "valueAll", label: "valueAll" });

    for (const item of items) {
      const opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.label;
      sortSel.appendChild(opt);
    }

    if (!items.some((x) => x.value === state.sortKey)) {
      state.sortKey = "rank7d";
      state.sortDir = "asc";
    }
    sortSel.value = state.sortKey;
    byId("sortDir").value = state.sortDir;

    const catSel = byId("categoryFilter");
    catSel.innerHTML = "";
    for (const c of CATEGORIES) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      catSel.appendChild(opt);
    }
    catSel.value = state.category;
  }

  function updateQuery() {
    const q = new URLSearchParams();
    if (state.search) q.set("q", state.search);
    if (state.sortKey !== "rank7d") q.set("sort", state.sortKey);
    if (state.sortDir !== "asc") q.set("dir", state.sortDir);
    if (state.category !== "all") q.set("category", state.category);
    if (state.hotOnly) q.set("hot", "1");
    if (state.newOnly) q.set("new", "1");
    if (state.dropOnly) q.set("drop", "1");
    if (state.page > 1) q.set("page", String(state.page));
    history.replaceState({}, "", q.toString() ? `?${q.toString()}` : location.pathname);
  }

  function hydrateFromQuery() {
    const q = new URLSearchParams(location.search);
    state.search = q.get("q") || "";
    state.sortKey = q.get("sort") || "rank7d";
    state.sortDir = q.get("dir") || "asc";
    state.category = q.get("category") || "all";
    state.hotOnly = q.get("hot") === "1";
    state.newOnly = q.get("new") === "1";
    state.dropOnly = q.get("drop") === "1";
    state.page = Math.max(1, Number.parseInt(q.get("page") || "1", 10) || 1);

    byId("searchInput").value = state.search;
    byId("sortDir").value = state.sortDir;
    byId("hotOnly").checked = state.hotOnly;
    byId("newOnly").checked = state.newOnly;
    byId("dropOnly").checked = state.dropOnly;
  }

  function applyFilters() {
    const term = state.search.trim().toLowerCase();
    state.filtered = state.apps.filter((app) => {
      const appName = String(app.name || "").toLowerCase();
      if (term && !appName.includes(term)) return false;
      if (state.category !== "all" && (app.category || "other") !== state.category) return false;
      if (state.hotOnly && !(app.flags && app.flags.hot)) return false;
      if (state.newOnly && !(app.flags && app.flags.new)) return false;
      if (state.dropOnly && !(app.flags && app.flags.drop)) return false;
      return true;
    });

    const descDefault = new Set(["value7d", "valueAll"]);
    const dir = state.sortDir;
    state.filtered.sort((a, b) => {
      const av = numberOrNull(a[state.sortKey]);
      const bv = numberOrNull(b[state.sortKey]);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) return 0;
      if (dir === "asc") return av - bv;
      return bv - av;
    });

    if (!byId("sortDir").dataset.userTouched && descDefault.has(state.sortKey) && state.sortDir === "asc") {
      // only for initial state keep fixed defaults from requirements
    }

    const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
  }

  function badgeHTML(app) {
    const badges = [];
    if (app.flags && app.flags.hot) badges.push('<span class="badge hot">HOT</span>');
    if (app.flags && app.flags.new) badges.push('<span class="badge new">NEW</span>');
    if (app.flags && app.flags.drop) badges.push('<span class="badge drop">DROP</span>');
    return badges.join(" ") || "—";
  }

  function currentPageRows() {
    const start = (state.page - 1) * PAGE_SIZE;
    return state.filtered.slice(start, start + PAGE_SIZE);
  }

  function renderTable() {
    const body = byId("appsBody");
    body.innerHTML = "";
    const rows = currentPageRows();

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" class="muted">No apps matched your conditions.</td></tr>';
    } else {
      for (const app of rows) {
        const key = app.slug || app.name;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><input type="checkbox" data-app-key="${encodeURIComponent(key)}" ${state.selected.has(key) ? "checked" : ""}></td>
          <td>${safe(app.rank7d)}</td>
          <td>${safe(app.name)}</td>
          <td>${fmtNum(app.value7d)}</td>
          <td class="${deltaClass(app.deltaRank7d)}">${deltaText(app.deltaRank7d)}</td>
          <td>${badgeHTML(app)}</td>
          <td>${safe(app.category || "other")}</td>
          <td><a href="/test/mini-apps/${encodeURIComponent(app.slug || "")}">Detail</a></td>
        `;
        body.appendChild(tr);
      }
    }

    const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    byId("pageInfo").textContent = `Page ${state.page} / ${totalPages}`;
    byId("prevPage").disabled = state.page <= 1;
    byId("nextPage").disabled = state.page >= totalPages;
    byId("resultMeta").textContent = `Showing ${rows.length} of ${state.filtered.length} matched apps (total ${state.apps.length}).`;
  }

  function selectedApps() {
    return state.apps.filter((a) => state.selected.has(a.slug || a.name));
  }

  function renderCompare() {
    const count = state.selected.size;
    byId("compareBar").hidden = count === 0;
    byId("selectedCount").textContent = `Selected: ${count}/${MAX_COMPARE}`;

    const panel = byId("comparePanel");
    const grid = byId("compareGrid");
    if (!state.compareOpen || count === 0) {
      panel.hidden = true;
      grid.innerHTML = "";
      return;
    }

    panel.hidden = false;
    const cards = selectedApps();
    grid.innerHTML = cards.map((app) => `
      <article class="compare-item">
        <h4>${safe(app.name)}</h4>
        <p><strong>rank7d:</strong> ${safe(app.rank7d)}</p>
        <p><strong>value7d:</strong> ${fmtNum(app.value7d)}</p>
        <p class="${deltaClass(app.deltaRank7d)}"><strong>deltaRank7d:</strong> ${deltaText(app.deltaRank7d)}</p>
        <p><strong>flags:</strong> ${badgeHTML(app)}</p>
        <p><strong>category:</strong> ${safe(app.category || "other")}</p>
        <p class="small muted">History coming soon</p>
      </article>
    `).join("");
  }

  function render() {
    applyFilters();
    renderTable();
    renderCompare();
    updateQuery();
  }

  function wireEvents() {
    byId("searchInput").addEventListener("input", (e) => {
      state.search = e.target.value;
      state.page = 1;
      render();
    });

    byId("sortKey").addEventListener("change", (e) => {
      state.sortKey = e.target.value;
      if (state.sortKey === "value7d" || state.sortKey === "valueAll") {
        state.sortDir = "desc";
      } else {
        state.sortDir = "asc";
      }
      byId("sortDir").value = state.sortDir;
      state.page = 1;
      render();
    });

    byId("sortDir").addEventListener("change", (e) => {
      state.sortDir = e.target.value;
      state.page = 1;
      render();
    });

    byId("categoryFilter").addEventListener("change", (e) => {
      state.category = e.target.value;
      state.page = 1;
      render();
    });

    for (const id of ["hotOnly", "newOnly", "dropOnly"]) {
      byId(id).addEventListener("change", () => {
        state.hotOnly = byId("hotOnly").checked;
        state.newOnly = byId("newOnly").checked;
        state.dropOnly = byId("dropOnly").checked;
        state.page = 1;
        render();
      });
    }

    byId("resetFilters").addEventListener("click", () => {
      state.search = "";
      state.sortKey = "rank7d";
      state.sortDir = "asc";
      state.category = "all";
      state.hotOnly = false;
      state.newOnly = false;
      state.dropOnly = false;
      state.page = 1;

      byId("searchInput").value = "";
      byId("sortKey").value = state.sortKey;
      byId("sortDir").value = state.sortDir;
      byId("categoryFilter").value = state.category;
      byId("hotOnly").checked = false;
      byId("newOnly").checked = false;
      byId("dropOnly").checked = false;
      render();
    });

    byId("appsBody").addEventListener("change", (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== "checkbox") return;
      const key = decodeURIComponent(el.dataset.appKey || "");
      if (!key) return;

      if (el.checked) {
        if (state.selected.size >= MAX_COMPARE) {
          el.checked = false;
          byId("selectToast").textContent = `You can compare up to ${MAX_COMPARE} apps.`;
          setTimeout(() => { byId("selectToast").textContent = ""; }, 1800);
          return;
        }
        state.selected.add(key);
      } else {
        state.selected.delete(key);
      }
      renderCompare();
    });

    byId("prevPage").addEventListener("click", () => {
      state.page = Math.max(1, state.page - 1);
      render();
    });

    byId("nextPage").addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
      state.page = Math.min(totalPages, state.page + 1);
      render();
    });

    byId("backTop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

    byId("clearSelected").addEventListener("click", () => {
      state.selected.clear();
      state.compareOpen = false;
      render();
    });

    byId("openCompare").addEventListener("click", () => {
      state.compareOpen = !state.compareOpen;
      renderCompare();
    });
  }

  async function bootstrap() {
    try {
      const res = await fetch("/test/mini-apps/data/latest.json", { cache: "no-store" });
      if (!res.ok) throw new Error("latest.json not found");
      const latest = await res.json();

      byId("updatedAt").textContent = `Updated: ${latest.updatedAt || "Unknown"}`;
      const apps = Array.isArray(latest.apps) ? latest.apps : [];
      if (!apps.length) {
        showStatus("warn", "データ未生成: apps が空です。PR90 の Actions（fetch/build）で latest.json を生成してください。");
      } else {
        showStatus("info", "Local latest.json loaded.");
      }

      state.apps = apps;
      state.hasRankAll = apps.some((a) => Number.isFinite(a.rankAll));
      state.hasValueAll = apps.some((a) => Number.isFinite(a.valueAll));

      hydrateFromQuery();
      buildOptions();
      render();
    } catch (_err) {
      byId("updatedAt").textContent = "Updated: Unknown";
      showStatus("error", "データ未生成: latest.json が読めません。PR90 の Actions 実行状況を確認してください。");
      state.apps = [];
      state.filtered = [];
      buildOptions();
      renderTable();
      renderCompare();
    }
  }

  wireEvents();
  bootstrap();
})();
