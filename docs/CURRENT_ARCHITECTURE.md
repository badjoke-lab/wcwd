# WCWD Current Architecture

**Status:** Active source of truth  
**Effective date:** 2026-06-17  
**Repository:** `badjoke-lab/wcwd`

This document overrides older WCWD notes, schedules, paid-plan drafts, and implementation plans wherever they conflict with the rules below.

## Operating model

WCWD is Pages-first. Static HTML, CSS, JavaScript, and reviewed static data are the default delivery layer. The Worker serves bounded request/response APIs but does not run recurring background collection.

## Mandatory cost guardrails

- Cloudflare Cron Triggers must remain at zero.
- Wrangler configuration must not contain `[triggers]` or `crons`.
- Worker source must not contain or export `scheduled()`.
- Public page views and public GET requests must not trigger hidden maintenance jobs or persistent writes.
- GitHub Actions `schedule:` triggers are prohibited unless the repository owner explicitly approves a later exception.
- Local scripts and manually dispatched (`workflow_dispatch`) maintenance are permitted only after their scope and cost are reviewed.
- D1, Durable Objects, Queues, Workflows, Browser Rendering, Workers AI, or another metered Cloudflare service must not be introduced without explicit approval.

## Active Worker architecture

`wrangler.toml` points to `src/entrypoint.js`. That module delegates only `fetch` to `src/index.js`.

`src/index.js` is the public API router. It contains no public collection, retention-enforcement, or watchlist-update route. `GET /api/retention` builds policy metadata in memory and does not write KV.

`src/worker.js` is a read-only history API over existing bounded KV records. It reads latest/history/health/events/daily/series data but does not collect snapshots, append events, generate daily records, enforce retention, or expose `/run`.

The only remaining Worker route that may write is `POST /api/test-notify`. It is not a public administrative route: it returns 404 when `ADMIN_TOKEN` is unset and requires an exact bearer token when configured. It is retained solely for explicit operator notification testing.

## Removed public write routes

The following routes are intentionally absent and must return 404:

- `POST /run`
- `POST /api/retention/enforce`
- `POST /api/sell-impact/watchlist/run`

Their absence and the read-only behavior of `GET /api/retention` are enforced by:

```bash
python3 scripts/check_no_public_write_routes.py
node --experimental-default-type=module scripts/test_read_only_worker.mjs
```

## Data updates

Live reads are initiated by an explicit user request. Historical or curated public files are generated locally or by a manually dispatched workflow, reviewed, and committed as static artifacts. Missing data must be shown as unavailable rather than synthesized.

Existing KV history may still be displayed, but WCWD no longer contains a recurring or public unauthenticated mechanism that extends it.

## Deployment

Worker deployment is manual. Before any Worker deployment, run:

```bash
python3 scripts/check_no_cloudflare_automation.py
python3 scripts/check_no_public_write_routes.py
node --check src/entrypoint.js
node --check src/index.js
node --check src/worker.js
node --experimental-default-type=module scripts/test_read_only_worker.mjs
```

A deployment must be rejected if any guard detects a Cron declaration, scheduled handler, unapproved scheduled GitHub Action, forbidden metered binding, removed public route, or write side effect on the retention GET route.

## Change control

Any proposal that can create recurring execution, storage growth, paid API calls, or Cloudflare billing must state the expected cost and receive explicit owner approval before implementation.

## Remediation tracking

The full repair sequence and acceptance criteria are maintained in `docs/WCWD_REMEDIATION_PLAN.md`. Merge-by-merge execution state is maintained in `docs/WCWD_REMEDIATION_STATUS.md`.
