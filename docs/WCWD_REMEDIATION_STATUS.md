# WCWD Remediation Status

**Status:** Active  
**Last updated:** 2026-06-30 after PR 9 merge  
**Current position:** PR 10 — Token Heatmap safety and truthfulness  
**Latest merged remediation PR:** #173  
**Latest merge commit:** `00311ae303e78a797be1b1fc0a4aa9d794938b2b`

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
| PR 6 | Cache, timeout, cancellation, request consolidation | Merged — #170; production pending |
| PR 7 | Build, route, sitemap, and CI drift unification | Merged — #171; production pending |
| PR 8 | Alert thresholds and event lifecycle | Merged — #172; production pending |
| PR 9 | Ecosystem data validation | Merged — #173; production pending |
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

### PR 2 — #166
- Merge commit: `41eabc288f9ed21c5f0041339415e2aefc5869f4`
- Added canonical `dist/`, build identity, artifact validation, public-source verification, and manual Pages deployment.

### PR 3 — #167
- Merge commit: `95fa885f80435ea02651b595a687d08f59305d98`
- Converted history access to read-only operation and removed public collection and retention mutation routes.
- Hosted SEO Check run #62 passed all guards and artifact validation.

### PR 4 — #168
- Merge commit: `eb60bc0a968fa69aeac2b8d8f572e4c57ba841f5`
- Fixed the server-side external fetch boundary and replaced the broad Pages proxy with an exact read allowlist.
- Hosted SEO Check run #65 passed.

### PR 5 — #169
- Merge commit: `0b4740a191215ce0160c47065fe46e3786f96fdf`.
- Corrected Monitor metric, period, source, daily-boundary, and timestamp semantics.
- Hosted SEO Check run #68 passed.

### PR 6 — #170
- Merge commit: `f83466e112eb666f7dba690bbdda06cd89616c42`.
- Added route-specific bounded cache headers at the public Pages API boundary.
- Added bounded browser timeouts and deduplicated simultaneous Monitor summary requests.
- Hosted SEO Check run #71 passed all existing guards plus cache and request-policy tests.
- No Cache API writes, KV writes, scheduled refresh, or background retry was introduced.

### PR 7 — #171
- Merge commit: `5f9edb3cba4d636be7015e32f74056d86960179b`.
- Established `config/routes.json` as the canonical route and metadata registry.
- Drove registered page builds, sitemap generation, SEO checks, and artifact validation from that registry.
- Added CI guards for route drift, public `/test/` links, generated-file drift, and direct Worker host references.

### PR 8 — #172
- Merge commit: `f23c69ba794e5fe8578d76bdb5e338b38d4e9157`.
- Unified alert thresholds and event lifecycle handling across API, frontend, and tests.
- Added policy/event tests that prevent duplicate visible events for continuing conditions.

### PR 9 — #173
- Merge commit: `00311ae303e78a797be1b1fc0a4aa9d794938b2b`.
- Added static ecosystem verification metadata with current review dates, review intervals, sources, confidence, and dated editorial feature metadata.
- Updated the ecosystem UI to distinguish reviewed World Chain records, stale review state, unverified records, and official offchain records.
- Strengthened ecosystem CI checks for duplicate IDs/contracts, World Chain contract identity, dates, source URLs, status, confidence, and permanent hot/new flag regressions.
- Hosted PR checks passed on 2026-06-30: PR8 Check, PR9 Check, SEO Check, and Cloudflare Pages preview.

## Open production gates

1. Identify the existing Pages project and custom-domain attachment.
2. Confirm production branch and output configuration.
3. Manually deploy Pages and Worker from a successful hosted-CI commit when the repository phase is ready.
4. Verify public build markers, removed routes, hardened APIs, semantic labels, cache headers, and ecosystem review labels.
5. Confirm Cloudflare Cron Trigger remains zero.

## Current PR: PR 10

- remove synthetic Token Heatmap fallback data from public presentation;
- keep the route unavailable or static-reviewed when current data is absent;
- require token identity, World Chain contract, source, timestamp, and freshness before rendering observed values;
- keep the route non-indexable and out of the sitemap while it is not a truthful live-data surface;
- preserve production deployment as a separate manual gate.
