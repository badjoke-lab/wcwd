# WCWD Operations

**Current operating model:** manual deployment, no Cloudflare Cron, no background collection.

This document is subordinate to `docs/CURRENT_ARCHITECTURE.md`. Older Cron/KV operating instructions are cancelled.

## 1. Services

- Pages: `https://wcwd.badjoke-lab.com/`
- Worker API: `https://wcwd-history.badjoke-lab.workers.dev`
- Repository: `badjoke-lab/wcwd`

Cloudflare Cron Triggers must remain at zero. The Worker must be deployed through the fetch-only entrypoint configured in `wrangler.toml`.

## 2. Canonical Pages build

Run from a clean checkout:

```bash
python3 scripts/check_no_cloudflare_automation.py
python3 scripts/build_pages.py
python3 scripts/gen_sitemap.py
git diff --exit-code
python3 scripts/build_pages_dist.py --commit "$(git rev-parse HEAD)"
python3 scripts/check_pages_artifact.py dist --expected-commit "$(git rev-parse HEAD)"
```

`dist/` is the approved Pages upload directory. Uploading the repository root is prohibited because it can expose internal files and makes the deployed output ambiguous.

## 3. Canonical Pages deployment

Use the manual GitHub workflow `.github/workflows/deploy-pages.yml`.

Required inputs:

- `project_name`: the existing Cloudflare Pages project name; do not guess it;
- `production_branch`: normally `main`;
- `production_url`: normally `https://wcwd.badjoke-lab.com`.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN` with Cloudflare Pages edit permission;
- `CLOUDFLARE_ACCOUNT_ID`.

The workflow disables Wrangler auto-create/provision behavior. It must fail rather than create a new project when the supplied project name is wrong.

## 4. Production verification

Every production deployment must pass:

```bash
python3 scripts/check_production_source.py \
  --base-url https://wcwd.badjoke-lab.com \
  --expected-commit "$(git rev-parse HEAD)"
```

The verification checks:

- `/version.json` commit;
- the commit marker embedded in Home HTML;
- current Home section markers;
- absence of the obsolete combined Home/Monitor content.

A successful repository merge is not a successful production deployment. Record repository state and production state separately.

## 5. Cloudflare dashboard settings requiring manual confirmation

The repository cannot inspect these settings directly. Before declaring production repaired, record evidence for:

- Pages project name;
- connected repository `badjoke-lab/wcwd`;
- production branch `main` if Git integration remains enabled;
- build output directory or Direct Upload method;
- custom domain `wcwd.badjoke-lab.com` attached to the intended project;
- Cloudflare Cron Triggers = 0;
- no unexpected Queues, Workflows, Durable Object alarms, or other recurring resources.

If Git integration is stale or points to a different branch/output, either correct it to the canonical build or disable automatic deployments and use the manual Direct Upload workflow. Do not operate two competing production deployment paths.

## 6. Worker deployment

Use `.github/workflows/deploy-history-worker.yml` manually. It runs the no-background-automation guard before deployment.

Do not restore:

- Wrangler `[triggers]` / `crons`;
- an exported Worker `scheduled()` handler;
- an automatic deployment schedule.

Legacy public write and collection routes remain unresolved until remediation PR 3 and must not be used as normal operations.

## 7. Incident recovery

When production content does not match `main`:

1. run the production source checker and save its exact failure;
2. inspect `/version.json` and the Home build marker;
3. identify the Pages project and production deployment commit in Cloudflare;
4. verify the custom domain points to that same project;
5. rebuild `dist/` from the intended commit;
6. manually deploy the existing Pages project;
7. rerun the production source checker;
8. record the deployment commit and verification result in `docs/WCWD_REMEDIATION_STATUS.md`.

Do not fix a stale site by restoring old build scripts, uploading an unknown directory, or re-enabling Cron.
