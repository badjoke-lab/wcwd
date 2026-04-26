import { RETENTION, readJson, writeJson } from "./retention.js";

const PAYMASTER_CHECKS_KEY = "paymaster:preflight:recent";

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function parseSafeHttpsUrl(value, field) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, empty: true, url: "", host: "" };
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return { ok: false, error: `${field}_must_be_https` };
    if (isBlockedHost(url.hostname)) return { ok: false, error: `${field}_host_blocked` };
    return { ok: true, empty: false, url: url.toString(), host: url.hostname };
  } catch {
    return { ok: false, error: `invalid_${field}_url` };
  }
}

async function rpcCall(rpcUrl, method, params = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok) throw new Error(`rpc_http_${res.status}`);
    if (body?.error) throw new Error(`rpc_error_${body.error.code || "unknown"}`);
    return body?.result;
  } finally {
    clearTimeout(timer);
  }
}

function weiHexToGwei(hexWei) {
  try {
    const wei = BigInt(hexWei || "0x0");
    return Number(wei) / 1e9;
  } catch {
    return null;
  }
}

function buildPayload({ ok, state, rpc = null, sponsor = null, notes = [] }) {
  return {
    ok,
    source: "same-origin",
    state,
    generated_at: new Date().toISOString(),
    rpc,
    sponsor,
    notes: Array.from(new Set(notes.map(String).filter(Boolean))),
    retention: { recent_points: RETENTION.paymaster_preflight_checks.recent_points, key: PAYMASTER_CHECKS_KEY },
  };
}

function compactCheck(payload) {
  return {
    ts: payload.generated_at,
    ok: !!payload.ok,
    state: payload.state,
    rpc_host: payload.rpc?.host || "",
    chainId: payload.rpc?.chainId || null,
    gasPriceGwei: payload.rpc?.gasPriceGwei ?? null,
    sponsor_host: payload.sponsor?.host || "",
    sponsor_valid: payload.sponsor?.valid ?? null,
    notes: Array.isArray(payload.notes) ? payload.notes.slice(0, 3) : [],
  };
}

async function appendCheck(env, payload) {
  const cap = RETENTION.paymaster_preflight_checks.recent_points;
  const current = await readJson(env, PAYMASTER_CHECKS_KEY, []);
  const list = Array.isArray(current) ? current : [];
  const next = list.concat([compactCheck(payload)]);
  const trimmed = next.length > cap ? next.slice(next.length - cap) : next;
  await writeJson(env, PAYMASTER_CHECKS_KEY, trimmed);
  return { stored: true, key: PAYMASTER_CHECKS_KEY, count: trimmed.length, cap };
}

async function withStorage(env, payload) {
  if (!env?.HIST) return { ...payload, retention: { ...payload.retention, stored: false, reason: "missing_hist_binding" } };
  try {
    const stored = await appendCheck(env, payload);
    return { ...payload, retention: { ...payload.retention, stored } };
  } catch (error) {
    return { ...payload, retention: { ...payload.retention, stored: false, reason: error?.message || "store_failed" } };
  }
}

export async function handlePaymasterPreflight(request, env) {
  const url = new URL(request.url);
  const rpcParsed = parseSafeHttpsUrl(url.searchParams.get("rpc"), "rpc");
  const sponsorParsed = parseSafeHttpsUrl(url.searchParams.get("sponsor"), "sponsor");
  const notes = [];

  if (!rpcParsed.ok) {
    const payload = buildPayload({ ok: false, state: "unavailable", notes: [rpcParsed.error] });
    return json(await withStorage(env, payload), { status: 400 });
  }
  if (!sponsorParsed.ok) {
    const payload = buildPayload({ ok: false, state: "unavailable", notes: [sponsorParsed.error] });
    return json(await withStorage(env, payload), { status: 400 });
  }

  let rpc = null;
  if (!rpcParsed.empty) {
    try {
      const chainId = await rpcCall(rpcParsed.url, "eth_chainId", []);
      const gasPrice = await rpcCall(rpcParsed.url, "eth_gasPrice", []);
      rpc = {
        host: rpcParsed.host,
        chainId,
        gasPrice,
        gasPriceGwei: weiHexToGwei(gasPrice),
        ok: true,
      };
    } catch (error) {
      rpc = { host: rpcParsed.host, ok: false, error: error?.message || "rpc_failed" };
      notes.push(rpc.error);
    }
  } else {
    notes.push("rpc_not_provided");
  }

  const sponsor = sponsorParsed.empty
    ? { provided: false, valid: false, host: "", note: "sponsor_not_provided" }
    : {
        provided: true,
        valid: true,
        host: sponsorParsed.host,
        note: "validated_url_only_no_server_post",
      };

  if (!sponsor.provided) notes.push("sponsor_not_provided");
  else notes.push("sponsor_url_validated_without_post");

  const ok = (rpc ? rpc.ok !== false : true) && (sponsor.provided ? sponsor.valid : true);
  const state = ok ? (sponsor.provided ? "fresh" : "degraded") : "unavailable";
  const payload = buildPayload({ ok, state, rpc, sponsor, notes });
  return json(await withStorage(env, payload));
}
