#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent

PUBLIC_PAGES = [
    "index.html",
    "about/index.html",
    "donate/index.html",
    "world-chain/index.html",
    "world-chain/monitor/index.html",
    "world-chain/sell-impact/index.html",
    "world-chain/ecosystem/index.html",
    "world-chain/oracles/index.html",
    "world-chain/paymaster/index.html",
    "world-id/index.html",
    "world-id/wizard/index.html",
    "world-id/debugger/index.html",
    "world-id/playground/index.html",
    "404.html",
]

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


def upsert_ga4(text: str, ga4: str) -> str:
    block = GA4_BEGIN + "\n" + ga4 + "\n" + GA4_END
    pat = re.escape(GA4_BEGIN) + r".*?" + re.escape(GA4_END)
    if re.search(pat, text, flags=re.S):
        return re.sub(pat, block, text, count=1, flags=re.S)
    return text.replace("</head>", block + "\n</head>", 1)


def process(path: Path, ga4: str, header: str, footer: str) -> bool:
    original = normalize(path.read_text(encoding="utf-8"))
    text = strip_unmarked_common(original)
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
        status = "updated" if process(path, ga4, header, footer) else "unchanged"
        print(f"{status}: {page}")


if __name__ == "__main__":
    main()
