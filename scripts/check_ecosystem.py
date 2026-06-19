#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
records = json.loads((ROOT / "ecosystem.json").read_text())
reviews = json.loads((ROOT / "ecosystem.v2.json").read_text())["records"]
assert {x["id"] for x in records} == {x["id"] for x in reviews}
print(f"ecosystem records: {len(records)}")
