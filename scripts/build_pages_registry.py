#!/usr/bin/env python3
from __future__ import annotations

import re
import sys

from route_registry import ROOT, load_routes, public_pages

HEADER_BEGIN = "<!-- WCWD:HEADER:BEGIN -->"
HEADER_END = "<!-- WCWD:HEADER:END -->"
FOOTER_BEGIN = "<!-- WCWD:FOOTER:BEGIN -->"
FOOTER_END = "<!-- WCWD:FOOTER:END -->"


def block(text: str, begin: str, end: str) -> str | None:
    match = re.search(re.escape(begin) + r"\n?(.*?)\n?" + re.escape(end), text, flags=re.S)
    return match.group(1).strip() if match else None


def main() -> int:
    routes = load_routes()
    pages = public_pages()
    expected_header = (ROOT / "partials" / "header.html").read_text(encoding="utf-8")
    expected_header = re.sub(r"<!-- WCWD:HEAD:GA4:BEGIN -->.*?<!-- WCWD:HEAD:GA4:END -->\s*", "", expected_header, flags=re.S).strip()
    expected_footer = (ROOT / "partials" / "footer.html").read_text(encoding="utf-8").strip()
    errors: list[str] = []

    for page in pages:
        path = ROOT / page
        if not path.is_file():
            errors.append(f"missing registered build target: {page}")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        actual_header = block(text, HEADER_BEGIN, HEADER_END)
        actual_footer = block(text, FOOTER_BEGIN, FOOTER_END)
        if actual_header != expected_header:
            errors.append(f"{page}: shared header differs from partial")
        if actual_footer != expected_footer:
            errors.append(f"{page}: shared footer differs from partial")

    registered = {item.file for item in routes}
    if registered - set(pages):
        errors.append("route registry contains a page excluded from build targets")

    if errors:
        print("Registered page build check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"Registered page build check passed: {len(pages)} targets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
