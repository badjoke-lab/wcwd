#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
registry = json.loads((root / "config/routes.json").read_text(encoding="utf-8"))
route = next(item for item in registry["routes"] if item["route"] == "/world-chain/token-heatmap/")
assert route["indexable"] is False

html = (root / "world-chain/token-heatmap/index.html").read_text(encoding="utf-8")
frontend = (root / "world-chain/token-heatmap/token-heatmap.js").read_text(encoding="utf-8")
server = (root / "src/token-heatmap-safe.js").read_text(encoding="utf-8")
shim = (root / "src/token-heatmap.js").read_text(encoding="utf-8")
sitemap = (root / "sitemap.xml").read_text(encoding="utf-8")

assert 'name="robots" content="noindex,nofollow"' in html
assert "workers.dev" not in html + frontend
assert "/world-chain/token-heatmap/" not in sitemap
assert "demo_fallback" not in frontend + server
assert "demo-" not in frontend + server
assert 'const API = "/api/world-chain/token-heatmap/latest"' in frontend
assert "generated token values" in html
assert "HIST.put" not in server
assert "api.geckoterminal.com" not in server
assert "read_only_snapshot" in server
assert "synthetic_fallback: false" in server
assert "Number(token?.chainId) !== 480" in server
assert "sourceUrl.startsWith(\"https://\")" in server
assert "snapshot_source_invalid" in server
assert "ADDRESS" in server and "updatedAt" in server and "source" in server
assert "chainId: 480" in frontend
assert "World Chain (480)" in frontend
assert 'from "./token-heatmap-safe.js"' in shim
print("token heatmap safety check passed")
