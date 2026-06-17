import worker from "../src/index.js";

const writes = [];
const latest = { ts: "2026-06-17T12:34:56.000Z", tps: 3.5, gas_gwei: 0.02, wld_usd: 1.25, token_pct: 40, native_pct: 60, summary_ok: true };
const store = new Map([
  ["snap:list", JSON.stringify([latest])],
  ["snap:latest", JSON.stringify(latest)],
  ["daily:latest", JSON.stringify({ date: "2026-06-17", tps: { max: 9, min: 1 } })],
  ["daily:2026-06-16", JSON.stringify({ date: "2026-06-16", calendar_basis: "utc_calendar_day", tps: { max: 8, min: 2 } })],
]);
const env = { HIST: {
  async get(key) { return store.get(key) ?? null; },
  async put(...args) { writes.push(["put", ...args]); },
  async delete(...args) { writes.push(["delete", ...args]); },
} };
const ctx = { waitUntil() { throw new Error("unexpected waitUntil"); } };
const get = (path) => worker.fetch(new Request(`https://worker.test${path}`), env, ctx);
const check = (value, message) => { if (!value) throw new Error(message); };

const summary = await (await get("/api/summary?limit=1&event_limit=1")).json();
check(summary.latest.observed_at === latest.ts, "observation timestamp mismatch");
check(summary.latest.source === "existing_kv_snapshot", "source mismatch");
check(summary.metric_semantics.metrics.tps.status === "estimated", "TPS status mismatch");
check(summary.metric_semantics.metrics.transactions_24h.status === "unavailable", "24h status mismatch");
check(summary.version.deployed_at === null && summary.version.deployed_at_known === false, "deployment timestamp mismatch");
check(summary.daily.available === false && summary.daily.reason === "daily_boundary_unverified", "legacy daily mismatch");

const version = await (await get("/api/version")).json();
check(version.deployed_at === null && version.deployed_at_known === false, "version timestamp mismatch");

const legacy = await (await get("/api/daily/latest")).json();
check(legacy.available === false && legacy.calendar_basis === "unknown", "daily latest mismatch");

const trusted = await (await get("/api/daily?date=2026-06-16")).json();
check(trusted.available === true, "UTC daily availability mismatch");
check(trusted.day_start_utc === "2026-06-16T00:00:00.000Z", "UTC start mismatch");
check(trusted.day_end_utc_exclusive === "2026-06-17T00:00:00.000Z", "UTC end mismatch");
check(writes.length === 0, "semantic reads wrote storage");
console.log("Monitor semantics tests passed.");
