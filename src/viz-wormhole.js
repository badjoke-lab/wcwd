import { RETENTION } from "./retention.js";

const ZERO_METRICS = Object.freeze({
  activity: 0,
  matchedRoutes: 0,
  inFlow: 0,
  outFlow: 0,
  depositCount: 0,
  withdrawCount: 0,
  uniqueUsers: 0,
  samples: 0,
});

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, num(value, 0)));
}

export function normalizeVizState(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (raw === "ok" || raw === "fresh" || raw === "normal") return "fresh";
  if (raw === "delayed") return "delayed";
  if (raw === "stale") return "stale";
  if (raw === "degraded" || raw === "partial" || raw === "warn" || raw === "alert") return "degraded";
  if (raw === "error" || raw === "unavailable" || raw === "empty" || raw === "invalid" || raw === "no data") return "unavailable";
  return "unknown";
}

export function normalizeVizAddress(addr) {
  const s = String(addr || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(s) ? s : "";
}

export function parseVizAddresses(url) {
  const q = url.searchParams.get("addresses") || "";
  return Array.from(new Set(q.split(",").map(normalizeVizAddress).filter(Boolean)));
}

function metricFrom(source, key, fallback = 0) {
  if (source?.metrics && source.metrics[key] !== undefined) return source.metrics[key];
  return source?.[key] ?? fallback;
}

function buildMetrics(source) {
  return {
    activity: clamp01(metricFrom(source, "activity")),
    matchedRoutes: Math.max(0, num(metricFrom(source, "matchedRoutes"), 0)),
    inFlow: clamp01(metricFrom(source, "inFlow")),
    outFlow: clamp01(metricFrom(source, "outFlow")),
    depositCount: Math.max(0, num(metricFrom(source, "depositCount"), 0)),
    withdrawCount: Math.max(0, num(metricFrom(source, "withdrawCount"), 0)),
    uniqueUsers: Math.max(0, num(metricFrom(source, "uniqueUsers"), 0)),
    samples: Math.max(0, num(metricFrom(source, "samples"), 0)),
  };
}

function buildWindow(source) {
  const srcWindow = source?.window && typeof source.window === "object" ? source.window : {};
  return {
    blocks: Math.max(0, num(srcWindow.blocks ?? source?.windowBlocks, 0)),
    from: srcWindow.from ?? source?.fromBlock ?? null,
    to: srcWindow.to ?? source?.toBlock ?? null,
  };
}

function buildNotes(source, statusCode, fallbackReason) {
  const notes = [];
  if (Array.isArray(source?.notes)) notes.push(...source.notes.map(String).filter(Boolean));
  if (fallbackReason) notes.push(fallbackReason);
  if (statusCode && statusCode >= 400) notes.push(`base_status_${statusCode}`);
  return Array.from(new Set(notes));
}

export function buildWormholeContract({ source = null, url, statusCode = 200, fallbackReason = "" }) {
  const addresses = parseVizAddresses(url);
  const hasSource = !!source && typeof source === "object";
  const metrics = hasSource ? buildMetrics(source) : { ...ZERO_METRICS };
  const state = hasSource ? normalizeVizState(source.state || source.status || (source.ok === false ? "degraded" : "fresh")) : "unavailable";
  const notes = buildNotes(source, statusCode, fallbackReason);
  const ok = hasSource ? source.ok !== false : false;
  const contract = {
    ok,
    source: String(source?.source || (hasSource ? "rpc" : "fallback")),
    state,
    generated_at: source?.generated_at || source?.ts || new Date().toISOString(),
    window: buildWindow(source),
    selection: {
      addresses,
      configured: addresses.length > 0,
    },
    metrics,
    notes,
    retention: {
      recent_points: RETENTION.visualizer_first_target.points,
    },
  };

  return {
    ...contract,
    // Backward-compatible aliases for the current frontend.
    activity: metrics.activity,
    matchedRoutes: metrics.matchedRoutes,
    inFlow: metrics.inFlow,
    outFlow: metrics.outFlow,
    depositCount: metrics.depositCount,
    withdrawCount: metrics.withdrawCount,
    uniqueUsers: metrics.uniqueUsers,
    samples: metrics.samples,
    bridgeConfigured: contract.selection.configured,
    selectedBridges: contract.selection.addresses,
    windowBlocks: contract.window.blocks,
  };
}

export async function handleWormholeViz({ request, env, ctx, baseWorker }) {
  const url = new URL(request.url);
  let response = null;
  let body = null;
  try {
    response = await baseWorker.fetch(request, env, ctx);
    body = await response.clone().json();
  } catch {
    body = null;
  }

  const statusCode = response?.status || 503;
  const hasUsableBody = body && typeof body === "object" && !Array.isArray(body);
  const payload = buildWormholeContract({
    source: hasUsableBody ? body : null,
    url,
    statusCode,
    fallbackReason: hasUsableBody ? "" : "base_viz_payload_unavailable",
  });
  const headers = new Headers(response?.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload, null, 2), { status: 200, headers });
}
