import { handleOracleFeed } from "../src/oracles-feed.js";
import { handlePaymasterPreflight } from "../src/paymaster-preflight.js";
import { onRequest as handleProxy } from "../functions/api/[[path]].js";

const fixedRpc = "https://worldchain-mainnet.g.alchemy.com/public";
const originalFetch = globalThis.fetch;
const assert = (value, message) => { if (!value) throw new Error(message); };
const word = (value) => BigInt(value).toString(16).padStart(64, "0");

try {
  const workerCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    workerCalls.push({ url: String(url), init });
    const body = JSON.parse(init.body || "{}");
    let result = "0x0";
    if (body.method === "eth_call") {
      result = body.params?.[0]?.data === "0x313ce567"
        ? `0x${word(8)}`
        : `0x${word(1)}${word(123456789)}${word(1700000000)}${word(Math.floor(Date.now() / 1000))}${word(1)}`;
    }
    if (body.method === "eth_chainId") result = "0x1e0";
    if (body.method === "eth_gasPrice") result = "0x3b9aca00";
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
  };

  const feed = "0x0000000000000000000000000000000000000001";
  const rejectedOracle = await handleOracleFeed(new Request(`https://worker.test/api/oracles/feed?feed=${feed}&rpc=https://unused.example`));
  assert(rejectedOracle.status === 400 && workerCalls.length === 0, "Oracle caller RPC was not rejected");

  const oracle = await handleOracleFeed(new Request(`https://worker.test/api/oracles/feed?feed=${feed}`));
  const oracleBody = await oracle.json();
  assert(oracleBody.ok && oracleBody.retention?.stored === false, "Oracle fixed path failed");
  assert(workerCalls.length === 2 && workerCalls.every((call) => call.url === fixedRpc && call.init.redirect === "error"), "Oracle fetch escaped fixed policy");

  workerCalls.length = 0;
  const rejectedPaymaster = await handlePaymasterPreflight(new Request("https://worker.test/api/paymaster/preflight?rpc=https://unused.example"));
  assert(rejectedPaymaster.status === 400 && workerCalls.length === 0, "Paymaster caller URL was not rejected");

  const paymaster = await handlePaymasterPreflight(new Request("https://worker.test/api/paymaster/preflight"));
  const paymasterBody = await paymaster.json();
  assert(paymasterBody.ok && paymasterBody.retention?.stored === false, "Paymaster fixed path failed");
  assert(workerCalls.length === 2 && workerCalls.every((call) => call.url === fixedRpc && call.init.redirect === "error"), "Paymaster fetch escaped fixed policy");

  const proxyCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    proxyCalls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = { CF_PAGES_COMMIT_SHA: "test" };
  const proxyCall = (path, method = "GET", origin = "") => handleProxy({
    request: new Request(`https://wcwd.badjoke-lab.com/api/${path}?limit=1`, { method, headers: origin ? { origin } : {} }),
    params: { path: path.split("/") },
    env,
  });

  const allowed = await proxyCall("latest", "GET", "https://wcwd.badjoke-lab.com");
  assert(allowed.status === 200 && proxyCalls.length === 1, "Allowed proxy route failed");
  assert(proxyCalls[0].url === "https://wcwd-history.badjoke-lab.workers.dev/api/latest?limit=1", "Proxy target mismatch");
  proxyCalls.length = 0;
  assert((await proxyCall("latest", "POST")).status === 405, "Proxy accepted POST");
  assert((await proxyCall("unknown")).status === 404, "Proxy accepted unknown route");
  assert((await proxyCall("test-notify")).status === 404, "Proxy exposed notification route");
  assert((await proxyCall("latest", "GET", "https://untrusted.example")).status === 403, "Proxy accepted untrusted Origin");
  assert(proxyCalls.length === 0, "Rejected proxy request fetched upstream");

  console.log("External fetch policy tests passed.");
} finally {
  globalThis.fetch = originalFetch;
}
