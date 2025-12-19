// functions/api/summary.js
import {
  buildSummary,
  applyWorldStatus,
  applyWorldscan,
  fetchWorldStatus,
  fetchWorldscan,
  fetchEtherscanTokenSupply,
  finalizeStatus, // ★ ok/partial/error を最終確定
} from "../../lib/summary.js";

export async function onRequestGet({ env }) {
  const summary = await buildSummary(env);

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

  await Promise.allSettled(tasks);

  // ★ warnings で ok=false にしない。status/degraded を確定する。
  finalizeStatus(summary);

  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");

  return new Response(JSON.stringify(summary, null, 2), { status: 200, headers });
}
