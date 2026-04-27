# WCWD Phase 4 Exit Check — Oracles / Paymaster

## Scope

This checklist closes the Oracles / Paymaster paid-plan strengthening pass.

Relevant work:

- P4-A: clarify Oracles / Paymaster role and state
- P4-B: add Oracles same-origin feed API contract
- P4-C: switch Oracles frontend to prefer same-origin API
- P4-D: add bounded Oracles feed check history
- P4-E: add Paymaster same-origin preflight API contract
- P4-F: switch Paymaster frontend to prefer same-origin API

Do not continue adding Oracles / Paymaster features until this checklist passes.

---

## 1. Oracles API contract

Check:

```txt
/api/oracles/feed?rpc=<https_rpc>&feed=<0x_feed>
```

Expected JSON fields:

```txt
ok
source
state
generated_at
feed
rpc_host
result
notes
retention
```

Expected `result` fields when ok:

```txt
decimals
roundId
answer_raw
answer_scaled
startedAt
updatedAt
answeredInRound
age_sec
```

Expected `state` values:

```txt
fresh
stale
degraded
unavailable
```

Expected safety behavior:

- non-HTTPS RPC URL is rejected
- localhost / private host RPC is rejected
- response is compact JSON
- raw RPC payload is not stored

Failure action:

- check `src/oracles-feed.js`
- check `src/index.js` route for `/api/oracles/feed`

---

## 2. Oracles frontend

Check:

```txt
/world-chain/oracles/
```

Expected:

- page explains current role and limitations
- `Fetch` uses `/api/oracles/feed` first
- same-origin result is rendered with state and metadata
- browser RPC fallback is attempted only after same-origin API failure
- both API and fallback errors are shown if both fail

Failure action:

- check `world-chain/oracles/app.js`
- check `/api/oracles/feed`

---

## 3. Oracles bounded history

Relevant KV key:

```txt
oracles:feed:recent
```

Expected:

- compact feed checks only
- max items: 96
- no raw RPC response archive
- API response includes retention storage status

Compact fields only:

```txt
ts
ok
state
feed
rpc_host
answer_scaled
updatedAt
age_sec
notes
```

Failure action:

- check `RETENTION.oracle_feed_checks.recent_points`
- check compact storage logic in `src/oracles-feed.js`

---

## 4. Paymaster API contract

Check:

```txt
/api/paymaster/preflight?rpc=<https_rpc>&sponsor=<https_sponsor_url>
```

Expected JSON fields:

```txt
ok
source
state
generated_at
rpc
sponsor
notes
retention
```

Expected `rpc` fields when provided:

```txt
host
chainId
gasPrice
gasPriceGwei
ok
```

Expected `sponsor` behavior:

- sponsor URL is validated only
- Worker does not POST to arbitrary sponsor endpoint
- sponsor result contains `validated_url_only_no_server_post`

Expected safety behavior:

- non-HTTPS RPC URL is rejected
- non-HTTPS sponsor URL is rejected
- localhost / private host URLs are rejected
- compact JSON only

Failure action:

- check `src/paymaster-preflight.js`
- check `src/index.js` route for `/api/paymaster/preflight`

---

## 5. Paymaster frontend

Check:

```txt
/world-chain/paymaster/
```

Expected:

- page explains current role and limitations
- RPC button calls `/api/paymaster/preflight` first
- sponsor button validates through `/api/paymaster/preflight` first
- browser RPC fallback remains available after same-origin API failure
- browser sponsor POST fallback remains browser-only
- output clearly states that Worker does not POST to arbitrary sponsor endpoints

Failure action:

- check `world-chain/paymaster/app.js`
- check `/api/paymaster/preflight`

---

## 6. Paymaster bounded history

Relevant KV key:

```txt
paymaster:preflight:recent
```

Expected:

- compact preflight checks only
- max items: 96
- no raw sponsor response archive
- no Worker-side arbitrary sponsor POST
- API response includes retention storage status

Compact fields only:

```txt
ts
ok
state
rpc_host
chainId
gasPriceGwei
sponsor_host
sponsor_valid
notes
```

Failure action:

- check `RETENTION.paymaster_preflight_checks.recent_points`
- check compact storage logic in `src/paymaster-preflight.js`

---

## 7. Storage and cost safety

Expected:

- no D1 introduced
- no Durable Objects introduced
- no raw transaction archive
- no raw RPC response archive
- no raw sponsor response archive
- all new histories are capped at 96 entries
- KV remains the only storage layer for these checks

Failure action:

- stop feature expansion
- fix retention / storage rules first

---

## 8. Phase 4 exit criteria

Phase 4 can be treated as closed when:

- Oracles API returns normalized compact payload
- Oracles frontend prefers same-origin API
- Oracles compact history is bounded
- Paymaster API returns normalized compact payload
- Paymaster frontend prefers same-origin API
- Paymaster compact history is bounded
- Worker-side sponsor POST is not introduced
- no unbounded storage path is introduced

---

## Recommended next step

After Phase 4 closes, stop adding backend surfaces for now.

Recommended next phase:

```txt
Phase 5: QA / deploy verification / production polish
```

Focus:

- run the deploy checks from Phase 2 / Phase 3 / Phase 4
- fix only broken behavior
- review mobile layout for Home / Monitor / Oracles / Paymaster
- confirm sitemap / navigation includes the new stable pages
- then decide whether to do SEO polish or another paid-plan feature
