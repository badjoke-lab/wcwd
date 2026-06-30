#!/usr/bin/env python3
from __future__ import annotations

import json
import re

from route_registry import ROOT, load_routes


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8", errors="replace")


def jsonld_blocks(html: str) -> list[dict]:
    blocks: list[dict] = []
    for match in re.finditer(r'<script\s+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, flags=re.I | re.S):
        blocks.append(json.loads(match.group(1)))
    return blocks


errors: list[str] = []
common = read("assets/common.js")
for forbidden in (
    "applyMeta",
    "injectSupportCard",
    "injectDonateCopy",
    "injectStructuredData",
    "injectVisibleSeoCopy",
    "application/ld+json",
    "Workers Cron",
):
    if forbidden in common:
        errors.append(f"assets/common.js still contains runtime SEO/support backfill: {forbidden}")

for route in load_routes():
    html = read(route.file)
    blocks = jsonld_blocks(html)
    if route.route == "/":
        types = {block.get("@type") for block in blocks}
        if "WebSite" not in types or "Organization" not in types:
            errors.append("index.html missing static WebSite + Organization JSON-LD")
    if route.application:
        if not any(block.get("@type") == "WebApplication" and block.get("name") == route.application["name"] for block in blocks):
            errors.append(f"{route.file} missing static WebApplication JSON-LD")
    if route.breadcrumbs:
        if not any(block.get("@type") == "BreadcrumbList" for block in blocks):
            errors.append(f"{route.file} missing static BreadcrumbList JSON-LD")

support_pages = {
    "index.html": "manual bounded snapshot/history work",
    "world-chain/index.html": "manual bounded snapshot work",
    "world-chain/monitor/index.html": "does not fund Cron",
    "world-chain/sell-impact/index.html": "Support Sell Impact",
    "world-chain/ecosystem/index.html": "Support the Ecosystem Directory",
    "donate/index.html": "manual bounded snapshot/history work",
}
for relative, phrase in support_pages.items():
    if phrase not in read(relative):
        errors.append(f"{relative} missing static support phrase: {phrase}")

about = read("about/index.html")
for phrase in (
    "static Pages-first",
    "Cloudflare Cron Triggers are zero",
    "does not run background collection",
    "Live reads happen only when a user",
    "bounded, manually produced",
    "source and freshness semantics",
    "read-only and route allowlisted",
    "World ID proof JSON is ephemeral",
    "non-sensitive allowlisted event names",
    "donation-supported",
    "independent and unofficial",
    "Nothing on WCWD is financial",
):
    if phrase not in about:
        errors.append(f"about/index.html missing architecture/privacy disclosure: {phrase}")

donate = read("donate/index.html")
for phrase in ("fund Cloudflare Cron", "automatic KV history", "Workers Cron"):
    if phrase in donate:
        errors.append(f"donate/index.html mentions obsolete support funding language: {phrase}")

for relative in ("assets/common.js", "config/routes.json"):
    text = read(relative)
    if "Workers Cron" in text or "automatic KV history" in text:
        errors.append(f"{relative} contains obsolete Cron/support language")

if errors:
    print("Static SEO/support check failed:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Static SEO/support check passed")
