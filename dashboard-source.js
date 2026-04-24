const DASHBOARD_SOURCE_UI = {
  freshness: document.getElementById("dataFreshness"),
  generatedAt: document.getElementById("dataGeneratedAt"),
  interval: document.getElementById("dataInterval"),
  path: document.getElementById("dataPath"),
  retention: document.getElementById("dataRetention"),
  raw: document.getElementById("raw"),
  status: document.getElementById("status"),
  reload: document.getElementById("reload"),
};

function dsIsLocalMode() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "" || location.protocol === "file:";
}

function dsApiBase() {
  if (!dsIsLocalMode()) return "";
  const meta = document.querySelector('meta[name="wcwd-history-base"]');
  return meta?.getAttribute("content")?.trim() || "https://wcwd-history.badjoke-lab.workers.dev";
}

function dsSetText(el, value) {
  if (!el) return;
  el.textContent = value || "—";
}

function dsNormalizeState(state) {
  const key = String(state || "").toLowerCase().trim();
  if (key === "ok" || key === "fresh" || key === "normal") return "fresh";
  if (key === "delayed") return "delayed";
  if (key === "stale") return "stale";
  if (key === "degraded" || key === "partial" || key === "warn" || key === "alert") return "degraded";
  if (key === "error" || key === "unavailable" || key === "empty" || key === "no data") return "unavailable";
  return "unknown";
}

function dsStateLabel(state) {
  const key = dsNormalizeState(state);
  if (key === "fresh") return "Fresh";
  if (key === "delayed") return "Delayed";
  if (key === "stale") return "Stale";
  if (key === "degraded") return "Degraded";
  if (key === "unavailable") return "Unavailable";
  return "Unknown";
}

function dsStateHelp(state) {
  const key = dsNormalizeState(state);
  if (key === "fresh") return "Summary API is current enough for normal dashboard use.";
  if (key === "delayed") return "Latest snapshot is late, but still usable.";
  if (key === "stale") return "Latest snapshot is old. Read trends as delayed data.";
  if (key === "degraded") return "One or more sources are failing, but partial data is available.";
  if (key === "unavailable") return "Summary path is not available right now.";
  return "Summary state could not be classified.";
}

function dsRenderStateBadge(el, state) {
  if (!el) return;
  const key = dsNormalizeState(state);
  el.className = `v state-badge state-${key}`;
  el.textContent = dsStateLabel(state);
  el.title = dsStateHelp(state);
}

function dsFormatGeneratedAt(value) {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return String(value);
  return new Date(ms).toLocaleString();
}

