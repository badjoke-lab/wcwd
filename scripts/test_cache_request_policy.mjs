import fs from "node:fs/promises";
import vm from "node:vm";
import { routeCacheControl } from "../src/cache-policy.js";
import { onRequest as handlePagesProxy } from "../functions/api/[[path]].js";

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(routeCacheControl("/api/summary") === "public, max-age=15, s-maxage=30, stale-while-revalidate=60", "summary cache policy mismatch");
assert(routeCacheControl("/api/version").includes("max-age=300"), "version cache policy mismatch");
assert(routeCacheControl("/api/list").includes("max-age=30"), "history cache policy mismatch");
assert(routeCacheControl("/api/oracles/feed") === "no-store", "dynamic route must remain no-store");
assert(routeCacheControl("/api/summary", "POST") === "no-store", "write method must be no-store");
assert(routeCacheControl("/api/summary", "GET", 500) === "no-store", "error response must be no-store");

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const summaryResponse = await handlePagesProxy({
    request: new Request("https://wcwd.badjoke-lab.com/api/summary?limit=1"),
    params: { path: ["summary"] },
    env: { CF_PAGES_COMMIT_SHA: "test" },
  });
  assert(summaryResponse.headers.get("x-wcwd-cache-policy") === "bounded-read", "Pages summary was not bounded-cache");
  assert(summaryResponse.headers.get("cache-control")?.includes("max-age=15"), "Pages summary cache header mismatch");

  const oracleResponse = await handlePagesProxy({
    request: new Request("https://wcwd.badjoke-lab.com/api/oracles/feed?feed=0x0000000000000000000000000000000000000001"),
    params: { path: ["oracles", "feed"] },
    env: { CF_PAGES_COMMIT_SHA: "test" },
  });
  assert(oracleResponse.headers.get("cache-control") === "no-store", "Oracle route must remain no-store");
} finally {
  globalThis.fetch = originalFetch;
}

const policySource = await fs.readFile(new URL("../assets/runtime-request-policy.js", import.meta.url), "utf8");
let nativeCalls = 0;
let nativeUrl = "";
const windowObject = {};
windowObject.fetch = async (input) => {
  nativeCalls += 1;
  nativeUrl = String(input);
  await Promise.resolve();
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
const context = vm.createContext({
  window: windowObject,
  location: {
    pathname: "/world-chain/monitor/",
    href: "https://wcwd.badjoke-lab.com/world-chain/monitor/",
  },
  URL,
  Request,
  Response,
  AbortController,
  Error,
  setTimeout,
  clearTimeout,
  console,
});
vm.runInContext(policySource, context, { filename: "runtime-request-policy.js" });
const responses = await Promise.all([
  windowObject.fetch("/api/summary?limit=1&event_limit=1"),
  windowObject.fetch("/api/summary?limit=96&event_limit=5"),
  windowObject.fetch("/api/summary?limit=20"),
]);
assert(responses.every((response) => response.status === 200), "consolidated summary response failed");
assert(nativeCalls === 1, `expected one native summary fetch, got ${nativeCalls}`);
assert(nativeUrl.includes("limit=96") && nativeUrl.includes("event_limit=20"), "summary request was not canonicalized");
assert(windowObject.__wcwdRuntimeRequestPolicy?.summaryConsolidation === true, "Monitor consolidation flag missing");

const sellWindow = {};
sellWindow.fetch = async () => new Response("{}", { status: 200 });
const sellContext = vm.createContext({
  window: sellWindow,
  location: {
    pathname: "/world-chain/sell-impact/",
    href: "https://wcwd.badjoke-lab.com/world-chain/sell-impact/",
  },
  URL,
  Request,
  Response,
  AbortController,
  Error,
  setTimeout,
  clearTimeout,
  console,
});
vm.runInContext(policySource, sellContext, { filename: "runtime-request-policy.js" });
assert(sellWindow.__wcwdRuntimeRequestPolicy?.timeoutMs === 12000, "Sell Impact timeout policy missing");

console.log("Cache and request policy tests passed.");
