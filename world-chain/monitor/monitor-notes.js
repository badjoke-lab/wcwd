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

function mnEnsureNote(id, targetId, text) {
  let note = document.getElementById(id);
  if (!note) {
    const target = document.getElementById(targetId);
    if (!target) return null;
    note = document.createElement("p");
    note.id = id;
    note.className = "muted small";
    target.insertAdjacentElement("afterend", note);
  }
  if (text && note.textContent !== text) note.textContent = text;
  return note;
}

function mnUnavailable(id, reason) {
  const element = document.getElementById(id);
  if (!element) return;
  if (element.textContent !== "Unavailable") element.textContent = "Unavailable";
  element.title = reason;
}

function mnFormatObservedAt(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? new Date(ms).toLocaleString() : "Unavailable";
}

function renderMonitorMetricSemantics(summary) {
  const latest = summary?.latest && typeof summary.latest === "object" ? summary.latest : null;
  const noMeasuredSource = [
    "tx24h",
    "newAddr24h",
    "totalAddr",
    "wldChg24h",
    "wldMc",
    "wldVol",
    "wldSpark7d",
    "chartWld7d",
    "pctContract",
    "pctOther",
  ];
  for (const id of noMeasuredSource) {
    mnUnavailable(id, "This metric is not measured by the current WCWD source.");
  }

  mnEnsureNote(
    "tx24hNote",
    "tx24h",
    "Unavailable: WCWD has no measured rolling 24-hour transaction counter. TPS is not multiplied into a daily total."
  );
  mnEnsureNote(
    "tpsNote",
    "tps",
    Number.isFinite(latest?.tps)
      ? "Estimated from a sampled block window; it is not a chain-wide daily count."
      : "Unavailable: the latest snapshot has no TPS estimate."
  );
  mnEnsureNote(
    "gasNote",
    "gas",
    Number.isFinite(latest?.gas_gwei)
      ? "Observed in the latest stored snapshot."
      : "Unavailable: the latest snapshot has no gas value."
  );
  mnSet("newAddrNote", "Unavailable: WCWD does not run a full address indexer.");
  mnSet("totalAddrNote", "Unavailable: WCWD does not run a full address indexer.");

  const sourceAnchor = document.getElementById("snapshotGen") || document.getElementById("freshAsOf");
  if (sourceAnchor) {
    const observed = mnEnsureNote("metricObservedAt", sourceAnchor.id);
    if (observed) observed.textContent = `Latest observation: ${mnFormatObservedAt(latest?.observed_at || latest?.ts)}`;
    const source = mnEnsureNote("metricSource", "metricObservedAt");
    if (source) source.textContent = `Metric source: ${latest?.source || (latest ? "Existing KV snapshot" : "Unavailable")}`;
  }

  const daily = summary?.daily;
  if (daily?.available === true && daily?.calendar_basis === "utc_calendar_day") {
    mnSet("dailyDate", `${daily.date} UTC`);
    mnEnsureNote(
      "dailyNote",
      "dailyDate",
      `Verified UTC calendar day: ${daily.day_start_utc} to ${daily.day_end_utc_exclusive} (exclusive).`
    );
  } else {
    for (const id of [
      "dailyDate",
      "dailyHealth",
      "dailyTpsMax",
      "dailyTpsMin",
      "dailyGasMax",
      "dailyWldUsdChange",
      "dailyWldJpyChange",
    ]) {
      mnUnavailable(id, "The stored record does not prove UTC calendar-day boundaries.");
    }
    mnEnsureNote(
      "dailyNote",
      "dailyDate",
      `Unavailable: ${daily?.reason || "no_data"}. A daily compact is shown only when its UTC calendar boundary is explicit.`
    );
  }
}

function renderMonitorNotes(summary) {
  renderMonitorMetricSemantics(summary);
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
    `Read 24h charts as recent stored samples, 7d charts as hourly series, and verified Daily records as UTC calendar summaries. Retention: ${mnRetention(summary)}.`
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
  const tx24h = document.getElementById("tx24h");
  if (tx24h) {
    const semanticObserver = new MutationObserver(() => { renderMonitorMetricSemantics(mnParseRawSummary()); });
    semanticObserver.observe(tx24h, { childList: true, characterData: true, subtree: true });
  }
  MONITOR_NOTE_UI.reload?.addEventListener("click", () => {
    setTimeout(() => { refreshMonitorNotes(); }, 800);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  attachMonitorNoteObservers();
  refreshMonitorNotes();
});
