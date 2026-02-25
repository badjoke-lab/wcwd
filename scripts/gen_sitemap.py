from __future__ import annotations

from pathlib import Path
from datetime import datetime, timezone

REPO = Path(__file__).resolve().parents[1]

PUBLIC_ROUTE_ALLOWLIST = [
    "/",
    "/about/",
    "/donate/",
    "/world-chain/",
    "/world-chain/sell-impact/",
    "/world-chain/oracles/",
    "/world-chain/paymaster/",
    "/world-id/",
    "/world-id/wizard/",
    "/world-id/debugger/",
    "/world-id/playground/",
]


def guess_base_url() -> str:
    cname = REPO / "CNAME"
    if cname.exists():
        host = cname.read_text(encoding="utf-8").strip()
        if host:
            return f"https://{host.strip('/')}/"
    # fallback（既定のbase URL想定）
    return "https://wcwd.badjoke-lab.com/"


def main() -> None:
    base_url = guess_base_url()

    # ルート index.html が無い場合はエラー
    if not (REPO / "index.html").exists():
        raise SystemExit("ERROR: repo root index.html not found")

    urls = [base_url + route.lstrip("/") for route in PUBLIC_ROUTE_ALLOWLIST]

    # lastmod は“生成日”で統一（静的サイトのため）
    lastmod = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    out = []
    out.append('<?xml version="1.0" encoding="UTF-8"?>')
    out.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    for u in urls:
        out.append("  <url>")
        out.append(f"    <loc>{u}</loc>")
        out.append(f"    <lastmod>{lastmod}</lastmod>")
        out.append("  </url>")
    out.append("</urlset>")
    (REPO / "sitemap.xml").write_text("\n".join(out) + "\n", encoding="utf-8")

    robots = []
    robots.append("User-agent: *")
    robots.append("Allow: /")
    robots.append("Disallow: /dev/")
    robots.append("Disallow: /infra/")
    robots.append("Disallow: /mini-apps/")
    robots.append("Disallow: /hub/")
    robots.append("")
    robots.append(f"Sitemap: {base_url}sitemap.xml")
    (REPO / "robots.txt").write_text("\n".join(robots) + "\n", encoding="utf-8")

    print("Generated: sitemap.xml, robots.txt")
    print("Base URL:", base_url)
    print("URL count:", len(urls))


if __name__ == "__main__":
    main()