function dsFormatInterval(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${n} min` : "—";
}

function dsParseRawSummary() {
  const rawText = DASHBOARD_SOURCE_UI.raw?.textContent?.trim();
  if (!rawText || rawText === "—") return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function dsBuildRetentionText(retention) {
  if (!retention || typeof retention !== "object") return "Retention: summary metadata unavailable.";
  const pieces = [];
  if (retention.list_limit) pieces.push(`list ${retention.list_limit}`);
  if (retention.events_limit) pieces.push(`events ${retention.events_limit}`);
  if (retention.daily_limit) pieces.push(`daily ${retention.daily_limit}`);
  if (retention.series_days) pieces.push(`series ${retention.series_days}d`);
  return pieces.length ? `Retention: ${pieces.join(" · ")}` : "Retention: summary metadata unavailable.";
}

function dsExtractFreshnessState(summary) {
  return summary?.dashboard_state || summary?.freshness?.state || summary?.status || "unknown";
}

function dsRenderFromSummary(summary) {
  if (!summary || typeof summary !== "object") return false;
  const freshnessState = dsExtractFreshnessState(summary);
  const generatedAt = summary?.generated_at || summary?.ts || "—";
  const intervalMin = summary?.interval_min || summary?.freshness?.interval_min || summary?.retention?.interval_min || null;
  const sourcePath = dsIsLocalMode() ? `${dsApiBase()}/api/summary` : "/api/summary";
  dsRenderStateBadge(DASHBOARD_SOURCE_UI.freshness, freshnessState);
  dsSetText(DASHBOARD_SOURCE_UI.generatedAt, dsFormatGeneratedAt(generatedAt));
  dsSetText(DASHBOARD_SOURCE_UI.interval, dsFormatInterval(intervalMin));
  dsSetText(DASHBOARD_SOURCE_UI.path, sourcePath);
  dsSetText(DASHBOARD_SOURCE_UI.retention, `${dsStateHelp(freshnessState)} ${dsBuildRetentionText(summary?.retention)}`);
  return true;
}

async function dsFetchSummaryFallback() {
  try {
    const res = await fetch(`${dsApiBase()}/api/summary?limit=1&event_limit=1`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function dsRefreshCard() {
  const rawSummary = dsParseRawSummary();
  if (dsRenderFromSummary(rawSummary)) return;
  const fetched = await dsFetchSummaryFallback();
  if (dsRenderFromSummary(fetched)) return;
  dsRenderStateBadge(DASHBOARD_SOURCE_UI.freshness, DASHBOARD_SOURCE_UI.status?.textContent || "unavailable");
  dsSetText(DASHBOARD_SOURCE_UI.generatedAt, "Waiting for summary payload");
  dsSetText(DASHBOARD_SOURCE_UI.interval, "—");
  dsSetText(DASHBOARD_SOURCE_UI.path, dsIsLocalMode() ? `${dsApiBase()}/api/summary` : "/api/summary");
  dsSetText(DASHBOARD_SOURCE_UI.retention, "Summary payload has not loaded yet. Retention metadata is unavailable.");
}

function dsCreateLink(href, text, variant = "ghost") {
  const a = document.createElement("a");
  a.href = href;
  a.className = variant === "primary" ? "btn secondary" : "btn ghost";
  a.textContent = text;
  return a;
}

function dsAddRoleMap() {
  if (document.getElementById("home-role-map")) return;
  const quickLinks = document.querySelector(".quick-links");
  const dashboard = document.getElementById("dashboard");
  if (!quickLinks || !dashboard) return;

  const section = document.createElement("section");
  section.className = "card role-map";
  section.id = "home-role-map";
  section.setAttribute("aria-labelledby", "home-role-map-title");

  const title = document.createElement("h2");
  title.id = "home-role-map-title";
  title.textContent = "Home / Monitor map";

  const lead = document.createElement("p");
  lead.className = "muted";
  lead.textContent = "Home is the entry point and short snapshot area. The embedded Monitor below is the detailed, server-owned dashboard.";

  const grid = document.createElement("div");
  grid.className = "role-map-grid";

  const homeCard = document.createElement("article");
  homeCard.className = "role-card";
  homeCard.innerHTML = "<h3>Home overview</h3><p class=\"muted\">Use this area for navigation, tool entry, and compact snapshots only.</p>";
  const homeActions = document.createElement("div");
  homeActions.className = "role-actions";
  homeActions.appendChild(dsCreateLink("/world-chain/", "World Chain tools", "primary"));
  homeActions.appendChild(dsCreateLink("/world-chain/sell-impact/", "Sell Impact"));
  homeCard.appendChild(homeActions);

  const monitorCard = document.createElement("article");
  monitorCard.className = "role-card";
  monitorCard.innerHTML = "<h3>Detailed Monitor</h3><p class=\"muted\">Use this section for live health, history, trends, events, and source freshness.</p>";
  const monitorActions = document.createElement("div");
  monitorActions.className = "role-actions";
  monitorActions.appendChild(dsCreateLink("#dashboard", "Jump to Monitor", "primary"));
  monitorActions.appendChild(dsCreateLink("#data-source-title", "Data Source"));
  monitorCard.appendChild(monitorActions);

  grid.appendChild(homeCard);
  grid.appendChild(monitorCard);
  section.appendChild(title);
  section.appendChild(lead);
  section.appendChild(grid);
  quickLinks.insertAdjacentElement("afterend", section);

  const hero = dashboard.querySelector(".hero");
  if (hero && !hero.querySelector(".section-eyebrow")) {
    const eyebrow = document.createElement("div");
    eyebrow.className = "section-eyebrow";
    eyebrow.textContent = "Detailed monitor";
    hero.insertBefore(eyebrow, hero.firstChild);
  }
}

function dsAttachObservers() {
  if (DASHBOARD_SOURCE_UI.raw) {
    const rawObserver = new MutationObserver(() => { dsRefreshCard(); });
    rawObserver.observe(DASHBOARD_SOURCE_UI.raw, { childList: true, characterData: true, subtree: true });
  }
  if (DASHBOARD_SOURCE_UI.reload) {
    DASHBOARD_SOURCE_UI.reload.addEventListener("click", () => {
      setTimeout(() => { dsRefreshCard(); }, 600);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  dsAddRoleMap();
  dsAttachObservers();
  dsRefreshCard();
});
