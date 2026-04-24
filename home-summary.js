const HOME_SUMMARY_BASE = (() => {
  const h = location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h === "" || location.protocol === "file:";
  if (!isLocal) return "";
  const meta = document.querySelector('meta[name="wcwd-history-base"]');
  return meta?.getAttribute("content")?.trim() || "https://wcwd-history.badjoke-lab.workers.dev";
})();

const HOME_SUMMARY_API = `${HOME_SUMMARY_BASE}/api/summary?limit=96&event_limit=3`;

function homeSet(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

function homeNum(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function homeUsd(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(digits)}`;
}

function homeJpy(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `¥${n.toFixed(digits)}`;
}

function homePct(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function homeState(summary) {
  const raw = String(summary?.dashboard_state || summary?.freshness?.state || summary?.status || "unknown").toLowerCase();
  if (raw === "ok" || raw === "fresh" || raw === "normal") return "Fresh";
  if (raw === "delayed") return "Delayed";
  if (raw === "stale") return "Stale";
  if (raw === "degraded" || raw === "partial") return "Degraded";
  if (raw === "error" || raw === "unavailable") return "Unavailable";
  return "Unknown";
}

function homeSpark(values) {
  const chars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const nums = values.filter((v) => Number.isFinite(Number(v))).map(Number);
  if (!nums.length) return "—";
  if (nums.length === 1) return chars[4];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return chars[4].repeat(Math.min(nums.length, 48));
  return nums.slice(-48).map((v) => {
    const idx = Math.max(0, Math.min(chars.length - 1, Math.round(((v - min) / (max - min)) * (chars.length - 1))));
    return chars[idx];
  }).join("");
}

function latestFrom(summary) {
  const hist = Array.isArray(summary?.history) ? summary.history : [];
  return hist[hist.length - 1] || summary?.latest || null;
}

function renderHomeSummary(summary) {
  const latest = latestFrom(summary);
  const hist = Array.isArray(summary?.history) ? summary.history : [];

  homeSet("homeFreshness", homeState(summary));
  homeSet("homeGeneratedAt", summary?.generated_at ? new Date(summary.generated_at).toLocaleString() : "—");

  homeSet("homeWldUsd", homeUsd(latest?.wld_usd, 4));
  homeSet("homeWldJpy", homeJpy(latest?.wld_jpy, 2));
  homeSet("homeWld24h", homePct(latest?.wld_change_24h, 2));
  homeSet("homeWldTrend", homeSpark(hist.map((p) => p?.wld_usd)));

  homeSet("homeTps", homeNum(latest?.tps, 2));
  homeSet("homeGas", homeNum(latest?.gas_gwei, 6));
  homeSet("homeTx24h", homeNum(latest?.tx24h, 0));
  homeSet("homeNetworkState", homeState(summary));
}

function renderHomeSummaryError(message) {
  homeSet("homeFreshness", "Unavailable");
  homeSet("homeGeneratedAt", message || "Summary unavailable");
  homeSet("homeWldUsd", "—");
  homeSet("homeWldJpy", "—");
  homeSet("homeWld24h", "—");
  homeSet("homeWldTrend", "—");
  homeSet("homeTps", "—");
  homeSet("homeGas", "—");
  homeSet("homeTx24h", "—");
  homeSet("homeNetworkState", "Unavailable");
}

async function loadHomeSummary() {
  try {
    const res = await fetch(HOME_SUMMARY_API, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    renderHomeSummary(json);
  } catch (error) {
    renderHomeSummaryError(error?.message || "summary_fetch_failed");
  }
}

document.addEventListener("DOMContentLoaded", loadHomeSummary);
