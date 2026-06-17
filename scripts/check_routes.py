#!/usr/bin/env python3
from __future__ import annotations

from html.parser import HTMLParser
import re
import sys

from route_registry import ROOT, load_routes, public_pages


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        values = dict(attrs)
        href = values.get("href")
        if href:
            self.links.append(str(href))


def main() -> int:
    errors: list[str] = []
    routes = load_routes()
    route_files = {item.file for item in routes}

    declared_pages = set(public_pages(include_non_indexable=False))
    if declared_pages != route_files:
        errors.append("public page set differs from route registry")

    for item in routes:
        if not item.path.is_file():
            errors.append(f"registered page missing: {item.file}")
            continue

        text = item.path.read_text(encoding="utf-8", errors="replace")
        parser = LinkParser()
        parser.feed(text)
        for href in parser.links:
            if href == "/test" or href.startswith("/test/"):
                errors.append(f"{item.file}: public link to experimental route: {href}")

        if re.search(r"(?:href|src)=[\"']https://[^\"']+\.workers\.dev", text, flags=re.I):
            errors.append(f"{item.file}: direct Worker hostname in public href/src")

    source_checks = {
        "scripts/gen_sitemap.py": ("route_registry", "PUBLIC_ROUTE_ALLOWLIST"),
        "scripts/check_seo.py": ("route_registry", "PUBLIC_ROUTES"),
        "scripts/build_pages_registry.py": ("route_registry", "PUBLIC_PAGES = ["),
    }
    for relative, (required, forbidden) in source_checks.items():
        path = ROOT / relative
        if not path.is_file():
            errors.append(f"missing registry consumer: {relative}")
            continue
        text = path.read_text(encoding="utf-8")
        if required not in text:
            errors.append(f"{relative}: missing registry import")
        if forbidden in text:
            errors.append(f"{relative}: hard-coded route list remains")

    if errors:
        print("Route registry check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Route registry check passed: {len(routes)} public routes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
