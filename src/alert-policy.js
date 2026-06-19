export const ALERT_POLICY = Object.freeze({
  baseline_hours: 3,
  minimum_baseline_points: 6,
  tps_spike_ratio: 1.4,
  tps_drop_ratio: 0.7,
  gas_high_ratio: 1.5,
});

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function baselineWindow(history, intervalMin) {
  const safeInterval = Number.isFinite(intervalMin) && intervalMin > 0 ? intervalMin : 15;
  const requested = Math.round((ALERT_POLICY.baseline_hours * 60) / safeInterval);
  return Math.max(ALERT_POLICY.minimum_baseline_points, requested);
}

function decision({ id, label, current, baseline, ratio, threshold, comparator, observedAt, baselinePoints, requiredPoints }) {
  const enoughData = Number.isFinite(current)
    && Number.isFinite(baseline)
    && baseline > 0
    && baselinePoints >= requiredPoints;
  let active = false;
  if (enoughData) active = comparator === "gte" ? ratio >= threshold : ratio <= threshold;
  return {
    id,
    type: id,
    label,
    state: enoughData ? (active ? "active" : "clear") : "insufficient_data",
    active,
    current: finite(current),
    baseline: finite(baseline),
    ratio: finite(ratio),
    threshold_ratio: threshold,
    comparator,
    baseline_points: baselinePoints,
    required_points: requiredPoints,
    observed_at: typeof observedAt === "string" ? observedAt : null,
  };
}

export function computeAlertDecisions(latest, history, intervalMin = 15) {
  const list = Array.isArray(history) ? history.filter((entry) => entry && typeof entry === "object") : [];
  const current = latest && typeof latest === "object" ? latest : (list[list.length - 1] || null);
  const requiredPoints = baselineWindow(list, intervalMin);
  const withoutCurrent = list.length && current === list[list.length - 1] ? list.slice(0, -1) : list;
  const baselineEntries = withoutCurrent.slice(Math.max(0, withoutCurrent.length - requiredPoints));
  const tpsValues = baselineEntries.map((entry) => entry?.tps).filter(Number.isFinite);
  const gasValues = baselineEntries.map((entry) => entry?.gas_gwei).filter(Number.isFinite);
  const tpsBaseline = average(tpsValues);
  const gasBaseline = average(gasValues);
  const currentTps = finite(current?.tps);
  const currentGas = finite(current?.gas_gwei);
  const tpsRatio = Number.isFinite(currentTps) && Number.isFinite(tpsBaseline) && tpsBaseline > 0
    ? currentTps / tpsBaseline
    : null;
  const gasRatio = Number.isFinite(currentGas) && Number.isFinite(gasBaseline) && gasBaseline > 0
    ? currentGas / gasBaseline
    : null;

  const decisions = [
    decision({
      id: "tps_spike",
      label: "TPS spike",
      current: currentTps,
      baseline: tpsBaseline,
      ratio: tpsRatio,
      threshold: ALERT_POLICY.tps_spike_ratio,
      comparator: "gte",
      observedAt: current?.ts,
      baselinePoints: tpsValues.length,
      requiredPoints,
    }),
    decision({
      id: "tps_drop",
      label: "TPS drop",
      current: currentTps,
      baseline: tpsBaseline,
      ratio: tpsRatio,
      threshold: ALERT_POLICY.tps_drop_ratio,
      comparator: "lte",
      observedAt: current?.ts,
      baselinePoints: tpsValues.length,
      requiredPoints,
    }),
    decision({
      id: "gas_high",
      label: "High gas",
      current: currentGas,
      baseline: gasBaseline,
      ratio: gasRatio,
      threshold: ALERT_POLICY.gas_high_ratio,
      comparator: "gte",
      observedAt: current?.ts,
      baselinePoints: gasValues.length,
      requiredPoints,
    }),
  ];

  return {
    policy: ALERT_POLICY,
    interval_min: intervalMin,
    baseline_window_points: requiredPoints,
    active_count: decisions.filter((item) => item.active).length,
    decisions,
  };
}

function eventIdentity(event) {
  const explicit = event?.id || event?.event_id || event?.type || event?.code;
  if (explicit) return String(explicit).trim().toLowerCase();
  const level = String(event?.level || "event").trim().toLowerCase();
  const message = String(event?.msg || event?.message || "unknown")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 160);
  return `${level}:${message}`;
}

function eventTimestamp(event) {
  const value = event?.last_seen || event?.ts || event?.timestamp || event?.first_seen;
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function eventState(event) {
  const explicit = String(event?.state || event?.status || "").trim().toLowerCase();
  if (["active", "resolved", "observed"].includes(explicit)) return explicit;
  if (["clear", "cleared", "closed", "normal", "recovered"].includes(explicit)) return "resolved";
  return "observed";
}

export function collapseEventLifecycle(events) {
  const groups = new Map();
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw || typeof raw !== "object") continue;
    const id = eventIdentity(raw);
    const seenAt = eventTimestamp(raw);
    const previous = groups.get(id);
    const occurrences = Math.max(1, Number(raw.occurrences) || 1);
    if (!previous) {
      groups.set(id, {
        id,
        type: raw.type || raw.code || null,
        level: raw.level || null,
        msg: raw.msg || raw.message || "—",
        first_seen: raw.first_seen || seenAt,
        last_seen: raw.last_seen || seenAt,
        occurrences,
        state: eventState(raw),
      });
      continue;
    }
    previous.occurrences += occurrences;
    if (seenAt && (!previous.first_seen || seenAt < previous.first_seen)) previous.first_seen = seenAt;
    if (seenAt && (!previous.last_seen || seenAt >= previous.last_seen)) {
      previous.last_seen = seenAt;
      previous.level = raw.level || previous.level;
      previous.msg = raw.msg || raw.message || previous.msg;
      previous.state = eventState(raw);
    }
  }
  return Array.from(groups.values()).sort((left, right) => {
    const a = Date.parse(left.last_seen || "") || 0;
    const b = Date.parse(right.last_seen || "") || 0;
    return a - b;
  });
}
