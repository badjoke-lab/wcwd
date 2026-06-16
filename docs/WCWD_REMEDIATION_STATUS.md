# WCWD Remediation Status

**Status document:** Active  
**Last updated:** 2026-06-17 after PR 2 merge  
**Plan:** `docs/WCWD_REMEDIATION_PLAN.md`  
**Current implementation position:** PR 3 — Remove unauthenticated write/admin endpoints  
**Open production gate:** PR 2 Pages deployment and public verification  
**Latest merged remediation PR:** #166 / PR 2  
**Latest merge commit:** `41eabc288f9ed21c5f0041339415e2aefc5869f4`

This file is the compact execution record for the larger remediation plan. It must be updated after every remediation merge and before the next implementation PR begins.

---

## Full schedule and current state

| Step | Theme | Audit items | State |
|---:|---|---|---|
| PR 0 | Save remediation plan and tracking protocol | Program governance | Completed |
| PR 1 | Disable Cloudflare Cron deployment path and add guardrails | Emergency Cron containment; part of item 27 | Merged — #165 |
| PR 2 | Establish canonical Pages build and production source verification | Item 1 | **Merged — #166; production deployment pending** |
| PR 3 | Remove unauthenticated write/admin endpoints and dormant scheduled collection code | Item 2; part of item 5; remaining PR 1 cleanup | **Next** |
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

- Removed active Wrangler `[triggers]` and `crons` declarations.
- Changed Wrangler `main` from `src/index.js` to the fetch-only `src/entrypoint.js`.
- Added `scripts/check_no_cloudflare_automation.py`.
- Added the guard to SEO checks and the manual Worker deployment workflow.
- Added `docs/CURRENT_ARCHITECTURE.md` as the active no-Cron architecture source of truth.

### What this fixes

A normal repository-driven Worker deployment can no longer recreate the deleted Cloudflare Cron Trigger from `wrangler.toml`, and the configured production entrypoint does not export a scheduled event handler.

### Limitation carried to PR 3

Two old internal `scheduled()` methods still physically exist in `src/index.js` and `src/worker.js`. They are dormant because `src/entrypoint.js` exposes only `fetch`. PR 3 must remove both methods and remove their temporary exact allowlist from the guard.

### Verification

- Final PR diff reviewed.
- Wrangler Cron declaration absent.
- Fetch-only entrypoint confirmed.
- Guard positive and negative behavior reproduced locally.
- No GitHub Actions/status run was generated; no hosted-CI success is claimed.
- Worker was not deployed and the Cloudflare dashboard was not directly inspected.

### Cost effect

- Removed a recurring-execution reactivation path.
- Added no recurring job, scheduled Action, or paid service.

---

## Merge record: PR 2 — Establish canonical Pages build and production source verification

- GitHub PR: #166
- Merged at: 2026-06-16 16:17:51 UTC
- Merge method: squash
- Merge commit: `41eabc288f9ed21c5f0041339415e2aefc5869f4`
- Changed files: 8
- Schedule position after merge: 2 of 15 remediation implementation/final-audit PRs merged
- Completion classification: repository implementation complete; production rollout incomplete

### What changed

- Added `scripts/build_pages_dist.py` as the canonical Cloudflare Pages artifact builder.
- Made `dist/` the only approved Pages upload directory.
- Added a build commit marker to every generated HTML file.
- Added generated `dist/version.json` containing the same commit identifier and explicit no-Cron/no-background-collection state.
- Added `scripts/check_pages_artifact.py` to reject incomplete, contaminated, obsolete, or commit-mismatched artifacts.
- Added `scripts/check_production_source.py` to compare public `/version.json` and Home HTML with the expected commit and current Home structure.
- Added the manual `.github/workflows/deploy-pages.yml` deployment path.
- Configured that workflow to deploy an existing Pages project only, with resource auto-creation/provisioning disabled.
- Added post-deployment public verification.
- Added canonical artifact validation to the existing SEO workflow.
- Replaced obsolete README and operations instructions that told operators to enable Cron or use an ambiguous Pages output.

