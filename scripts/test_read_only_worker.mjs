import worker from "../src/index.js";

const writes = [];
const env = {
  HIST: {
    async get() { return null; },
    async put(...args) { writes.push(["put", ...args]); },
    async delete(...args) { writes.push(["delete", ...args]); },
  },
};

async function callRoute(path, method = "GET") {
  return worker.fetch(
    new Request(`https://worker.test${path}`, { method }),
    env,
    { waitUntil() { throw new Error("waitUntil must not be used"); } },
  );
}

for (const path of ["/run", "/api/retention/enforce", "/api/sell-impact/watchlist/run"]) {
  const response = await callRoute(path, "POST");
  if (response.status !== 404) throw new Error(`${path} expected 404, got ${response.status}`);
}

const response = await callRoute("/api/retention");
if (response.status !== 200) throw new Error(`/api/retention expected 200, got ${response.status}`);
const body = await response.json();
if (body.source !== "api_read_only") throw new Error(`/api/retention source mismatch: ${body.source}`);
if (writes.length !== 0) throw new Error(`storage writes observed: ${JSON.stringify(writes)}`);

console.log("Read-only Worker route test passed.");
