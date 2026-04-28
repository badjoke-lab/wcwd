# WCWD Remaining Visualizers Spec

## Purpose

This document locks the direction for the three remaining WCWD visualizers after Wormhole.

Original names:

- METRO MAP
- Human vs Bot Flow
- PLANET SYSTEM

Updated implementation names:

- Metro Map
- Ecosystem Orbit
- Activity Pattern Flow

Wormhole already established the first visualizer pattern:

- same-origin API contract where needed
- visible stale / unavailable state
- compact bounded recent snapshots
- no raw archive
- no D1 / Durable Objects

The remaining three visualizers must follow the same cost and safety rules.

---

## Global rules

### Cloudflare / cost rules

All remaining visualizers must follow these rules:

```txt
no raw transaction archive
no raw RPC response archive
no raw log archive
no D1
no Durable Objects
KV compact recent snapshots only when useful
max 96 snapshots per visualizer
manual apply or low-frequency refresh only
no heavy Home page calls
```

### UX rules

All remaining visualizers must use the same basic operation model:

```txt
light mode / reduced motion path
pause
reset
debug panel toggle
clear empty state
clear stale / unavailable state
mobile-first containment
```

### Data rules

The goal is not exact real-time reconstruction.

The goal is:

```txt
compact signal -> stable state -> readable visual metaphor
```

Allowed data sources:

- existing WCWD summary APIs
- `ecosystem.json`
- compact same-origin visualizer APIs
- fixed route/category definitions
- short TTL/stale cache

Not allowed in the first pass:

- full-chain indexing
- arbitrary user-selected large queries
- address-level judgment labels
- permanent history
- long raw event storage

---

## Implementation order

Recommended order:

```txt
1. Metro Map
2. Ecosystem Orbit
3. Activity Pattern Flow
```

Reason:

- Metro Map is the clearest visual metaphor and safest first expansion.
- Ecosystem Orbit can reuse `ecosystem.json` and avoid heavy API work.
- Activity Pattern Flow has labeling / interpretation risk, so it should come last.

---

## 1. Metro Map

### Short summary

Metro Map is a route-map visualizer for World Chain activity.

It shows the World Chain ecosystem as stations and lines, with moving particles representing activity intensity.

### User value

Users should quickly understand:

- which areas of World Chain are connected
- which routes are active
- where activity appears concentrated
- how Monitor / Sell Impact / Ecosystem / Oracles / Paymaster relate to each other

### Visual metaphor

```txt
station = domain / category / tool area
line = relationship / route
train particle = activity signal
line thickness = activity strength
station pulse = current attention or recent activity
```

### Initial station set

Start with a fixed station map.

Suggested stations:

- Monitor
- Sell Impact
- Ecosystem
- Tokens
- DEX / Liquidity
- Oracles
- Paymaster
- World ID
- Bridges
- Apps

### Initial line set

Start with fixed lines. Do not auto-discover routes.

Suggested lines:

- Monitor -> Tokens
- Tokens -> DEX / Liquidity
- DEX / Liquidity -> Sell Impact
- Ecosystem -> Apps
- Ecosystem -> Oracles
- Apps -> Paymaster
- World ID -> Apps
- Bridges -> Tokens
- Bridges -> Apps

### Data contract

First MVP can use static weights plus optional compact signals.

Potential inputs:

- Home / summary freshness state
- Sell Impact watchlist count / top hot tokens
- Ecosystem hot/new counts
- Oracles recent check state
- Paymaster recent check state
- Wormhole recent state

Preferred API path if needed:

```txt
/api/viz/metro-map
```

Expected compact response shape:

```json
{
  "ok": true,
  "source": "same-origin",
  "state": "fresh",
  "generated_at": "2026-04-28T00:00:00.000Z",
  "stations": [],
  "lines": [],
  "metrics": {
    "activeLines": 0,
    "activeStations": 0,
    "activity": 0
  },
  "notes": [],
  "retention": {
    "recent_points": 96
  }
}
```

### MVP scope

MVP should include:

- static station layout
- fixed line definitions
- moving particles on active lines
- activity-only fallback
- light mode / pause / reset / debug
- mobile-safe SVG or Canvas rendering
- no storage unless the API produces useful compact state

### Do not do in MVP

- no auto-discovered graph
- no user-entered address tracing
- no full transaction path reconstruction
- no permanent route history
- no claim that this is a complete World Chain map

### Completion criteria

Metro Map MVP is complete when:

- page loads without API data
- stations and lines are understandable at 360px
- particles move without severe jank
- stale / unavailable state is visible
- debug panel shows source and sample count
- no unbounded storage exists

---

## 2. Ecosystem Orbit

### Short summary

Ecosystem Orbit is the updated version of PLANET SYSTEM.

It visualizes `ecosystem.json` as an orbit map: categories and projects appear as planets, satellites, and moving signals.

### User value

Users should quickly understand:

- what areas exist in the World Chain ecosystem
- which categories are larger or more visible
- what is hot / new
- how projects cluster by category or tag

### Visual metaphor

```txt
large planet = category or major cluster
small planet = project / entry
satellite = tag / status / related item
orbit distance = relationship to category
pulse = hot or new state
small moving ships = recent activity or attention signal
```

