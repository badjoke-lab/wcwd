(function () {
  "use strict";

  const categories = ["finance", "games", "social", "utility", "shopping", "ai", "other"];
  const fmtNum = (v) => Number.isFinite(v) ? new Intl.NumberFormat("en-US").format(v) : "—";
  const safe = (v) => (v === null || v === undefined || v === "") ? "—" : String(v);

  const byId = (id) => document.getElementById(id);

  function showStatus(type, msg) {
    const mount = byId("stateMount");
    mount.innerHTML = "";
    if (!msg) return;
    const div = document.createElement("div");
    div.className = "status " + (type || "info");
    div.textContent = msg;
    mount.appendChild(div);
  }

  function deltaView(delta) {
    if (!Number.isFinite(delta)) return "—";
    if (delta < 0) return "↑" + Math.abs(delta);
    if (delta > 0) return "↓" + delta;
    return "0";
  }

  function deltaClass(delta) {
    if (!Number.isFinite(delta) || delta === 0) return "delta-flat";
    return delta < 0 ? "delta-up" : "delta-down";
  }

  function renderTopNow(apps) {
    const body = byId("topNowBody");
    body.innerHTML = "";

    const rows = apps.slice().sort((a, b) => (a.rank7d ?? 1e9) - (b.rank7d ?? 1e9)).slice(0, 20);
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No ranking rows available.</td></tr>';
      return;
    }

    for (const app of rows) {
      const tr = document.createElement("tr");
      const hot = app.flags && app.flags.hot;
      const isNew = app.flags && app.flags.new;
      const drop = app.flags && app.flags.drop;
      const badges = [
        hot ? '<span class="badge hot">HOT</span>' : "",
        isNew ? '<span class="badge new">NEW</span>' : "",
        drop ? '<span class="badge drop">DROP</span>' : "",
      ].filter(Boolean).join(" ");

      tr.innerHTML = [
        `<td>${safe(app.rank7d)}</td>`,
        `<td>${safe(app.name)}${badges ? `<br>${badges}` : ""}</td>`,
        `<td>${fmtNum(app.value7d)}</td>`,
        `<td>${fmtNum(app.valueAll)}</td>`,
        `<td class="${deltaClass(app.deltaRank7d)}">${deltaView(app.deltaRank7d)}</td>`
      ].join("");
      body.appendChild(tr);
    }
  }

  function renderSignalList(id, list) {
    const ul = byId(id);
    ul.innerHTML = "";
    if (!list.length) {
      ul.innerHTML = '<li class="muted">No signals yet.</li>';
      return;
    }
    for (const app of list) {
      const li = document.createElement("li");
      li.innerHTML = `${safe(app.name)} <span class="${deltaClass(app.deltaRank7d)}">${deltaView(app.deltaRank7d)}</span> · rank ${safe(app.rank7d)}`;
      ul.appendChild(li);
    }
  }

  function renderSignals(apps) {
    const risers = apps
      .filter((a) => Number.isFinite(a.deltaRank7d) && a.deltaRank7d < 0)
      .sort((a, b) => a.deltaRank7d - b.deltaRank7d)
      .slice(0, 10);
    const fallers = apps
      .filter((a) => Number.isFinite(a.deltaRank7d) && a.deltaRank7d > 0)
      .sort((a, b) => b.deltaRank7d - a.deltaRank7d)
      .slice(0, 10);
    const newer = apps
      .filter((a) => a.flags && a.flags.new)
      .sort((a, b) => (a.rank7d ?? 1e9) - (b.rank7d ?? 1e9))
      .slice(0, 10);

    renderSignalList("risersList", risers);
    renderSignalList("fallersList", fallers);
    renderSignalList("newList", newer);
  }

  function renderCategoryTable(apps, category) {
    const body = byId("categoryBody");
    body.innerHTML = "";
    const rows = apps
      .filter((a) => (a.category || "other") === category)
      .sort((a, b) => (a.rank7d ?? 1e9) - (b.rank7d ?? 1e9))
      .slice(0, 10);

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="4" class="muted">No apps in ${category} yet.</td></tr>`;
      return;
    }

    for (const app of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${safe(app.rank7d)}</td><td>${safe(app.name)}</td><td>${fmtNum(app.value7d)}</td><td class="${deltaClass(app.deltaRank7d)}">${deltaView(app.deltaRank7d)}</td>`;
      body.appendChild(tr);
    }
  }

  function renderCategoryPills(apps) {
    const row = byId("categoryPills");
    row.innerHTML = "";
    let active = categories[0];

    const paint = () => {
      for (const btn of row.querySelectorAll("button")) {
        btn.setAttribute("aria-pressed", btn.dataset.cat === active ? "true" : "false");
      }
      renderCategoryTable(apps, active);
    };

    for (const cat of categories) {
      const btn = document.createElement("button");
      btn.className = "pill";
      btn.type = "button";
      btn.dataset.cat = cat;
      btn.textContent = cat;
      btn.addEventListener("click", function () {
        active = cat;
        paint();
      });
      row.appendChild(btn);
    }

    paint();
  }

  function renderDigest(apps) {
    const mount = byId("digestList");
    mount.innerHTML = "";

    if (apps.length < 3) {
      mount.innerHTML = "<li class='muted'>Digest will appear after more snapshots accumulate.</li>";
      return;
    }

    const risers = apps.filter((a) => Number.isFinite(a.deltaRank7d) && a.deltaRank7d < 0)
      .sort((a, b) => a.deltaRank7d - b.deltaRank7d).slice(0, 3).map((a) => a.name);
    const newEntries = apps.filter((a) => a.flags && a.flags.new)
      .sort((a, b) => (a.rank7d ?? 1e9) - (b.rank7d ?? 1e9)).slice(0, 3).map((a) => a.name);
    const drops = apps.filter((a) => Number.isFinite(a.deltaRank7d) && a.deltaRank7d > 0)
      .sort((a, b) => b.deltaRank7d - a.deltaRank7d).slice(0, 3).map((a) => a.name);

    const lines = [
      `Top risers this week: ${risers.length ? risers.join(", ") : "No major risers detected."}`,
      `New entries: ${newEntries.length ? newEntries.join(", ") : "No new entries this week."}`,
      `Notable drops: ${drops.length ? drops.join(", ") : "No notable drops this week."}`
    ];

    for (const line of lines) {
      const li = document.createElement("li");
      li.textContent = line;
      mount.appendChild(li);
    }
  }

  async function renderWorldchainPulse() {
    const el = byId("worldchainPulse");
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3000);
      const res = await fetch("/api/hello", { cache: "no-store", signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error("status " + res.status);
      el.textContent = "Pulse: Online (core endpoint reachable).";
    } catch (_err) {
      el.textContent = "Pulse unavailable right now. Check infra monitor for endpoint health.";
    }
  }

  async function bootstrap() {
    byId("updatedAt").textContent = "Data updated: Unknown";
    try {
      const res = await fetch("/test/mini-apps/data/latest.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load latest.json");
      const data = await res.json();
      const apps = Array.isArray(data.apps) ? data.apps : [];

      byId("updatedAt").textContent = `Data updated: ${data.updatedAt || "Unknown"}`;

      if (!apps.length) {
        showStatus("warn", "No app rows found in latest.json. Run PR1 actions to fetch/build snapshots and regenerate latest.json.");
      } else {
        showStatus("info", "Showing rankings from local latest.json (no API)." );
      }

      renderTopNow(apps);
      renderSignals(apps);
      renderCategoryPills(apps);
      renderDigest(apps);
    } catch (_err) {
      showStatus("error", "latest.json is missing or unreadable. Confirm PR1 actions and daily build scripts generated test/mini-apps/data/latest.json.");
      renderTopNow([]);
      renderSignals([]);
      renderCategoryPills([]);
      renderDigest([]);
    }

    renderWorldchainPulse();
  }

  bootstrap();
})();
