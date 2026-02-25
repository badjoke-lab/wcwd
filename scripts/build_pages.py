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
    "world-chain/sell-impact/index.html",
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


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n")


def _read_partials() -> tuple[str, str, str]:
    header_partial = _normalize_newlines((ROOT / "partials/header.html").read_text(encoding="utf-8")).strip()
    footer_partial = _normalize_newlines((ROOT / "partials/footer.html").read_text(encoding="utf-8")).strip()

    ga4_match = re.search(rf"{re.escape(GA4_BEGIN)}\n?(.*?)\n?{re.escape(GA4_END)}", header_partial, flags=re.S)
    if not ga4_match:
        raise RuntimeError("partials/header.html must contain GA4 markers.")

    ga4_block = ga4_match.group(1).strip()
    header_markup = re.sub(rf"{re.escape(GA4_BEGIN)}.*?{re.escape(GA4_END)}\n?", "", header_partial, flags=re.S).strip()
    return ga4_block, header_markup, footer_partial


def _upsert_marked_block(text: str, begin: str, end: str, content: str, fallback_pattern: str) -> str:
    marker_re = re.compile(rf"{re.escape(begin)}.*?{re.escape(end)}", flags=re.S)
    replacement = f"{begin}\n{content}\n{end}"

    if marker_re.search(text):
        return marker_re.sub(replacement, text, count=1)

    match = re.search(fallback_pattern, text, flags=re.I | re.S)
    if not match:
        return text

    insert_at = match.end()
    return text[:insert_at] + "\n" + replacement + text[insert_at:]


def _remove_legacy_blocks(text: str) -> str:
    text = re.sub(r"\n?<!--\s*WCWD-HEADER-INJECT:START\s*-->.*?<!--\s*WCWD-HEADER-INJECT:END\s*-->\n?", "\n", text, flags=re.S)

    protected = {}

    def stash(match: re.Match[str]) -> str:
        key = f"__WCWD_KEEP_{len(protected)}__"
        protected[key] = match.group(0)
        return key

    text = re.sub(rf"{re.escape(HEADER_BEGIN)}.*?{re.escape(HEADER_END)}", stash, text, flags=re.S)
    text = re.sub(rf"{re.escape(FOOTER_BEGIN)}.*?{re.escape(FOOTER_END)}", stash, text, flags=re.S)

    text = re.sub(r"\n\s*<header\b[^>]*class=[\"'][^\"']*\bheader\b[^\"']*[\"'][^>]*>.*?</header>\s*\n", "\n", text, flags=re.S | re.I)
    text = re.sub(r"\n\s*<footer\b[^>]*class=[\"'][^\"']*\bfooter\b[^\"']*[\"'][^>]*>.*?</footer>\s*\n", "\n", text, flags=re.S | re.I)

    for key, value in protected.items():
        text = text.replace(key, value)

    return text


def _upsert_ga4(text: str, ga4_block: str) -> str:
    ga4_script_re = re.compile(
        r"\n?<!--\s*Google tag \(gtag\.js\)\s*-->\s*"
        r"<script\s+async\s+src=[\"']https://www\.googletagmanager\.com/gtag/js\?id=G-0D84H0D66W[\"']></script>\s*"
        r"<script>.*?gtag\('config',\s*'G-0D84H0D66W'\);.*?</script>\n?",
        flags=re.S,
    )
    text = ga4_script_re.sub("\n", text)

    marker_re = re.compile(rf"{re.escape(GA4_BEGIN)}.*?{re.escape(GA4_END)}", flags=re.S)
    replacement = f"{GA4_BEGIN}\n{ga4_block}\n{GA4_END}"
    if marker_re.search(text):
        return marker_re.sub(replacement, text, count=1)

    head_close = re.search(r"</head>", text, flags=re.I)
    if not head_close:
        return text

    return text[: head_close.start()] + replacement + "\n" + text[head_close.start() :]


def process_page(path: Path, ga4_block: str, header_markup: str, footer_markup: str) -> bool:
    original = _normalize_newlines(path.read_text(encoding="utf-8"))
    text = original

    text = _remove_legacy_blocks(text)
    text = _upsert_ga4(text, ga4_block)

    text = _upsert_marked_block(
        text,
        HEADER_BEGIN,
        HEADER_END,
        header_markup,
        r"<body\b[^>]*>",
    )
    text = _upsert_marked_block(
        text,
        FOOTER_BEGIN,
        FOOTER_END,
        footer_markup,
        r"</main>",
    )

    # If no </main>, ensure footer still lands before </body>
    if FOOTER_BEGIN not in text:
        text = _upsert_marked_block(
            text,
            FOOTER_BEGIN,
            FOOTER_END,
            footer_markup,
            r"</body>",
        )

    text = re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    ga4_block, header_markup, footer_markup = _read_partials()
    changed = []

    for page in PUBLIC_PAGES:
        path = ROOT / page
        if not path.exists():
            raise FileNotFoundError(f"Public page not found: {page}")
        if process_page(path, ga4_block, header_markup, footer_markup):
            changed.append(page)

    for page in PUBLIC_PAGES:
        status = "updated" if page in changed else "unchanged"
        print(f"{status}: {page}")


if __name__ == "__main__":
    main()
