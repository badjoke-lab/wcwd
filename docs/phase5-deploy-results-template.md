# WCWD Phase 5 Deploy Results Template

## Purpose

Use this file to record real deploy check results after a production deploy.

This is a template. Copy it into a dated result file when needed, for example:

```txt
docs/results/2026-04-27-deploy-check.md
```

Do not use this file to plan new features. Use it only to record checks, failures, and follow-up fixes.

---

## Deploy metadata

```txt
Date:
Checked by:
Production URL:
Git commit:
PR range:
Cloudflare deployment ID:
Browser/device:
Viewport(s):
```

---

## Summary

```txt
Overall status: PASS / PASS WITH KNOWN ISSUES / FAIL
Blocking issues:
Non-blocking issues:
Next PR needed: yes / no
```

---

## 1. Public route checks

| Route | Status | Notes |
|---|---:|---|
| `/` | unchecked |  |
| `/about/` | unchecked |  |
| `/donate/` | unchecked |  |
| `/world-chain/` | unchecked |  |
| `/world-chain/monitor/` | unchecked |  |
| `/world-chain/sell-impact/` | unchecked |  |
| `/world-chain/ecosystem/` | unchecked |  |
| `/world-chain/oracles/` | unchecked |  |
| `/world-chain/paymaster/` | unchecked |  |
| `/world-id/` | unchecked |  |
| `/world-id/wizard/` | unchecked |  |
| `/world-id/debugger/` | unchecked |  |
| `/world-id/playground/` | unchecked |  |

Expected:

- no 404
- header loads
- footer loads where expected
- title/canonical are present on stable pages

---

## 2. SEO route files

| File | Status | Notes |
|---|---:|---|
| `/sitemap.xml` | unchecked |  |
| `/robots.txt` | unchecked |  |

Expected:

- sitemap includes stable public pages
- robots references sitemap
- no accidental blocking of stable pages

---

## 3. Phase 2 API checks

| Endpoint | Status | Notes |
|---|---:|---|
| `/api/retention` | unchecked |  |
| `/api/summary?limit=999999&event_limit=999999` | unchecked |  |
| `/api/list?limit=999999` | unchecked |  |
| `/api/events?limit=999999` | unchecked |  |

Expected:

- JSON response
- limits are clamped
- retention metadata appears
- summary state is normalized

---

## 4. Phase 3 Wormhole checks

| Check | Status | Notes |
|---|---:|---|
| `/api/viz/wormhole` | unchecked |  |
| `/api/viz/wormhole?lite=0` | unchecked |  |
| `/api/viz/wormhole?lite=0&addresses=0x4200000000000000000000000000000000000010` | unchecked |  |
| `/test/visualizers/wormhole/` activity-only mode | unchecked |  |
| `/test/visualizers/wormhole/` bridge-selected mode | unchecked |  |

Expected:

- normalized contract fields exist
- `recent_count <= 96`
- no safe-test wording
- no crash on empty/unavailable state

---

## 5. Phase 4 Oracles checks

| Check | Status | Notes |
|---|---:|---|
| `/world-chain/oracles/` loads | unchecked |  |
| same-origin API attempted first | unchecked |  |
| browser fallback is fallback only | unchecked |  |
| `/api/oracles/feed` invalid input response | unchecked |  |
| `/api/oracles/feed` valid RPC/feed response | unchecked |  |

Expected:

- normalized compact payload
- unsafe RPC hosts are rejected
- compact history is capped at 96
- errors are visible

---

## 6. Phase 4 Paymaster checks

| Check | Status | Notes |
|---|---:|---|
| `/world-chain/paymaster/` loads | unchecked |  |
| same-origin preflight attempted first | unchecked |  |
| browser fallback remains fallback only | unchecked |  |
| `/api/paymaster/preflight` invalid input response | unchecked |  |
| `/api/paymaster/preflight` valid RPC/sponsor response | unchecked |  |

Expected:

- normalized compact payload
- sponsor URL is validated only
- Worker does not POST to arbitrary sponsor endpoints
- compact history is capped at 96

---

## 7. Home / Monitor checks

| Check | Status | Notes |
|---|---:|---|
| Home compact WLD snapshot | unchecked |  |
| Home compact network snapshot | unchecked |  |
| Home Sell Impact snapshot | unchecked |  |
| Monitor Data Source card | unchecked |  |
| Monitor History / Fallback Guide | unchecked |  |
| Monitor Trends | unchecked |  |
| Monitor 7d Series | unchecked |  |
| Monitor Debug | unchecked |  |

Expected:

- no full Monitor embedded on Home
- unavailable states are clean
- debug blocks remain contained

---

## 8. Mobile layout checks

Viewport targets:

```txt
360px
390px
768px
```

| Page | 360px | 390px | 768px | Notes |
|---|---:|---:|---:|---|
| `/` | unchecked | unchecked | unchecked |  |
| `/world-chain/` | unchecked | unchecked | unchecked |  |
| `/world-chain/monitor/` | unchecked | unchecked | unchecked |  |
| `/world-chain/sell-impact/` | unchecked | unchecked | unchecked |  |
| `/world-chain/ecosystem/` | unchecked | unchecked | unchecked |  |
| `/world-chain/oracles/` | unchecked | unchecked | unchecked |  |
| `/world-chain/paymaster/` | unchecked | unchecked | unchecked |  |

Expected:

- no severe horizontal overflow
- header usable
- buttons wrap acceptably
- long JSON/debug blocks contained

---

## 9. Known issues

### Blocking

| ID | Area | Issue | Fix PR |
|---|---|---|---|
| B-001 |  |  |  |

### Non-blocking

| ID | Area | Issue | Fix PR |
|---|---|---|---|
| N-001 |  |  |  |

---

## 10. Follow-up decision

Choose one:

```txt
A. No blocker. Continue to SEO / metadata polish.
B. Minor issues. Create targeted fix PR first.
C. Blocker found. Stop feature work until fixed.
```

Decision:

```txt

```

Reason:

```txt

```
