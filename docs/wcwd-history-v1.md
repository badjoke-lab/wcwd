# WCWD History v1 Spec (Locked)

## Purpose
WCWD progresses from a current snapshot viewer into a history-enabled mini monitoring dashboard, adding time-series context while staying lightweight and implementation-ready.

## MVP History Scope (Locked)
- **Series keys (4, locked):** `tps`, `gasPriceGwei`, `wldUsd`, `wldJpy`.
- **Interval (locked):** `15m` only.
- **Range (locked):** `7d`, `30d`.
- **Retention (locked):** rolling **30 days** of 15m points.

## Data Definitions
- **TPS**: Estimated from the latest N blocks; derive average transactions per second by dividing total tx count across those blocks by total block time span. Store as numeric value rounded to two decimals.
- **Gas price (gasPriceGwei)**: Result of `eth_gasPrice` converted to gwei (1 gwei = 1e9 wei). Treat as the chain congestion indicator. Round to whole numbers or one decimal if needed for chart stability.
- **WLD price (wldUsd / wldJpy)**: External market source price in USD and JPY. Store raw numeric prices (suggest two decimals). Fiat toggle is UI-only; both series are stored independently.

## Storage Model (WCWD-only)
- **Platform**: Cloudflare Worker with KV for historical storage.
- **Key pattern**: 1-day-per-key append model using `wcwd:snap:15m:YYYY-MM-DD`.
- **Value shape**: JSON envelope containing `points` array. Each point:
  - `ts`: epoch seconds (UTC)
  - `network`: `{ tps, gasPriceGwei }`
  - `market`: `{ wldUsd, wldJpy }`
- MVP keeps points minimal with only the metrics above.

## WCWD History API (WCWD-only, current path)
- **Endpoints**:
  - `GET /api/wcwd/current`: returns latest snapshot used by the dashboard (same shape as current UI expectations).
  - `GET /api/wcwd/history?range=7d&interval=15m`
    - Allowed query values: `range` ∈ {`7d`, `30d`}; `interval` fixed to `15m` (other values rejected or ignored).
    - Response shape (WCWD-only, no shared envelope):
      ```json
      {
        "range": "7d",
        "interval": "15m",
        "series": {
          "tps": [[ts, value], ...],
          "gasPriceGwei": [[ts, value], ...],
          "wldUsd": [[ts, value], ...],
          "wldJpy": [[ts, value], ...]
        }
      }
      ```
    - Series arrays are optimized for charts and include only [timestamp, value] tuples.

### Example `/api/wcwd/history` response (7d)
```json
{
  "range": "7d",
  "interval": "15m",
  "series": {
    "tps": [[1719964800, 3.42], [1719965700, 3.18]],
    "gasPriceGwei": [[1719964800, 4.1], [1719965700, 4.0]],
    "wldUsd": [[1719964800, 2.11], [1719965700, 2.13]],
    "wldJpy": [[1719964800, 305.2], [1719965700, 308.7]]
  }
}
```

## Edge Cases & Guarantees
- Missing points are skipped (omit null placeholders); series arrays contain only available points.
- Points must be ordered ascending by `ts`.
- All timestamps stored as UTC epoch seconds.
- Max points returned: `7d` → up to 672 points per series; `30d` → up to 2,880 points per series (15m interval).

## Future Extensions (Non-MVP)
- Activity breakdown history.
- txCount/new addresses estimates.
- Daily rollup compression.
- Moving averages / prev24h diff server-side.
