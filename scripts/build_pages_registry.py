#!/usr/bin/env python3
from __future__ import annotations

import json
import re

import build_pages as legacy
from route_registry import ROOT, load_routes, public_pages

ROUTE_SCRIPT = '<script src="/assets/routes.generated.js"></script>'


def write_runtime_registry(routes) -> None:
    payload = {
        item.route: {
            "title": item.title,
            "description": item.description,
            "breadcrumbs": list(item.breadcrumbs),
            "application": item.application,
            "indexable": item.indexable,
        }
        for item in routes
    }
    source = "window.WCWD_ROUTE_REGISTRY = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "assets" / "routes.generated.js").write_text(source, encoding="utf-8")


def inject_registry_script(page: str) -> None:
    path = ROOT / page
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"\n?\s*<script\s+src=[\"']/assets/routes\.generated\.js[\"']></script>", "", text, flags=re.I)
    text = re.sub(r"</body>", ROUTE_SCRIPT + "\n</body>", text, count=1, flags=re.I)
    path.write_text(text, encoding="utf-8")


def main() -> None:
    routes = load_routes()
    legacy.PUBLIC_PAGES = public_pages()
    legacy.SEO = {
        item.file: (item.route, item.title, item.description)
        for item in routes
    }
    legacy.SITE = str(legacy.SITE).rstrip("/")
    write_runtime_registry(routes)
    legacy.main()
    for page in legacy.PUBLIC_PAGES:
        inject_registry_script(page)
    print(f"Generated route runtime for {len(routes)} routes")


if __name__ == "__main__":
    main()
