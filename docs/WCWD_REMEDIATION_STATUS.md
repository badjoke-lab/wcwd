# WCWD Remediation Status

**Status:** Active  
**Last updated:** 2026-06-18 after PR 5 merge  
**Current position:** PR 6 — Cache, timeout, cancellation, and request consolidation  
**Latest merged remediation PR:** #169  
**Latest merge commit:** `0b4740a191215ce0160c47065fe46e3786f96fdf`

Repository completion and production rollout are recorded separately.

## Schedule

| Step | Theme | State |
|---:|---|---|
| PR 0 | Remediation plan and tracking | Completed |
| PR 1 | Disable Cron deployment path | Merged — #165 |
| PR 2 | Canonical Pages artifact and source verification | Merged — #166; production pending |
| PR 3 | Read-only history API and removal of public mutation routes | Merged — #167; production pending |
| PR 4 | Fixed external fetch and exact Pages proxy boundary | Merged — #168; production pending |
| PR 5 | Monitor metric and timestamp semantics | Merged — #169; production pending |
| PR 6 | Cache, timeout, cancellation, request consolidation | Next |
| PR 7 | Build, route, sitemap, and CI drift unification | Not started |
| PR 8 | Alert thresholds and event lifecycle | Not started |
| PR 9 | Ecosystem data validation | Not started |
| PR 10 | Token Heatmap safety and truthfulness | Not started |
| PR 11 | Experimental route removal | Partly completed in PR 3 |
| PR 12 | World ID proof persistence removal | Not started |
| PR 13 | Static SEO/support and About rewrite | Not started |
| PR 14 | Design alignment and specification archive | Not started |
| PR 15 | Final repository and production audit | Not started |

## Completed merge records

### PR 1 — #165

- Merge commit: `f51e27c8f6f7b93282f38c7c974c015f78a2d129`
- Removed Wrangler Cron declarations and added the fetch-only entrypoint and no-background guard.
- Production was not verified.

### PR 2 — #166

- Merge commit: `41eabc288f9ed21c5f0041339415e2aefc5869f4`
- Added canonical `dist/`, build identity, artifact validation, public-source verification, and manual Pages deployment.
- Pages production deployment remains pending.

### PR 3 — #167

- Merge commit: `95fa885f80435ea02651b595a687d08f59305d98`
- Converted history access to read-only operation.
- Removed public collection and retention mutation routes.
- Removed Worker scheduled handlers and the remaining scheduled GitHub workflow.
- Preserved the existing list response shape.
- Excluded the experimental test tree from production artifacts.
- Hosted SEO Check run #62 passed all guards, runtime tests, build, and artifact validation.
- Worker deployment and Cloudflare Cron Trigger confirmation remain pending.

### PR 4 — #168

- Merge commit: `eb60bc0a968fa69aeac2b8d8f572e4c57ba841f5`
- Oracle and Paymaster now use a fixed World Chain Mainnet RPC and reject caller URL parameters.
- Public GET checks no longer write KV.
- External responses are time-limited, redirect-blocked, and size-limited.
- Pages API forwarding is an exact GET allowlist rather than a broad proxy.
- Unknown routes, write methods, the notification route, and untrusted browser origins are rejected.
- Browser RPC and sponsor POST fallbacks were removed from the public UI.
- Hosted SEO Check run #65 passed all guards, negative tests, syntax, SEO, build, and artifact validation.
- Pages and Worker production deployments remain pending.

### PR 5 — #169

- Merge commit: `0b4740a191215ce0160c47065fe46e3786f96fdf`.
- Merge method: non-force fast-forward after the immediate merge endpoint was blocked; GitHub records the PR as merged.
- TPS and sampled activity shares are explicitly labeled estimates.
- A measured rolling 24-hour transaction count is unavailable instead of being synthesized as TPS × 86,400.
- Address totals and unsupported market fields are shown as unavailable.
- Response-generation, observation, source, and deployment timestamps are separated.
- Unknown deployment time remains `null`.
- Daily records are displayed only when they declare a valid UTC calendar-day boundary.
- Old Cron wording was removed from the Monitor.
- Hosted SEO Check run #68 passed all existing guards plus the new Monitor semantic tests, build, and artifact validation.
- Production deployment remains pending.

## Open production gates

1. Identify the existing Pages project and custom-domain attachment.
2. Confirm the production branch and output configuration.
3. Disable any competing stale deployment path.
4. Manually deploy Pages and Worker from a successful hosted-CI commit.
5. Verify public source commit markers and removed-route behavior.
6. Verify the hardened API and Monitor semantics in production.
7. Confirm Cloudflare Cron Trigger remains zero.

## Next PR: PR 6

- apply explicit route-specific cache policies instead of universal `no-store`;
- ensure remaining external/browser fetches have bounded timeouts and cancellation;
- remove duplicate Monitor summary requests;
- consolidate related reads without introducing background work or persistent cache writes;
- add regression tests for cache headers, timeout behavior, and request counts.
