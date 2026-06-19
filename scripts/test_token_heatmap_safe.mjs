import assert from "node:assert/strict";
import { getTokenHeatmapLatest, getTokenHeatmapMeta } from "../src/token-heatmap-safe.js";

const missing = await getTokenHeatmapLatest({ HIST: { get: async () => null } });
assert.equal(missing.available, false);
assert.equal(missing.status, "unavailable");
assert.deepEqual(missing.tokens, []);

const valid = {
  updatedAt: new Date().toISOString(),
  tokens: [{
    symbol: "WLD",
    name: "Worldcoin",
    address: "0x2cfc85d8e48f8eab294be644d9e25c3030863003",
    capUsd: 10,
    volume24h: 5,
    liquidityUsd: 3,
    change24h: 1,
    capSource: "market_cap_usd",
    riskState: "healthy",
    dataStatus: "fresh",
    updatedAt: new Date().toISOString(),
  }],
};
const result = await getTokenHeatmapLatest({ HIST: { get: async () => JSON.stringify(valid) } });
assert.equal(result.available, true);
assert.equal(result.tokens.length, 1);
assert.equal(result.source.provider, "GeckoTerminal public API");
assert.equal(getTokenHeatmapMeta().synthetic_fallback, false);

const invalid = await getTokenHeatmapLatest({ HIST: { get: async () => JSON.stringify({ updatedAt: new Date().toISOString(), tokens: [{ symbol: "FAKE", name: "Fake", address: "", capUsd: 100 }] }) } });
assert.equal(invalid.available, false);
assert.equal(invalid.reason, "snapshot_has_no_verified_tokens");

console.log("token heatmap safe tests passed");
