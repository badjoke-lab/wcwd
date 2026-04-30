#!/usr/bin/env python3
from __future__ import annotations

from html import escape
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://wcwd.badjoke-lab.com"
OG_IMAGE = f"{SITE}/og.png"

PUBLIC_PAGES = [
    "index.html",
    "about/index.html",
    "donate/index.html",
    "world-chain/index.html",
    "world-chain/monitor/index.html",
    "world-chain/sell-impact/index.html",
    "world-chain/ecosystem/index.html",
    "world-chain/token-heatmap/index.html",
    "world-chain/oracles/index.html",
    "world-chain/paymaster/index.html",
    "world-id/index.html",
    "world-id/wizard/index.html",
    "world-id/debugger/index.html",
    "world-id/playground/index.html",
    "404.html",
]

SEO = {
    "index.html": (
        "/",
        "WCWD — Worldcoin, World Chain, WLD & World ID Tools",
        "Unofficial Worldcoin toolkit for World Chain monitoring, WLD market context, Sell Impact checks, ecosystem browsing, and World ID builder workflows.",
    ),
    "about/index.html": (
        "/about/",
        "WCWD — About This Unofficial Worldcoin Toolkit",
        "About WCWD, an independent Worldcoin, World Chain, and World ID toolkit with best-effort data, disclaimers, and privacy notes.",
    ),
    "donate/index.html": (
        "/donate/",
        "WCWD — Support This Free Worldcoin Toolkit",
        "Support WCWD's free Worldcoin, World Chain, WLD, and World ID tools, including data engine maintenance, Workers Cron, and bounded history.",
    ),
    "world-chain/index.html": (
        "/world-chain/",
        "WCWD — World Chain Tools",
        "World Chain tool hub for Monitor, Sell Impact, Ecosystem, Oracles, and Paymaster utilities.",
    ),
    "world-chain/monitor/index.html": (
        "/world-chain/monitor/",
        "WCWD — World Chain Monitor for WLD, Gas, Activity & History",
        "Monitor World Chain health, WLD market context, gas, activity, alerts, events, and bounded history using WCWD's best-effort server-owned summaries.",
    ),
    "world-chain/sell-impact/index.html": (
        "/world-chain/sell-impact/",
        "WCWD — World Chain Sell Impact & Liquidity Risk Tool",
        "Estimate World Chain token sell impact, conservative max sell size, pool depth, liquidity risk, and rough exit conditions using public pool snapshots.",
    ),
    "world-chain/ecosystem/index.html": (
        "/world-chain/ecosystem/",
        "WCWD — World Chain Ecosystem Directory",
        "Browse World Chain tokens, dApps, infrastructure, oracle-related entries, and curated ecosystem links from WCWD's best-effort directory.",
    ),
    "world-chain/token-heatmap/index.html": (
        "/world-chain/token-heatmap/",
        "WCWD — World Chain Token Heatmap",
        "Treemap view of World Chain token volume, liquidity, and momentum with market, liquidity, and risk modes.",
    ),
    "world-chain/oracles/index.html": (
        "/world-chain/oracles/",
        "WCWD — World Chain Oracle Feed Tester",
        "Test oracle feed responses through same-origin API support and browser fallback for World Chain builder workflows.",
    ),
    "world-chain/paymaster/index.html": (
        "/world-chain/paymaster/",
        "WCWD — World Chain Paymaster Preflight",
        "Check paymaster and sponsor endpoint readiness with same-origin RPC preflight, validation notes, and browser fallback.",
    ),
    "world-id/index.html": (
        "/world-id/",
        "WCWD — World ID Builder Tools",
        "World ID builder hub for integration snippets, proof debugging, and verifier request testing.",
    ),
    "world-id/wizard/index.html": (
        "/world-id/wizard/",
        "WCWD — World ID Integration Wizard",
        "Generate frontend and backend template snippets for World ID integration workflows.",
    ),
    "world-id/debugger/index.html": (
        "/world-id/debugger/",
        "WCWD — World ID Proof Debugger",
        "Inspect and diagnose World ID proof JSON structure safely in the browser.",
    ),
    "world-id/playground/index.html": (
        "/world-id/playground/",
        "WCWD — World ID Verifier Playground",
        "Generate verifier request examples and test browser-based World ID proof requests with clear CORS feedback.",
    ),
}

HEADER_BEGIN = "<!-- WCWD:HEADER:BEGIN -->"
HEADER_END = "<!-- WCWD:HEADER:END -->"
FOOTER_BEGIN = "<!-- WCWD:FOOTER:BEGIN -->"
FOOTER_END = "<!-- WCWD:FOOTER:END -->"
GA4_BEGIN = "<!-- WCWD:HEAD:GA4:BEGIN -->"
GA4_END = "<!-- WCWD:HEAD:GA4:END -->"


def normalize(text: str) -> str:
    return text.replace("\r\n", "\n")


def read_partials() -> tuple[str, str, str]:
    header = normalize((ROOT / "partials/header.html").read_text(encoding="utf-8")).strip()
    footer = normalize((ROOT / "partials/footer.html").read_text(encoding="utf-8")).strip()
    m = re.search(re.escape(GA4_BEGIN) + r"\n?(.*?)\n?" + re.escape(GA4_END), header, flags=re.S)
    if not m:
        raise RuntimeError("partials/header.html must contain GA4 markers")
    ga4 = m.group(1).strip()
    header_markup = re.sub(re.escape(GA4_BEGIN) + r".*?" + re.escape(GA4_END) + r"\n?", "", header, flags=re.S).strip()
    return ga4, header_markup, footer


