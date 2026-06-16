# WCWD Remediation Status

**Status document:** Active  
**Last updated:** 2026-06-17 00:55 JST / 2026-06-16 15:55 UTC  
**Plan:** `docs/WCWD_REMEDIATION_PLAN.md`  
**Current position:** PR 2 — Repair production source of truth  
**Latest merged remediation PR:** #165 / PR 1  
**Latest merge commit:** `f51e27c8f6f7b93282f38c7c974c015f78a2d129`

This file is the compact, continuously updated execution record for the larger remediation plan. It must be updated after every remediation merge and before the next implementation PR begins.

---

## Full schedule and current state

| Step | Theme | Audit items | State |
|---:|---|---|---|
| PR 0 | Save remediation plan and tracking protocol | Program governance | Completed |
| PR 1 | Disable Cloudflare Cron deployment path and add guardrails | Emergency Cron containment; part of item 27 | **Merged — #165** |
| PR 2 | Repair production source of truth | Item 1 | **Next** |
| PR 3 | Remove unauthenticated write/admin endpoints and physically remove dormant scheduled collection code | Item 2; part of item 5; remaining PR 1 cleanup | Not started |
| PR 4 | Restrict arbitrary external fetches and API proxy | Items 3, 4, 5, 21 | Not started |
| PR 5 | Correct Monitor metric meaning and timestamps | Items 6, 7, 8, 15 | Not started |
| PR 6 | Add route-specific cache, timeout, cancellation, and request consolidation | Items 9, 22, 28 | Not started |
| PR 7 | Unify builds, routes, sitemap, and CI drift detection | Items 10, 11, 12, 23 | Not started |
| PR 8 | Unify alert thresholds and event lifecycle | Items 13, 14 | Not started |
| PR 9 | Refresh and validate Ecosystem records | Item 16 | Not started |
| PR 10 | Make Token Heatmap safe and truthful | Items 17, 18 | Not started |
| PR 11 | Remove public experimental/test routes | Item 19 | Not started |
| PR 12 | Remove World ID proof persistence | Item 20 | Not started |
| PR 13 | Make SEO/support static and rewrite About | Items 24, 25 | Not started |
| PR 14 | Align design and archive superseded specifications | Items 26, 27 | Not started |
| PR 15 | Final repository and production audit | All items | Not started |

---

## Merge record: PR 1 — Disable Cloudflare Cron deployment path and add guardrails

- GitHub PR: #165
- Merged at: 2026-06-16 15:55:53 UTC
- Merge method: squash
- Merge commit: `f51e27c8f6f7b93282f38c7c974c015f78a2d129`
- Changed files: 7
- Schedule position after merge: 1 of 15 remediation implementation/final-audit PRs completed

### What changed

- Removed the active `[triggers]` and `crons` declaration from `wrangler.toml`.
- Changed Wrangler `main` from `src/index.js` to `src/entrypoint.js`.
- Added a production entrypoint that delegates only `fetch` and does not export `scheduled()`.
- Added `scripts/check_no_cloudflare_automation.py`.
- Added the guard to the SEO workflow.
- Added the guard before the manual Worker deployment command.
- Added `docs/CURRENT_ARCHITECTURE.md` as the current no-Cron architecture source of truth.
- Removed all temporary patch workflows/scripts used during implementation.

### What this fixes

A normal repository-driven Worker deployment can no longer recreate the deleted Cloudflare Cron Trigger from `wrangler.toml`, and the configured production entrypoint cannot expose a scheduled event handler. New Cron declarations, new scheduled handlers, scheduled GitHub Actions, and selected unapproved metered Cloudflare bindings are rejected by the repository guard.

### Important limitation carried forward

Two legacy internal `scheduled()` methods remain in:

- `src/index.js`
- `src/worker.js`

They are not exported by the configured `src/entrypoint.js` and are therefore dormant in the active deployment path. Their physical removal is now an explicit mandatory part of PR 3, together with removal of the public write/collection routes that use the same legacy collection code.

PR 3 must also remove the temporary exact allowlist for those two files from `scripts/check_no_cloudflare_automation.py`. No additional scheduled handler is permitted before then.

### Verification performed

#### Repository/diff verification

- Confirmed the final PR contained only the intended seven file changes.
- Confirmed no temporary patch workflow or one-shot patch script remained.
- Confirmed `wrangler.toml` had no active `[triggers]` or `crons` declaration.
- Confirmed Wrangler points to `src/entrypoint.js`.
- Confirmed the active entrypoint delegates only `fetch`.
- Confirmed the manual deploy workflow runs the guard before `wrangler deploy`.

#### Local/reproduced checks

- The guard passed against the intended no-Cron configuration.
- Reintroducing a Cron block caused the guard to fail as intended.
- Python syntax compilation for the guard passed.
- JavaScript syntax checking for the fetch-only entrypoint passed.

#### GitHub Actions

No Actions/status check run was generated for the PR or merge commit. Therefore this record does **not** claim a successful GitHub-hosted CI execution. The workflows now contain the guard, but their actual execution remains to be confirmed when Actions next runs.

#### Production and Cloudflare

- This PR did not automatically deploy the Worker.
- The Cloudflare dashboard was not directly accessible from the available repository tools.
- Cron Trigger count remains based on the repository owner's prior statement that it was intentionally deleted in Cloudflare.
- The repository-side reactivation path is closed, but a later manual Worker deployment is required for the fetch-only entrypoint to become the deployed Worker code.

### Cost effect

- Removed the repository configuration that could recreate recurring Cloudflare execution.
- Added no recurring job.
- Added no new paid Cloudflare service.
- Added no GitHub Actions schedule.

### Current overall status

- Completed: plan baseline, repository-side Cron reactivation containment.
- Partially completed: physical removal of old scheduled collection code; deferred to mandatory PR 3 scope.
- Not verified: Cloudflare dashboard resource state and deployment of the new fetch-only entrypoint.
- In progress next: production source-of-truth audit and repair.

---

## Next PR: PR 2 — Repair production source of truth

### Goal

Prove which commit and build output currently serve `https://wcwd.badjoke-lab.com/`, identify why production differs from `main`, and make production traceable to the intended repository commit.

### Planned work

- Inspect the current production HTML and public asset behavior again after PR 1.
- Inspect repository build scripts, Pages Functions, deployment workflows, and production configuration files.
- Add a build/version marker that identifies the source commit.
- Eliminate obsolete build paths that can publish the old combined Home/Monitor/Ecosystem/Test page.
- Add a repeatable production smoke comparison.
- Record which deployment steps require manual Cloudflare dashboard action.

### Explicit non-scope

- Do not deploy the Worker merely to test PR 1.
- Do not restore Cron.
- Do not remove public write APIs until PR 3.
- Do not redesign Monitor metrics until PR 5.
- Do not perform broad UI redesign.
