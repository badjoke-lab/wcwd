import assert from "node:assert/strict";
import { getTokenHeatmapLatest, getTokenHeatmapMeta } from "../src/token-heatmap-safe.js";

const missing = await getTokenHeatmapLatest({ HIST: { get: async () => null } });
assert.equal(missing.available, false);
assert.equal(missing.status, "unavailable");
assert.deepEqual(missing.tokens, []);

const valid = {
  updatedAt: new Date().toISOString(),
  source: {
    provider: "GeckoTerminal public API",
    url: "https://www.geckoterminal.com/world-chain/pools",
  },
  tokens: [{
    symbol: "WLD",
    name: "Worldcoin",
    chainId: 480,
    address: "0x2cfc85d8e48f8eab294be644d9e25c3030863003",
    sourceUrl: "https://www.geckoterminal.com/world-chain/pools",
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
assert.equal(invalid.reason, "snapshot_source_invalid");

const invalidTokens = await getTokenHeatmapLatest({ HIST: { get: async () => JSON.stringify({ ...valid, tokens: [{ symbol: "FAKE", name: "Fake", chainId: 1, address: "0x2cfc85d8e48f8eab294be644d9e25c3030863003", sourceUrl: "https://example.com", capUsd: 100 }] }) } });
assert.equal(invalidTokens.available, false);
assert.equal(invalidTokens.reason, "snapshot_has_no_verified_tokens");

const malformed = await getTokenHeatmapLatest({ HIST: { get: async () => "{not-json" } });
assert.equal(malformed.available, false);
assert.equal(malformed.reason, "no_reviewed_snapshot");

const badTimestamp = await getTokenHeatmapLatest({ HIST: { get: async () => JSON.stringify({ ...valid, updatedAt: "not-a-date" }) } });
assert.equal(badTimestamp.available, false);
assert.equal(badTimestamp.reason, "snapshot_timestamp_invalid");

const stale = await getTokenHeatmapLatest({ HIST: { get: async () => JSON.stringify({ ...valid, updatedAt: "2026-01-01T00:00:00.000Z" }) } });
assert.equal(stale.available, true);
assert.equal(stale.status, "stale");
assert.equal(stale.reason, "snapshot_older_than_one_hour");

const missingTokenTimestamp = await getTokenHeatmapLatest({ HIST: { get: async () => JSON.stringify({ ...valid, tokens: [{ ...valid.tokens[0], updatedAt: "" }] }) } });
assert.equal(missingTokenTimestamp.available, false);
assert.equal(missingTokenTimestamp.reason, "snapshot_has_no_verified_tokens");

console.log("token heatmap safe tests passed");
