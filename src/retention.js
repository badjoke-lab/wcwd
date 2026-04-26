export const RETENTION = Object.freeze({
  interval_min: 15,
  summary_list: {
    recommended_points: 288,
    hard_max_points: 672,
  },
  series_7d_hourly: {
    days: 7,
    points_per_metric: 168,
  },
  events: {
    recommended_items: 50,
    hard_max_items: 100,
  },
  daily: {
    recommended_days: 30,
    hard_max_days: 90,
  },
  sellimpact_watchlist: {
    latest_objects: 1,
    list_points: 96,
  },
  visualizer_first_target: {
    points: 96,
  },
  oracle_feed_checks: {
    recent_points: 96,
  },
});

export const RETENTION_KEYS = Object.freeze({
  meta: "meta:retention",
  events: "events:list",
});

export function buildRetentionMetadata(extra = {}) {
  return {
    ok: true,
    policy_version: "2026-04-25",
    interval_min: RETENTION.interval_min,
    summary_list: RETENTION.summary_list,
    series_7d_hourly: RETENTION.series_7d_hourly,
    events: RETENTION.events,
    daily: RETENTION.daily,
    sellimpact_watchlist: RETENTION.sellimpact_watchlist,
    visualizer_first_target: RETENTION.visualizer_first_target,
    oracle_feed_checks: RETENTION.oracle_feed_checks,
    generated_at: new Date().toISOString(),
    ...extra,
  };
}

export function clampLimit(value, { min = 1, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function trimArray(value, max) {
  const list = Array.isArray(value) ? value : [];
  if (!Number.isFinite(max) || max <= 0) return [];
  return list.length > max ? list.slice(list.length - max) : list;
}

export async function readJson(env, key, fallback = null) {
  try {
    const raw = await env.HIST.get(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeJson(env, key, value) {
  await env.HIST.put(key, JSON.stringify(value));
}

export async function writeRetentionMetadata(env, extra = {}) {
  const metadata = buildRetentionMetadata(extra);
  await writeJson(env, RETENTION_KEYS.meta, metadata);
  return metadata;
}

export async function enforceEventsCap(env) {
  const events = await readJson(env, RETENTION_KEYS.events, []);
  const trimmed = trimArray(events, RETENTION.events.hard_max_items);
  if (Array.isArray(events) && trimmed.length !== events.length) {
    await writeJson(env, RETENTION_KEYS.events, trimmed);
  }
  return { before: Array.isArray(events) ? events.length : 0, after: trimmed.length };
}

export async function enforceBaseRetention(env) {
  const metadata = await writeRetentionMetadata(env);
  const events = await enforceEventsCap(env);
  return { ok: true, metadata, events };
}
