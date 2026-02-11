from __future__ import annotations

from pathlib import Path
from datetime import datetime, timezone
import re

REPO = Path(__file__).resolve().parents[1]

EXCLUDE_DIRS = {
    ".git", ".wrangler", "node_modules", ".next", ".cache", ".DS_Store"
}

def guess_base_url() -> str:
    cname = REPO / "CNAME"
    if cname.exists():
        host = cname.read_text(encoding="utf-8").strip()
        if host:
            return f"https://{host.strip('/')}/"
    # fallback（wcwd の pages.dev 想定）
    return "https://wcwd.badjoke-lab.com/"

def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    if parts & EXCLUDE_DIRS:
        return True
    # 隠しディレクトリ一括除外（.dev.vars などを含む）
    for p in path.parts:
        if p.startswith(".") and p not in {".well-known"}:
            return True
    return False

def url_for(file_path: Path, base_url: str) -> str:
    rel = file_path.relative_to(REPO)
    # "dir/index.html" は "dir/" にする
    if rel.name == "index.html":
        rel_url = str(rel.parent).replace("\\", "/")
        if rel_url == ".":
            rel_url = ""
        else:
            rel_url = rel_url.rstrip("/") + "/"
    else:
        rel_url = str(rel).replace("\\", "/")
    return base_url + rel_url

def main() -> None:
    base_url = guess_base_url()

    html_files: list[Path] = []
    for p in REPO.rglob("*.html"):
        if should_skip(p):
            continue
        html_files.append(p)

    # ルート index.html が無い場合はエラー
    if not (REPO / "index.html").exists():
        raise SystemExit("ERROR: repo root index.html not found")

    # URLを作って重複排除
    urls = sorted({url_for(p, base_url) for p in html_files})

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
    robots.append("")
    robots.append(f"Sitemap: {base_url}sitemap.xml")
    (REPO / "robots.txt").write_text("\n".join(robots) + "\n", encoding="utf-8")

    print("Generated: sitemap.xml, robots.txt")
    print("Base URL:", base_url)
    print("URL count:", len(urls))

if __name__ == "__main__":
    main()
