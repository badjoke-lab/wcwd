# WCWD Phase 5 QA / Deploy Index

## Purpose

This document is the single execution index for Phase 5.

Phase 5 is not a feature expansion phase. It is a verification and production polish phase after the paid-plan strengthening work.

Relevant completed passes:

- Phase 2: retention / cron / monitor stabilization
- Phase 3: Wormhole visualizer API / UI / bounded snapshots
- Phase 4: Oracles / Paymaster same-origin APIs and bounded checks
- Phase 5-A: sitemap route coverage

---

## Rule

Fix only broken behavior first.

Do not add new backend surfaces, new storage types, or new long-term histories during Phase 5.

Allowed work:

- broken route fix
- broken API response fix
- broken UI state fix
- mobile layout correction
- sitemap / robots / canonical correction
- copy / wording cleanup
- deploy check docs

Not allowed:

- new D1 tables
- Durable Objects
- raw archives
- second visualizer
- new major feature page
- expanding retention caps

---

## 1. Route coverage check

### Public pages

Check these routes after deploy:

```txt
/
/about/
/donate/
/world-chain/
/world-chain/monitor/
/world-chain/sell-impact/
/world-chain/ecosystem/
/world-chain/oracles/
/world-chain/paymaster/
/world-id/
/world-id/wizard/
/world-id/debugger/
/world-id/playground/
```

Expected:

- no 404
- common header loads
- footer loads where expected
- page title matches page role
- canonical URL exists on stable pages

Failure action:

- fix only the missing route, broken link, or metadata issue

---

## 2. Sitemap / robots check

Check:

```txt
/sitemap.xml
/robots.txt
```

Expected sitemap includes:

```txt
/
/about/
/donate/
/world-chain/
/world-chain/monitor/
/world-chain/sell-impact/
/world-chain/ecosystem/
/world-chain/oracles/
/world-chain/paymaster/
/world-id/
/world-id/wizard/
/world-id/debugger/
/world-id/playground/
```

Expected robots:

- allows public routes
- references sitemap
- keeps deprecated/dev paths blocked if intended

Failure action:

- patch `sitemap.xml` or `robots.txt` only

---

## 3. Phase 2 API checks

Use the Phase 2 deploy checklist as source of truth:

```txt
docs/phase2-deploy-check.md
```

Minimum API checks:

```txt
/api/retention
/api/summary?limit=999999&event_limit=999999
/api/list?limit=999999
/api/events?limit=999999
```

Expected:

- JSON response
- request limits are clamped
- retention metadata appears where expected
- summary state is normalized

Failure action:

- fix `src/index.js` retention/clamp layer
- do not rewrite the full worker unless absolutely required

---

## 4. Phase 3 Visualizer checks

Use the Phase 3 exit checklist as source of truth:

```txt
docs/visualizer-phase3-exit-check.md
```

Minimum API checks:

```txt
/api/viz/wormhole
/api/viz/wormhole?lite=0
/api/viz/wormhole?lite=0&addresses=0x4200000000000000000000000000000000000010
```

Expected:

- normalized contract fields exist
- `state` is normalized
- `recent_count <= 96`
- no raw archive

Minimum frontend check:

```txt
/test/visualizers/wormhole/
```

Expected:

- no safe-test wording
- activity-only mode works
- bridge-selected mode works without crashing
- unavailable state is readable

Failure action:

- fix `src/viz-wormhole.js` or `test/visualizers/wormhole/demo-svg.js`
- do not add a second visualizer

---

## 5. Phase 4 Oracles / Paymaster checks

Use the Phase 4 exit checklist as source of truth:

```txt
docs/oracles-paymaster-phase4-exit-check.md
```

Minimum Oracles API check:

```txt
/api/oracles/feed?rpc=<https_rpc>&feed=<0x_feed>
```

Expected:

- normalized compact payload
- same-origin API works where possible
- unsafe RPC hosts are rejected
- compact history is capped at 96

Minimum Oracles frontend check:

```txt
/world-chain/oracles/
```

Expected:

- same-origin API is attempted first
- browser fallback is only fallback
- errors are visible

Minimum Paymaster API check:

```txt
/api/paymaster/preflight?rpc=<https_rpc>&sponsor=<https_sponsor_url>
```

Expected:

- normalized compact payload
- RPC preflight works where possible
- sponsor URL is validated only
- Worker does not POST to arbitrary sponsor endpoints
- compact history is capped at 96

Minimum Paymaster frontend check:

```txt
/world-chain/paymaster/
```

Expected:

- same-origin API is attempted first
- browser fallback remains fallback
- output states Worker does not POST to arbitrary sponsor endpoints

Failure action:

- fix only the affected API or page
- keep safety restrictions

---

## 6. Home and Monitor checks

### Home

Check:

```txt
/
```

Expected:

- compact Home
- WLD Snapshot visible or clean unavailable state
- Network Snapshot visible or clean unavailable state
- Sell Impact Snapshot visible or clean empty state
- full Monitor not embedded
- full Ecosystem not embedded

### Monitor

Check:

```txt
/world-chain/monitor/
```

Expected:

- Data Source card appears
- History / Fallback Guide appears
- Trends do not crash
- 7d Series does not crash
- Debug exposes raw payload or error

Failure action:

- fix only broken UI or API wiring

---

## 7. Mobile layout check

Check at roughly:

```txt
360px width
390px width
768px width
```

Priority pages:

```txt
/
/world-chain/
/world-chain/monitor/
/world-chain/sell-impact/
/world-chain/ecosystem/
/world-chain/oracles/
/world-chain/paymaster/
```

Expected:

- header does not overflow badly
- buttons wrap acceptably
- tables/cards do not force unusable horizontal scroll unless unavoidable
- long JSON/debug blocks stay contained
- primary CTA remains visible

Failure action:

- CSS/layout-only PR
- do not add features while fixing mobile

---

## 8. Production polish queue

After checks pass, permitted polish PRs are:

1. mobile spacing / wrapping fixes
2. shared status wording cleanup
3. CTA wording cleanup
4. docs link cleanup
5. sitemap/canonical/OG consistency cleanup

Do not start SEO content expansion or new feature expansion until QA blockers are cleared.

---

## Phase 5 exit criteria

Phase 5 can be treated as closed when:

- sitemap covers stable public pages
- core public routes do not 404
- Phase 2 deploy checks pass or known issues are documented
- Phase 3 Wormhole checks pass or known issues are documented
- Phase 4 Oracles / Paymaster checks pass or known issues are documented
- mobile layout has no severe blocker on priority pages
- no unbounded storage path was added

---

## Recommended next decision after Phase 5

Choose one:

### Option A: SEO / production metadata polish

Recommended if QA passes and pages are stable.

### Option B: World ID side paid-pattern review

Only if World Chain side is stable.

### Option C: stop WCWD expansion temporarily

Recommended if deploy checks reveal enough bugs that maintenance is more important than new features.
