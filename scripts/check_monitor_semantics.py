#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
errors = []
index = (root / "src/index.js").read_text(encoding="utf-8")
semantics = (root / "src/monitor-semantics.js").read_text(encoding="utf-8")
daily = (root / "src/monitor-daily.js").read_text(encoding="utf-8")
summary = (root / "src/monitor-summary.js").read_text(encoding="utf-8")
html = (root / "world-chain/monitor/index.html").read_text(encoding="utf-8")
notes = (root / "world-chain/monitor/monitor-notes.js").read_text(encoding="utf-8")

required = {
    "src/index.js": ("normalizeSummary", "normalizeVersion", "normalizeDailyRecord"),
    "src/monitor-semantics.js": ("no_measured_24h_counter", "deployed_at_known", "sampled_block_window"),
    "src/monitor-daily.js": ("utc_calendar_day", "daily_boundary_unverified", "day_end_utc_exclusive"),
    "src/monitor-summary.js": ("metric_semantics", "timestamp_semantics", "observed_at"),
    "world-chain/monitor/monitor-notes.js": ("TPS is not multiplied into a daily total", "renderMonitorMetricSemantics", "Unavailable"),
}
texts = {
    "src/index.js": index,
    "src/monitor-semantics.js": semantics,
    "src/monitor-daily.js": daily,
    "src/monitor-summary.js": summary,
    "world-chain/monitor/monitor-notes.js": notes,
}
for name, markers in required.items():
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f"{name}: missing {marker}")

for obsolete in ("Tx/day (est.)", "Workers Cron", "Cloudflare Workers Cron"):
    if obsolete in html:
        errors.append(f"monitor HTML still contains obsolete wording: {obsolete}")
for marker in ("Transactions (rolling 24h)", "Automatic collection is disabled", "Unavailable: no full address indexer"):
    if marker not in html:
        errors.append(f"monitor HTML missing semantic marker: {marker}")

if errors:
    print("Monitor semantics guard failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)
print("Monitor semantics guard passed.")
