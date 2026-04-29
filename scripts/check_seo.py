#!/usr/bin/env python3
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://wcwd.badjoke-lab.com"

PUBLIC_ROUTES = {
    "/": "index.html",
    "/about/": "about/index.html",
    "/donate/": "donate/index.html",
    "/world-chain/": "world-chain/index.html",
    "/world-chain/monitor/": "world-chain/monitor/index.html",
    "/world-chain/sell-impact/": "world-chain/sell-impact/index.html",
    "/world-chain/ecosystem/": "world-chain/ecosystem/index.html",
    "/world-chain/oracles/": "world-chain/oracles/index.html",
    "/world-chain/paymaster/": "world-chain/paymaster/index.html",
    "/world-id/": "world-id/index.html",
    "/world-id/wizard/": "world-id/wizard/index.html",
    "/world-id/debugger/": "world-id/debugger/index.html",
    "/world-id/playground/": "world-id/playground/index.html",
}

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
        attr = {k.lower(): (v or "") for k, v in attrs}
        tag = tag.lower()
        if tag == "head":
            self.in_head = True
            return
        if not self.in_head:
            return
        if tag == "title":
            self.in_title = True
        elif tag == "meta":
            name = attr.get("name", "").lower()
            prop = attr.get("property", "").lower()
            content = attr.get("content", "")
            if name:
                self.meta_name[name] = content
            if prop:
                self.meta_prop[prop] = content
        elif tag == "link":
            self.links.append(attr)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self.in_title = False
        elif tag == "head":
            self.in_head = False

    def handle_data(self, data: str) -> None:
        if self.in_head and self.in_title:
            self.title_parts.append(data.strip())

    @property
    def title(self) -> str:
        return " ".join([p for p in self.title_parts if p]).strip()


def parse_head(path: Path) -> HeadParser:
    parser = HeadParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser


def expect(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def check_html() -> list[str]:
    errors: list[str] = []
    for route, rel in PUBLIC_ROUTES.items():
        path = ROOT / rel
        expect(path.exists(), f"missing page: {rel}", errors)
        if not path.exists():
            continue
        head = parse_head(path)
        expected_url = SITE + route

        expect(bool(head.title), f"{rel}: missing <title>", errors)
        for name in REQUIRED_META_NAMES:
            expect(bool(head.meta_name.get(name)), f"{rel}: missing meta name={name}", errors)
        for prop in REQUIRED_META_PROPS:
            expect(bool(head.meta_prop.get(prop)), f"{rel}: missing meta property={prop}", errors)

        canonical = [l for l in head.links if l.get("rel", "").lower() == "canonical"]
        expect(bool(canonical), f"{rel}: missing canonical", errors)
        if canonical:
            expect(canonical[0].get("href") == expected_url, f"{rel}: canonical mismatch: {canonical[0].get('href')} != {expected_url}", errors)

        expect(head.meta_prop.get("og:url") == expected_url, f"{rel}: og:url mismatch", errors)
        expect(head.meta_name.get("twitter:card") == "summary_large_image", f"{rel}: twitter:card must be summary_large_image", errors)
        expect(head.meta_prop.get("og:image") == f"{SITE}/og.png", f"{rel}: og:image mismatch", errors)
        expect(head.meta_name.get("twitter:image") == f"{SITE}/og.png", f"{rel}: twitter:image mismatch", errors)
    return errors


def check_sitemap() -> list[str]:
    errors: list[str] = []
    path = ROOT / "sitemap.xml"
    expect(path.exists(), "missing sitemap.xml", errors)
    if not path.exists():
        return errors
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    try:
        tree = ET.parse(path)
        locs = {el.text or "" for el in tree.findall(".//sm:loc", ns)}
    except ET.ParseError as exc:
        errors.append(f"sitemap.xml parse error: {exc}")
        return errors
    for route in PUBLIC_ROUTES:
        expect(SITE + route in locs, f"sitemap missing route: {route}", errors)
    return errors


def check_robots() -> list[str]:
    errors: list[str] = []
    path = ROOT / "robots.txt"
    expect(path.exists(), "missing robots.txt", errors)
    if not path.exists():
        return errors
    text = path.read_text(encoding="utf-8", errors="replace")
    expect(f"Sitemap: {SITE}/sitemap.xml" in text, "robots.txt missing production sitemap", errors)
    expect("Disallow: /test/" in text, "robots.txt should disallow /test/", errors)
    return errors


def check_common_js() -> list[str]:
    errors: list[str] = []
    path = ROOT / "assets/common.js"
    expect(path.exists(), "missing assets/common.js", errors)
    if not path.exists():
        return errors
    text = path.read_text(encoding="utf-8", errors="replace")
    for marker in ["data-wcwd-support-card", "data-wcwd-donate-copy", "application/ld+json", "data-wcwd-seo-copy"]:
        expect(marker in text, f"common.js missing SEO feature marker: {marker}", errors)
    return errors


def main() -> int:
    errors: list[str] = []
    errors.extend(check_html())
    errors.extend(check_sitemap())
    errors.extend(check_robots())
    errors.extend(check_common_js())

    if errors:
        print("SEO check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("SEO check passed.")
    print(f"Checked {len(PUBLIC_ROUTES)} public routes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
