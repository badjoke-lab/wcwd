# WCWD Current Architecture

**Status:** Active source of truth  
**Effective date:** 2026-06-17  
**Repository:** `badjoke-lab/wcwd`

This document overrides older WCWD notes, schedules, paid-plan drafts, and implementation plans wherever they conflict with the rules below.

## Operating model

WCWD is Pages-first. Static HTML, CSS, JavaScript, and reviewed static data are the default delivery layer. A Worker may serve bounded request/response APIs, but it must not run recurring background collection.

## Mandatory cost guardrails

- Cloudflare Cron Triggers must remain at zero.
- Wrangler configuration must not contain `[triggers]` or `crons`.
- The deployed Worker entrypoint must expose `fetch` only and must never export `scheduled()`.
- Public page views and public GET requests must not be converted into hidden maintenance jobs or implicit persistent writes.
- GitHub Actions `schedule:` triggers are prohibited unless the repository owner explicitly approves a later exception.
- Local scripts and manually dispatched (`workflow_dispatch`) maintenance are permitted only after their scope and cost are reviewed.
- D1, Durable Objects, Queues, Workflows, Browser Rendering, Workers AI, or another metered Cloudflare service must not be introduced without explicit approval.

## Active Worker entrypoint

`wrangler.toml` must point to `src/entrypoint.js`. That module delegates only the `fetch` handler. It intentionally does not expose any scheduled handler, even while dormant legacy collection methods remain elsewhere in the repository.

Two old internal `scheduled()` methods currently remain in `src/index.js` and `src/worker.js`. They are unreachable from the configured Worker entrypoint and therefore cannot be invoked by a normal deployment. Their physical removal is coupled to the public write/collection route removal in remediation PR 3, where the legacy collection code will be simplified rather than edited in isolation.

This temporary exception does not permit any new scheduled handler. `scripts/check_no_cloudflare_automation.py` allowlists only those two existing locations and rejects any additional occurrence.

## Data updates

Live reads are initiated by an explicit user request. Historical or curated public files are generated locally or by a manually dispatched workflow, reviewed, and committed as static artifacts. Missing data must be shown as unavailable rather than synthesized.

## Existing Worker and KV limitations

The current repository still contains legacy public write and collection routes. They are unresolved audit findings, not approved architecture. Their removal or restriction is scheduled in PR 3 and PR 4 of `docs/WCWD_REMEDIATION_PLAN.md`.

Until those PRs are merged:

- do not treat `/run`, retention-enforcement, or watchlist-run routes as acceptable public interfaces;
- do not add new callers for those routes;
- do not add new persistent history writers.

## Deployment

Worker deployment is manual. Before any Worker deployment, run:

```bash
python3 scripts/check_no_cloudflare_automation.py
```

A deployment must be rejected if the guard detects a Cron declaration, a scheduled handler in the active entrypoint, an unapproved scheduled GitHub Action, or a forbidden metered binding.

## Change control

Any proposal that can create recurring execution, storage growth, paid API calls, or Cloudflare billing must state the expected cost and receive explicit owner approval before implementation.

## Remediation tracking

The full repair sequence, acceptance criteria, merge log, and current position are maintained in `docs/WCWD_REMEDIATION_PLAN.md`.
