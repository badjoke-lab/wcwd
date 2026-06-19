#!/usr/bin/env python3
from datetime import date
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
registry = json.loads((root / "ecosystem.v2.json").read_text())
for item in registry["records"]:
    verified = date.fromisoformat(item["verified_at"])
    review_after = date.fromisoformat(item["review_after"])
    assert (review_after - verified).days == registry["review_interval_days"]
    assert item["confidence"] in {"high", "medium", "low"}
    assert item["sources"]
    assert all(str(url).startswith("https://") for url in item["sources"])
print("ecosystem review fields passed")
