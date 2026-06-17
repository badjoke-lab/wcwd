#!/usr/bin/env python3
"""Build the canonical Cloudflare Pages upload directory for WCWD."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIRS = ("assets", "about", "donate", "world-chain", "world-id")
ROOT_SUFFIXES = {".html", ".css", ".js", ".json", ".xml", ".txt", ".ico", ".svg", ".png", ".webmanifest"}
ROOT_NAMES = {"_headers", "_redirects"}
BUILD_MARKER_RE = re.compile(r"\n?\s*<meta\s+name=[\"']wcwd-build-commit[\"'][^>]*>", re.I)


def detect_commit(explicit: str | None) -> str:
    candidates = (explicit, os.getenv("CF_PAGES_COMMIT_SHA"), os.getenv("GITHUB_SHA"))
    for value in candidates:
        if value and re.fullmatch(r"[0-9a-fA-F]{7,64}", value.strip()):
            return value.strip().lower()
    try:
        value = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
        if re.fullmatch(r"[0-9a-fA-F]{40,64}", value):
            return value.lower()
    except (OSError, subprocess.CalledProcessError):
        pass
    return "local"


def should_copy_root(path: Path) -> bool:
    if path.name in ROOT_NAMES:
        return True
    return path.suffix.lower() in ROOT_SUFFIXES and not path.name.startswith(".")


def copy_public_tree(output: Path) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    for path in ROOT.iterdir():
        if path.is_file() and should_copy_root(path):
            shutil.copy2(path, output / path.name)

    for dirname in PUBLIC_DIRS:
        source = ROOT / dirname
        if source.is_dir():
            shutil.copytree(
                source,
                output / dirname,
                ignore=shutil.ignore_patterns(".DS_Store", "*.md", "*.py", "__pycache__"),
            )


def inject_commit_marker(output: Path, commit: str) -> int:
    marker = f'  <meta name="wcwd-build-commit" content="{commit}">'
    changed = 0
    for path in sorted(output.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        text = BUILD_MARKER_RE.sub("", text)
        if "</head>" not in text.lower():
            raise RuntimeError(f"HTML has no </head>: {path.relative_to(output)}")
        text = re.sub(r"</head>", marker + "\n</head>", text, count=1, flags=re.I)
        path.write_text(text, encoding="utf-8")
        changed += 1
    return changed


def write_version(output: Path, commit: str) -> None:
    payload = {
        "schema_version": 1,
        "project": "wcwd",
        "repository": "badjoke-lab/wcwd",
        "commit_sha": commit,
        "built_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "build_output": "dist",
        "deployment_target": "cloudflare-pages",
        "background_collection": False,
        "cloudflare_cron": False,
    }
    (output / "version.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="dist")
    parser.add_argument("--commit")
    args = parser.parse_args()

    output = (ROOT / args.output).resolve()
    if ROOT not in output.parents:
        raise SystemExit("Output directory must be inside the repository")

    commit = detect_commit(args.commit)
    copy_public_tree(output)
    html_count = inject_commit_marker(output, commit)
    write_version(output, commit)

    print(f"Built {output.relative_to(ROOT)} for commit {commit} ({html_count} HTML files)")


if __name__ == "__main__":
    main()
