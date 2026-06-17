export function normalizeVersion(body, env = {}) {
  return {
    ...(body && typeof body === "object" ? body : {}),
    ok: body?.ok !== false,
    deployed_at: env.DEPLOYED_AT || null,
    deployed_at_known: Boolean(env.DEPLOYED_AT),
  };
}
