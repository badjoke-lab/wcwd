# WCWD Repository and Production Remediation Plan

**Status:** Active  
**Repository:** `badjoke-lab/wcwd`  
**Production:** `https://wcwd.badjoke-lab.com/`  
**Plan established:** 2026-06-17  
**Current phase:** Plan baseline  
**Current position:** PR 0 — save and adopt this remediation plan

---

## 1. Purpose

This document is the source of truth for correcting the repository and production defects identified in the June 2026 WCWD audit.

The work is intentionally split into small pull requests. After every merge, this document must be updated before the next implementation PR is started so that it always records:

1. the full remediation schedule;
2. the current position in that schedule;
3. what the latest merge changed;
4. what remains unresolved;
5. the next PR to be implemented.

No remediation item is considered complete only because code was written. Completion requires the item-specific acceptance criteria and the post-merge production checks described below.

---

## 2. Non-negotiable operating rules

### 2.1 Cloudflare cost and automation guardrails

The following rules override older WCWD planning documents and implementation notes:

- Cloudflare Cron Triggers must remain at **zero**.
- Do not add or restore a `[triggers]` / `crons` declaration in Wrangler configuration.
- Do not add or retain a Worker `scheduled()` handler.
- Do not perform background data collection on Cloudflare.
- Do not convert public page views or public GET requests into implicit KV writes.
- Do not add GitHub Actions `schedule:` workflows as a substitute unless the repository owner explicitly approves them in advance.
- Manual maintenance automation may use local scripts or manually dispatched GitHub Actions (`workflow_dispatch`) only.
- Any change that can create recurring Cloudflare usage, storage growth, external API cost, or paid-plan dependency requires explicit cost review before implementation.
- D1, Durable Objects, Queues, Workflows, Browser Rendering, AI bindings, and other metered Cloudflare services are out of scope unless explicitly approved later.

### 2.2 Data integrity rules

- Never present projected data as observed data.
- Never present synthetic/demo data as live market data.
- Every visible metric must expose its source, freshness state, or unavailability reason.
- A missing upstream source must result in an explicit unavailable state, not an invented fallback value.
- Historical files must state their covered time range, generation time, and whether they are provisional or final.

### 2.3 Security and privacy rules

- Public unauthenticated endpoints must not trigger persistent writes or administrative work.
- User-supplied URLs must not cause the WCWD Worker to fetch arbitrary external hosts.
- World ID proof payloads must not be persisted automatically in localStorage, analytics, Worker storage, or logs.
- Cross-origin access must be limited to routes that genuinely require it; wildcard CORS is not the default.

### 2.4 Delivery rules

- One coherent theme per PR.
- Each PR must list scope, non-scope, verification steps, cost impact, and rollback notes.
- Each merged PR must be followed by an update to this document before the next implementation PR begins.
- The update must record the merge result, changed files, checks performed, production result, unresolved risks, and next PR.
- Production and `main` must be verified after every deployment-affecting merge.

---

## 3. Completion definition

The remediation program is complete only when all of the following are true:

1. Cloudflare Cron Triggers are zero in both repository configuration and the Cloudflare dashboard.
2. No Worker `scheduled()` handler remains.
3. A normal deployment cannot recreate Cron Triggers.
4. Production identifies and serves the expected `main` commit.
5. No unauthenticated public request can trigger administrative work or persistent history writes.
6. The Worker cannot be used as an arbitrary external-URL fetch relay.
7. Daily and 24-hour metrics accurately describe their measurement method and period.
8. Permanently empty metric cards have been connected, removed, or explicitly marked unavailable.
9. Route-specific caching and request timeouts are implemented without background refresh.
10. Shared HTML, route metadata, sitemap generation, and SEO checks use one source of truth.
11. CI detects generated-file drift, forbidden Cron constructs, leaked Worker hostnames, public `/test/` links, and route mismatches.
12. Alert thresholds are unified and event duplication is eliminated.
13. Deployment timestamps are real deployment metadata, not request timestamps.
14. Ecosystem records have current verification dates and sources.
15. Token Heatmap does not expose synthetic values as live data and does not call a Worker hostname directly.
16. `/test/` is absent from normal production navigation and indexing.
17. World ID proof payloads are not automatically persisted.
18. Oracles and Paymaster descriptions match their actual network behavior.
19. External requests have bounded timeouts, stale-request cancellation, and clear error states.
20. JSON-LD and essential SEO/support content exist in static HTML.
21. About and architecture documentation accurately describe the no-Cron operating model.
22. CSS and the approved design specification no longer contradict each other materially.
23. Superseded paid/Cron plans are clearly archived or marked as non-implementable.
24. Monitor initial requests are reduced, deduplicated, and parallelized where independent.

