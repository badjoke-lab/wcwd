#!/usr/bin/env python3
from datetime import date
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
records = json.loads((root / "ecosystem.json").read_text())
registry = json.loads((root / "ecosystem.v2.json").read_text())

ids = [item["id"] for item in records]
assert len(ids) == len(set(ids)), "ecosystem.json contains duplicate ids"

review_ids = [item["id"] for item in registry["records"]]
assert len(review_ids) == len(set(review_ids)), "ecosystem.v2.json contains duplicate ids"
assert set(ids) == set(review_ids), "review registry ids must match ecosystem records"

contracts = set()
address_re = re.compile(r"^0x[a-fA-F0-9]{40}$")
for item in records:
    assert item.get("status") in {"active", "unavailable", "unverified"}, f"{item['id']} has invalid status"
    assert "hot" not in item and "hot_rank" not in item and "new" not in item, f"{item['id']} uses permanent featured flags"
    for contract in item.get("contracts", []):
        assert contract.get("chainId") == 480, f"{item['id']} has non-World Chain contract"
        address = contract.get("address", "")
        assert address_re.match(address), f"{item['id']} has invalid contract address"
        key = (contract["chainId"], address.lower())
        assert key not in contracts, f"duplicate contract {address}"
        contracts.add(key)

for item in registry["records"]:
    assert "hot" not in item and "hot_rank" not in item and "new" not in item, f"{item['id']} uses permanent featured flags"
    verified = date.fromisoformat(item["verified_at"])
    review_after = date.fromisoformat(item["review_after"])
    assert (review_after - verified).days == registry["review_interval_days"]
    assert item["confidence"] in {"high", "medium", "low"}
    assert item["sources"]
    assert all(str(url).startswith("https://") for url in item["sources"])
    editorial = item.get("editorial")
    if editorial:
        date.fromisoformat(editorial["featured_until"])
        assert isinstance(editorial["rank"], int) and editorial["rank"] > 0
print("ecosystem review fields passed")
