# WCWD Current Architecture

**Status:** Active source of truth  
**Effective date:** 2026-06-18  
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

The only remaining Worker route that may write is `POST /api/test-notify`. It returns 404 when `ADMIN_TOKEN` is unset and requires an exact bearer token when configured. It is retained solely for explicit operator notification testing and is not exposed by the Pages API proxy.

## External fetch boundary

Oracle and Paymaster server routes do not accept caller-selected external URLs.

- `GET /api/oracles/feed` accepts only a feed contract address.
- `GET /api/paymaster/preflight` accepts no RPC or sponsor URL.
- Both routes use the fixed public World Chain Mainnet RPC declared in source.
- Redirect following is disabled.
- Requests have an eight-second timeout.
- Responses are limited to 64 KiB and must be valid JSON-RPC payloads.
- Public GET results are returned without being appended to KV history.
- Sponsor endpoint testing is client-owned: WCWD can generate a curl template but does not fetch or POST to the supplied sponsor URL.

The Pages Function at `functions/api/[[path]].js` is an allowlisted read proxy, not a general catch-all proxy.

- Only exact approved GET routes are forwarded.
- Unknown routes, write methods, and the notification route are rejected.
- Only minimal request headers are forwarded.
- The upstream origin is fixed to the WCWD Worker.
- Redirect following is disabled.
- Upstream responses are limited to 1 MiB and time out after ten seconds.
- Browser CORS access is limited to trusted WCWD origins.

## Removed public write routes

The following routes are intentionally absent and must return 404:

- `POST /run`
- `POST /api/retention/enforce`
- `POST /api/sell-impact/watchlist/run`

Their absence, read-only retention behavior, and fixed-fetch policy are enforced by:

```bash
python3 scripts/check_no_public_write_routes.py
python3 scripts/check_external_fetch_policy.py
node --experimental-default-type=module scripts/test_read_only_worker.mjs
node --experimental-default-type=module scripts/test_external_fetch_policy.mjs
```

## Data updates

Live reads are initiated by an explicit user request. Historical or curated public files are generated locally or by a manually dispatched workflow, reviewed, and committed as static artifacts. Missing data must be shown as unavailable rather than synthesized.

Existing KV history may still be displayed, but WCWD no longer contains a recurring or public unauthenticated mechanism that extends it.

## Deployment

Worker and Pages deployments are manual. Before deploying either surface, the selected commit must have a successful hosted CI run and the relevant local guards must pass.

Worker pre-deploy commands:

```bash
python3 scripts/check_no_cloudflare_automation.py
python3 scripts/check_no_public_write_routes.py
python3 scripts/check_external_fetch_policy.py
node --check src/entrypoint.js
node --check src/index.js
node --check src/worker.js
node --check src/oracles-feed.js
node --check src/paymaster-preflight.js
node --experimental-default-type=module scripts/test_read_only_worker.mjs
node --experimental-default-type=module scripts/test_external_fetch_policy.mjs
```

A deployment must be rejected if any guard detects a Cron declaration, scheduled handler, unapproved scheduled GitHub Action, forbidden metered binding, removed public route, retention GET write, caller-selected server fetch, broad proxy route, or untrusted CORS access.

## Change control

Any proposal that can create recurring execution, storage growth, paid API calls, or Cloudflare billing must state the expected cost and receive explicit owner approval before implementation.

## Remediation tracking

The full repair sequence and acceptance criteria are maintained in `docs/WCWD_REMEDIATION_PLAN.md`. Merge-by-merge execution state is maintained in `docs/WCWD_REMEDIATION_STATUS.md`.