---

## 4. Master remediation schedule

| PR | Theme | Audit items covered | Status |
|---:|---|---|---|
| 0 | Save remediation plan and tracking rules | Program governance | **In progress** |
| 1 | Remove Cloudflare Cron and prevent reintroduction | Emergency Cron correction; part of item 27 | Not started |
| 2 | Repair production source of truth | Item 1 | Not started |
| 3 | Remove unauthenticated write/admin endpoints | Item 2; part of item 5 | Not started |
| 4 | Restrict external fetches and API proxy | Items 3, 4, 5, 21 | Not started |
| 5 | Correct Monitor metric meaning and timestamps | Items 6, 7, 8, 15 | Not started |
| 6 | Add cache, timeout, cancellation, and request consolidation | Items 9, 22, 28 | Not started |
| 7 | Unify builds, routes, sitemap, and CI | Items 10, 11, 12, 23 | Not started |
| 8 | Unify alert thresholds and event lifecycle | Items 13, 14 | Not started |
| 9 | Refresh and validate Ecosystem data | Item 16 | Not started |
| 10 | Make Token Heatmap safe and truthful | Items 17, 18 | Not started |
| 11 | Remove public experimental/test routes | Item 19 | Not started |
| 12 | Remove World ID proof persistence | Item 20 | Not started |
| 13 | Make SEO/support static and rewrite About | Items 24, 25 | Not started |
| 14 | Align design and archive superseded specifications | Items 26, 27 | Not started |
| 15 | Final repository and production audit | All items and completion definition | Not started |

The sequence is deliberate. Security, cost containment, deployment correctness, and data truthfulness precede presentation work.

---

## 5. Detailed PR plan

## PR 1 — Remove Cloudflare Cron and prevent reintroduction

### Objective

Make it impossible for a normal repository deployment to recreate the Cloudflare Cron configuration that was intentionally removed.

### Planned changes

- Remove `[triggers]` and `crons` from every Wrangler configuration.
- Remove Worker `scheduled()` handlers.
- Remove or disable code paths that exist only for scheduled collection.
- Add a CI guard that fails on:
  - Wrangler `crons` declarations;
  - `scheduled()` Worker handlers;
  - GitHub Actions `schedule:` declarations added to WCWD automation without explicit approval;
  - new D1, Durable Objects, Queues, or Workflows bindings.
- Add/update `docs/CURRENT_ARCHITECTURE.md` with the no-Cron, no-background-collection rule.
- Mark older Cron-oriented plans as superseded where necessary.

### Acceptance criteria

- Repository search finds no active Cron declaration or `scheduled()` handler.
- Existing tests/builds pass.
- CI explicitly enforces the prohibition.
- Cloudflare dashboard confirmation records Cron Triggers = 0 after deployment.

### Cost effect

Reduces the risk of recurring Cloudflare execution and storage charges.

---

## PR 2 — Repair production source of truth

### Objective

Ensure production is built from and traceable to the current `main` branch.

### Planned changes

