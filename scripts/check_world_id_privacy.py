#!/usr/bin/env python3
from pathlib import Path
root = Path(__file__).resolve().parents[1]
tools = (root / "assets/world-id-tools.js").read_text()
apps = (root / "world-id/debugger/app.js").read_text() + (root / "world-id/playground/app.js").read_text()
assert "localStorage.setItem" not in tools
assert "localStorage.getItem" not in tools
assert "localStorage." not in apps
assert "localStorage.removeItem" in tools
assert "MAX_PROOF_BYTES = 200 * 1024" in tools
assert "data-world-id-privacy-warning" in tools
assert "btnClearProof" in tools
assert "EVENT_ALLOWLIST" in tools
assert "gtag('event', eventName)" in tools
print("World ID privacy check passed")
