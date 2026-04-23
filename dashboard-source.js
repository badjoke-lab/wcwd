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

function dsFormatState(state) {
  const key = String(state || "").toLowerCase();
  if (key === "ok" || key === "fresh") return "OK / fresh";
  if (key === "delayed") return "Delayed";
  if (key === "stale") return "Stale";
  if (key === "degraded" || key === "partial") return "Degraded";
  if (key === "error" || key === "unavailable") return "Unavailable";
  return state || "—";
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

function dsRenderFromSummary(summary) {
  if (!summary || typeof summary !== "object") return false;
  const freshnessState = summary?.dashboard_state || summary?.freshness?.state || summary?.status || "—";
  const generatedAt = summary?.generated_at || summary?.ts || "—";
  const intervalMin = summary?.interval_min || summary?.freshness?.interval_min || summary?.retention?.interval_min || null;
  const sourcePath = dsIsLocalMode() ? `${dsApiBase()}/api/summary` : "/api/summary";
  dsSetText(DASHBOARD_SOURCE_UI.freshness, dsFormatState(freshnessState));
  dsSetText(DASHBOARD_SOURCE_UI.generatedAt, dsFormatGeneratedAt(generatedAt));
  dsSetText(DASHBOARD_SOURCE_UI.interval, dsFormatInterval(intervalMin));
  dsSetText(DASHBOARD_SOURCE_UI.path, sourcePath);
  dsSetText(DASHBOARD_SOURCE_UI.retention, dsBuildRetentionText(summary?.retention));
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
  dsSetText(DASHBOARD_SOURCE_UI.freshness, dsFormatState(DASHBOARD_SOURCE_UI.status?.textContent || "—"));
  dsSetText(DASHBOARD_SOURCE_UI.generatedAt, "Waiting for summary payload");
  dsSetText(DASHBOARD_SOURCE_UI.interval, "—");
  dsSetText(DASHBOARD_SOURCE_UI.path, dsIsLocalMode() ? `${dsApiBase()}/api/summary` : "/api/summary");
  dsSetText(DASHBOARD_SOURCE_UI.retention, "Retention: unavailable until summary payload loads.");
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
  dsAttachObservers();
  dsRefreshCard();
});