- Verify and document Cloudflare Pages production branch, root directory, build command, and output directory.
- Add a generated `/version.json` or equivalent build marker containing commit SHA and build time.
- Remove obsolete build paths that combine old Home, Monitor, Ecosystem, or Test content.
- Redeploy the current `main` through the approved production path.
- Add a production smoke check comparing the public build marker with the expected commit.

### Acceptance criteria

- Production build SHA equals expected `main` SHA.
- Production Home structure and navigation match repository output.
- No obsolete Test navigation or old combined-page markup remains.

---

## PR 3 — Remove unauthenticated write/admin endpoints

### Objective

Prevent public HTTP requests from running administrative tasks or creating persistent history.

### Planned changes

- Remove public `/run`.
- Remove public `/api/retention/enforce`.
- Remove public `/api/sell-impact/watchlist/run`.
- Make `GET /api/retention` read-only.
- Move any necessary maintenance to local scripts or manual `workflow_dispatch` actions without a `schedule:` trigger.
- Add route tests proving that removed endpoints return 404/405 and do not write storage.

### Acceptance criteria

- No unauthenticated route triggers persistent writes or retention/collection work.
- GET routes have no hidden write side effects.

---

## PR 4 — Restrict external fetches and API proxy

### Objective

Stop WCWD infrastructure from acting as an arbitrary external fetch relay.

### Planned changes

- Remove user-supplied RPC fetching from the Oracle Worker route.
- Remove user-supplied RPC and sponsor-host fetching from the Paymaster Worker route.
- Use only explicitly configured World Chain endpoints for server-side requests.
- Keep arbitrary endpoint experiments browser-side and explicitly user-triggered, or remove them.
- Stop automatically storing Oracle/Paymaster test results.
- Replace catch-all API forwarding with an explicit route/method allowlist.
- Remove wildcard CORS by default.
- Limit request body size, query size, response size, redirect behavior, and execution time.
- Correct Oracle and Paymaster UI copy and button labels.

### Acceptance criteria

- User input cannot make the Worker fetch an arbitrary host.
- Unknown paths and methods are rejected before reaching the Worker.
- Oracle/Paymaster checks do not create persistent history.
- UI wording matches actual behavior.

---

## PR 5 — Correct Monitor metric meaning and timestamps

### Objective

Remove misleading daily, 24-hour, blank, and deployment metrics.

### Planned changes

- Replace access/Cron-frozen daily summaries with manually generated static daily files or remove the feature until final data exists.
- Mark partial-day files as `provisional` and complete UTC-day files as `final`.
- Stop labelling `latest TPS × 86,400` as observed 24-hour transactions.
- Rename projections explicitly or hide them until measured data exists.
- Connect, remove, or explicitly mark unavailable all permanently blank metric cards.
- Return separate `generated_at`, `deployed_at`, and `commit_sha` fields.
- Never substitute request time for deployment time.

### Acceptance criteria

- Every period metric states whether it is observed, projected, provisional, final, stale, or unavailable.
- No permanently blank card is presented as if live data should exist.
- Deployment time remains stable across requests.

---

## PR 6 — Add cache, timeout, cancellation, and request consolidation

### Objective

Reduce duplicate upstream traffic and prevent hanging UI without background jobs.

### Planned changes

- Define route-specific browser/CDN cache headers.
- Use short-lived cache for user-triggered public live reads and longer cache for immutable/static files.
- Keep administrative or user-specific responses `no-store`.
- Do not use KV as an implicit background-refresh system.
- Add a shared bounded fetch helper with timeout.
- Abort stale requests when a user retries or changes input.
- Deduplicate simultaneous identical requests.
- Consolidate Monitor summary calls and load independent series with `Promise.allSettled`.

### Acceptance criteria

- All external requests terminate within a defined timeout.
- Repeated UI actions do not multiply identical in-flight requests.
- A partial API failure does not freeze the entire Monitor.
- No background refresh or scheduled collection is introduced.

---

## PR 7 — Unify builds, routes, sitemap, and CI

### Objective

Create one source of truth for public routes and generated shared markup.

