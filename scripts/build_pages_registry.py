#!/usr/bin/env python3
from __future__ import annotations

import build_pages as legacy
from route_registry import load_routes, public_pages


def main() -> None:
    routes = load_routes()
    legacy.PUBLIC_PAGES = public_pages()
    legacy.SEO = {
        item.file: (item.route, item.title, item.description)
        for item in routes
    }
    legacy.main()
    print(f"Built {len(routes)} registered public routes")


if __name__ == "__main__":
    main()
