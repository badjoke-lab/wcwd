#!/usr/bin/env python3
from __future__ import annotations

from route_registry import ROOT, load_routes, site_url

BLOCKED_PREFIXES = ("/dev/", "/infra/", "/mini-apps/", "/hub/", "/test/")


def main() -> None:
    site = site_url()
    routes = load_routes(indexable_only=True)
    if not (ROOT / "index.html").exists():
        raise SystemExit("ERROR: repo root index.html not found")

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for item in routes:
        if not item.path.exists():
            raise SystemExit(f"ERROR: public page not found: {item.file}")
        lines += [
            "  <url>",
            f"    <loc>{site}{item.route}</loc>",
            f"    <lastmod>{item.lastmod}</lastmod>",
            "  </url>",
        ]
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")

    robots = ["User-agent: *", "Allow: /"]
    robots += [f"Disallow: {prefix}" for prefix in BLOCKED_PREFIXES]
    robots += ["", f"Sitemap: {site}/sitemap.xml"]
    (ROOT / "robots.txt").write_text("\n".join(robots) + "\n", encoding="utf-8")

    print("Generated: sitemap.xml, robots.txt")
    print("Indexable URL count:", len(routes))


if __name__ == "__main__":
    main()