### Planned changes

- Introduce `config/routes.json` or an equivalent canonical route registry.
- Generate/validate navigation, canonical URLs, sitemap entries, breadcrumbs, and SEO coverage from it.
- Make shared header/footer generation deterministic.
- Generate sitemap `lastmod` from actual file or Git history rather than a fixed date.
- Extend CI to run build/generation commands followed by `git diff --exit-code`.
- Add internal-link, static HTML, canonical, and route smoke tests.
- Add forbidden-pattern checks for Cron constructs, direct `workers.dev` references, and public `/test/` links.

### Acceptance criteria

- Adding/removing a public route requires one canonical route change.
- Generated artifacts cannot drift unnoticed.
- Sitemap and SEO checker cover the same indexable routes.

---

## PR 8 — Unify alert thresholds and event lifecycle

### Objective

Ensure identical data produces identical alert decisions without duplicate event floods.

### Planned changes

- Put all alert thresholds and baseline requirements in one shared configuration.
- Compute alerts in one layer; presentation layers render supplied decisions rather than recalculate them differently.
- Replace repeated append-only health events with an active/resolved lifecycle or static curated event history.
- Use stable event identity with `first_seen`, `last_seen`, `occurrences`, and `state` if history is retained.

### Acceptance criteria

- Frontend, API, documentation, and notifications use the same threshold values.
- A continuing condition does not generate a new visible event on every evaluation.

---

## PR 9 — Refresh and validate Ecosystem data

### Objective

Make the directory current, sourced, and explicitly curated.

### Planned changes

- Re-verify every existing record against official sources and relevant on-chain data.
- Add `verified_at`, `sources`, `status`, and confidence fields.
- Correct outdated names, contracts, URLs, and statuses.
- Add material current World Chain projects where justified.
- Mark records stale after a documented review interval.
- Replace manually permanent `hot`/`new` flags with dated editorial metadata.
- Add schema validation.

### Acceptance criteria

- Every public record has a current verification date and at least one source.
- No placeholder 2024 date is used as if it were a real current review date.

---

## PR 10 — Make Token Heatmap safe and truthful

### Objective

Prevent synthetic values and infrastructure details from appearing as live public market data.

### Planned changes

- Remove synthetic token/value fallback from live presentation.
- Display an unavailable state when upstream data is absent.
- Remove the route from sitemap and add `noindex` until real-data acceptance criteria are met.
- Remove direct public `workers.dev` URL usage.
- Prefer a manually produced static snapshot; use a same-origin read route only when justified.
- Require real token identity, contract address, source, timestamp, and stale state before re-indexing.

### Acceptance criteria

- No synthetic token/value is presented as live.
- Public JavaScript contains no direct Worker hostname.
- The route remains non-indexable until the real-data gate passes.

---

## PR 11 — Remove public experimental/test routes

### Objective

Separate production navigation from development tools.

### Planned changes

- Remove `/test/` from public navigation and World ID hub links.
- Exclude test pages from the production build or return 404 in production.
- Add `X-Robots-Tag: noindex` where a retained private/test path can still be reached.
- Add CI checks that reject public references to `/test/`.

### Acceptance criteria

- Normal production navigation cannot reach `/test/`.
- Search indexing does not rely only on robots.txt exclusion.

---

## PR 12 — Remove World ID proof persistence

### Objective

Keep proof payloads ephemeral and local to the active page session.

### Planned changes

- Remove automatic localStorage persistence of proof JSON.
- Retain only non-sensitive UI preferences when useful.
- Add clear-input and clear-settings controls.
- Add an explicit privacy warning and maximum input size.
- Confirm analytics receives event names only, never proof payloads, endpoint URLs, or raw error bodies.

### Acceptance criteria

- Reloading the page does not restore a prior proof payload.
- Proof content is absent from storage and analytics.

---

## PR 13 — Make SEO/support static and rewrite About

### Objective

