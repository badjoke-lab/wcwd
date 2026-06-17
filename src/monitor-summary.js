import { normalizeDailyRecord } from "./monitor-daily.js";
import { metricSemantics, normalizeTimestamp, normalizeVersion } from "./monitor-semantics.js";

export function normalizeSummary(body, env = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const latest = body.latest && typeof body.latest === "object" && !Array.isArray(body.latest)
    ? body.latest
    : null;
  const semantics = metricSemantics(latest);
  return {
    ...body,
    latest: latest ? {
      ...latest,
      observed_at: semantics.observed_at,
      source: semantics.source,
    } : null,
    daily: normalizeDailyRecord(body.daily),
    version: normalizeVersion(body.version, env),
    metric_semantics: semantics,
    timestamp_semantics: {
      response_generated_at: normalizeTimestamp(body.generated_at),
      latest_observed_at: semantics.observed_at,
      deployed_at: env.DEPLOYED_AT || null,
    },
  };
}
