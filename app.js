const $ = (sel) => document.querySelector(sel);

function setText(id, v) {
  const el = $(id);
  if (!el) return;
  el.textContent = (v === undefined || v === null || v === "") ? "—" : String(v);
}

function shortJSON(v, max=240) {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return String(v);
  }
}

async function load() {
  setText("#status", "loading...");
  try {
    const r = await fetch("/api/summary", { cache: "no-store" });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch {}

    if (!r.ok || !j) {
      setText("#status", `ERROR: HTTP ${r.status}`);
      setText("#raw", text.slice(0, 800));
      return;
    }

    setText("#status", j.ok ? "OK" : "PARTIAL (see errors)");
    setText("#errors", (j.errors && j.errors.length) ? j.errors.join("\n") : "—");

    // RPC core
    setText("#chainId", j.rpc?.chain_id_dec);
    setText("#blockNumber", j.rpc?.latest_block_dec);
    setText("#gasPrice", j.rpc?.gas_price);
    setText("#priorityFee", j.rpc?.max_priority_fee);
    setText("#tps", j.rpc?.tps_estimate);
    setText("#blockTime", j.rpc?.block_time_avg_s);

    // FREE extras (2-3)
    setText("#worldStatus", shortJSON(j.world_status?.sample));
    setText("#worldscan", j.worldscan?.ok ? `OK (HTTP ${j.worldscan.status})` : `NG (HTTP ${j.worldscan?.status ?? "?"})`);

    // KEYED extras (4-5)
    setText("#etherscan", shortJSON(j.etherscan));
    setText("#coingecko", shortJSON(j.coingecko));

    setText("#raw", JSON.stringify(j, null, 2).slice(0, 2000));
  } catch (e) {
    setText("#status", "ERROR: fetch failed");
    setText("#raw", String(e));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  $("#reload")?.addEventListener("click", load);
  load();
});