Make essential metadata and architecture disclosures available without runtime JavaScript.

### Planned changes

- Generate JSON-LD, breadcrumbs, SEO explanation, and Support content into static HTML.
- Remove runtime injection of those essential elements from shared JavaScript.
- Rewrite About to describe:
  - static Pages-first operation;
  - zero Cloudflare Cron Triggers;
  - no background collection;
  - user-triggered live reads;
  - manually generated bounded history;
  - source/freshness semantics;
  - World ID proof handling;
  - analytics, donation, independence, and non-financial-advice disclosures.
- Test essential page content with JavaScript disabled.

### Acceptance criteria

- Essential SEO/support information exists in source HTML.
- About accurately describes actual production behavior.

---

## PR 14 — Align design and archive superseded specifications

### Objective

Finish UI consistency and eliminate conflicting architecture instructions.

### Planned changes

- Adopt approved typography, width, spacing, card, button, color, and numeric-display rules.
- Remove conflicting global CSS definitions and unnecessary inline styles.
- Add representative viewport checks at 360, 768, 1024, and 1440 pixels.
- Complete `docs/CURRENT_ARCHITECTURE.md`.
- Move superseded specifications into an archive or mark them prominently:
  - `SUPERSEDED`;
  - `DO NOT IMPLEMENT`;
  - `Cloudflare Cron plan cancelled`.
- Point README and contributor/agent instructions to the current architecture source of truth.

### Acceptance criteria

- Current code and current design specification materially agree.
- No active instruction document tells a contributor or coding agent to restore Cron/KV background collection.

---

## PR 15 — Final repository and production audit

### Objective

Prove that the complete remediation is effective in the repository and on the public site.

### Planned verification

- Re-run the full repository audit.
- Re-check every item in this document.
- Verify Cloudflare dashboard resources and production deployment settings.
- Verify public routes, HTTP methods, CORS, cache headers, timeouts, indexing, source/freshness labels, and privacy behavior.
- Compare production build marker with `main`.
- Record remaining limitations as explicit accepted constraints rather than unresolved defects.

### Acceptance criteria

- Every master completion condition is checked and evidenced.
- Any deferred item has explicit owner approval and is not silently represented as complete.

---

## 6. Required post-merge report format

After each merge, update both the schedule table and the log below before beginning the next implementation PR.

Use this structure:

```markdown
## Merge record: PR N — title

- PR: #...
- Merged at: YYYY-MM-DD HH:MM UTC
- Merge commit: `...`
- Schedule position: N of 15 implementation/final-audit PRs
- Audit items changed: ...

### What changed

- ...

### What this fixes

- ...

### Verification performed

- Repository checks: ...
- CI checks: ...
- Production checks: ...
- Cloudflare cost/resource checks: ...

### Remaining limitations and risks

- ...

### Current overall status

- Completed: ...
- In progress: ...
- Not started: ...

### Next PR

- PR N+1 — ...
- Goal: ...
- Explicit non-scope: ...
```

A merge is not enough by itself. The explanation must distinguish repository completion, deployment completion, and production verification.

---

## 7. Progress log

## Baseline record — remediation plan creation

- Date: 2026-06-17
- Schedule position: PR 0
- Reason: A repository/production audit identified 28 numbered defects plus the higher-priority need to guarantee that intentionally removed Cloudflare Cron Triggers cannot be recreated from repository configuration.
- Current action: Save this plan as the program source of truth.
- Next action after merge: PR 1 — remove Cloudflare Cron declarations/handlers and add anti-regression checks.

### Current overall status

- Completed: Audit and remediation design.
- In progress: Plan adoption.
- Not started: PRs 1–15.

---

## 8. Current position

**Current PR:** PR 0 — Save remediation plan and tracking rules  
**Latest completed implementation PR:** None  
**Next implementation PR:** PR 1 — Remove Cloudflare Cron and prevent reintroduction  
**Program state:** Remediation implementation has not started; only the governing plan is being established.
