const $ = (id) => document.getElementById(id);

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n/1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return (n/1e9).toFixed(2) + "B";
  if (abs >= 1e6)  return (n/1e6).toFixed(2) + "M";
  if (abs >= 1e3)  return Math.round(n).toLocaleString();
  return (typeof n === "number" ? n.toFixed(2) : String(n));
}

function sparkline(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return "—";
  const bars = "▁▂▃▄▅▆▇█";
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = (max - min) || 1;
  return arr.map(v => {
    const idx = Math.max(0, Math.min(7, Math.floor(((v - min) / range) * 7)));
    return bars[idx];
  }).join("");
}

function setText(id, v) { $(id).textContent = v; }

async function refresh() {
  try {
    setText("debug", "loading...");
    const r = await fetch("/api/summary", { cache: "no-store" });
    const j = await r.json();

    // Network
    setText("tps", j.network?.tps_estimate?.toFixed(2) ?? "—");
    setText("tx24h", (j.network?.tx_24h ?? "—"));
    setText("newAddr24h", (j.network?.new_addresses_24h ?? "—"));
    setText("totalAddr", (j.network?.total_addresses_est ?? "—"));
    setText("gasGwei", (j.network?.gas_gwei?.toFixed(2) ?? "—"));

    // Market
    const pUsd = j.market?.price_usd;
    const pJpy = j.market?.price_jpy;
    setText("price", (pUsd!=null && pJpy!=null) ? `$${fmtNum(pUsd)} / ¥${fmtNum(pJpy)}` : "—");
    setText("chg24h", j.market?.change_24h_pct!=null ? `${j.market.change_24h_pct.toFixed(2)}%` : "—");
    setText("mcap", j.market?.market_cap_usd!=null ? `$${fmtNum(j.market.market_cap_usd)}` : "—");
    setText("vol24h", j.market?.volume_24h_usd!=null ? `$${fmtNum(j.market.volume_24h_usd)}` : "—");
    setText("spark7d", sparkline(j.market?.price_7d_usd ?? []));

    // Activity
    setText("nativePct", j.activity?.native_pct!=null ? `${j.activity.native_pct.toFixed(1)}%` : "—");
    setText("tokenPct",  j.activity?.token_pct!=null  ? `${j.activity.token_pct.toFixed(1)}%`  : "—");
    setText("contractPct",j.activity?.contract_pct!=null?`${j.activity.contract_pct.toFixed(1)}%`:"—");
    setText("otherPct",  j.activity?.other_pct!=null  ? `${j.activity.other_pct.toFixed(1)}%`  : "—");

    // Trends
    setText("trendWld", sparkline(j.trends?.wld_7d_usd ?? []));
    setText("trendTx",  sparkline(j.trends?.tx_7d ?? []));

    // Alerts
    setText("alertSpike", j.alerts?.spike ? "YES" : "no");
    setText("alertDrop",  j.alerts?.drop  ? "YES" : "no");
    setText("alertGas",   j.alerts?.high_gas ? "YES" : "no");

    setText("updated", new Date().toISOString());
    setText("debug", j.debug ?? "ok");
  } catch (e) {
    setText("debug", "ERROR: " + (e?.message || e));
  }
}

refresh();
setInterval(refresh, 60_000);
