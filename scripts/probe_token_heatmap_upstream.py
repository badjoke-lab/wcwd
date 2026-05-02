#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from typing import Any

GT_BASE = "https://api.geckoterminal.com/api/v2"
GT_ACCEPT = "application/json;version=20230203"
DEFAULT_NETWORK = "world-chain"


def fetch_json(url: str, timeout: int) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            "accept": GT_ACCEPT,
            "user-agent": "wcwd-token-heatmap-upstream-probe/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8", "replace"))


def num(value: Any) -> float:
    try:
        n = float(str(value or "0"))
    except ValueError:
        return 0.0
    return n if n == n and n not in {float("inf"), float("-inf")} else 0.0


def parse_token_addr_from_id(value: Any) -> str:
    s = str(value or "")
    marker = "_0x"
    i = s.find(marker)
    if i >= 0:
        return s[i + 1 :].lower()
    return s.lower() if s.startswith("0x") else ""


def clean_symbol(value: Any) -> str:
    raw = str(value or "TOKEN").strip()
    if not raw:
        return "TOKEN"
    # GeckoTerminal pool names can contain fee suffixes; keep the left token symbol compact.
    return raw.split()[0].strip() or "TOKEN"


def normalize_pool(pool: dict[str, Any]) -> dict[str, Any] | None:
    attrs = pool.get("attributes") or {}
    rel = pool.get("relationships") or {}
    base_id = ((rel.get("base_token") or {}).get("data") or {}).get("id")
    base_addr = parse_token_addr_from_id(base_id)
    if not base_addr:
        return None
    name = str(attrs.get("name") or attrs.get("pool_name") or "").strip()
    base_symbol = clean_symbol(name.split("/")[0] if name else "TOKEN")
    volume24h = num((attrs.get("volume_usd") or {}).get("h24"))
    liquidity = num(attrs.get("reserve_in_usd"))
    if volume24h <= 0 and liquidity <= 0:
        return None
    return {
        "address": base_addr,
        "symbol": base_symbol,
        "volume24h": volume24h,
        "liquidityUsd": liquidity,
        "pool": str(attrs.get("address") or "").lower(),
    }


def fetch_pools(network: str, pages: int, timeout: int, sleep: float) -> tuple[list[dict[str, Any]], list[str]]:
    pools: list[dict[str, Any]] = []
    errors: list[str] = []
    for page in range(1, pages + 1):
        url = f"{GT_BASE}/networks/{urllib.parse.quote(network)}/pools?page={page}"
        try:
            body = fetch_json(url, timeout)
            rows = body.get("data") or []
            if not isinstance(rows, list):
                errors.append(f"page_{page}:data_not_list")
                break
            pools.extend(rows)
        except urllib.error.HTTPError as exc:
            errors.append(f"page_{page}:http_{exc.code}")
            if page == 1:
                break
        except Exception as exc:
            errors.append(f"page_{page}:{type(exc).__name__}:{exc}")
            if page == 1:
                break
        if sleep > 0 and page < pages:
            time.sleep(sleep)
    return pools, errors


def aggregate(pools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_addr: dict[str, dict[str, Any]] = {}
    for pool in pools:
        token = normalize_pool(pool)
        if not token:
            continue
        key = token["address"]
        if key not in by_addr:
            by_addr[key] = token.copy()
            by_addr[key]["pool_count"] = 1
        else:
            prev = by_addr[key]
            prev["volume24h"] += token["volume24h"]
            prev["liquidityUsd"] += token["liquidityUsd"]
            prev["pool_count"] += 1
            if token["volume24h"] > prev.get("best_pool_volume", 0):
                prev["pool"] = token["pool"]
            prev["best_pool_volume"] = max(prev.get("best_pool_volume", 0), token["volume24h"])
    return sorted(by_addr.values(), key=lambda t: (t["volume24h"], t["liquidityUsd"]), reverse=True)


def run_probe(network: str, page_options: list[int], timeout: int, sleep: float) -> dict[str, Any]:
    results = []
    for pages in page_options:
        pools, errors = fetch_pools(network, pages, timeout, sleep)
        tokens = aggregate(pools)
        drawable = [t for t in tokens if t["volume24h"] > 0 or t["liquidityUsd"] > 0]
        results.append(
            {
                "pages": pages,
                "pools_seen": len(pools),
                "unique_drawable_tokens": len(drawable),
                "top40_fill": min(40, len(drawable)),
                "top60_fill": min(60, len(drawable)),
                "errors": errors,
                "top_symbols": [t["symbol"] for t in drawable[:12]],
            }
        )
    best = max(results, key=lambda r: r["unique_drawable_tokens"]) if results else None
    decision = "do_not_unlock_top60"
    reason = "No probe results."
    if best:
        if best["unique_drawable_tokens"] >= 55:
            decision = "can_consider_optional_top60"
            reason = "Probe found enough drawable tokens for a meaningful optional Top60 view."
        elif best["unique_drawable_tokens"] >= 40:
            decision = "expand_top40_source_first"
            reason = "Probe can fill Top40 more reliably, but still does not justify Top60."
        else:
            decision = "keep_top40"
            reason = "Probe did not find enough drawable tokens beyond the current Top40 range."
    return {
        "network": network,
        "page_options": page_options,
        "results": results,
        "recommendation": {
            "decision": decision,
            "reason": reason,
            "best_pages": best and best["pages"],
            "best_unique_drawable_tokens": best and best["unique_drawable_tokens"],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe GeckoTerminal upstream page counts for WCWD Token Heatmap.")
    parser.add_argument("--network", default=DEFAULT_NETWORK)
    parser.add_argument("--pages", default="3,5,8", help="Comma-separated page counts to test")
    parser.add_argument("--timeout", default=20, type=int)
    parser.add_argument("--sleep", default=0.3, type=float, help="Sleep between upstream page requests")
    args = parser.parse_args()

    page_options = sorted({int(x.strip()) for x in args.pages.split(",") if x.strip()})
    if not page_options or any(x < 1 or x > 10 for x in page_options):
        raise SystemExit("--pages values must be between 1 and 10")

    report = run_probe(args.network, page_options, args.timeout, args.sleep)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
