# WCWD Metro Map Spec

## Purpose

Metro Map is the first remaining visualizer to implement after Wormhole.

It visualizes the World Chain ecosystem as a transit map:

```txt
stations = domains / tools / activity areas
lines = relationships / flows
moving particles = activity signals
line thickness = relative activity strength
station pulse = current attention or recent signal
```

The goal is not to reconstruct every transaction path.

The goal is to make the structure of WCWD / World Chain easier to understand at a glance.

---

## Position in WCWD

Metro Map is a visual companion to the World Chain section.

It should help users understand how these surfaces relate:

- Monitor
- Sell Impact
- Ecosystem
- Oracles
- Paymaster
- Wormhole / Bridges
- World ID / Apps

It is not a replacement for Monitor or Ecosystem.

It is a visual index / flow map.

---

## Initial route and files

### Initial route

Use the existing visualizer area first:

```txt
/test/visualizers/metro-map/
```

Do not add it to the public sitemap until it passes visualizer QA.

### Expected files

```txt
test/visualizers/metro-map/index.html
test/visualizers/metro-map/demo-svg.js
test/visualizers/metro-map/metro-map-data.js
```

Optional later API:

```txt
src/viz-metro-map.js
/api/viz/metro-map
```

Do not add the API in the first MVP unless the static MVP cannot express the intended behavior.

---

## User-facing summary

Suggested page copy:

```txt
Metro Map shows World Chain as stations and lines.
It is a simplified visual map, not a complete transaction graph.
Activity animation is based on compact signals or fallback demo weights.
```

Short label:

```txt
World Chain as a transit map.
```

---

## MVP goal

The MVP must work even with no backend signal.

The first implementation should render a fixed map, animated particles, controls, legend, and debug panel.

The first MVP must not depend on a new paid backend surface.

---

## Visual model

### ViewBox

Use SVG first, not Canvas.

Reason:

- station labels are easier
- lines are easier to inspect
- mobile scaling is simpler
- accessible fallback is easier

Recommended viewBox:

```txt
0 0 1000 620
```

### Station types

| Type | Meaning | Visual treatment |
|---|---|---|
| core | major WCWD / World Chain surface | larger node, bold label |
| data | data or reference surface | medium node |
| activity | liquidity / token / bridge area | medium node with stronger pulse |
| builder | World ID / app / paymaster area | medium node with dashed relation option |

### Initial stations

| ID | Label | Type | Desktop position | Short mobile label |
|---|---|---|---|---|
| monitor | Monitor | core | x=210 y=100 | Monitor |
| bridges | Bridges | activity | x=90 y=250 | Bridges |
| tokens | Tokens | activity | x=260 y=250 | Tokens |
| dex | DEX / Liquidity | activity | x=455 y=250 | DEX |
| sellImpact | Sell Impact | core | x=680 y=250 | Impact |
| ecosystem | Ecosystem | core | x=260 y=430 | Eco |
| oracles | Oracles | data | x=500 y=430 | Oracles |
| apps | Apps | builder | x=680 y=430 | Apps |
| worldId | World ID | builder | x=500 y=555 | World ID |
| paymaster | Paymaster | data | x=850 y=430 | Paymaster |

### Initial lines

| ID | Label | From | To | Type | Direction |
|---|---|---|---|---|---|
| bridgeToken | Bridge inflow | bridges | tokens | activity | both |
| tokenDex | Token liquidity | tokens | dex | activity | both |
| dexImpact | Sell impact route | dex | sellImpact | activity | forward |
| monitorToken | Monitor watches tokens | monitor | tokens | data | forward |
| monitorDex | Monitor watches liquidity | monitor | dex | data | forward |
| ecosystemToken | Ecosystem lists tokens | ecosystem | tokens | data | both |
| ecosystemOracle | Ecosystem references oracles | ecosystem | oracles | data | forward |
| oracleApps | Oracles support apps | oracles | apps | data | forward |
| worldIdApps | World ID connects to apps | worldId | apps | builder | forward |
| appsPaymaster | Apps use paymaster | apps | paymaster | builder | forward |
| bridgeApps | Bridges connect app activity | bridges | apps | activity | forward |

### Line grouping

Use three conceptual line groups:

```txt
Liquidity line: Bridges -> Tokens -> DEX / Liquidity -> Sell Impact
Data line: Monitor -> Tokens / DEX, Ecosystem -> Oracles -> Apps
Builder line: World ID -> Apps -> Paymaster
```

The UI must explain this in the legend.

---

## Animation behavior

### Particles

Particles represent activity signals.

They are not individual real transactions in the MVP.

Particle properties:

