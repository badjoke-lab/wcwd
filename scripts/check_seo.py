#!/usr/bin/env python3
from __future__ import annotations

from html.parser import HTMLParser
import xml.etree.ElementTree as ET

from route_registry import ROOT, load_routes, og_image, site_url

SITE = site_url()
OG_IMAGE = og_image()
REQUIRED_META_NAMES = ["description", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]
REQUIRED_META_PROPS = ["og:type", "og:site_name", "og:title", "og:description", "og:url", "og:image"]


class HeadParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_head = False
        self.in_title = False
        self.title_parts: list[str] = []
        self.meta_name: dict[str, str] = {}
        self.meta_prop: dict[str, str] = {}
        self.links: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): (value or "") for key, value in attrs}
        tag = tag.lower()
        if tag == "head":
            self.in_head = True
        elif self.in_head and tag == "title":
            self.in_title = True
        elif self.in_head and tag == "meta":
            if values.get("name"):
                self.meta_name[values["name"].lower()] = values.get("content", "")
            if values.get("property"):
                self.meta_prop[values["property"].lower()] = values.get("content", "")
        elif self.in_head and tag == "link":
            self.links.append(values)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False
        elif tag.lower() == "head":
            self.in_head = False

    def handle_data(self, data: str) -> None:
        if self.in_head and self.in_title and data.strip():
            self.title_parts.append(data.strip())

    @property
    def title(self) -> str:
        return " ".join(self.title_parts).strip()


def expect(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def parse_head(path) -> HeadParser:
    parser = HeadParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser


def check_html() -> list[str]:
    errors: list[str] = []
    for item in load_routes():
        path = item.path
        expect(path.exists(), f"missing page: {item.file}", errors)
        if not path.exists():
            continue
        head = parse_head(path)
        expected_url = SITE + item.route
        expect(bool(head.title), f"{item.file}: missing title", errors)
        for name in REQUIRED_META_NAMES:
            expect(bool(head.meta_name.get(name)), f"{item.file}: missing meta name={name}", errors)
        for prop in REQUIRED_META_PROPS:
            expect(bool(head.meta_prop.get(prop)), f"{item.file}: missing meta property={prop}", errors)
        canonical = [link for link in head.links if link.get("rel", "").lower() == "canonical"]
        expect(len(canonical) == 1, f"{item.file}: expected one canonical", errors)
        if canonical:
            expect(canonical[0].get("href") == expected_url, f"{item.file}: canonical mismatch", errors)
        expect(head.meta_prop.get("og:url") == expected_url, f"{item.file}: og:url mismatch", errors)
        expect(head.meta_name.get("twitter:card") == "summary_large_image", f"{item.file}: twitter card mismatch", errors)
        expect(head.meta_prop.get("og:image") == OG_IMAGE, f"{item.file}: og:image mismatch", errors)
        expect(head.meta_name.get("twitter:image") == OG_IMAGE, f"{item.file}: twitter:image mismatch", errors)
    return errors


def check_sitemap() -> list[str]:
    errors: list[str] = []
    path = ROOT / "sitemap.xml"
    if not path.exists():
        return ["missing sitemap.xml"]
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    try:
        tree = ET.parse(path)
    except ET.ParseError as error:
        return [f"sitemap.xml parse error: {error}"]
    entries = {}
    for node in tree.findall(".//sm:url", namespace):
        loc = node.findtext("sm:loc", default="", namespaces=namespace)
        lastmod = node.findtext("sm:lastmod", default="", namespaces=namespace)
        entries[loc] = lastmod
    expected = {SITE + item.route: item.lastmod for item in load_routes(indexable_only=True)}
    expect(entries == expected, "sitemap routes or lastmod values differ from config/routes.json", errors)
    return errors


def check_robots() -> list[str]:
    path = ROOT / "robots.txt"
    if not path.exists():
        return ["missing robots.txt"]
    text = path.read_text(encoding="utf-8", errors="replace")
    errors: list[str] = []
    expect(f"Sitemap: {SITE}/sitemap.xml" in text, "robots.txt missing production sitemap", errors)
    expect("Disallow: /test/" in text, "robots.txt must disallow /test/", errors)
    return errors


def main() -> int:
    errors = check_html() + check_sitemap() + check_robots()
    if errors:
        print("SEO check failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"SEO check passed for {len(load_routes())} registered routes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
