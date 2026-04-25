# WCWD Visualizer Phase 3 Plan

## Purpose

Phase 3 strengthens WCWD visualizers after the paid-plan Monitor / retention work.

The goal is not to make a flashy visual first. The goal is to make visualizers stable, server-owned, bounded, and readable.

Phase 3 should follow this order:

1. inventory current visualizers
2. choose one first target
3. add or stabilize same-origin `/api/viz/*`
4. add bounded recent snapshot only if needed
5. add stale / unavailable UI
6. only then improve visual rendering

---

## Current inventory

### Shared data layer

Path:

```txt
test/visualizers/data-layer.js
```

Role:

- browser-side fetch helper
- short memory cache
- timeout handling
- stale memory fallback
- basic sampling helpers

Current status:

- useful as a frontend helper
- not a substitute for server-owned data
- can stay, but future visualizers should not rely on client-only raw upstream logic

Risk:

- memory cache disappears on reload
- does not provide bounded cross-session history
- stale state is only local

Action:

- keep it as a frontend helper
- do not treat it as the main data source

---

### Wormhole visualizer

Path:

```txt
test/visualizers/wormhole/demo-svg.js
```

Current behavior:

- SVG visualizer
- address selection UI
- calls:

```txt
/api/viz/wormhole?lite=0&addresses=...
```

- uses `window.DataLayer.fetchWithCache`
- has activity-only rendering
- bridge rendering branch is currently disabled / safe-test style
- contains text such as:
  - `Safe test mode`
  - `Bridge branch disabled in frontend`
  - `Used only to isolate crash cause`

Current status:

- best first target for Phase 3
- already points toward same-origin API usage
- has known UX debt from the safe-test period
- needs a clearer server-owned payload contract

Risk:

- visual output is still more of a test harness than a final tool
- bridge mode is not restored as a meaningful visual
- stale / unavailable state is not prominent enough
- no durable recent-snapshot layer yet

Action:

- select Wormhole as first Phase 3 target
- stabilize `/api/viz/wormhole` contract
- replace safe-test copy with real status copy
- add explicit stale / unavailable / partial states
- only add bounded history after the API contract is clear

---

## First target decision

The first target is:

```txt
Wormhole visualizer
```

Reasons:

- it already uses a same-origin API path
- it already has a real user-facing interaction model: choose bridge addresses, apply, visualize
- it has clear visible debt from previous testing
- improving it will prove the Phase 3 pattern before adding more visualizers

Do not start with multiple visualizers.

---

## Target architecture for Wormhole

### API contract

Preferred endpoint:

```txt
/api/viz/wormhole
```

Expected response shape:

```json
{
  "ok": true,
  "source": "rpc",
  "state": "fresh",
  "generated_at": "2026-04-25T00:00:00.000Z",
  "window": {
    "blocks": 0,
    "from": null,
    "to": null
  },
  "selection": {
    "addresses": [],
    "configured": false
  },
  "metrics": {
    "activity": 0,
    "matchedRoutes": 0,
    "inFlow": 0,
    "outFlow": 0,
    "depositCount": 0,
    "withdrawCount": 0,
    "uniqueUsers": 0,
    "samples": 0
  },
  "notes": [],
  "retention": {
    "recent_points": 96
  }
}
```

Allowed states:

- fresh
- delayed
- stale
- degraded
- unavailable
- unknown

### Frontend contract

The frontend should:

- read `state`
- render stale / unavailable visibly
- render activity-only mode when no addresses are selected
- render bridge mode when addresses are selected
- never crash when the API returns partial data
- never show safe-test copy as if it were final UI

### Retention contract

First step:

- no persistent history
- API contract only

Second step:

- add bounded recent snapshots after the contract is stable
- cap: 96 points for first target
- no global visualizer archive
- no D1 / Durable Objects

---

## PR plan

### P3-A: Inventory and first target

This document.

Completion criteria:

- visualizer inventory exists
- first target is selected
- Wormhole next steps are explicit

### P3-B: Wormhole API contract wrapper

Scope:

- add or stabilize `/api/viz/wormhole` response shape
- normalize state
- include generated_at / source / selection / metrics / notes
- keep response compact

Completion criteria:

- endpoint returns predictable JSON
- no frontend visual redesign yet
- no persistent history yet

### P3-C: Wormhole frontend state cleanup

Scope:

- remove safe-test wording
- show proper fresh / stale / unavailable state
- make activity-only and bridge-selected mode clear
- keep SVG simple

Completion criteria:

- UI no longer says bridge rendering disabled
- empty / partial / unavailable states are clear
- address apply flow remains usable

### P3-D: Wormhole bounded recent snapshots

Scope:

- store compact recent visualizer snapshots if useful
- cap at 96 points
- expose retention metadata

Completion criteria:

- no unbounded storage
- recent snapshots are optional and bounded
- visualizer can show before / after or trend only from compact data

### P3-E: Decide second visualizer or stop

Scope:

- evaluate Wormhole result
- decide whether to add a second visualizer or move to Oracles / Paymaster

Completion criteria:

- no automatic expansion without review

---

## Do not do in Phase 3-A/B

- do not redesign all visualizers
- do not add D1
- do not add Durable Objects
- do not save raw transaction history
- do not add long-term visualizer archives
- do not make multiple visualizers at once

---

## Phase 3 exit criteria

Phase 3 can close when:

- at least one visualizer uses a stable same-origin API contract
- frontend shows stale / unavailable states clearly
- any retained visualizer data is bounded
- no unbounded storage path is introduced
- the next expansion target is explicitly chosen or deferred
