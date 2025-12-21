// wcwd-history Worker
// - Cron: fetch summary JSON from your Pages endpoint (or any URL)
// - Store compact samples into KV (daily bucket)
// - Expose HTTP API for history read: /history?days=7

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    if (url.pathname === "/history") {
      // GET /history?days=7
      const days = clampInt(url.searchParams.get("days"), 1, 30, 7);
      const out = await readHistory(env, days);
      return json(out, {
        "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
      });
    }

    return json({ ok: false, error: "Not found" }, {}, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};

function json(obj, headers = {}, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function dayKeyUTC(ms) {
  const d = new Date(ms);
  // YYYY-MM-DD in UTC
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function round(n, digits = 6) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const p = Math.pow(10, digits);
  return Math.round(x * p) / p;
}

function pickWarnFlags(summary) {
  const wf = [];
  const w = Array.isArray(summary?.warnings) ? summary.warnings : [];
  for (const item of w) {
    const src = item?.src;
    const where = item?.where;
    const reason = String(item?.reason || "");
    // coingecko
    if (src === "coingecko" && where === "simple/price") wf.push("cg_simple_failed");
    if (src === "coingecko" && where === "market_chart") {
      // try to extract status code
      if (reason.includes("401")) wf.push("cg_chart_401");
      else if (reason.includes("400")) wf.push("cg_chart_400");
      else wf.push("cg_chart_failed");
    }
  }
  return wf;
}

function deriveStatus(summary) {
  // Your API sometimes returns:
  // - ok:boolean (old)
  // - ok:true + status:"partial" + degraded:true (new)
  // normalize:
  if (!summary) return "error";
  if (summary.ok === false) return "error";
  const st = typeof summary.status === "string" ? summary.status : null;
  if (st === "partial") return "partial";
  return "ok";
}

async function runCron(env) {
  // IMPORTANT: set SUMMARY_URL to your Pages endpoint /api/summary
  // Example: https://<your-site>.pages.dev/api/summary
  const summaryUrl = env.SUMMARY_URL;
  if (!summaryUrl) {
    // no env => can't do cron
    await env.HIST.put("last_cron_error", JSON.stringify({
      ts: new Date().toISOString(),
      error: "missing SUMMARY_URL",
    }));
    return;
  }

  const started = Date.now();
  let summary = null;
  let fetchError = null;

  try {
    const r = await fetch(summaryUrl, { cf: { cacheTtl: 0, cacheEverything: false } });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(`summary fetch failed: HTTP ${r.status}`);
    summary = j;
  } catch (e) {
    fetchError = String(e?.message || e);
  }

  const now = Date.now();
  const key = `hist:${dayKeyUTC(now)}`;

  if (!summary) {
    // record a tiny failure sample so gaps are visible
    const sample = {
      t: now,
      st: "error",
      blk: null,
      tps: null,
      gas: null,
      wld: null,
      mc: null,
      vol: null,
      tok: null,
      wf: ["cron_fetch_failed"],
    };
    await appendSample(env, key, sample);
    await env.HIST.put("last_cron_error", JSON.stringify({
      ts: new Date().toISOString(),
      error: fetchError || "unknown",
      elapsed_ms: Date.now() - started,
    }));
    return;
  }

  // --- Build compact sample ---
  const st = deriveStatus(summary);

  const blk = summary?.rpc?.latest_block_dec ?? null;
  const tps = summary?.rpc?.tps_estimate ?? null;

  const gasWeiHex = summary?.rpc?.gas_price ?? null;
  const gasWei = hexToInt(gasWeiHex);
  const gasGwei = gasWei != null ? gasWei / 1e9 : null;

  const cg = summary?.coingecko || {};
  const wldUsd = cg?.simple?.usd ?? null;
  const mcUsd = cg?.simple?.usd_market_cap ?? null;
  const volUsd = cg?.simple?.usd_24h_vol ?? null;

  const tokPct = summary?.activity_sample?.token_pct ?? null;

  const sample = {
    t: now,
    st,
    blk: (typeof blk === "number" ? blk : null),
    tps: (typeof tps === "number" ? tps : null),
    gas: (gasGwei != null ? round(gasGwei, 6) : null),
    wld: (wldUsd != null ? round(wldUsd, 8) : null),
    mc: (mcUsd != null ? round(mcUsd, 2) : null),
    vol: (volUsd != null ? round(volUsd, 2) : null),
    tok: (tokPct != null ? round(tokPct, 4) : null),
    wf: pickWarnFlags(summary),
  };

  await appendSample(env, key, sample);

  // helpful meta
  await env.HIST.put("last_cron_ok", JSON.stringify({
    ts: new Date().toISOString(),
    key,
    st,
    elapsed_ms: Date.now() - started,
  }));
}

function hexToInt(h) {
  if (!h || typeof h !== "string") return null;
  if (h.startsWith("0x")) {
    const n = parseInt(h, 16);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(h);
  return Number.isFinite(n) ? n : null;
}

async function appendSample(env, dayKey, sample) {
  const raw = await env.HIST.get(dayKey);
  let arr = [];
  if (raw) {
    try { arr = JSON.parse(raw); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) arr = [];

  arr.push(sample);

  // retention inside the day bucket: cap to avoid KV object blow-up
  // 5-min interval => 288/day. keep 400 just in case.
  while (arr.length > 400) arr.shift();

  await env.HIST.put(dayKey, JSON.stringify(arr));
}

async function readHistory(env, days) {
  const now = Date.now();
  const dayKeys = [];
  for (let i = 0; i < days; i++) {
    const ms = now - i * 24 * 3600 * 1000;
    dayKeys.push(`hist:${dayKeyUTC(ms)}`);
  }

  const buckets = await Promise.all(dayKeys.map(async (k) => {
    const raw = await env.HIST.get(k);
    if (!raw) return { key: k, samples: [] };
    try {
      const arr = JSON.parse(raw);
      return { key: k, samples: Array.isArray(arr) ? arr : [] };
    } catch {
      return { key: k, samples: [] };
    }
  }));

  // flatten and sort by time
  const samples = buckets.flatMap(b => b.samples).filter(s => s && typeof s.t === "number");
  samples.sort((a, b) => a.t - b.t);

  // quick summary for UI
  const last = samples.length ? samples[samples.length - 1] : null;

  return {
    ok: true,
    ts: new Date().toISOString(),
    days,
    sample_count: samples.length,
    last,
    samples,
  };
}
