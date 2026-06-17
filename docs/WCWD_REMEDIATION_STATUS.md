# WCWD Remediation Status

**Status document:** Active  
**Last updated:** 2026-06-18 after PR 3 merge  
**Plan:** `docs/WCWD_REMEDIATION_PLAN.md`  
**Current implementation position:** PR 4 — Restrict arbitrary external fetches and API proxy  
**Open production gates:** PR 2 Pages deployment; PR 3 Worker deployment; Cloudflare Cron Trigger verification  
**Latest merged remediation PR:** #167 / PR 3  
**Latest merge commit:** `95fa885f80435ea02651b595a687d08f59305d98`

This file is the compact execution record for the larger remediation plan. Repository completion and production rollout are always recorded separately.

---

## Full schedule and current state

| Step | Theme | Audit items | State |
|---:|---|---|---|
| PR 0 | Save remediation plan and tracking protocol | Program governance | Completed |
| PR 1 | Disable Cloudflare Cron deployment path and add guardrails | Emergency Cron containment; part of item 27 | Merged — #165 |
| PR 2 | Establish canonical Pages build and production source verification | Item 1 | **Merged — #166; production deployment pending** |
| PR 3 | Remove unauthenticated write/admin endpoints and dormant scheduled collection code | Item 2; part of item 5; remaining PR 1 cleanup | **Merged — #167; Worker deployment pending** |
| PR 4 | Restrict arbitrary external fetches and API proxy | Items 3, 4, 5, 21 | **Next** |
| PR 5 | Correct Monitor metric meaning and timestamps | Items 6, 7, 8, 15 | Not started |
| PR 6 | Add route-specific cache, timeout, cancellation, and request consolidation | Items 9, 22, 28 | Not started |
| PR 7 | Unify builds, routes, sitemap, and CI drift detection | Items 10, 11, 12, 23 | Not started |
| PR 8 | Unify alert thresholds and event lifecycle | Items 13, 14 | Not started |
| PR 9 | Refresh and validate Ecosystem records | Item 16 | Not started |
| PR 10 | Make Token Heatmap safe and truthful | Items 17, 18 | Not started |
| PR 11 | Remove public experimental/test routes | Item 19 | Partially completed in PR 3; remaining route/navigation cleanup pending |
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
- Completion classification: repository implementation complete; production verification incomplete

### What changed

- Removed active Wrangler `[triggers]` and `crons` declarations.
- Changed Wrangler `main` to the fetch-only `src/entrypoint.js`.
- Added the no-background-automation guard.
- Added `docs/CURRENT_ARCHITECTURE.md` as the active architecture source of truth.

### Verification and limitation

- Repository guard behavior was reproduced.
- No hosted CI run was generated at the time.
- Worker was not deployed and the Cloudflare dashboard was not inspected.

---

## Merge record: PR 2 — Establish canonical Pages build and production source verification

- GitHub PR: #166
- Merged at: 2026-06-16 16:17:51 UTC
- Merge method: squash
- Merge commit: `41eabc288f9ed21c5f0041339415e2aefc5869f4`
- Completion classification: repository implementation complete; production rollout incomplete

### What changed

- Added `scripts/build_pages_dist.py` and made `dist/` the canonical Pages artifact.
- Added build commit markers and generated `dist/version.json`.
- Added artifact and public-source verification scripts.
- Added a manual-only Pages deployment workflow.
- Replaced obsolete Cron-oriented deployment documentation.

### Open production gate

1. Identify the existing Cloudflare Pages project.
2. Confirm the custom-domain attachment and production branch/output settings.
3. Disable any competing stale deployment path.
4. Run the manual Pages deployment workflow.
5. Obtain a passing production-source check.
6. Record the deployed commit here.

No production deployment is claimed.

---

## Merge record: PR 3 — Remove legacy scheduled collection and make history routes read-only

- GitHub PR: #167
- Merged at: 2026-06-17 UTC
- Merge method: squash
- Merge commit: `95fa885f80435ea02651b595a687d08f59305d98`
- Changed files: 14
- Completion classification: repository implementation complete; Worker production rollout incomplete

### What changed

- Converted `src/worker.js` to a read-only API over existing KV snapshots.
- Removed public `POST /run`.
- Removed public `POST /api/retention/enforce`.
- Removed public `POST /api/sell-impact/watchlist/run`.
- Made `GET /api/retention` read-only with no KV write.
- Removed all Worker `scheduled()` handlers and legacy collection logic.
- Retained only token-protected `POST /api/test-notify`; it returns 404 when `ADMIN_TOKEN` is unset.
- Added a static public-write-route guard and runtime route test.
- Preserved the existing array response shape of `GET /api/list`.
- Removed the remaining GitHub Actions `schedule:` trigger from `miniapps-daily`; the workflow is manual-only.
- Excluded the experimental `test/` tree from the canonical Pages artifact and made the artifact checker reject it.

### Hosted verification

GitHub Actions SEO Check run #62 completed successfully. It passed:

- no-Cron/no-schedule/no-`scheduled()` guard;
- public-write-route guard;
- JavaScript syntax checks;
- runtime removed-route, retention no-write, and list-shape checks;
- static SEO checks;
- canonical Pages build;
- canonical Pages artifact validation.

### Open production gate

- Manually deploy the Worker from the merged main branch.
- Verify in production:
  - `POST /run` returns 404;
  - `POST /api/retention/enforce` returns 404;
  - `POST /api/sell-impact/watchlist/run` returns 404;
  - `GET /api/retention` returns 200;
  - existing read APIs still return the expected shapes.
- Confirm Cloudflare Cron Trigger remains 0 in the dashboard.

No Worker deployment or Cloudflare dashboard verification is claimed.

### Cost and automation effect

- Removed recurring Worker execution and the last repository scheduled Action.
- Added no replacement collector, Cron, scheduled Action, or paid binding.
- Pages and Worker deployment remain manual-only.

---

## Next PR: PR 4 — Restrict arbitrary external fetches and API proxy

### Goal

Prevent WCWD from acting as an arbitrary external RPC/proxy service and stop read requests from persisting untrusted external responses.

### Required scope

- Remove caller-selected arbitrary RPC URLs from Oracle and Paymaster server routes.
- Use a fixed trusted configuration or an operator-controlled environment value only.
- Reject private, local, metadata, non-HTTPS, credential-bearing, and redirect-escaped targets.
- Remove Oracle and Paymaster history writes from public GET requests.
- Replace the Pages catch-all proxy with an exact route/method allowlist.
- Do not expose the authenticated notification route through Pages.
- Restrict CORS and forwarded headers.
- Add timeout, response-size, and regression checks.
- Keep all deployment manual and add no background collection.

### Acceptance criteria

- A caller cannot choose an arbitrary external host for server-side fetches.
- Invalid, private, and redirect-escaped targets are rejected.
- Public GET requests do not write Oracle or Paymaster check history.
- Pages proxies only explicitly supported read routes.
- Hosted CI proves the allowlist and negative cases.