### What this fixes in the repository

- Pages output now has a deterministic source directory.
- Every deployment can identify its source commit.
- Old combined Home/Monitor output can be rejected before and after deployment.
- Uploading the repository root is explicitly prohibited.
- A repeatable manual deployment and verification procedure now exists.
- The deployment workflow adds no schedule and performs no automatic deployment on push.

### Verification performed

#### Repository and local/reproduced checks

- Reviewed the final eight-file branch diff.
- Python syntax checks passed for all three new scripts in a local reproduction.
- Canonical artifact positive validation passed.
- Negative artifact validation correctly rejected a missing current-Home marker.
- Positive local HTTP production-source verification passed.
- Negative local HTTP verification correctly rejected a commit mismatch.
- Current Wrangler Pages deployment flags were checked against official Cloudflare documentation during implementation.

#### GitHub Actions

No GitHub Actions/status check was generated for the PR head. Therefore no hosted-CI success is claimed. The repository now contains the checks, but their hosted execution remains unverified.

#### Production and Cloudflare

PR 2 did not deploy production. A public re-check after merge still returned the old combined page with:

- a public Test navigation link;
- `World Chain Monitor (Phase 0)` on the root page;
- `History: sampled by Cloudflare Workers Cron + KV`;
- Monitor and Ecosystem sections embedded into Home.

Therefore item 1 is not yet closed in production. The following external/manual gate remains:

1. identify the existing Cloudflare Pages project name;
2. confirm the custom domain `wcwd.badjoke-lab.com` is attached to that project;
3. confirm whether stale Git integration or another deployment path is serving production;
4. remove or disable any competing deployment path;
5. run the manual Pages deployment workflow against the existing project;
6. obtain a passing `scripts/check_production_source.py` result;
7. record the deployed commit and public verification here.

The repository tools cannot inspect the Cloudflare dashboard or trigger the manual workflow, so those facts are not represented as completed.

### Cost effect

- No automatic deployment was introduced.
- No Cron or background collection was introduced.
- The deployment workflow requires explicit manual execution.
- Wrangler project auto-creation and auto-provisioning are disabled.

### Current overall status after PR 2

- Completed in repository: plan, Cron reactivation containment, canonical Pages artifact, commit identity, artifact validation, manual deployment workflow, production comparison script.
- Still open in production: deploy current canonical artifact and verify the custom domain serves the expected commit.
- Still open from PR 1: physically remove dormant scheduled methods in PR 3.
- Next implementation work: remove unauthenticated write/admin endpoints.

---

## Next PR: PR 3 — Remove unauthenticated write/admin endpoints and dormant scheduled collection code

### Goal

Make every public GET read-only, remove unauthenticated administrative/write routes, and physically eliminate the remaining scheduled collection handlers.

### Required scope

- Remove public `POST /run`.
- Remove public `POST /api/retention/enforce`.
- Remove public `POST /api/sell-impact/watchlist/run`.
- Change `GET /api/retention` to build and return metadata without writing KV.
- Remove `scheduled()` from `src/index.js`.
- Remove `scheduled()` from `src/worker.js`.
- Remove unused imports and route-specific write callers created by those removals.
- Remove the temporary legacy scheduled-handler allowlist from `scripts/check_no_cloudflare_automation.py`.
- Add a regression check proving the removed routes and scheduled handlers cannot return.

### Acceptance criteria

- No unauthenticated HTTP request starts collection, retention enforcement, or watchlist updating.
- `GET /api/retention` has no write side effect.
- Repository Worker source contains no `scheduled()` handler anywhere.
- The no-background guard has no legacy exception.
- Removed routes return 404 or 405 through the active Worker router.
- No new scheduled or paid automation is introduced.

### Explicit non-scope

- Do not redesign Oracle or Paymaster external fetching; that is PR 4.
- Do not redesign Monitor metrics; that is PR 5.
- Do not restore automatic history collection by another mechanism.
- Do not treat the still-pending Pages production deployment as completed.
