import assert from "node:assert/strict";
import { ALERT_POLICY, computeAlertDecisions } from "../src/alert-policy.js";
const baseline = Array.from({ length: 12 }, (_, i) => ({ ts: new Date(2026, 5, 20, 0, i * 15).toISOString(), tps: 100, gas_gwei: 10 }));
const result = computeAlertDecisions({ ts: "2026-06-20T03:00:00Z", tps: 140, gas_gwei: 15 }, baseline, 15);
assert.equal(ALERT_POLICY.tps_spike_ratio, 1.4);
assert.equal(result.decisions.find((item) => item.id === "tps_spike").active, true);
assert.equal(result.decisions.find((item) => item.id === "gas_high").active, true);
console.log("policy tests passed");
