const MONITOR_NOTE_UI = {
  historyMode: document.getElementById("monitorHistoryMode"),
  historyWindow: document.getElementById("monitorHistoryWindow"),
  seriesMode: document.getElementById("monitorSeriesMode"),
  fallbackMode: document.getElementById("monitorFallbackMode"),
  note: document.getElementById("monitorHistoryNote"),
  raw: document.getElementById("raw"),
  errors: document.getElementById("errors"),
  reload: document.getElementById("reload"),
};

function monitorIsLocalMode() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "" || location.protocol === "file:";
}

function monitorApiBase() {
  if (!monitorIsLocalMode()) return "";
  const meta = document.querySelector('meta[name="wcwd-history-base"]');
  return meta?.getAttribute("content")?.trim() || "https://wcwd-history.badjoke-lab.workers.dev";
}

function mnSet(idOrEl, value) {
  const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
  if (el) el.textContent = value || "—";
}

function mnNum(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function mnParseRawSummary() {
  const raw = MONITOR_NOTE_UI.raw?.textContent?.trim();
  if (!raw || raw === "—") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mnHistoryCount(summary) {
  if (Array.isArray(summary?.history)) return summary.history.length;
  if (summary?.latest && typeof summary.latest === "object") return 1;
  return 0;
}

function mnInterval(summary) {
  const candidates = [summary?.interval_min, summary?.freshness?.interval_min, summary?.retention?.interval_min];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function mnRetention(summary) {
  const r = summary?.retention || {};
  const parts = [];
  if (r.list_limit) parts.push(`list ${r.list_limit}`);
  if (r.events_limit) parts.push(`events ${r.events_limit}`);
  if (r.daily_limit) parts.push(`daily ${r.daily_limit}`);
  if (r.series_days) parts.push(`series ${r.series_days}d`);
  return parts.length ? parts.join(" · ") : "metadata unavailable";
}

function mnState(summary) {
  const raw = String(summary?.dashboard_state || summary?.freshness?.state || summary?.status || "unknown").toLowerCase();
  if (raw === "ok" || raw === "fresh" || raw === "normal") return "fresh";
  if (raw === "delayed") return "delayed";
  if (raw === "stale") return "stale";
  if (raw === "degraded" || raw === "partial") return "degraded";
  if (raw === "error" || raw === "unavailable") return "unavailable";
  return "unknown";
}

function mnErrorText() {
  const txt = MONITOR_NOTE_UI.errors?.textContent?.trim() || "";
  return txt && txt !== "—" ? txt : "";
}

function renderMonitorNotes(summary) {
  if (!summary || typeof summary !== "object") {
    mnSet(MONITOR_NOTE_UI.historyMode, "Waiting");
    mnSet(MONITOR_NOTE_UI.historyWindow, "—");
    mnSet(MONITOR_NOTE_UI.seriesMode, "Waiting");
    mnSet(MONITOR_NOTE_UI.fallbackMode, mnErrorText() ? "Fallback / error visible" : "Waiting for summary");
    mnSet(MONITOR_NOTE_UI.note, "This panel reads the same summary payload as the detailed monitor. If the summary is unavailable, check Debug → Errors.");
    return;
  }

  const count = mnHistoryCount(summary);
  const interval = mnInterval(summary);
  const approxHours = count && interval ? (count * interval) / 60 : null;
  const state = mnState(summary);
  const usedFallback = !!mnErrorText();
  const seriesDays = Number(summary?.retention?.series_days);

  mnSet(MONITOR_NOTE_UI.historyMode, count > 1 ? "Summary history" : count === 1 ? "Latest only" : "No history");
  mnSet(MONITOR_NOTE_UI.historyWindow, count && interval ? `${mnNum(count)} points · ~${mnNum(approxHours, 1)}h · ${mnNum(interval)}m interval` : "—");
  mnSet(MONITOR_NOTE_UI.seriesMode, Number.isFinite(seriesDays) && seriesDays > 0 ? `Series API · ${mnNum(seriesDays)}d bounded` : "Series API · bounded");
  mnSet(MONITOR_NOTE_UI.fallbackMode, usedFallback ? `Fallback / partial · ${state}` : `Normal · ${state}`);
  mnSet(
    MONITOR_NOTE_UI.note,
    `Read 24h charts as recent KV samples, 7d charts as hourly series, and Events/Daily as compact summaries. Retention: ${mnRetention(summary)}.`
  );
}

async function fetchMonitorSummaryFallback() {
  try {
    const res = await fetch(`${monitorApiBase()}/api/summary?limit=96&event_limit=5`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function refreshMonitorNotes() {
  const rawSummary = mnParseRawSummary();
  if (rawSummary) {
    renderMonitorNotes(rawSummary);
    return;
  }
  const fetched = await fetchMonitorSummaryFallback();
  renderMonitorNotes(fetched);
}

function attachMonitorNoteObservers() {
  if (MONITOR_NOTE_UI.raw) {
    const rawObserver = new MutationObserver(() => { refreshMonitorNotes(); });
    rawObserver.observe(MONITOR_NOTE_UI.raw, { childList: true, characterData: true, subtree: true });
  }
  if (MONITOR_NOTE_UI.errors) {
    const errorObserver = new MutationObserver(() => { refreshMonitorNotes(); });
    errorObserver.observe(MONITOR_NOTE_UI.errors, { childList: true, characterData: true, subtree: true });
  }
  MONITOR_NOTE_UI.reload?.addEventListener("click", () => {
    setTimeout(() => { refreshMonitorNotes(); }, 800);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  attachMonitorNoteObservers();
  refreshMonitorNotes();
});
