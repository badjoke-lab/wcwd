# WCWD

World Chain / World ID dashboard and builder toolkit.

## Current architecture

The active architecture and cost guardrails are defined in:

- [`docs/CURRENT_ARCHITECTURE.md`](docs/CURRENT_ARCHITECTURE.md)
- [`docs/WCWD_REMEDIATION_PLAN.md`](docs/WCWD_REMEDIATION_PLAN.md)
- [`docs/WCWD_REMEDIATION_STATUS.md`](docs/WCWD_REMEDIATION_STATUS.md)

Cloudflare Cron is intentionally disabled. Do not add Wrangler `crons`, Worker `scheduled()` exports, or GitHub Actions `schedule:` triggers.

## Build the committed public pages

Shared header/footer and SEO metadata are written into the tracked HTML files:

```bash
python3 scripts/build_pages.py
python3 scripts/gen_sitemap.py
```

A clean repository should have no diff after those commands:

```bash
git diff --exit-code
```

## Build the canonical Pages upload artifact

```bash
python3 scripts/build_pages_dist.py
python3 scripts/check_pages_artifact.py dist
```

The generated `dist/` directory is the only approved static upload directory. It contains `version.json` and embeds the same commit identifier in every HTML file.

## Deploy Pages

Production deployment is manual through `.github/workflows/deploy-pages.yml` (`workflow_dispatch`). The operator must provide the existing Cloudflare Pages project name. The workflow:

1. runs the no-background-automation guard;
2. regenerates and checks tracked public files;
3. builds and validates `dist/`;
4. deploys the existing Pages project without auto-creating resources;
5. verifies that the public site serves the expected commit and current Home structure.

Do not upload the repository root directly. Do not guess the Cloudflare Pages project name.

## Worker deployment

Worker deployment is manual through `.github/workflows/deploy-history-worker.yml`. The workflow runs `scripts/check_no_cloudflare_automation.py` before `wrangler deploy`.

The configured Worker entrypoint is fetch-only. Public write/admin endpoints remain scheduled for removal in remediation PR 3 and must not be treated as approved interfaces.

## Checks

```bash
python3 scripts/check_no_cloudflare_automation.py
python3 scripts/check_seo.py
python3 scripts/check_pages_artifact.py dist
```

After a Pages deployment:

```bash
python3 scripts/check_production_source.py \
  --base-url https://wcwd.badjoke-lab.com \
  --expected-commit "$(git rev-parse HEAD)"
```
