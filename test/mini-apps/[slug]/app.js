(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const safe = (v) => (v === null || v === undefined || v === "") ? "—" : String(v);
  const fmtNum = (v) => Number.isFinite(v) ? new Intl.NumberFormat("en-US").format(v) : "—";

  function showStatus(type, msg) {
    const mount = byId("stateMount");
    mount.innerHTML = "";
    if (!msg) return;
    const div = document.createElement("div");
    div.className = "status " + (type || "info");
    div.textContent = msg;
    mount.appendChild(div);
  }

  function getSlugFromPath() {
    const qsSlug = new URLSearchParams(location.search).get("slug");
    if (qsSlug) return qsSlug.trim();
    const parts = location.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("mini-apps");
    if (idx === -1) return "";
    return decodeURIComponent(parts[idx + 1] || "").trim();
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

  function badgeHTML(app) {
    const badges = [];
    if (app.flags && app.flags.hot) badges.push('<span class="badge hot">HOT</span>');
    if (app.flags && app.flags.new) badges.push('<span class="badge new">NEW</span>');
    if (app.flags && app.flags.drop) badges.push('<span class="badge drop">DROP</span>');
    return badges.join(" ");
  }

  function renderKpis(app) {
    const items = [
      ["rank7d", safe(app.rank7d)],
      ["value7d", fmtNum(app.value7d)],
      ["deltaRank7d", deltaText(app.deltaRank7d)],
      ["rankAll", safe(app.rankAll)],
      ["valueAll", fmtNum(app.valueAll)],
      ["category", safe(app.category || "other")],
    ];
    byId("kpiGrid").innerHTML = items.map(([k, v]) => `<div class="kpi"><div class="label">${k}</div><div class="value">${v}</div></div>`).join("");
  }

  async function loadSnapshots() {
    const today = new Date();
    const reqs = [];
    for (let i = 0; i < 30; i += 1) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      reqs.push(fetch(`/test/mini-apps/data/snapshots/${key}.json`, { cache: "no-store" })
        .then((res) => res.ok ? res.json() : null)
        .catch(() => null));
    }
    return Promise.all(reqs);
  }

  function renderTrend(slug, snapshots, fallbackApp) {
    const rows = [];
    for (const snap of snapshots) {
      if (!snap || !Array.isArray(snap.apps)) continue;
      const app = snap.apps.find((a) => a.slug === slug);
      if (!app) continue;
      const date = (snap.updatedAt || "").slice(0, 10) || "Unknown";
      rows.push({ date, rank7d: app.rank7d, value7d: app.value7d });
    }

    rows.sort((a, b) => a.date.localeCompare(b.date));
    const trendBody = byId("trendBody");
    if (!rows.length) {
      trendBody.innerHTML = `<tr><td>Latest only</td><td>${safe(fallbackApp.rank7d)}</td><td>${fmtNum(fallbackApp.value7d)}</td></tr>`;
      byId("trendHint").textContent = "Collecting daily snapshots…";
      return;
    }

    trendBody.innerHTML = rows.map((r) => `<tr><td>${r.date}</td><td>${safe(r.rank7d)}</td><td>${fmtNum(r.value7d)}</td></tr>`).join("");
    byId("trendHint").textContent = `Showing ${rows.length} day(s) with available snapshots.`;
  }

  function renderPeerList(id, list) {
    const ul = byId(id);
    if (!list.length) {
      ul.innerHTML = '<li class="muted">No peers available.</li>';
      return;
    }
    ul.innerHTML = list.map((app) => `
      <li>
        <a href="/test/mini-apps/${encodeURIComponent(app.slug)}">
          <div class="peer-line"><strong>#${safe(app.rank7d)}</strong><span class="${deltaClass(app.deltaRank7d)}">${deltaText(app.deltaRank7d)}</span></div>
          <div>${safe(app.name)}</div>
          <div>${badgeHTML(app)}</div>
        </a>
      </li>
    `).join("");
  }

  function renderPeers(app, apps) {
    const rank = Number.isFinite(app.rank7d) ? app.rank7d : null;
    const nearby = apps
      .filter((a) => a.slug !== app.slug && Number.isFinite(a.rank7d) && rank !== null && Math.abs(a.rank7d - rank) <= 5)
      .sort((a, b) => a.rank7d - b.rank7d)
      .slice(0, 10);

    const sameCategory = apps
      .filter((a) => a.slug !== app.slug && (a.category || "other") === (app.category || "other"))
      .sort((a, b) => (a.rank7d ?? 1e9) - (b.rank7d ?? 1e9))
      .slice(0, 10);

    const rising = apps
      .filter((a) => a.slug !== app.slug && Number.isFinite(a.deltaRank7d) && a.deltaRank7d < 0)
      .sort((a, b) => a.deltaRank7d - b.deltaRank7d)
      .slice(0, 10);

    renderPeerList("nearbyList", nearby);
    renderPeerList("categoryList", sameCategory);
    renderPeerList("risingList", rising);
  }

  function renderNotFound(slug) {
    byId("title").textContent = "Mini App Not Found";
    showStatus("error", `アプリが見つかりません: ${slug || "(empty slug)"}`);
    byId("kpiSection").innerHTML = '<div class="not-found"><p>404: アプリが見つかりません。</p><p><a href="/test/mini-apps/all">← Back to All</a></p></div>';
    byId("trendSection").remove();
    byId("peersSection").remove();
  }

  async function bootstrap() {
    try {
      const slug = getSlugFromPath();
      const res = await fetch("/test/mini-apps/data/latest.json", { cache: "no-store" });
      if (!res.ok) throw new Error("latest.json not found");
      const latest = await res.json();
      const apps = Array.isArray(latest.apps) ? latest.apps : [];

      const app = apps.find((a) => a.slug === slug);
      if (!app) {
        renderNotFound(slug);
        return;
      }

      byId("title").textContent = safe(app.name);
      byId("headerBadges").innerHTML = badgeHTML(app) || '<span class="muted">No flags</span>';
      if (app.links && app.links.official) {
        const link = byId("officialLink");
        link.href = app.links.official;
        link.hidden = false;
      }

      renderKpis(app);
      renderPeers(app, apps);
      const snaps = await loadSnapshots();
      renderTrend(slug, snaps, app);
      showStatus("info", `Data updated: ${latest.updatedAt || "Unknown"}`);
    } catch (_err) {
      showStatus("error", "latest.json が読めません。データ生成状態を確認してください。");
    }
  }

  bootstrap();
})();