def replace_or_insert(text: str, begin: str, end: str, content: str, fallback: str) -> str:
    block = begin + "\n" + content + "\n" + end
    pat = re.escape(begin) + r".*?" + re.escape(end)
    if re.search(pat, text, flags=re.S):
        return re.sub(pat, block, text, count=1, flags=re.S)
    m = re.search(fallback, text, flags=re.I | re.S)
    if not m:
        return text
    return text[:m.end()] + "\n" + block + text[m.end():]


def strip_unmarked_common(text: str) -> str:
    protected: dict[str, str] = {}

    def stash(match: re.Match[str]) -> str:
        key = f"__WCWD_KEEP_{len(protected)}__"
        protected[key] = match.group(0)
        return key

    text = re.sub(re.escape(HEADER_BEGIN) + r".*?" + re.escape(HEADER_END), stash, text, flags=re.S)
    text = re.sub(re.escape(FOOTER_BEGIN) + r".*?" + re.escape(FOOTER_END), stash, text, flags=re.S)
    text = re.sub(r"\n?\s*<header\b[^>]*class=[\"'][^\"']*\bheader\b[^\"']*[\"'][^>]*>.*?</header>\s*\n?", "\n", text, flags=re.S | re.I)
    text = re.sub(r"\n?\s*<footer\b[^>]*class=[\"'][^\"']*\bfooter\b[^\"']*[\"'][^>]*>.*?</footer>\s*\n?", "\n", text, flags=re.S | re.I)
    for key, value in protected.items():
        text = text.replace(key, value)
    return text


def remove_seo_tags(head: str) -> str:
    patterns = [
        r"\n?\s*<title>.*?</title>",
        r"\n?\s*<meta\s+name=[\"']description[\"'][^>]*>",
        r"\n?\s*<link\s+rel=[\"']canonical[\"'][^>]*>",
        r"\n?\s*<meta\s+property=[\"']og:(?:type|site_name|title|description|url|image)[\"'][^>]*>",
        r"\n?\s*<meta\s+name=[\"']twitter:(?:card|title|description|image)[\"'][^>]*>",
    ]
    for pat in patterns:
        head = re.sub(pat, "", head, flags=re.I | re.S)
    return head


def build_seo_block(route: str, title: str, description: str) -> str:
    url = f"{SITE}{route}"
    t = escape(title, quote=True)
    d = escape(description, quote=True)
    return "\n".join([
        f"  <title>{t}</title>",
        f"  <meta name=\"description\" content=\"{d}\" />",
        f"  <link rel=\"canonical\" href=\"{url}\">",
        "  <meta property=\"og:type\" content=\"website\">",
        "  <meta property=\"og:site_name\" content=\"WCWD\">",
        f"  <meta property=\"og:title\" content=\"{t}\">",
        f"  <meta property=\"og:description\" content=\"{d}\">",
        f"  <meta property=\"og:url\" content=\"{url}\">",
        f"  <meta property=\"og:image\" content=\"{OG_IMAGE}\">",
        "  <meta name=\"twitter:card\" content=\"summary_large_image\">",
        f"  <meta name=\"twitter:title\" content=\"{t}\">",
        f"  <meta name=\"twitter:description\" content=\"{d}\">",
        f"  <meta name=\"twitter:image\" content=\"{OG_IMAGE}\">",
    ])


def upsert_static_seo(text: str, page: str) -> str:
    if page not in SEO:
        return text
    route, title, description = SEO[page]
    m = re.search(r"<head>(.*?)</head>", text, flags=re.I | re.S)
    if not m:
        return text
    head_inner = remove_seo_tags(m.group(1))
    seo_block = build_seo_block(route, title, description)
    charset = re.search(r"\n?\s*<meta\s+charset=[^>]*>", head_inner, flags=re.I)
    if charset:
        insert_at = charset.end()
        head_inner = head_inner[:insert_at] + "\n" + seo_block + head_inner[insert_at:]
    else:
        head_inner = "\n" + seo_block + head_inner
    return text[:m.start(1)] + head_inner + text[m.end(1):]


def upsert_ga4(text: str, ga4: str) -> str:
    block = GA4_BEGIN + "\n" + ga4 + "\n" + GA4_END
    pat = re.escape(GA4_BEGIN) + r".*?" + re.escape(GA4_END)
    if re.search(pat, text, flags=re.S):
        return re.sub(pat, block, text, count=1, flags=re.S)
    return text.replace("</head>", block + "\n</head>", 1)


def process(page: str, path: Path, ga4: str, header: str, footer: str) -> bool:
    original = normalize(path.read_text(encoding="utf-8"))
    text = strip_unmarked_common(original)
    text = upsert_static_seo(text, page)
    text = upsert_ga4(text, ga4)
    text = replace_or_insert(text, HEADER_BEGIN, HEADER_END, header, r"<body\b[^>]*>")
    text = replace_or_insert(text, FOOTER_BEGIN, FOOTER_END, footer, r"</main>")
    if FOOTER_BEGIN not in text:
        text = replace_or_insert(text, FOOTER_BEGIN, FOOTER_END, footer, r"</body>")
    text = re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"
    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    ga4, header, footer = read_partials()
    for page in PUBLIC_PAGES:
        path = ROOT / page
        if not path.exists():
            raise FileNotFoundError(f"Public page not found: {page}")
        status = "updated" if process(page, path, ga4, header, footer) else "unchanged"
        print(f"{status}: {page}")


if __name__ == "__main__":
    main()
