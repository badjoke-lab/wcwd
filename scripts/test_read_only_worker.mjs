import worker from "../src/index.js";

const writes = [];
const store = new Map([["snap:list", JSON.stringify([{ ts: "2026-06-17T00:00:00.000Z", tps: 1 }])]]);
const env = {
  HIST: {
    async get(key) { return store.get(key) ?? null; },
    async put(...args) { writes.push(["put", ...args]); },
    async delete(...args) { writes.push(["delete", ...args]); },
  },
};

async function call(path, method = "GET") {
  return worker.fetch(new Request(`https://example.test${path}`, { method }), env, {
    waitUntil() { throw new Error("unexpected waitUntil"); },
  });
}

for (const path of ["/run", "/api/retention/enforce", "/api/sell-impact/watchlist/run"]) {
  const response = await call(path, "POST");
  if (response.status !== 404) throw new Error(`${path}: ${response.status}`);
}

const retentionResponse = await call("/api/retention");
const retention = await retentionResponse.json();
if (retentionResponse.status !== 200 || retention.source !== "api_read_only") throw new Error("retention route mismatch");

const listResponse = await call("/api/list?limit=1");
const list = await listResponse.json();
if (listResponse.status !== 200 || !Array.isArray(list) || list.length !== 1) throw new Error("list response shape mismatch");

if (writes.length !== 0) throw new Error(`storage writes observed: ${JSON.stringify(writes)}`);
console.log("Read-only Worker route test passed.");
