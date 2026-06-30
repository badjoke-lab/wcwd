# WCWD Remediation Status

**Status:** Active  
**Last updated:** 2026-06-30 after PR 12 merge  
**Current position:** PR 13 — Static SEO/support and About rewrite  
**Latest merged remediation PR:** #176  
**Latest merge commit:** `a8fec67f42270d36e95dcc0f04526f92c3cc15b6`

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
| PR 10 | Token Heatmap safety and truthfulness | Merged — #174; production pending |
| PR 11 | Experimental route removal | Merged — #175; production pending |
| PR 12 | World ID proof persistence removal | Merged — #176; production pending |
| PR 13 | Static SEO/support and About rewrite | In progress |
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

### PR 10 — #174
- Merge commit: `15ffb31fb3389767ed2d1d514baa0bbede2af74a`.
- Replaced Token Heatmap synthetic/demo presentation with an unavailable-first read-only reviewed snapshot flow.
- Kept the route non-indexable and removed it from the sitemap while the real-data gate remains unsatisfied.
- Required source metadata, observation timestamp, freshness, token identity, World Chain `chainId: 480`, contract address, token source URL, and token timestamp before rendering token values.
- Added PR10 checks and tests for missing, malformed, valid, stale, and invalid snapshots.
- Hosted PR checks passed on 2026-06-30: PR8 Check, PR9 Check, PR10 Check, SEO Check, and Cloudflare Pages preview.

### PR 11 — #175
- Merge commit: `a116f8cabfd447d432ce24f0d810a116889327ac`.
- Removed production `/test/` navigation from source pages by regenerating stale pages from the shared production partials.
- Removed the runtime-only `/test/` navigation stripping fallback.
- Converted retained visualizer redirect paths into explicit `noindex,nofollow` unavailable pages that do not link to `/test/`.
- Strengthened source and artifact checks so production HTML cannot reference `/test/`, and the canonical artifact rejects `test/` and `dev/` trees.
- Hosted PR checks passed on 2026-06-30: PR8 Check, PR9 Check, PR10 Check, SEO Check, and Cloudflare Pages preview.

### PR 12 — #176
- Merge commit: `a8fec67f42270d36e95dcc0f04526f92c3cc15b6`.
- Made World ID proof handling ephemeral by disabling proof save/load behavior and clearing legacy proof storage keys.
- Added visible privacy warning, clear controls, 200KB proof size enforcement, and allowlisted analytics event names.
- Recovered the verified temp repair `ac1ba8164f8fbd8372ce75520e3ecc7f67dff7ff`, restoring controls and clearing stale status text when oversize input becomes valid again.
- Hosted PR checks passed on 2026-06-30: PR8 Check, PR9 Check, PR10 Check, PR12 Check, SEO Check, and Cloudflare Pages preview.

## Open production gates

1. Identify the existing Pages project and custom-domain attachment.
2. Confirm production branch and output configuration.
3. Manually deploy Pages and Worker from a successful hosted-CI commit when the repository phase is ready.
4. Verify public build markers, removed routes, hardened APIs, semantic labels, cache headers, ecosystem review labels, Token Heatmap noindex/unavailable states, absence of `/test/` production navigation, and World ID proof privacy behavior.
5. Confirm Cloudflare Cron Trigger remains zero.

## Current PR: PR 13

- keep `config/routes.json` as the canonical route and metadata source;
- make essential metadata, JSON-LD, breadcrumbs, support content, and About disclosures static HTML;
- remove runtime injection of essential SEO/support/architecture content;
- verify core content with JavaScript disabled;
- preserve production deployment as a separate manual gate.
