#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
errors = []
files = {
    "oracle": (root / "src/oracles-feed.js").read_text(encoding="utf-8"),
    "paymaster": (root / "src/paymaster-preflight.js").read_text(encoding="utf-8"),
    "proxy": (root / "functions/api/[[path]].js").read_text(encoding="utf-8"),
}

for name in ("oracle", "paymaster"):
    text = files[name]
    for required in (
        "worldchain-mainnet.g.alchemy.com/public",
        'redirect: "error"',
        "public_get_is_read_only",
        "caller_",
    ):
        if required not in text:
            errors.append(f"{name}: missing safeguard {required}")
    for forbidden in ("readJson", "writeJson", "env.HIST"):
        if forbidden in text:
            errors.append(f"{name}: storage helper remains: {forbidden}")

proxy = files["proxy"]
for required in (
    "ALLOWED_GET_PATHS",
    'method !== "GET"',
    'redirect: "error"',
    "route_not_allowed",
    "origin_not_allowed",
    "MAX_RESPONSE_BYTES",
):
    if required not in proxy:
        errors.append(f"proxy: missing safeguard {required}")

allowlist = proxy.split("const ALLOWED_GET_PATHS", 1)[-1].split("]);", 1)[0]
if "test-notify" in allowlist:
    errors.append("proxy: notification route is allowlisted")
if 'access-control-allow-origin", "*"' in proxy:
    errors.append("proxy: wildcard CORS remains")
if "new Headers(request.headers)" in proxy:
    errors.append("proxy: incoming headers are forwarded wholesale")

if errors:
    print("External fetch policy guard failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)
print("External fetch policy guard passed.")
