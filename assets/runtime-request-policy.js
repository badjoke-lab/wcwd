(function installWcwdRuntimeRequestPolicy() {
  "use strict";
  if (window.__wcwdRuntimeRequestPolicy) return;

  const path = location.pathname.endsWith("/") ? location.pathname : `${location.pathname}/`;
  const monitor = path === "/world-chain/monitor/";
  const sellImpact = path === "/world-chain/sell-impact/";
  if (!monitor && !sellImpact) return;

  const nativeFetch = window.fetch.bind(window);
  const timeoutMs = sellImpact ? 12000 : 10000;
  const inFlightSummary = new Map();

  function combineSignal(upstreamSignal, controller) {
    if (!upstreamSignal) return function cleanup() {};
    const onAbort = function () { controller.abort(upstreamSignal.reason || new Error("Request aborted")); };
    if (upstreamSignal.aborted) onAbort();
    else upstreamSignal.addEventListener("abort", onAbort, { once: true });
    return function cleanup() { upstreamSignal.removeEventListener("abort", onAbort); };
  }

  function canonicalizeMonitorSummary(input) {
    if (!monitor) return { input, key: null };
    try {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, location.href);
      if (url.pathname !== "/api/summary") return { input, key: null };
      url.searchParams.set("limit", "96");
      url.searchParams.set("event_limit", "20");
      return { input: url.toString(), key: `${url.origin}${url.pathname}` };
    } catch {
      return { input, key: null };
    }
  }

  function fetchWithTimeout(input, init) {
    const controller = new AbortController();
    const cleanupSignal = combineSignal(init.signal, controller);
    const timer = setTimeout(function () {
      controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    return nativeFetch(input, { ...init, signal: controller.signal }).finally(function () {
      clearTimeout(timer);
      cleanupSignal();
    });
  }

  window.fetch = function wcwdBoundedFetch(input, init = {}) {
    const normalized = canonicalizeMonitorSummary(input);
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (normalized.key && method === "GET") {
      let shared = inFlightSummary.get(normalized.key);
      if (!shared) {
        shared = fetchWithTimeout(normalized.input, init);
        inFlightSummary.set(normalized.key, shared);
        shared.finally(function () {
          setTimeout(function () { inFlightSummary.delete(normalized.key); }, 1500);
        });
      }
      return shared.then(function (response) { return response.clone(); });
    }
    return fetchWithTimeout(normalized.input, init);
  };

  window.__wcwdRuntimeRequestPolicy = {
    page: monitor ? "monitor" : "sell-impact",
    timeoutMs,
    summaryConsolidation: monitor,
  };
})();
