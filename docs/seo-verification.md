# WCWD SEO Verification Checklist

This checklist is for the paid-plan SEO pass.

Run it after SEO-related PRs, before or after deployment.

---

## 1. Static repository check

Run:

```bash
python3 scripts/check_seo.py
```

Expected result:

```text
SEO check passed.
Checked 13 public routes.
```

The script checks:

- public route files exist
- static `<title>` exists
- static description exists
- canonical URL exists and matches the route
- Open Graph metadata exists
- Twitter metadata exists
- `twitter:card` is `summary_large_image`
- sitemap contains stable public routes
- robots points to the production sitemap
- `/test/` is blocked from indexing
- shared SEO feature markers exist in `assets/common.js`

---

## 2. Production URL checks

Open these after deployment:

- `https://wcwd.badjoke-lab.com/`
- `https://wcwd.badjoke-lab.com/world-chain/monitor/`
- `https://wcwd.badjoke-lab.com/world-chain/sell-impact/`
- `https://wcwd.badjoke-lab.com/world-chain/ecosystem/`
- `https://wcwd.badjoke-lab.com/donate/`

Confirm:

- page loads without a blank screen
- header Donate/Support CTA is visible
- support card appears on Home / Monitor / Sell Impact / Ecosystem
- Donate page explains what support funds
- no horizontal overflow on mobile width
- Monitor still loads data or shows a safe degraded state
- Sell Impact still accepts inputs and shows its existing UI
- Ecosystem still lists entries

---

## 3. Source checks in browser

For each key URL, inspect page source or devtools:

- `<title>`
- `<meta name="description">`
- `<link rel="canonical">`
- `og:title`
- `og:description`
- `og:url`
- `og:image`
- `twitter:card`
- `twitter:title`
- `twitter:description`
- `twitter:image`

Static metadata should exist even before JavaScript metadata fallback runs.

---

## 4. Structured data checks

On deployed pages, check that JSON-LD appears in the DOM:

- Home: `WebSite` and `Organization`
- Tool pages: `WebApplication`
- Lower-level pages: `BreadcrumbList`

Recommended URLs:

- `/`
- `/world-chain/monitor/`
- `/world-chain/sell-impact/`
- `/world-chain/ecosystem/`
- `/world-id/wizard/`

Do not claim:

- official Worldcoin status
- strict real-time accuracy
- full indexer coverage
- financial advice

---

## 5. Sitemap and robots checks

Open:

- `https://wcwd.badjoke-lab.com/sitemap.xml`
- `https://wcwd.badjoke-lab.com/robots.txt`

Sitemap must contain:

- `/`
- `/about/`
- `/donate/`
- `/world-chain/`
- `/world-chain/monitor/`
- `/world-chain/sell-impact/`
- `/world-chain/ecosystem/`
- `/world-chain/oracles/`
- `/world-chain/paymaster/`
- `/world-id/`
- `/world-id/wizard/`
- `/world-id/debugger/`
- `/world-id/playground/`

Robots must include:

```text
Sitemap: https://wcwd.badjoke-lab.com/sitemap.xml
Disallow: /test/
```

---

## 6. Google Search Console follow-up

After deployment:

1. Submit or resubmit `https://wcwd.badjoke-lab.com/sitemap.xml`.
2. URL inspect the following pages:
   - `/`
   - `/world-chain/monitor/`
   - `/world-chain/sell-impact/`
   - `/world-chain/ecosystem/`
   - `/donate/`
3. Request indexing if Google has not crawled the updated version.
4. Watch Coverage / Page indexing for:
   - duplicate canonical issues
   - blocked-by-robots errors
   - discovered currently not indexed
   - crawled currently not indexed

---

## 7. Completion condition

The WCWD paid-plan SEO pass is complete when:

- static metadata exists on stable public pages
- sitemap and route registry match
- `/test/` is not indexed
- donation path is visible on key traffic pages
- Donate page explains infrastructure and data-engine support clearly
- structured data is present
- Search Console has received the updated sitemap
- no page overclaims official status, full-indexing, strict real-time data, or financial advice
