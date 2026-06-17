# WCWD Operations

**Current operating model:** manual deployment, no Cloudflare Cron, no background collection.

This document is subordinate to `docs/CURRENT_ARCHITECTURE.md`. Older Cron/KV and arbitrary-proxy operating instructions are cancelled.

## 1. Services

- Pages: `https://wcwd.badjoke-lab.com/`
- Worker API: `https://wcwd-history.badjoke-lab.workers.dev`
- Repository: `badjoke-lab/wcwd`

Cloudflare Cron Triggers must remain at zero. The Worker must be deployed through the fetch-only entrypoint configured in `wrangler.toml`.

## 2. Canonical Pages build

Run from a clean checkout:

```bash
python3 scripts/check_no_cloudflare_automation.py
python3 scripts/check_no_public_write_routes.py
python3 scripts/check_external_fetch_policy.py
node --experimental-default-type=module scripts/test_read_only_worker.mjs
node --experimental-default-type=module scripts/test_external_fetch_policy.mjs
python3 scripts/build_pages.py
python3 scripts/gen_sitemap.py
git diff --exit-code
python3 scripts/build_pages_dist.py --commit "$(git rev-parse HEAD)"
python3 scripts/check_pages_artifact.py dist --expected-commit "$(git rev-parse HEAD)"
```

`dist/` is the approved Pages upload directory. Uploading the repository root is prohibited. The experimental `test/` tree must not appear in the artifact.

## 3. Canonical Pages deployment

Use the manual GitHub workflow `.github/workflows/deploy-pages.yml` only after the selected commit has a successful hosted SEO Check run.

Required inputs:

- `project_name`: the existing Cloudflare Pages project name; do not guess it;
- `production_branch`: normally `main`;
- `production_url`: normally `https://wcwd.badjoke-lab.com`.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN` with Cloudflare Pages edit permission;
- `CLOUDFLARE_ACCOUNT_ID`.

The workflow disables Wrangler auto-create/provision behavior. It must fail rather than create a new project when the supplied project name is wrong.

## 4. Pages API proxy policy

`functions/api/[[path]].js` is an exact allowlisted GET proxy.

- It forwards only listed read routes to the fixed WCWD Worker origin.
- It does not forward POST bodies, authorization headers, cookies, or arbitrary request headers.
- Unknown routes and non-GET methods return an error without reaching the Worker.
- `/api/test-notify` is intentionally not proxied.
- Browser CORS access is limited to trusted WCWD origins.
- Redirects are rejected.
- Upstream requests time out after ten seconds.
- Responses larger than 1 MiB are rejected.

Before deploying Pages, run:

```bash
python3 scripts/check_external_fetch_policy.py
node --experimental-default-type=module scripts/test_external_fetch_policy.mjs
```

## 5. Production verification

Every production deployment must pass:

```bash
python3 scripts/check_production_source.py \
  --base-url https://wcwd.badjoke-lab.com \
  --expected-commit "$(git rev-parse HEAD)"
```

The verification checks `/version.json`, the Home build marker, current Home structure, and absence of obsolete combined Home/Monitor content.

A successful repository merge is not a successful production deployment. Record repository state and production state separately.

## 6. Cloudflare dashboard settings requiring manual confirmation

The repository cannot inspect these settings directly. Before declaring production repaired, record evidence for:

- Pages project name;
- connected repository `badjoke-lab/wcwd`;
- production branch `main` if Git integration remains enabled;
- build output directory or Direct Upload method;
- custom domain `wcwd.badjoke-lab.com` attached to the intended project;
- Cloudflare Cron Triggers = 0;
- no unexpected Queues, Workflows, Durable Object alarms, or other recurring resources.

If Git integration is stale or points to a different branch/output, correct it or disable it. Do not operate two competing production deployment paths.

## 7. Worker deployment

Use `.github/workflows/deploy-history-worker.yml` manually. Before deployment it runs:

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

The Worker reads existing bounded KV records. It does not collect new snapshots or generate history automatically.

Removed routes that must return 404:

- `POST /run`
- `POST /api/retention/enforce`
- `POST /api/sell-impact/watchlist/run`

`GET /api/retention` is read-only. The authenticated `POST /api/test-notify` remains available only when `ADMIN_TOKEN` is configured and is not exposed through Pages.

## 8. Oracle and Paymaster external fetch policy

- The Worker uses the fixed World Chain Mainnet public RPC defined in source.
- A request containing `rpc=` is rejected.
- Paymaster preflight also rejects `sponsor=`.
- Oracle and Paymaster GET requests do not write KV.
- RPC redirects are rejected.
- Each RPC request has an eight-second timeout.
- Each RPC response is limited to 64 KiB.
- Sponsor endpoint requests are never sent by WCWD; the page generates a local curl template only.

Do not restore caller-selected server fetch targets, browser fallback claims in the page copy, or compact-check history writes from public GET requests.

## 9. Incident recovery

When production content does not match `main`:

1. run the production source checker and save its exact failure;
2. inspect `/version.json` and the Home build marker;
3. identify the Pages project and production deployment commit in Cloudflare;
4. verify the custom domain points to that same project;
5. rebuild `dist/` from the intended commit;
6. manually deploy the existing Pages project;
7. rerun the production source checker;
8. record the deployment commit and verification result in `docs/WCWD_REMEDIATION_STATUS.md`.

Do not fix a stale site by restoring old build scripts, uploading an unknown directory, re-enabling Cron, or reopening a general-purpose proxy.
