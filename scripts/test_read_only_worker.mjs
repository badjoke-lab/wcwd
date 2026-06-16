import worker from "../src/index.js";

const writes = [];
const env = {
  HIST: {
    async get() {
      return null;
    },
    async put(...args) {
      writes.push(["put", ...args]);
    },
    async delete(...args) {
      writes.push(["delete", ...args]);
    },
  },
};

async function request(path, method = "GET") {
  const response = await worker.fetch(
    new Request(`https://worker.test${path}`, { method }),
    env,
    { waitUntil() { throw new Error("waitUntil must not be used"); } },
  );
  return response;
}

for (const path of [
  "/run",
  "/api/retention/enforce",
  "/api/sell-impact/watchlist/run",
]) {
  const response = await request(path, "POST");
  if (response.status !== 404) {
    throw new Error(`${path} expected 404, got ${response.status}`);
  }
}

const retentionResponse = await request("/api/retention", "GET");
if (retentionResponse.status !== 200) {
  throw new Error(`/api/retention expected 200, got ${retentionResponse.status}`);
}
const retention = await retentionResponse.json();
if (retention.source !== "api_read_only") {
  throw new Error(`/api/retention source mismatch: ${retention.source}`);
}

if (writes.length !== 0) {
  throw new Error(`read-only route test observed storage writes: ${JSON.stringify(writes)}`);
}

console.log("Read-only Worker route test passed.");
