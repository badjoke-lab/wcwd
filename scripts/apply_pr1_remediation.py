#!/usr/bin/env python3
"""One-shot branch patcher for WCWD remediation PR 1.

This file deletes itself after applying the patch. It is not part of the final PR.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, pattern: str, replacement: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit(f"Expected exactly one {label} in {path}")
    path.write_text(updated, encoding="utf-8")


replace_once(
    ROOT / "wrangler.toml",
    r"\n# Cron: every 15 minutes\n\[triggers\]\ncrons = \[[^\n]*\]\n",
    "\n# Cloudflare Cron is intentionally disabled. Do not add [triggers] or crons.\n",
    "Wrangler Cron block",
)

for worker_path in (ROOT / "src/index.js", ROOT / "src/worker.js"):
    replace_once(
        worker_path,
        r"\n\n  async scheduled\([^)]*\) \{.*?\n  \},\n\};\s*$",
        "\n};\n",
        "scheduled() handler",
    )

checker = '''#!/usr/bin/env python3
"""Fail CI when recurring/background Cloudflare automation is reintroduced."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

wrangler_patterns = (
    (re.compile(r"(?m)^\\s*\\[triggers\\]\\s*$"), "Cloudflare [triggers] section"),
    (re.compile(r"(?m)^\\s*crons\\s*="), "Cloudflare crons declaration"),
    (re.compile(r"(?m)^\\s*\\[\\[d1_databases\\]\\]"), "D1 binding"),
    (re.compile(r"(?m)^\\s*\\[durable_objects\\]"), "Durable Objects binding"),
    (re.compile(r"(?m)^\\s*\\[\\[queues\\.(?:producers|consumers)\\]\\]"), "Queues binding"),
    (re.compile(r"(?m)^\\s*\\[\\[workflows\\]\\]"), "Cloudflare Workflows binding"),
    (re.compile(r"(?m)^\\s*ai\\s*="), "Workers AI binding"),
    (re.compile(r"(?m)^\\s*browser\\s*="), "Browser Rendering binding"),
)

for path in sorted(ROOT.glob("wrangler*.toml")):
    text = path.read_text(encoding="utf-8")
    for pattern, label in wrangler_patterns:
        if pattern.search(text):
            errors.append(f"{path.relative_to(ROOT)}: forbidden {label}")

scheduled_pattern = re.compile(r"\\b(?:async\\s+)?scheduled\\s*\\(")
src = ROOT / "src"
if src.exists():
    for path in sorted(src.rglob("*")):
        if path.suffix not in {".js", ".mjs", ".cjs", ".ts", ".tsx"}:
            continue
        text = path.read_text(encoding="utf-8")
        if scheduled_pattern.search(text):
            errors.append(f"{path.relative_to(ROOT)}: forbidden Worker scheduled() handler")

schedule_pattern = re.compile(r"(?m)^\\s*schedule\\s*:")
workflows = ROOT / ".github" / "workflows"
if workflows.exists():
    for path in sorted(workflows.glob("*.y*ml")):
        text = path.read_text(encoding="utf-8")
        if schedule_pattern.search(text):
            errors.append(f"{path.relative_to(ROOT)}: forbidden GitHub Actions schedule trigger")

if errors:
    print("Background automation guard failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("Background automation guard passed: no Cron, scheduled handler, or forbidden metered binding found.")
'''
checker_path = ROOT / "scripts/check_no_cloudflare_automation.py"
checker_path.write_text(checker, encoding="utf-8")
checker_path.chmod(0o755)

architecture = '''# WCWD Current Architecture

**Status:** Active source of truth  
**Effective date:** 2026-06-17  
**Repository:** `badjoke-lab/wcwd`

This document overrides older WCWD notes, schedules, paid-plan drafts, and implementation plans wherever they conflict with the rules below.

## Operating model

WCWD is Pages-first. Static HTML, CSS, JavaScript, and reviewed static data are the default delivery layer. A Worker may serve bounded request/response APIs, but it must not run recurring background collection.

## Mandatory cost guardrails

- Cloudflare Cron Triggers must remain at zero.
- Wrangler configuration must not contain `[triggers]` or `crons`.
- Worker source must not define `scheduled()` handlers.
- Public page views and public GET requests must not be converted into hidden maintenance jobs or implicit persistent writes.
- GitHub Actions `schedule:` triggers are prohibited unless the repository owner explicitly approves a later exception.
- Local scripts and manually dispatched (`workflow_dispatch`) maintenance are permitted when their scope and cost are reviewed.
- D1, Durable Objects, Queues, Workflows, Browser Rendering, Workers AI, or another metered Cloudflare service must not be introduced without explicit approval.

## Data updates

Live reads are initiated by an explicit user request. Historical or curated public files are generated locally or by a manually dispatched workflow, reviewed, and committed as static artifacts. Missing data must be shown as unavailable rather than synthesized.

## Existing Worker and KV limitations

The current repository still contains legacy public write and collection routes. They are unresolved audit findings, not approved architecture. Their removal or restriction is scheduled in PR 3 and PR 4 of `docs/WCWD_REMEDIATION_PLAN.md`.

Until those PRs are merged:

- do not treat the existing `/run`, retention-enforcement, or watchlist-run routes as acceptable public interfaces;
- do not add new callers for them;
- do not add new persistent history writers.

## Deployment

Worker deployment is manual. Before any Worker deployment, run:

```bash
python3 scripts/check_no_cloudflare_automation.py
```

A deployment must be rejected if the guard detects a Cron declaration, a `scheduled()` handler, an unapproved scheduled GitHub Action, or a forbidden metered binding.

## Change control

Any proposal that can create recurring execution, storage growth, paid API calls, or Cloudflare billing must state the expected cost and receive explicit owner approval before implementation.

## Remediation tracking

The full repair sequence, acceptance criteria, merge log, and current position are maintained in `docs/WCWD_REMEDIATION_PLAN.md`.
'''
(ROOT / "docs/CURRENT_ARCHITECTURE.md").write_text(architecture, encoding="utf-8")

seo = ROOT / ".github/workflows/seo-check.yml"
seo_text = seo.read_text(encoding="utf-8")
seo_needle = "      - name: Run static SEO checks\n"
seo_insert = (
    "      - name: Enforce no-background-automation guard\n"
    "        run: python3 scripts/check_no_cloudflare_automation.py\n\n"
)
if seo_insert not in seo_text:
    if seo_needle not in seo_text:
        raise SystemExit("SEO workflow insertion point not found")
    seo_text = seo_text.replace(seo_needle, seo_insert + seo_needle, 1)
seo.write_text(seo_text, encoding="utf-8")

deploy = ROOT / ".github/workflows/deploy-history-worker.yml"
deploy_text = deploy.read_text(encoding="utf-8")
deploy_needle = "      - name: Set up Node\n"
deploy_insert = (
    "      - name: Enforce no-background-automation guard\n"
    "        run: python3 scripts/check_no_cloudflare_automation.py\n\n"
)
if deploy_insert not in deploy_text:
    if deploy_needle not in deploy_text:
        raise SystemExit("Deploy workflow insertion point not found")
    deploy_text = deploy_text.replace(deploy_needle, deploy_insert + deploy_needle, 1)
deploy.write_text(deploy_text, encoding="utf-8")

for temporary in (
    ROOT / "docs/.remediation-plan-marker",
    ROOT / ".github/workflows/pr1-apply-remediation.yml",
    Path(__file__),
):
    if temporary.exists():
        temporary.unlink()
