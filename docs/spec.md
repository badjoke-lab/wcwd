# Worldchain × WLD Dashboard — Implementation Spec (Codex Only)

This is the ONLY specification Codex must follow.  
Do NOT read or use any other project files or documents.

---

# 1. Purpose

Create a **static, fully client-side dashboard** that shows real-time metrics for **Worldchain** and **WLD market data**, using **ONLY free APIs** and **WITHOUT any backend, database, cron, or AI**.

The dashboard must run on Cloudflare Pages / GitHub Pages with **0 yen operational cost**.

---

# 2. Allowed Directories / Files

Codex may ONLY create or modify the following files **in the repository root**:

```
/index.html
/style.css
/app.js
/assets/*   (optional)
```

❗Codex MUST NOT modify:

- `/specs/` (all files inside specs are strictly read-only)
- any existing file outside `index.html`, `style.css`, `app.js`
- any additional folder other than `/assets/`
- any new files not explicitly listed above

Codex MUST treat the **repository root as the implementation directory**.  
Do NOT assume any `/tools/` or nested folder structure.

---

# 3. Forbidden (Do NOT implement)

Codex MUST NOT implement any of the following:

- AI calls / OpenAI API  
- Server-side code  
- Databases (Neon, Supabase, etc.)  
- Cron jobs / scheduled tasks  
- Authentication or backend logic  
- Any paid API  
- Any API requiring a secret key  
- Any file outside the allowed root files  
- Auto-refresh loops (only manual refresh allowed)

---

# 4. Required Free APIs

Codex must use ONLY the following free endpoints:

### 4.1 CoinGecko — WLD Market Data
- Price  
- 24h change  
- Market cap  
- Volume  
- 7d sparkline  
Endpoint example:  
```
https://api.coingecko.com/api/v3/coins/worldcoin
```

### 4.2 Worldscan (Etherscan-compatible) — Worldchain Data
Use **only endpoints that require no API key** to get:
- Latest block  
- TX count  
- Basic gas info  
- Basic address count (estimated via block scanning)

### 4.3 QuickNode Gas Tracker (view only)
Use read-only gas price endpoint if available.

Codex MUST NOT use any endpoint requiring keys.

---

# 5. UI Requirements

### 5.1 Layout

Use a **card-based responsive grid**:

```
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
```

This layout must support:

- 360px width → 1 column  
- 480–768px → 1–2 columns  
- 1024px → 3 columns  
- 1440px → 4 columns  
- ≥1920px → 5–6 columns  

### 5.2 Sections (in this order)

1. **Network Stats**  
   - TPS (calculated)  
   - 24h TX count  
   - New addresses (estimated)  
   - Total addresses (estimated)  
   - Gas price  

2. **WLD Market Stats**  
   - Price (USD/JPY)  
   - 24h change  
   - Market cap  
   - Volume  
   - 7d sparkline  

3. **Activity Breakdown**  
   - Native transfer %  
   - Token transfer %  
   - Contract call %  
   - Others  

4. **Trend Charts**  
   - WLD 7d price trend  
   - TX 7d trend  
   (Charts must be lightweight, no heavy libraries)

5. **Alerts**  
   - Spike / Drop / High Gas (simple threshold logic)  

---

# 6. Interaction Rules

- No auto-refresh.  
- Provide a **“Refresh” button** to fetch new data.  
- Use **localStorage** to save previous-day values for diff display.  
- No popups, no modals.

---

# 7. index.html Structure

Codex must output HTML with the following blocks:

```
<header>Title</header>

<section id="network-stats" class="cards-grid"></section>

<section id="market-stats" class="cards-grid"></section>

<section id="activity-breakdown" class="cards-grid"></section>

<section id="trend-charts">
  <canvas id="priceChart"></canvas>
  <canvas id="txChart"></canvas>
</section>

<section id="alerts"></section>

<footer>Simple text</footer>
```

Use placeholder content initially; real values will be filled via app.js.

---

# 8. style.css Requirements

Codex must implement:

- White background (#FFFFFF)  
- Black text (#000000 / #555555)  
- Card borders (#E5E5E5)  
- Border-radius: 8px  
- Padding: 16px  
- Lightweight shadows on hover  
- Everything fully responsive  

Charts: width 100%, height 160–260px depending on viewport.

---

# 9. app.js Requirements

Codex must implement:

### 9.1 API fetching functions

- fetchWLDMarket()  
- fetchWorldchainStats()  
- fetchActivityBreakdown()  

### 9.2 Data calculation

- TPS from latest blocks  
- Activity % breakdown  
- Diff calculation using localStorage  

### 9.3 Alert detection

Simple thresholds:

- Spike: TPS > median × 1.4  
- Drop: TPS < median × 0.7  
- High Gas: gas > baseline × 1.5  

### 9.4 Rendering functions

- renderNetworkStats()  
- renderMarketStats()  
- renderActivityBreakdown()  
- renderCharts()  
- renderAlerts()  

Charts must use **only lightweight code** (no heavy libraries).

---

# 10. Initial State

Codex must:

- Create all sections with **placeholder text**  
- Implement actual API calls  
- Implement the refresh button  
- Ensure full responsiveness at 360px minimum width  

---

# 11. Final Output Criteria

A working static dashboard consisting of:

```
/index.html
/style.css
/app.js
/assets/*
```

that:

- Uses ONLY free APIs  
- Has NO backend  
- Costs 0 yen to operate  
- Renders all required sections  
- Is fully responsive down to 360px  
- Does not modify any other folder  

---

# End of Spec  
Codex must follow ONLY this document.
