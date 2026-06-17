function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function iso(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function normalizeVersion(body, env = {}) {
  return {
    ...(body && typeof body === "object" ? body : {}),
    ok: body?.ok !== false,
    deployed_at: env.DEPLOYED_AT || null,
    deployed_at_known: Boolean(env.DEPLOYED_AT),
  };
}

export function metricSemantics(latest) {
  const observedAt = iso(latest?.ts);
  return {
    observed_at: observedAt,
    source: latest ? "existing_kv_snapshot" : null,
    metrics: {
      tps: {
        status: finite(latest?.tps) ? "estimated" : "unavailable",
        basis: "sampled_block_window",
      },
      transactions_24h: {
        status: "unavailable",
        basis: "no_measured_24h_counter",
      },
      gas_gwei: {
        status: finite(latest?.gas_gwei) ? "observed" : "unavailable",
        basis: "snapshot_value",
      },
      addresses_24h: {
        status: "unavailable",
        basis: "no_full_indexer",
      },
      addresses_total: {
        status: "unavailable",
        basis: "no_full_indexer",
      },
      wld_market: {
        status: finite(latest?.wld_usd) || finite(latest?.wld_jpy) ? "observed" : "unavailable",
        basis: "snapshot_market_source",
      },
      activity_share: {
        status: finite(latest?.token_pct) || finite(latest?.native_pct) ? "estimated" : "unavailable",
        basis: "sampled_transaction_classification",
      },
    },
  };
}

export function normalizeTimestamp(value) {
  return iso(value);
}
