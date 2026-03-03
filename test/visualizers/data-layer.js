(function () {
  const cacheStore = new Map();

  function sampleByLimit(list, limit) {
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

  function sampleByTimeWindow(events, windowMs, now) {
    if (!Array.isArray(events)) return [];
    if (!Number.isFinite(windowMs) || windowMs <= 0) return events.slice();
    const current = Number.isFinite(now) ? now : Date.now();
    const threshold = current - windowMs;

    return events.filter(function (event) {
      return Number(event && event.ts) >= threshold;
    });
  }

  async function fetchWithCache(url, options) {
    const config = Object.assign({ ttlMs: 2500, staleMs: 30000, timeoutMs: 4000 }, options);
    const cacheKey = config.key || url;
    const now = Date.now();
    const existing = cacheStore.get(cacheKey);

    if (existing && (now - existing.fetchedAt) <= config.ttlMs) {
      return { data: existing.data, isStale: false, source: 'memory-fresh' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(function () {
      controller.abort('timeout');
    }, config.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal, headers: config.headers || undefined });
      if (!response.ok) throw new Error('http_' + response.status);

      const json = await response.json();
      cacheStore.set(cacheKey, { data: json, fetchedAt: Date.now() });
      return { data: json, isStale: false, source: 'network' };
    } catch (error) {
      const fallback = cacheStore.get(cacheKey);
      const maxStaleAge = config.ttlMs + config.staleMs;
      if (fallback && (Date.now() - fallback.fetchedAt) <= maxStaleAge) {
        return {
          data: fallback.data,
          isStale: true,
          source: 'memory-stale',
          error: error instanceof Error ? error.message : String(error)
        };
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  window.DataLayer = {
    fetchWithCache: fetchWithCache,
    sampleByLimit: sampleByLimit,
    sampleByTimeWindow: sampleByTimeWindow
  };
})();
