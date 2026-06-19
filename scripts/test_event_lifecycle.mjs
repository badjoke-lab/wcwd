import assert from "node:assert/strict";
import { collapseEventLifecycle } from "../src/alert-policy.js";
const output = collapseEventLifecycle([
  { type: "metric_state", level: "WARN", msg: "Observed", ts: "2026-06-20T00:00:00Z" },
  { type: "metric_state", level: "WARN", msg: "Observed", ts: "2026-06-20T00:15:00Z" },
  { type: "metric_state", level: "NORMAL", msg: "Recovered", ts: "2026-06-20T00:30:00Z", state: "resolved" },
]);
assert.equal(output.length, 1);
assert.equal(output[0].occurrences, 3);
assert.equal(output[0].state, "resolved");
assert.equal(output[0].first_seen, "2026-06-20T00:00:00.000Z");
assert.equal(output[0].last_seen, "2026-06-20T00:30:00.000Z");
console.log("event lifecycle tests passed");
