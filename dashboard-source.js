const DS = {
  freshness: document.getElementById("dataFreshness"),
  generatedAt: document.getElementById("dataGeneratedAt"),
  interval: document.getElementById("dataInterval"),
  path: document.getElementById("dataPath"),
  retention: document.getElementById("dataRetention"),
  raw: document.getElementById("raw"),
  status: document.getElementById("status"),
  reload: document.getElementById("reload"),
  alerts: {
    tps_spike: document.getElementById("alertSpike"),
    tps_drop: document.getElementById("alertDrop"),
    gas_high: document.getElementById("alertHighGas"),
  },
};

function dsLocal() {
  return ["localhost", "127.0.0.1", ""].includes(location.hostname) || location.protocol === "file:";
}

function dsBase() {
  if (!dsLocal()) return "";
  return document.querySelector('meta[name="wcwd-history-base"]')?.content?.trim() || "";
}

function dsText(element, value) {
  if (element) element.textContent = value || "—";
}

function dsState(value) {
  const key = String(value || "").toLowerCase().trim();
  if (["ok", "fresh", "normal"].includes(key)) return "fresh";
  if (["delayed", "stale"].includes(key)) return key;
  if (["degraded", "partial", "warn", "alert"].includes(key)) return "degraded";
  if (["error", "unavailable", "empty", "no data"].includes(key)) return "unavailable";
  return "unknown";
}

function dsHelp(state) {
  return {
    fresh: "Summary API is current enough for normal dashboard use.",
    delayed: "Latest snapshot is late, but still usable.",
    stale: "Latest snapshot is old. Read trends as delayed data.",
    degraded: "One or more sources are failing, but partial data is available.",
    unavailable: "Summary path is not available right now.",
    unknown: "Summary state could not be classified.",
  }[dsState(state)];
}

function dsBadge(state) {
  if (!DS.freshness) return;
  const key = dsState(state);
  DS.freshness.className = `v state-badge state-${key}`;
  DS.freshness.textContent = key[0].toUpperCase() + key.slice(1);
  DS.freshness.title = dsHelp(key);
}

function dsDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toLocaleString() : (value || "—");
}

function dsRetention(value) {
  if (!value || typeof value !== "object") return "Retention: summary metadata unavailable.";
  const parts = [];
  if (value.list_limit) parts.push(`list ${value.list_limit}`);
  if (value.events_limit) parts.push(`events ${value.events_limit}`);
  if (value.daily_limit) parts.push(`daily ${value.daily_limit}`);
  if (value.series_days) parts.push(`series ${value.series_days}d`);
  return parts.length ? `Retention: ${parts.join(" · ")}` : "Retention: summary metadata unavailable.";
}

function dsNumber(value, digits) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function dsAlert(decision) {
  const element = DS.alerts[decision?.id];
  if (!element) return;
  if (!decision || decision.state === "insufficient_data") {
    element.textContent = "Insufficient data";
    element.title = "The server-owned policy does not have enough baseline samples.";
  } else if (!decision.active) {
    element.textContent = "Clear";
    element.title = `${decision.label}: ratio ${dsNumber(decision.ratio, 3)}.`;
  } else {
    const digits = decision.id === "gas_high" ? 6 : 2;
    element.textContent = `Active · ${dsNumber(decision.current, digits)} / ${dsNumber(decision.baseline, digits)}`;
    element.title = `${decision.label}: threshold ${decision.threshold_ratio}, ratio ${dsNumber(decision.ratio, 3)}.`;
  }
}

function dsAlerts(summary) {
  const payload = summary?.alerts || summary?.health?.alerts;
  const decisions = Array.isArray(payload?.decisions) ? payload.decisions : null;
  if (!decisions) return false;
  for (const id of Object.keys(DS.alerts)) dsAlert(decisions.find((item) => item?.id === id) || { id, state: "insufficient_data" });
  document.documentElement.dataset.alertPolicySource = "summary-api";
  return true;
}

function dsParseRaw() {
  try {
    const text = DS.raw?.textContent?.trim();
    return text && text !== "—" ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function dsRender(summary) {
  if (!summary || typeof summary !== "object") return false;
  const state = summary.dashboard_state || summary?.freshness?.state || summary.status || "unknown";
  const interval = Number(summary.interval_min || summary?.freshness?.interval_min || summary?.retention?.interval_min);
  dsBadge(state);
  dsText(DS.generatedAt, dsDate(summary.generated_at || summary.ts));
  dsText(DS.interval, Number.isFinite(interval) && interval > 0 ? `${interval} min` : "—");
  dsText(DS.path, dsLocal() ? `${dsBase()}/api/summary` : "/api/summary");
  dsText(DS.retention, `${dsHelp(state)} ${dsRetention(summary.retention)}`);
  dsAlerts(summary);
  return true;
}

async function dsFetchSummaryFallback() {
  try {
    const response = await fetch(`${dsBase()}/api/summary?limit=96&event_limit=20`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    return null;
  }
}

async function dsRefresh() {
  const raw = dsParseRaw();
  if (raw) {
    dsRender(raw);
    if (dsAlerts(raw)) return;
  }
  if (dsRender(await dsFetchSummaryFallback())) return;
  dsBadge(DS.status?.textContent || "unavailable");
  dsText(DS.generatedAt, "Waiting for summary payload");
  dsText(DS.interval, "—");
  dsText(DS.path, dsLocal() ? `${dsBase()}/api/summary` : "/api/summary");
  dsText(DS.retention, "Summary payload has not loaded yet. Retention metadata is unavailable.");
  document.documentElement.dataset.alertPolicySource = "unavailable";
}

document.addEventListener("DOMContentLoaded", () => {
  if (DS.raw) new MutationObserver(dsRefresh).observe(DS.raw, { childList: true, characterData: true, subtree: true });
  DS.reload?.addEventListener("click", () => setTimeout(dsRefresh, 600));
  dsRefresh();
});
