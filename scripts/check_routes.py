#!/usr/bin/env python3
from __future__ import annotations

import sys

from route_registry import ROOT, load_routes, public_pages


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

    header = (ROOT / "partials/header.html").read_text(encoding="utf-8")
    world_id = (ROOT / "world-id/index.html").read_text(encoding="utf-8")
    common = (ROOT / "assets/common.js").read_text(encoding="utf-8")
    build_script = (ROOT / "scripts/build_pages_dist.py").read_text(encoding="utf-8")

    if 'href="/test/' in header:
        errors.append("shared public header contains a test route")
    if 'href="/test/' in world_id:
        errors.append("World ID production hub contains a test route")
    if 'document.querySelectorAll(\'nav a[href="/test/"]\')' not in common:
        errors.append("legacy generated headers are not stripped at runtime")
    if '"test"' in build_script or "'test'" in build_script:
        errors.append("production artifact must not copy the test tree")

    if errors:
        print("Route registry check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Route registry check passed: {len(routes)} public routes; test tree excluded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
