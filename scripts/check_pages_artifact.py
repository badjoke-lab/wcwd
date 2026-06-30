#!/usr/bin/env python3
"""Validate the canonical WCWD Pages upload artifact before deployment."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

FORBIDDEN_DIRS = {".git", ".github", "dev", "docs", "scripts", "src", "partials", "functions", "node_modules", "test"}
REQUIRED_ROOT_FILES = {"index.html", "404.html", "robots.txt", "sitemap.xml", "version.json"}
RUNTIME_POLICY_PAGES = {
    Path("world-chain/monitor/index.html"),
    Path("world-chain/sell-impact/index.html"),
}
RUNTIME_POLICY_TAG = '<script src="/assets/runtime-request-policy.js"></script>'


def fail(errors: list[str]) -> None:
    print("Pages artifact check failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", nargs="?", default="dist")
    parser.add_argument("--expected-commit")
    args = parser.parse_args()

    root = Path(args.directory).resolve()
    errors: list[str] = []
    if not root.is_dir():
        fail([f"artifact directory does not exist: {root}"])

    names = {path.name for path in root.iterdir()}
    for required in sorted(REQUIRED_ROOT_FILES - names):
        errors.append(f"missing required root file: {required}")
    for forbidden in sorted(FORBIDDEN_DIRS & names):
        errors.append(f"internal or experimental directory leaked into artifact: {forbidden}")

    runtime_asset = root / "assets" / "runtime-request-policy.js"
    if not runtime_asset.is_file():
        errors.append("missing runtime request policy asset")

    version_path = root / "version.json"
    version: dict[str, object] = {}
    if version_path.is_file():
        try:
            version = json.loads(version_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"invalid version.json: {error}")

    commit = str(version.get("commit_sha") or "")
    if args.expected_commit and commit != args.expected_commit.lower():
        errors.append(f"version commit mismatch: expected {args.expected_commit.lower()}, got {commit or 'missing'}")
    if version.get("cloudflare_cron") is not False:
        errors.append("version.json must declare cloudflare_cron=false")
    if version.get("background_collection") is not False:
        errors.append("version.json must declare background_collection=false")

    marker_pattern = re.compile(
        r'<meta\s+name=["\']wcwd-build-commit["\']\s+content=["\']([^"\']+)["\']\s*/?>',
        re.I,
    )
    html_files = sorted(root.rglob("*.html"))
    if not html_files:
        errors.append("artifact contains no HTML files")

    for path in html_files:
        text = path.read_text(encoding="utf-8")
        matches = marker_pattern.findall(text)
        relative = path.relative_to(root)
        if len(matches) != 1:
            errors.append(f"{relative}: expected exactly one build marker, found {len(matches)}")
        elif matches[0] != commit:
            errors.append(f"{relative}: build marker does not match version.json")
        if relative in RUNTIME_POLICY_PAGES and text.count(RUNTIME_POLICY_TAG) != 1:
            errors.append(f"{relative}: expected exactly one runtime request policy tag")
        if "/test/" in text:
            errors.append(f"{relative}: production artifact references /test/")

    index = root / "index.html"
    if index.is_file():
        text = index.read_text(encoding="utf-8")
        required_markers = (
            'id="wld-snapshot-title"',
            'id="network-snapshot-title"',
            'id="sell-impact-snapshot-title"',
            'id="tool-directory-title"',
        )
        for marker in required_markers:
            if marker not in text:
                errors.append(f"index.html missing current-home marker: {marker}")
        for obsolete in ("World Chain Monitor (Phase 0)", "History: sampled by Cloudflare Workers Cron"):
            if obsolete in text:
                errors.append(f"index.html contains obsolete combined-home content: {obsolete}")
        header_match = re.search(r"<header\b.*?</header>", text, flags=re.I | re.S)
        if header_match and re.search(r'href=["\']/test/', header_match.group(0), flags=re.I):
            errors.append("index.html production header links to /test/")

    if errors:
        fail(errors)
    print(f"Pages artifact check passed: {len(html_files)} HTML files, commit {commit}")


if __name__ == "__main__":
    main()
