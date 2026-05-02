#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any

DEFAULT_BASE_URL = "https://wcwd-history.badjoke-lab.workers.dev"


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


def top60_recommendation(latest: dict[str, Any], refresh: dict[str, Any]) -> dict[str, Any]:
    count = len(latest.get("tokens") or [])
    latest_status = latest.get("status")
    refresh_status = refresh.get("status")
    stable_cache = latest.get("updatedAt") == refresh.get("updatedAt")
    if latest_status == "fresh" and refresh_status == "fresh" and stable_cache and count >= 38:
        decision = "can_consider_optional_top60"
        reason = "Fresh snapshot, refresh query did not bypass cache, and Top40 is nearly full."
    elif latest_status in {"fresh", "partial"} and stable_cache and count >= 34:
        decision = "defer_top60_or_expand_upstream_first"
        reason = "API is healthy, but current drawable token count is below 38; Top60 may add little unless upstream page count/filtering changes."
    else:
        decision = "do_not_unlock_top60"
        reason = "API freshness/cache/count conditions are not strong enough."
    return {
        "decision": decision,
        "reason": reason,
        "latest_count": count,
        "latest_status": latest_status,
        "refresh_status": refresh_status,
        "refresh_query_bypassed_cache": not stable_cache,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Check WCWD World Chain Token Heatmap API gate conditions.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Base URL, default: {DEFAULT_BASE_URL}")
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
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            fail(
                f"network error: HTTP 404 at {exc.url}. "
                "The Worker route is not available yet. Deploy wcwd-history worker from main, "
                "then rerun this check."
            )
        fail(f"network error: HTTP {exc.code} at {exc.url}: {exc.reason}")
    except urllib.error.URLError as exc:
        fail(f"network error: {exc}")
    except json.JSONDecodeError as exc:
        fail(f"invalid json: {exc}")

    latest_updated = latest.get("updatedAt")
    refresh_updated = refresh.get("updatedAt")
    report = {
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
        "top60_gate": top60_recommendation(latest, refresh),
    }
    print("PASS: token heatmap API gate checks")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
