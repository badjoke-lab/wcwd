# WCWD Visualizer Phase 3 Exit Check

## Scope

This checklist closes the first Visualizer strengthening pass.

Phase 3 first target:

```txt
Wormhole visualizer
```

Relevant work:

- P3-A: visualizer inventory and first target plan
- P3-B: `/api/viz/wormhole` contract wrapper
- P3-C: Wormhole frontend state cleanup
- P3-D: bounded Wormhole recent snapshots

Do not start a second visualizer until this checklist passes.

---

## 1. API contract check

Check:

```txt
/api/viz/wormhole
/api/viz/wormhole?lite=0
/api/viz/wormhole?lite=0&addresses=0x4200000000000000000000000000000000000010
```

Expected JSON fields:

```txt
ok
source
state
generated_at
window
selection
metrics
notes
retention
recent
recent_count
```

Expected `state` values are limited to:

```txt
fresh
delayed
stale
degraded
unavailable
unknown
```

Expected backward-compatible fields:

```txt
activity
matchedRoutes
inFlow
outFlow
depositCount
withdrawCount
uniqueUsers
samples
bridgeConfigured
selectedBridges
windowBlocks
```

Failure action:

- check `src/viz-wormhole.js`
- check `src/index.js` route for `/api/viz/wormhole`
- check base worker route for upstream payload

---

## 2. Bounded snapshot check

Check repeated calls:

```txt
/api/viz/wormhole?lite=0
```

Expected:

- `recent` is an array
- `recent_count` is present
- `retention.recent_points` is 96
- `retention.stored.cap` is 96
- `recent_count` never exceeds 96

Storage rule:

```txt
KV key: viz:wormhole:recent
max items: 96
raw upstream payloads: not stored
```

Failure action:

- check `appendWormholeSnapshot` in `src/viz-wormhole.js`
- check `RETENTION.visualizer_first_target.points`
- check KV binding `HIST`

---

## 3. Frontend state check

Check page:

```txt
/test/visualizers/wormhole/
```

Expected without address:

- mode is Activity only
- no safe-test wording
- no bridge-disabled wording
- visualizer does not crash
- state is shown as Fresh / Delayed / Stale / Degraded / Unavailable / Unknown

Expected with bridge address:

- preset address can be added
- Apply updates URL query
- mode changes to Bridge selected or Bridge activity
- empty match state is readable
- unavailable state is readable

Failure action:

- check `test/visualizers/wormhole/demo-svg.js`
- check `test/visualizers/data-layer.js`
- check `/api/viz/wormhole`

---

## 4. Storage safety check

Confirm no new unbounded storage path was introduced.

Expected:

- no D1
- no Durable Objects
- no raw transaction archive
- no global visualizer archive
- only Wormhole first-target compact snapshots
- cap is enforced on every append

Failure action:

- stop expansion to second visualizer
- fix retention before new visualizer work

---

## 5. Decision gate

If all checks pass:

```txt
Phase 3 first-target pass is acceptable.
```

Then choose one:

### Option A: stop Visualizer expansion

Recommended default.

Move to:

```txt
Oracles / Paymaster paid-plan strengthening
```

Reason:

- Wormhole has proven the pattern
- expanding to more visualizers now risks another long visualizer loop
- Oracles / Paymaster were already in the paid-plan scope

### Option B: add a second visualizer

Only choose if Wormhole passes browser/API/KV checks and the next visualizer has a clear data contract.

Requirements:

- one target only
- same-origin `/api/viz/*`
- compact payload
- visible stale / unavailable state
- bounded retention from the start

---

## Recommended decision

Default decision after P3-D:

```txt
Do not start a second visualizer yet.
```

Proceed to:

```txt
Oracles / Paymaster strengthening
```

Rationale:

- Sell Impact is already strong enough for now
- Home / Monitor / Ecosystem split is done
- Retention and caps are documented and partially enforced
- Wormhole visualizer has a server-owned contract and bounded recent snapshots
- The next visible value is strengthening the remaining World Chain tools rather than over-investing in visualizers

---

## Phase 3 exit criteria

Phase 3 can be treated as closed when:

- `/api/viz/wormhole` returns the normalized contract
- frontend no longer shows safe-test wording
- activity-only mode works
- bridge-selected mode works without crashing
- `recent_count <= 96`
- no unbounded visualizer storage exists
- second visualizer is explicitly deferred or separately approved
