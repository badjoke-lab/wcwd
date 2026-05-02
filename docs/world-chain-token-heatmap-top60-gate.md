# WCWD World Chain Token Heatmap — Top60 Gate

This note defines the checks required before unlocking **Top 60** on `/world-chain/token-heatmap/`.

Top60 is not a visual-only change. It increases upstream pool reads, payload size, canvas density, and user-facing noise. Do not unlock it just because Top40 works once.

---

## Current fixed state

- Page: `/world-chain/token-heatmap/`
- API: `/api/world-chain/token-heatmap/latest`
- Meta: `/api/world-chain/token-heatmap/meta`
- Current display limit: Top40
- Storage: KV latest only
- History: none
- D1: none
- Cron: none
- Raw upstream body storage: none
- Home auto-load: none
- Public refresh query: disabled

---

## Latest gate result

First successful production Worker deploy and API gate check:

```txt
Run: https://github.com/badjoke-lab/wcwd/actions/runs/25249760489/job/74039895559
Worker: https://wcwd-history.badjoke-lab.workers.dev
Status: PASS
Latest status: fresh
Latest source: live_snapshot
Latest drawable token count: 36
Refresh query source: cached_snapshot
Refresh query same updatedAt: true
Meta max_tokens: 40
History: none
Raw storage: false
Public refresh: false
```

Decision from this run:

```txt
Top40 API gate: passed
Top60 unlock: defer
Reason: current drawable token count is 36, so simply enabling a Top60 button would not produce 60 visible tokens.
```

Next action before Top60:

```txt
Keep Top40 default.
Do not unlock Top60 yet.
If expanding, first test whether increasing upstream page count or filtering can produce meaningfully more drawable tokens without raising budget risk.
```

---

## Required manual API checks

Run:

```bash
python3 scripts/check_token_heatmap_api.py
```

Optional staging/custom URL:

```bash
python3 scripts/check_token_heatmap_api.py --base-url https://wcwd-history.badjoke-lab.workers.dev
```

The script must pass and report:

- `meta.max_tokens == 40`
- `meta.history == "none"`
- `meta.raw_storage == false`
- `meta.public_refresh == false`
- `/latest` returns `ok: true`
- `/latest` returns a non-empty `tokens` array
- `/latest` returns at most 40 tokens
- `/latest?refresh=1` does not bypass the cache policy
- `top60_gate.decision` explains whether Top60 should be considered or deferred

If DNS or network is unavailable from the runner, run the script locally from the user machine before Top60 work.

---

## Required UI checks

Open:

```text
/world-chain/token-heatmap/
```

Confirm:

- Page starts with demo fallback, then replaces data only if API returns usable tokens.
- Snapshot status shows `Source`, `Status`, `Last updated`, and `Reason`.
- Endpoint policy details are visible in the debug section.
- Market / Liquidity / Risk modes still redraw correctly.
- Reset zoom still works.
- Desktop wheel scroll is not stolen by the map.
- Ctrl / Alt / Meta + wheel zooms the map.
- Drag pans the map.
- Double click zooms in.
- Shift + double click zooms out.
- Tile click updates selected token.
- Mobile default mode scrolls the page.
- Mobile Control map enables pan / pinch.
- Back to scroll returns to normal page scrolling.

---

## Top60 unlock criteria

Top60 can be considered only if all of the following are true:

1. API checks pass on production.
2. Latest snapshot status is usually `fresh` or `partial`, not repeatedly `demo`.
3. `tokens.length` is close to 40 and not consistently much lower.
4. Page remains usable on mobile.
5. No Home auto-load has been added.
6. No D1 / cron / raw storage was added to support the heatmap.
7. Cloudflare usage remains inside the WCWD visualizer budget.
8. The latest gate script returns `top60_gate.decision == can_consider_optional_top60`, or there is a documented reason to override it.

---

## Cloudflare budget guard

Do not unlock Top60 if the heatmap is trending toward any of these:

- Requests above 50k/month for this page/API.
- CPU above 0.3M CPU ms/month for this page/API.
- KV series/history added before a separate approval.
- External API fetches above the intended low-volume latest snapshot pattern.
- User-triggered refresh behavior.

The current API is intentionally latest-only. If usage grows, add caching and monitoring before adding count.

---

## Suggested Top60 PR scope

If the gate passes, the Top60 PR should be small:

- Change API max token count from 40 to 60.
- Update meta `max_tokens` from 40 to 60.
- Enable the Top60 button.
- Keep Top40 as default.
- Do not add history.
- Do not add cron.
- Do not add D1.
- Do not add Home auto-load.

Top60 must be an optional view, not the default first render.

---

## Stop conditions

Stop and do not unlock Top60 if:

- Production latest returns `demo` because upstream fetch fails.
- Latest often returns fewer than 30 drawable tokens.
- Mobile treemap becomes unreadable at Top40 already.
- `refresh=1` or another query can force repeated upstream refreshes.
- Cloudflare usage cannot be checked.
- External API behavior is unstable or rate-limited.
- Top40 is not close to full and no upstream-expansion test has shown more drawable tokens.

---

## Next after Top60

Do not jump from Top60 to Top100.

The next valid step after Top60 is one of:

- Better token filtering.
- Better selected token detail.
- Better Sell Impact deep links.
- Better low-liquidity warnings.
- Optional KV series up to 96 points, only after separate approval.
