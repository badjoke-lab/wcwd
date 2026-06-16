#!/usr/bin/env python3
"""Reject public collection/admin routes and read endpoints with write helpers."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "src" / "index.js"
WORKER = ROOT / "src" / "worker.js"
errors: list[str] = []

sources = {
    "src/index.js": INDEX.read_text(encoding="utf-8"),
    "src/worker.js": WORKER.read_text(encoding="utf-8"),
}
combined = "\n".join(sources.values())

for route in (
    "/run",
    "/api/retention/enforce",
    "/api/sell-impact/watchlist/run",
):
    for path, text in sources.items():
        if f'pathname === "{route}"' in text or f"pathname === '{route}'" in text:
            errors.append(f"{path}: forbidden public write/admin route {route}")

index_text = sources["src/index.js"]
for identifier in (
    "updateSellImpactWatchlist",
    "enforceBaseRetention",
    "writeRetentionMetadata",
):
    if re.search(rf"\b{re.escape(identifier)}\b", index_text):
        errors.append(f"src/index.js: forbidden write helper {identifier}")

retention_match = re.search(
    r'if\s*\(pathname\s*===\s*["\']/api/retention["\']\)\s*\{(.*?)\n\s*\}',
    index_text,
    flags=re.S,
)
if not retention_match:
    errors.append("src/index.js: read-only /api/retention route is missing")
else:
    retention_block = retention_match.group(1)
    if "buildRetentionMetadata" not in retention_block:
        errors.append("src/index.js: /api/retention must build metadata without storage")
    for forbidden in (".put(", ".delete(", "writeRetentionMetadata", "enforceBaseRetention"):
        if forbidden in retention_block:
            errors.append(f"src/index.js: /api/retention contains write operation {forbidden}")

if re.search(r"\b(?:async\s+)?scheduled\s*\(", combined):
    errors.append("Worker source still contains scheduled()")

worker_text = sources["src/worker.js"]
if "runOnce(" in worker_text:
    errors.append("src/worker.js: legacy collection function runOnce remains")
if 'env.SUMMARY_URL' in worker_text:
    errors.append("src/worker.js: legacy background summary fetch remains")

if errors:
    print("Public write-route guard failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("Public write-route guard passed: collection/admin routes are absent and retention GET is read-only.")