```txt
lineId
progress 0..1
speed
size
opacity
phase
```

### Particle generation

Each active line gets particles according to its weight.

Suggested defaults:

```txt
weight 0.00 - 0.20 => 1 to 2 particles
weight 0.20 - 0.50 => 3 to 5 particles
weight 0.50 - 0.80 => 6 to 9 particles
weight 0.80 - 1.00 => 10 to 14 particles
```

### Particle caps

| Mode | Desktop cap | Mobile cap | FPS target |
|---|---:|---:|---:|
| normal | 96 | 48 | 30 |
| light | 32 | 24 | 24-30 |
| paused | 0 moving | 0 moving | none |

### Station pulse

Station pulse should be subtle.

Rules:

- active station pulses slightly
- selected station has visible ring
- stale state reduces pulse opacity
- unavailable state stops pulse and shows static map

### Direction

For `forward` lines, particles move from source to target.

For `both` lines, use two particle streams or alternating direction.

MVP can use a single dominant direction with arrow hint if two-stream rendering is too noisy.

---

## Data behavior

## MVP data mode

MVP uses static fixed weights.

This avoids API complexity and proves the visual metaphor first.

Suggested initial weights:

| Line | Weight |
|---|---:|
| bridgeToken | 0.55 |
| tokenDex | 0.75 |
| dexImpact | 0.70 |
| monitorToken | 0.45 |
| monitorDex | 0.35 |
| ecosystemToken | 0.40 |
| ecosystemOracle | 0.25 |
| oracleApps | 0.30 |
| worldIdApps | 0.45 |
| appsPaymaster | 0.35 |
| bridgeApps | 0.25 |

### Signal mode later

If static MVP passes, add optional compact signal mode.

Potential signal inputs:

```txt
/api/summary?limit=24&event_limit=10
/api/sell-impact/watchlist/latest
/api/viz/wormhole?lite=1
/ecosystem.json
/api/oracles/feed only when user enters config; do not auto-call arbitrary RPC
/api/paymaster/preflight only when user enters config; do not auto-call arbitrary endpoints
```

Do not auto-call Oracles or Paymaster endpoints without user-provided configuration.

### Optional API contract

Only add this if needed after MVP:

```txt
GET /api/viz/metro-map
```

Expected response:

```json
{
  "ok": true,
  "source": "same-origin",
  "state": "fresh",
  "generated_at": "2026-04-28T00:00:00.000Z",
  "stations": [
    { "id": "tokens", "activity": 0.7, "state": "fresh" }
  ],
  "lines": [
    { "id": "tokenDex", "weight": 0.75, "state": "fresh" }
  ],
  "metrics": {
    "activeStations": 10,
    "activeLines": 11,
    "activity": 0.52,
    "samples": 0
  },
  "notes": ["static_layout_with_compact_signals"],
  "retention": {
    "recent_points": 96,
    "stored": false
  }
}
```

Allowed states:

```txt
fresh
delayed
stale
degraded
unavailable
unknown
```

### Retention rule if API is added

If `/api/viz/metro-map` stores recent snapshots:

```txt
KV key: viz:metro-map:recent
max items: 96
compact metrics only
no raw upstream payloads
no raw transaction history
no D1
no Durable Objects
```

---

## UI layout

### Page structure

```txt
Header
Hero / title / short explanation
Controls row
MiniStats row
Map panel
Legend
Hint
Debug panel
Limitations note
```

### Controls

Required controls:

| Control | Behavior |
|---|---|
| Light mode | reduce particles, reduce pulse, lower FPS |
| Pause | pause animation but keep map visible |
| Reset | clear selected station/line, restart particles |
| Debug | show/hide debug panel |

Optional controls after MVP:

| Control | Behavior |
|---|---|
| Focus group | Liquidity / Data / Builder / All |
| Signal mode | Static / Compact signal |

Do not add many filters in MVP.

### MiniStats

Show 3 or 4 compact stats:

```txt
Mode: Static / Signal
Lines: active line count
Stations: active station count
State: fresh / stale / unavailable
```

Optional if signal mode exists:

```txt
Activity: 0-100%
Updated: relative time
```

### Legend

Legend must explain:

```txt
station
line
moving particle
line thickness
station pulse
```

### Hint

Default hint:

```txt
Tap a station or line to focus it. This is a simplified map, not a complete transaction graph.
```

### Debug panel

Debug panel must include:

```txt
source
state
last update
viewport
fps target
particle count
selected station / line
mode
notes
```

---

## Interaction behavior

### Tap / click station

When a station is selected:

