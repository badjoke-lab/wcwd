#!/usr/bin/env python3
"""Reject recurring/background automation in the active WCWD deployment path."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []
warnings: list[str] = []

wrangler_files = sorted(ROOT.glob("wrangler*.toml"))
if not wrangler_files:
    errors.append("No Wrangler configuration found")

main_paths: set[Path] = set()
wrangler_patterns = (
    (re.compile(r"(?m)^\s*\[triggers\]\s*$"), "Cloudflare [triggers] section"),
    (re.compile(r"(?m)^\s*crons\s*="), "Cloudflare crons declaration"),
    (re.compile(r"(?m)^\s*\[\[d1_databases\]\]"), "D1 binding"),
    (re.compile(r"(?m)^\s*\[durable_objects\]"), "Durable Objects binding"),
    (re.compile(r"(?m)^\s*\[\[queues\.(?:producers|consumers)\]\]"), "Queues binding"),
    (re.compile(r"(?m)^\s*\[\[workflows\]\]"), "Cloudflare Workflows binding"),
    (re.compile(r"(?m)^\s*ai\s*="), "Workers AI binding"),
    (re.compile(r"(?m)^\s*browser\s*="), "Browser Rendering binding"),
)

for path in wrangler_files:
    text = path.read_text(encoding="utf-8")
    for pattern, label in wrangler_patterns:
        if pattern.search(text):
            errors.append(f"{path.relative_to(ROOT)}: forbidden {label}")

    main_match = re.search(r'(?m)^\s*main\s*=\s*"([^"]+)"\s*$', text)
    if not main_match:
        errors.append(f"{path.relative_to(ROOT)}: missing main entrypoint")
        continue
    main_path = ROOT / main_match.group(1)
    main_paths.add(main_path)
    if not main_path.is_file():
        errors.append(f"{path.relative_to(ROOT)}: entrypoint does not exist: {main_path.relative_to(ROOT)}")

scheduled_pattern = re.compile(r"\b(?:async\s+)?scheduled\s*\(")
for path in sorted(main_paths):
    if path.is_file() and scheduled_pattern.search(path.read_text(encoding="utf-8")):
        errors.append(f"{path.relative_to(ROOT)}: active Worker entrypoint exports scheduled()")

expected_entrypoint = ROOT / "src/entrypoint.js"
if expected_entrypoint not in main_paths:
    errors.append("Active Wrangler configuration must use src/entrypoint.js")
elif expected_entrypoint.is_file():
    entrypoint = expected_entrypoint.read_text(encoding="utf-8")
    if "worker.fetch(request, env, ctx)" not in entrypoint:
        errors.append("src/entrypoint.js must delegate only the fetch handler")

# These two pre-existing handlers are unreachable through the fetch-only entrypoint.
# PR 3 removes the legacy write/collection code and this temporary allowlist.
legacy_allowed = {
    ROOT / "src/index.js",
    ROOT / "src/worker.js",
}
for path in sorted((ROOT / "src").rglob("*")):
    if path.suffix not in {".js", ".mjs", ".cjs", ".ts", ".tsx"}:
        continue
    if not scheduled_pattern.search(path.read_text(encoding="utf-8")):
        continue
    if path in legacy_allowed:
        warnings.append(f"{path.relative_to(ROOT)}: dormant legacy scheduled() pending removal in remediation PR 3")
    else:
        errors.append(f"{path.relative_to(ROOT)}: new scheduled() handler is forbidden")

schedule_pattern = re.compile(r"(?m)^\s*schedule\s*:")
workflows = ROOT / ".github" / "workflows"
if workflows.exists():
    for path in sorted(workflows.glob("*.y*ml")):
        text = path.read_text(encoding="utf-8")
        if schedule_pattern.search(text):
            errors.append(f"{path.relative_to(ROOT)}: GitHub Actions schedule trigger is forbidden")

for warning in warnings:
    print(f"WARNING: {warning}")

if errors:
    print("No-background-automation guard failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("No-background-automation guard passed: active deployment has no Cron or scheduled handler.")
