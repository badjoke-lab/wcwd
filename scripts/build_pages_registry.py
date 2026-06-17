#!/usr/bin/env python3
from __future__ import annotations

import sys

from route_registry import ROOT, load_routes, public_pages


def main() -> int:
    routes = load_routes()
    pages = public_pages(include_non_indexable=False)
    errors: list[str] = []

    registered = {item.file for item in routes}
    if registered != set(pages):
        errors.append("route registry and build target set differ")

    for page in public_pages(include_non_indexable=True):
        path = ROOT / page
        if not path.is_file():
            errors.append(f"missing registered build source: {page}")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if page != "404.html" and "WCWD" not in text:
            errors.append(f"{page}: WCWD identity marker is missing")

    for partial in ("partials/header.html", "partials/footer.html"):
        if not (ROOT / partial).is_file():
            errors.append(f"missing shared partial: {partial}")

    if errors:
        print("Registered page build check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"Registered page build check passed: {len(pages)} public targets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
