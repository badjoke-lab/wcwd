export function sampleByLimit(list, limit) {
  if (!Array.isArray(list)) return [];
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : list.length;
  if (max === 0) return [];
  if (list.length <= max) return list.slice();

  const step = list.length / max;
  const sampled = [];
  for (let i = 0; i < max; i += 1) {
    sampled.push(list[Math.floor(i * step)]);
  }
  return sampled;
}

export function sampleByTimeWindow(events, windowMs, now = Date.now()) {
  if (!Array.isArray(events)) return [];
  if (!Number.isFinite(windowMs) || windowMs <= 0) return events.slice();
  const threshold = now - windowMs;

  return events.filter((event) => {
    const ts = Number(event?.ts);
    return Number.isFinite(ts) && ts >= threshold;
  });
}
