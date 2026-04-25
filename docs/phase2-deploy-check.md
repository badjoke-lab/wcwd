# WCWD Phase 2 Deploy Check

## Scope

This checklist closes the retention / cron / monitor stabilization phase before moving to Visualizer work.

It covers:

- retention metadata
- summary/list/events limit caps
- monitor history/fallback display
- Home compact snapshots
- no unbounded storage behavior

---

## 1. Retention API

Check:

```txt
/api/retention
```

Expected:

- returns JSON
- `ok` is true
- `interval_min` is present
- `summary_list.recommended_points` is present
- `summary_list.hard_max_points` is present
- `events.hard_max_items` is present
- `daily.hard_max_days` is present
- `visualizer_first_target.points` is present

Failure action:

- if missing, check `src/retention.js`
- if route fails, check `src/index.js` route handling

---

## 2. Summary cap

Check:

```txt
/api/summary?limit=999999&event_limit=999999
```

Expected:

- response succeeds or returns a clean JSON error
- `limit` is not above the summary hard max
- `event_limit` is not above the events hard max
- `retention.source` is `summary_proxy`
- `dashboard_state` is one of:
  - fresh
  - delayed
  - stale
  - degraded
  - unavailable
  - unknown

Failure action:

- if large values pass through, check `src/index.js` clamping
- if state is inconsistent, check summary state normalization

---

## 3. List cap

Check:

```txt
/api/list?limit=999999
```

Expected:

- `limit` is not above the summary hard max
- response includes retention metadata
- returned list is bounded

Failure action:

- if unbounded, check entrypoint clamp
- if old worker internals ignore limit, inspect `src/worker.js` list route

---

## 4. Events cap

Check:

```txt
/api/events?limit=999999
```

Expected:

- `limit` is not above the events hard max
- response includes retention metadata
- returned events list is bounded

Optional enforcement check:

```txt
POST /api/retention/enforce
```

Expected:

- returns JSON
- trims `events:list` if it exceeds the hard max

Failure action:

- check `src/retention.js` `enforceEventsCap`
- check KV binding name `HIST`

---

## 5. Home

Check:

```txt
/
```

Expected:

- Home is compact
- WLD Snapshot appears
- Network Snapshot appears
- Sell Impact Snapshot shows top 3 or a clean empty state
- full Monitor is not embedded on Home
- Ecosystem directory is not embedded on Home

Failure action:

- check `index.html`
- check `home-summary.js`
- check `home-watchlist.js`

---

## 6. Monitor

Check:

```txt
/world-chain/monitor/
```

Expected:

- Data Source card appears
- History / Fallback Guide appears
- Health / Network / WLD Market sections render
- Trends render or show clear empty state
- 7d Series render or show clear unavailable state
- Debug contains raw payload or error

Failure action:

- check `world-chain/monitor/index.html`
- check `dashboard-source.js`
- check `world-chain/monitor/monitor-notes.js`
- check `/api/summary`

---

## 7. Ecosystem

Check:

```txt
/world-chain/ecosystem/
```

Expected:

- ecosystem.json loads
- Hot and New sections render
- search/filter controls work
- unverified toggle works

Failure action:

- check `world-chain/ecosystem/ecosystem.js`
- check `/ecosystem.json`

---

## 8. World Chain Hub

Check:

```txt
/world-chain/
```

Expected:

- Monitor / Sell Impact / Ecosystem appear as primary tools
- Oracles / Paymaster appear as reference pages
- role map is visible

Failure action:

- check `world-chain/index.html`

---

## 9. Cron and storage expectations

Expected after scheduled runs:

- `meta:retention` is refreshed
- `events:list` does not exceed hard max after enforcement
- Sell Impact watchlist history follows shared retention cap
- no D1 or Durable Object dependency is introduced

Failure action:

- check scheduled handler in `src/index.js`
- check `src/retention.js`
- check `src/sellimpact-watchlist.js`

---

## Phase 2 exit criteria

Phase 2 can be treated as closed when:

- `/api/retention` returns policy metadata
- `/api/summary`, `/api/list`, `/api/events` clamp large limits
- Monitor shows Data Source and History / Fallback Guide
- Home remains compact
- Ecosystem remains separate
- no unbounded retention path is newly introduced

After this, proceed to Phase 3:

```txt
Visualizer strengthening
- inventory visualizers
- choose one target
- add same-origin /api/viz/*
- add bounded recent snapshot
- add stale-aware visualizer UI
```
