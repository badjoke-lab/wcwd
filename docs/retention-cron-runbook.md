# WCWD Retention / Cron / Fallback Runbook

## Purpose

This document fixes the operational contract for WCWD paid-plan data handling.

The goal is not to store unlimited history. The goal is to keep the site useful, cheap, bounded, and recoverable.

WCWD should prefer:

- same-origin API responses
- short history
- compact summaries
- visible stale / delayed / degraded states
- bounded retention

WCWD should avoid:

- unlimited KV growth
- raw long-term event storage
- D1 / Durable Objects by default
- silent failure
- per-user or page-view tracking for dashboard metrics

---

## Data Classes

### 1. latest

Current best-known snapshot.

Used for:

- Home WLD Snapshot
- Home Network Snapshot
- Monitor current cards
- Data Source freshness

Retention:

- keep one current latest object per source
- overwrite on each successful collection
- never append indefinitely

Failure behavior:

- keep last good latest if available
- mark state as delayed / stale / degraded depending on age and failure source
- do not pretend it is fresh

---

### 2. summary history / list

Short rolling history sampled by cron.

Used for:

- Monitor 24h trends
- short sparkline context
- alert baseline comparison
- Home compact trend

Target behavior:

- default interval: about 15 minutes
- target 24h window: about 96 points
- safe request cap from frontend: 288 points
- keep enough room for delay / missed runs, but do not grow unbounded

Retention rule:

- keep a bounded list only
- old points are dropped when the list exceeds the configured cap
- raw per-transaction data is not stored

Recommended cap:

- normal: 288 points
- maximum without explicit reason: 672 points

---

### 3. 7d series

Hourly or compact aggregate series.

Used for:

- Monitor 7d Series
- longer trend context

Retention rule:

- store aggregates only
- target period: 7 days
- target step: 1h
- cap: about 168 points per metric
- do not keep raw 15m samples forever just to derive this

Allowed metrics:

- TPS
- WLD USD
- gas if explicitly needed
- token-tx share only if stable enough

---

### 4. events

Compact operational event summaries.

Used for:

- Monitor Events
- degraded / alert explanations

Retention rule:

- short list only
- recommended cap: 50 events
- maximum without explicit reason: 100 events
- event body must stay compact

Do not store:

- raw upstream responses
- large stack traces
- repeated identical errors without compression

---

### 5. daily

Daily compact rollup.

Used for:

- Monitor Daily
- coarse historical context

Retention rule:

- compact daily summary only
- recommended cap: 30 days
- maximum without explicit reason: 90 days

Do not store:

- raw 24h data
- full event logs
- per-request data

---

### 6. visualizer recent snapshots

Future visualizer support.

Used for:

- before / after comparison
- short animated trend
- stale-aware rendering

Retention rule:

- visualizer-specific short history only
- start with one visualizer only
- recommended cap: 96 points
- do not build a global visualizer archive

---

## State Definitions

### fresh

The latest snapshot is current enough for normal use.

Typical condition:

- latest age <= 2x expected interval
- no critical upstream failure

### delayed

The latest snapshot is late but still usable.

Typical condition:

- latest age > 2x expected interval
- latest age <= 4x expected interval

### stale

The latest snapshot is old.

Typical condition:

- latest age > 4x expected interval

UI behavior:

- keep last good values if available
- show stale state clearly
- trend charts should be read as delayed data

### degraded

Some source failed, but partial data is still available.

Examples:

- CoinGecko failed but RPC is available
- World status endpoint failed
- series endpoint failed but latest exists

UI behavior:

- show partial data
- show degraded state
- expose error in Debug / Events where possible

### unavailable

No usable data is available.

UI behavior:

- show empty state
- do not show fake values
- point user to retry or Debug

---

## Cron Rules

### Expected interval

Default expected interval:

- 15 minutes

The UI and summary payload should expose interval metadata when available.

### Cron run must do

Each cron run should:

1. fetch upstream sources with timeouts
2. build compact latest snapshot
3. append one compact history point if valid
4. enforce list cap
5. update hourly series aggregate if needed
6. append compact event only if state changed or important failure occurred
7. update daily compact rollup

### Cron run must not do

- store raw upstream payloads indefinitely
- append duplicate identical errors forever
- expand data shape without a cap
- fail the whole snapshot because one optional source failed
- require D1 or Durable Objects unless a later phase explicitly approves it

---

## Failure Handling

### Upstream partial failure

If an optional source fails:

- keep the rest of the snapshot
- mark degraded
- add warning / compact event
- do not erase last known good value unless it is invalid

### Total collection failure

If the collection fails completely:

- keep latest if available
- mark delayed or stale based on age
- append at most one compact failure event per failure window
- do not append empty history point as if it were valid

### API failure

If `/api/summary` fails:

- Home should show compact unavailable state
- Monitor should show unavailable / fallback note
- Debug should expose error if available

### Series failure

If `/api/series` fails:

- 24h summary history can still work
- 7d Series should show unavailable
- Monitor should not imply series is fresh

---

## UI Contract

### Home

Home is a compact landing page.

Allowed data:

- WLD Snapshot
- Network Snapshot
- top 3 Sell Impact Snapshot
- Tool Directory

Home must not show:

- full Monitor
- Debug
- Events list
- Daily rollup
- full Ecosystem directory

### Monitor

Monitor is the detailed health and history page.

It should show:

- Data Source
- History / Fallback Guide
- Health
- Network
- WLD Market
- Activity
- Trends
- 7d Series
- Alerts
- Events
- Daily
- Debug

### Ecosystem

Ecosystem is a standalone directory.

Source of truth:

- `ecosystem.json`

### Visualizer

Visualizer must eventually use:

- same-origin `/api/viz/*`
- server-shaped payload
- bounded recent snapshots
- stale / unavailable UI state

But visualizer should start with one selected target only.

---

## Recommended Key Caps

These are the default bounds unless a later PR changes them with a clear reason.

```txt
summary/list: 288 points
summary/list hard max: 672 points
series/7d/hourly: 168 points per metric
events: 50 items
events hard max: 100 items
daily: 30 days
daily hard max: 90 days
sell-impact watchlist latest: 1 latest object
sell-impact watchlist list: short rolling list only
visualizer first target: 96 points
```

---

## Deployment Check

After deploy, check:

1. `/`
   - WLD Snapshot loads or shows unavailable cleanly
   - Network Snapshot loads or shows unavailable cleanly
   - Sell Impact Snapshot shows top 3 or empty state

2. `/world-chain/monitor/`
   - Data Source card shows freshness
   - History / Fallback Guide shows history mode
   - Trends render or show empty state
   - 7d Series renders or shows unavailable note
   - Debug contains raw payload or error

3. `/world-chain/ecosystem/`
   - ecosystem.json loads
   - Hot / New / filters work

4. `/world-chain/`
   - Monitor / Sell Impact / Ecosystem links work

---

## When To Escalate Beyond KV

Do not introduce D1 or Durable Objects just because Cloudflare paid plan exists.

Escalate only if:

- query patterns require relational filtering
- write contention becomes real
- multi-user personalized state is introduced
- KV list rewriting becomes too fragile
- retention needs exceed compact summary use cases

Until then:

- KV + compact JSON is enough
- same-origin APIs are enough
- bounded retention is mandatory

---

## Next Implementation Targets

After this runbook is merged, implementation should proceed in this order:

1. expose retention constants in code / summary metadata
2. ensure summary/list and events caps are enforced consistently
3. ensure stale / delayed / degraded state calculation is consistent
4. update Monitor notes if metadata names change
5. then proceed to Visualizer Phase 3
