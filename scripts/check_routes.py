#!/usr/bin/env python3
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import re
import sys

from route_registry import ROOT, load_routes, public_pages

ALLOWED_DIRECT_WORKER_FILES = {
    "dashboard-source.js",
    "world-chain/token-heatmap/app.js",
}


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        values = dict(attrs)
        if values.get("href"):
            self.links.append(str(values["href"]))


def normalize_internal(href: str) -> str | None:
    if not href.startswith("/") or href.startswith("//"):
        return None
    path = urlsplit(href).path
    if not path or path == "/":
        return "/"
    if path.endswith("/index.html"):
        path = path[:-10]
    if not path.endswith("/") and "." not in Path(path).name:
        path += "/"
    return path


def main() -> int:
    errors: list[str] = []
    routes = load_routes()
    route_paths = {item.route for item in routes}
    route_files = {item.file for item in routes}

    for item in routes:
        if not item.path.is_file():
            errors.append(f"registered page missing: {item.file}")
            continue
        parser = LinkParser()
        parser.feed(item.path.read_text(encoding="utf-8", errors="replace"))
        for href in parser.links:
            normalized = normalize_internal(href)
            if normalized is None:
                continue
            if normalized.startswith("/test/"):
                errors.append(f"{item.file}: public link to /test/: {href}")
            elif normalized.endswith("/") and normalized not in route_paths:
                errors.append(f"{item.file}: unregistered internal route: {href}")

    declared_pages = set(public_pages(include_non_indexable=False))
    if declared_pages != route_files:
        errors.append("public page set differs from route registry")

    for path in sorted(ROOT.rglob("*.js")):
        relative = path.relative_to(ROOT).as_posix()
        if relative.startswith(("node_modules/", "dist/", "test/")):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if "workers.dev" in text and relative not in ALLOWED_DIRECT_WORKER_FILES:
            errors.append(f"unexpected direct workers.dev reference: {relative}")

    for item in routes:
        text = item.path.read_text(encoding="utf-8", errors="replace")
        if re.search(r"(?:href|src)=[\"']https://[^\"']+\.workers\.dev", text, flags=re.I):
            errors.append(f"{item.file}: direct Worker hostname in public href/src")

    source_checks = {
        "scripts/gen_sitemap.py": ("route_registry", "PUBLIC_ROUTE_ALLOWLIST"),
        "scripts/check_seo.py": ("route_registry", "PUBLIC_ROUTES"),
        "scripts/build_pages_registry.py": ("route_registry", "PUBLIC_PAGES = ["),
    }
    for relative, (required, forbidden) in source_checks.items():
        text = (ROOT / relative).read_text(encoding="utf-8")
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
