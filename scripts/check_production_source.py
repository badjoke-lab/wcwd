#!/usr/bin/env python3
"""Verify that public WCWD production serves the expected repository build."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def fetch(url: str, timeout: float) -> tuple[bytes, dict[str, str]]:
    request = Request(url, headers={"User-Agent": "WCWD-production-source-check/1.0"})
    with urlopen(request, timeout=timeout) as response:
        return response.read(), {key.lower(): value for key, value in response.headers.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="https://wcwd.badjoke-lab.com")
    parser.add_argument("--expected-commit", required=True)
    parser.add_argument("--attempts", type=int, default=6)
    parser.add_argument("--delay-seconds", type=float, default=10)
    parser.add_argument("--timeout", type=float, default=15)
    args = parser.parse_args()

    expected = args.expected_commit.lower()
    base = args.base_url.rstrip("/")
    errors: list[str] = []

    for attempt in range(1, max(1, args.attempts) + 1):
        cache_bust = urlencode({"wcwd_verify": expected, "attempt": attempt})
        errors = []
        try:
            version_raw, _ = fetch(f"{base}/version.json?{cache_bust}", args.timeout)
            version = json.loads(version_raw.decode("utf-8"))
            actual = str(version.get("commit_sha") or "").lower()
            if actual != expected:
                errors.append(f"version.json commit mismatch: expected {expected}, got {actual or 'missing'}")

            home_raw, _ = fetch(f"{base}/?{cache_bust}", args.timeout)
            home = home_raw.decode("utf-8", errors="replace")
            marker = re.search(
                r'<meta\s+name=["\']wcwd-build-commit["\']\s+content=["\']([^"\']+)["\']',
                home,
                flags=re.I,
            )
            if not marker:
                errors.append("production home has no wcwd-build-commit marker")
            elif marker.group(1).lower() != expected:
                errors.append(f"home marker mismatch: expected {expected}, got {marker.group(1).lower()}")

            for required in (
                'id="wld-snapshot-title"',
                'id="network-snapshot-title"',
                'id="sell-impact-snapshot-title"',
                'id="tool-directory-title"',
            ):
                if required not in home:
                    errors.append(f"production home missing current marker: {required}")
            for obsolete in ("World Chain Monitor (Phase 0)", "History: sampled by Cloudflare Workers Cron"):
                if obsolete in home:
                    errors.append(f"production home still contains obsolete content: {obsolete}")

            if not errors:
                print(f"Production source check passed: {base} serves {expected}")
                return
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeError) as error:
            errors.append(f"request/parse failure: {error}")

        print(f"Attempt {attempt}/{args.attempts} failed: {'; '.join(errors)}", file=sys.stderr)
        if attempt < args.attempts:
            time.sleep(max(0, args.delay_seconds))

    print("Production source check failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)


if __name__ == "__main__":
    main()