### Data source

Primary source:

```txt
ecosystem.json
```

Do not require live chain data in MVP.

Optional compact signals later:

- hot count
- new count
- verified count
- category distribution
- stale / data age

Preferred API path if needed:

```txt
/api/viz/ecosystem-orbit
```

MVP may be fully static/client-side from `ecosystem.json`.

### MVP scope

MVP should include:

- category planets
- project dots grouped by category
- hot/new visual emphasis
- verified / offchain / unverified distinction
- category filter or focus control
- light mode / pause / reset / debug
- mobile-safe layout

### Do not do in MVP

- no score claiming objective project quality
- no investment ranking
- no auto-generated trust score
- no raw chain history
- no heavy orbital physics that hurts mobile

### Naming

Internal name:

```txt
Ecosystem Orbit
```

Avoid exposing the old name `PLANET SYSTEM` as the main product label unless used as a subtitle or development note.

### Completion criteria

Ecosystem Orbit MVP is complete when:

- it renders from `ecosystem.json`
- hot/new/verified states are visible
- category clustering is understandable
- 360px mobile does not break
- empty/missing ecosystem data has a clean fallback
- no paid storage is required for MVP

---

## 3. Activity Pattern Flow

### Short summary

Activity Pattern Flow is the safer replacement for Human vs Bot Flow.

It should visualize activity pattern tendencies without claiming that an address or user is human or bot.

### Required renaming

Do not ship the page as:

```txt
Human vs Bot Flow
```

Use:

```txt
Activity Pattern Flow
```

Optional UI wording:

```txt
human-like / automated-like tendencies
natural-looking / repetitive-looking activity
pattern signal, not identity judgment
```

### User value

Users should quickly understand:

- whether recent activity looks distributed or concentrated
- whether timing looks bursty or steady
- whether repeated patterns are visible
- whether activity is likely organic-looking or automation-looking

### Visual metaphor

```txt
soft particles = distributed / natural-looking activity
sharp particles = repetitive / automated-looking activity
lanes = pattern groups
pulse rhythm = timing concentration
clusters = repeated behavior
```

### Data contract

This visualizer must avoid identity claims.

Potential lightweight features:

- interval regularity
- repeated transaction shape count
- short-window burstiness
- concentration by source group
- sample count

Preferred API path:

```txt
/api/viz/activity-pattern
```

Expected compact response shape:

```json
{
  "ok": true,
  "source": "same-origin",
  "state": "fresh",
  "generated_at": "2026-04-28T00:00:00.000Z",
  "metrics": {
    "distributed": 0,
    "repetitive": 0,
    "bursty": 0,
    "steady": 0,
    "samples": 0
  },
  "notes": ["pattern_signal_not_identity_judgment"],
  "retention": {
    "recent_points": 96
  }
}
```

### Required disclaimer

The page must clearly state:

```txt
This is a pattern visualization, not a bot detector.
It does not identify humans or bots.
Signals are approximate and based on limited samples.
```

### MVP scope

MVP should include:

- simulated or compact sample-based pattern lanes
- clear distinction between pattern tendencies
- no address judgment
- visible disclaimer
- light mode / pause / reset / debug
- stale / unavailable handling

### Do not do in MVP

- no address labels like `bot`
- no user identity judgment
- no fraud/scam claim
- no blacklisting
- no leaderboard of suspicious addresses
- no raw transaction archive

### Completion criteria

Activity Pattern Flow MVP is complete when:

- the page never claims to detect bots
- visual lanes communicate pattern tendencies
- sample count and limitation are visible
- stale / unavailable state is visible
- no identity judgment is produced
- no unbounded storage exists

---

## Shared implementation plan

### P6-B: Metro Map MVP

Scope:

- add visualizer page
- add static station/line definitions
- add shared controls if missing
- no backend unless needed

Done when:

- Metro Map renders with fixed graph
- mobile works
- empty/stale state works

### P6-C: Metro Map compact API, if needed

Scope:

- add `/api/viz/metro-map` only if static MVP is not enough
- compact state only
- optional 96-item recent snapshots

Done when:

- API response is normalized
- retention is bounded

### P6-D: Ecosystem Orbit MVP

Scope:

- render from `ecosystem.json`
- group by category / status
- no backend first

Done when:

- orbit view renders from current data
- hot/new/verified visible

### P6-E: Activity Pattern Flow MVP spec-to-prototype

Scope:

- implement visual shell and disclaimer
- use compact sample/mock first if no safe data contract is ready
- no identity claims

Done when:

- pattern tendencies are shown
- no bot/human judgment is made

### P6-F: Remaining visualizers exit check

Scope:

- verify all three visualizers
- check mobile
- check storage and request risk
- decide whether any API expansion is justified

Done when:

- all three have clear route, state, and limitation copy
- none introduces unbounded storage

---

## Final decision

Proceed with all three, but not as equal-risk features.

Implementation priority:

```txt
1. Metro Map
2. Ecosystem Orbit
3. Activity Pattern Flow
```

The main rule:

```txt
visual metaphor first, compact signal second, no heavy archive ever
```
