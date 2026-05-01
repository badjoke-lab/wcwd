#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any

DEFAULT_BASE_URL = "https://wcwd.badjoke-lab.com"


def fetch_json(url: str, timeout: int) -> tuple[int, dict[str, Any]]:
    req = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "wcwd-token-heatmap-check/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        status = int(getattr(res, "status", 0) or 0)
        raw = res.read().decode("utf-8", "replace")
        return status, json.loads(raw)


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def check_meta(base: str, timeout: int) -> dict[str, Any]:
    status, body = fetch_json(f"{base}/api/world-chain/token-heatmap/meta", timeout)
    if status != 200:
        fail(f"meta status={status}")
    if body.get("ok") is not True:
        fail("meta ok is not true")
    if body.get("max_tokens") != 40:
        fail(f"meta max_tokens expected 40, got {body.get('max_tokens')}")
    if body.get("history") != "none":
        fail(f"meta history expected none, got {body.get('history')}")
    if body.get("raw_storage") is not False:
        fail("meta raw_storage expected false")
    if body.get("public_refresh") is not False:
        fail("meta public_refresh expected false")
    return body


def check_latest(base: str, timeout: int, path: str = "/api/world-chain/token-heatmap/latest") -> dict[str, Any]:
    status, body = fetch_json(f"{base}{path}", timeout)
    if status != 200:
        fail(f"latest status={status} path={path}")
    if body.get("ok") is not True:
        fail(f"latest ok is not true path={path}")
    if body.get("status") not in {"fresh", "partial", "stale", "demo", "degraded"}:
        fail(f"unexpected latest status={body.get('status')} path={path}")
    tokens = body.get("tokens")
    if not isinstance(tokens, list) or not tokens:
        fail(f"latest tokens missing path={path}")
    if len(tokens) > 40:
        fail(f"latest token count exceeds 40: {len(tokens)} path={path}")
    for idx, token in enumerate(tokens):
        for key in ["symbol", "address", "volume24h", "liquidityUsd", "riskState", "dataStatus"]:
            if key not in token:
                fail(f"token[{idx}] missing {key} path={path}")
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description="Check WCWD World Chain Token Heatmap API gate conditions.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL, default: https://wcwd.badjoke-lab.com")
    parser.add_argument("--timeout", default=20, type=int)
    parser.add_argument("--sleep", default=2, type=int, help="Seconds to wait between latest calls")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    started = time.time()

    try:
        meta = check_meta(base, args.timeout)
        latest = check_latest(base, args.timeout)
        time.sleep(max(0, args.sleep))
        refresh = check_latest(base, args.timeout, "/api/world-chain/token-heatmap/latest?refresh=1")
    except urllib.error.URLError as exc:
        fail(f"network error: {exc}")
    except json.JSONDecodeError as exc:
        fail(f"invalid json: {exc}")

    latest_updated = latest.get("updatedAt")
    refresh_updated = refresh.get("updatedAt")
    print("PASS: token heatmap API gate checks")
    print(json.dumps({
        "base_url": base,
        "elapsed_sec": round(time.time() - started, 2),
        "meta": {
            "max_tokens": meta.get("max_tokens"),
            "history": meta.get("history"),
            "raw_storage": meta.get("raw_storage"),
            "public_refresh": meta.get("public_refresh"),
            "cache_ttl_min": meta.get("cache_ttl_min"),
        },
        "latest": {
            "status": latest.get("status"),
            "source": latest.get("source"),
            "count": len(latest.get("tokens") or []),
            "updatedAt": latest_updated,
            "reason": latest.get("reason"),
        },
        "refresh_query": {
            "status": refresh.get("status"),
            "source": refresh.get("source"),
            "count": len(refresh.get("tokens") or []),
            "updatedAt": refresh_updated,
            "same_updated_at_as_latest": latest_updated == refresh_updated,
        },
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