- station ring becomes visible
- connected lines highlight
- unrelated lines dim
- mini detail text shows station role
- mobile detail appears below map or inside compact panel

### Tap / click line

When a line is selected:

- selected line becomes thicker or darker
- particles on selected line remain visible
- unrelated particles reduce opacity
- detail text shows from / to / meaning / weight

### Reset

Reset must:

- clear selected station
- clear selected line
- restore all lines
- restart particle progress
- keep current mode setting

### Pause

Pause must:

- stop particle movement
- keep selected highlight
- change button label to Resume
- not clear debug information

### Light mode

Light mode must:

- reduce particle cap
- lower or clamp FPS
- reduce pulse animation
- preserve readability
- persist only in memory for MVP unless localStorage is already standard in the shell

---

## Responsive behavior

### Desktop

Expected:

- full map visible
- station labels visible
- controls in one or two rows
- debug panel can sit below map

### Tablet

Expected:

- map scales down
- labels remain readable
- controls wrap

### Mobile 360px

Expected:

- no horizontal overflow
- controls stack/wrap
- station labels may use short labels
- map remains visible with horizontal-free scaling
- selected detail is below map
- debug panel is collapsed by default

MVP must pass 360px basic usability.

---

## Accessibility

Required:

- map has an accessible label
- station buttons or clickable groups have labels
- line clickable groups have labels
- no information depends only on color
- reduced-motion path exists via Light mode / Pause
- text fallback lists stations and lines if SVG fails

Suggested SVG labels:

```txt
aria-label="Metro Map visualizer showing simplified World Chain relationships"
```

---

## Error / empty / stale behavior

### Static MVP

Static MVP should not fail because of data.

If JS fails, page still shows explanation and limitation text.

### Signal mode later

If signal fetch fails:

- keep static map visible
- show state as `stale` or `unavailable`
- keep last known compact signal if available
- do not show blank canvas
- do not throw uncaught error

Error message:

```txt
Signal data is unavailable. Showing the static Metro Map layout.
```

---

## Copy / disclaimer

Required limitation copy:

```txt
Metro Map is a simplified visual map. It is not a complete transaction graph and does not trace every on-chain path.
```

Required data copy for MVP:

```txt
MVP uses fixed route weights to prove the visual layout. Compact live signals may be added later.
```

---

## Do not do

Do not include in MVP:

- auto-discovered graph
- full transaction tracing
- wallet connection
- user-entered address tracing
- raw log storage
- raw RPC storage
- D1
- Durable Objects
- Home page heavy API calls
- public sitemap entry before QA
- claim that the map is complete or real-time

---

## Implementation plan

### PR P6-B1: Metro Map static MVP page

Files:

```txt
test/visualizers/metro-map/index.html
test/visualizers/metro-map/metro-map-data.js
test/visualizers/metro-map/demo-svg.js
```

Scope:

- add route
- add static stations and lines
- render SVG map
- animate particles
- add controls
- add legend / MiniStats / Hint / Debug
- no backend
- no storage

Done when:

- map renders
- particles move
- controls work
- 360px does not break
- no API needed

### PR P6-B2: Metro Map hub integration

Scope:

- add card/link to visualizer hub if available
- if no current stable hub exists, add only internal link from visualizer index
- do not add sitemap yet

Done when:

- Metro Map is discoverable from visualizer area
- not exposed as stable public route yet

### PR P6-C: Metro Map compact signal API, optional

Only do this after static MVP is acceptable.

Scope:

- add `/api/viz/metro-map`
- normalize compact signal response
- optionally store 96 compact snapshots
- no raw archive

Done when:

- API returns normalized state
- map can use API result without breaking
- storage remains bounded

---

## QA checklist

### Route

```txt
/test/visualizers/metro-map/
```

Expected:

- page loads
- no console crash
- no horizontal overflow at 360px

### Visual

Expected:

- stations visible
- lines visible
- particles move
- station labels readable
- legend explains the map

### Controls

Expected:

- Light mode reduces particles
- Pause freezes animation
- Reset clears selection
- Debug toggles debug panel

### Interaction

Expected:

- tapping station highlights connected lines
- tapping line focuses the line
- reset restores all lines

### Safety

Expected:

- no network dependency in MVP
- no storage introduced
- no raw data saved
- no sitemap exposure yet

---

## Completion definition

Metro Map spec is implemented when:

```txt
1. Static SVG map exists
2. Particles animate on fixed lines
3. Controls work
4. Station/line selection works
5. Legend and limitations are visible
6. Mobile 360px is usable
7. No backend or storage is required for MVP
8. No claim of complete real-time graph is made
```

After that, decide whether compact signal mode is worth adding.
