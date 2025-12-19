// functions/api/summary.js
import {
  buildSummary,
  applyWorldStatus,
  applyWorldscan,
  fetchWorldStatus,
  fetchWorldscan,
  fetchEtherscanTokenSupply,
  finalizeOk, // ★追加：ok再計算
} from "../../lib/summary.js";

export async function onRequestGet({ env }) {
  const summary = await buildSummary(env);

  // --- Optional: World Status / Worldscan (only if URLs exist) ---
  // Set these env vars if you want them enabled without code changes:
  // - WORLD_STATUS_URL
  // - WORLDSCAN_HEALTH_URL
  const tasks = [];

  if (env.WORLD_STATUS_URL) {
    tasks.push(
      (async () => {
        const r = await fetchWorldStatus(env.WORLD_STATUS_URL);
        if (r.ok && r.json) applyWorldStatus(summary, r.json, r.status);
        else {
          summary.warnings.push({ src: "world_status", where: "fetch", reason: r.text || "failed" });
          summary.world_status = { http_status: r.status ?? 0, ok: false, sample: null };
        }
      })()
    );
  } else {
    // keep predictable shape
    summary.world_status = { http_status: 0, ok: false, sample: null };
  }

  if (env.WORLDSCAN_HEALTH_URL) {
    tasks.push(
      (async () => {
        const r = await fetchWorldscan(env.WORLDSCAN_HEALTH_URL);
        applyWorldscan(summary, r.ok, r.status);
        if (!r.ok) summary.warnings.push({ src: "worldscan", where: "fetch", reason: r.text || "failed" });
      })()
    );
  } else {
    summary.worldscan = { status: 0, ok: false };
  }

  // --- Optional: Token supply via Etherscan-style API ---
  // To enable, set:
  // - ETHERSCAN_BASE_URL (full base URL like https://api.<explorer>/api)
  // - ETHERSCAN_KEY
  // - WLD_WORLDCHAIN (contract address)
  if (env.ETHERSCAN_BASE_URL && env.ETHERSCAN_KEY && env.WLD_WORLDCHAIN) {
    tasks.push(
      (async () => {
        const r = await fetchEtherscanTokenSupply({
          baseUrl: env.ETHERSCAN_BASE_URL,
          apiKey: env.ETHERSCAN_KEY,
          contract: env.WLD_WORLDCHAIN,
        });
        if (r.ok && r.json) {
          summary.etherscan.wld_token_supply = r.json;
        } else {
          summary.warnings.push({ src: "etherscan", where: "tokensupply", reason: r.text || "failed" });
          summary.etherscan.wld_token_supply = null;
        }
      })()
    );
  } else {
    if (summary.etherscan) summary.etherscan.wld_token_supply = summary.etherscan.wld_token_supply ?? null;
  }

  // Run optional fetches concurrently, but never fail the whole response
  await Promise.allSettled(tasks);

  // ★ここが最重要：warnings/errorsが増えた後に ok を再計算する
  finalizeOk(summary);

  // Phase 0 cache (CDN-side)
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");

  return new Response(JSON.stringify(summary, null, 2), { status: 200, headers });
}
