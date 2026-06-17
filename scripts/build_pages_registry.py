#!/usr/bin/env python3
from __future__ import annotations

import sys

from route_registry import ROOT, load_routes, public_pages

HEADER_BEGIN = "<!-- WCWD:HEADER:BEGIN -->"
HEADER_END = "<!-- WCWD:HEADER:END -->"
FOOTER_BEGIN = "<!-- WCWD:FOOTER:BEGIN -->"
FOOTER_END = "<!-- WCWD:FOOTER:END -->"


def main() -> int:
    routes = load_routes()
    pages = public_pages(include_non_indexable=False)
    errors: list[str] = []

    for page in pages:
        path = ROOT / page
        if not path.is_file():
            errors.append(f"missing registered build target: {page}")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for begin, end, label in (
            (HEADER_BEGIN, HEADER_END, "header"),
            (FOOTER_BEGIN, FOOTER_END, "footer"),
        ):
            if text.count(begin) != 1 or text.count(end) != 1:
                errors.append(f"{page}: expected one generated {label} marker pair")
        if '<a class="brand" href="/">WCWD</a>' not in text:
            errors.append(f"{page}: shared WCWD brand link is missing")
        if 'href="/donate/"' not in text:
            errors.append(f"{page}: shared support route is missing")

    registered = {item.file for item in routes}
    if registered != set(pages):
        errors.append("route registry and build target set differ")

    for page in public_pages(include_non_indexable=True):
        if not (ROOT / page).is_file():
            errors.append(f"missing build artifact source: {page}")

    if errors:
        print("Registered page build check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"Registered page build check passed: {len(pages)} public targets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
