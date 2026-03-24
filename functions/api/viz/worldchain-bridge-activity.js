const CACHE_TTL_MS = 6000;
const CACHE_STALE_MS = 45000;
const FETCH_TIMEOUT_MS = 6000;

const memoryCache = {
  full: { entry: null, inflight: null },
  lite: { entry: null, inflight: null },
};

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseHexInt(hex) {
  if (!hex || typeof hex !== 'string') return 0;
  return parseInt(hex, 16) || 0;
}

function normalizeAddress(addr) {
  return typeof addr === 'string' ? addr.trim().toLowerCase() : '';
}

function uniq(list) {
  return Array.from(new Set(list));
}

function parseAddressList(raw) {
  return uniq(
    String(raw || '')
      .split(',')
      .map((s) => normalizeAddress(s))
      .filter(Boolean)
  );
}

async function rpcFetch(rpcUrl, method, params, timeoutMs = FETCH_TIMEOUT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: ac.signal,
    });

    if (!res.ok) throw new Error('rpc_http_' + res.status);

    const j = await res.json();
    if (j.error) throw new Error('rpc_error_' + (j.error.message || j.error.code || 'unknown'));
    return j.result;
  } finally {
    clearTimeout(t);
  }
}

async function buildLivePayload({ lite, now, rpcUrl, bridgeAddresses, forceFail }) {
  if (forceFail) throw new Error('forced failure');

  const chainId = await rpcFetch(rpcUrl, 'eth_chainId', []);
  if (String(chainId).toLowerCase() !== '0x1e0') {
    throw new Error('worldchain_only_expected_0x1e0_got_' + chainId);
  }

  const blocksToScan = lite ? 8 : 8;
  const latestHex = await rpcFetch(rpcUrl, 'eth_blockNumber', []);
  const latestNum = parseHexInt(latestHex);

  let txTotal = 0;
  let bridgeTxCount = 0;
  let depositCount = 0;
  let withdrawCount = 0;
  const uniqueUsers = new Set();

  for (let i = 0; i < blocksToScan; i += 1) {
    const n = latestNum - i;
    if (n < 0) break;

    const block = await rpcFetch(
      rpcUrl,
      'eth_getBlockByNumber',
      ['0x' + n.toString(16), true]
    );

    const txs = Array.isArray(block?.transactions) ? block.transactions : [];
    txTotal += txs.length;

    if (!bridgeAddresses.length) continue;

    for (const tx of txs) {
      const from = normalizeAddress(tx?.from);
      const to = normalizeAddress(tx?.to);

      const fromIsBridge = from && bridgeAddresses.includes(from);
      const toIsBridge = to && bridgeAddresses.includes(to);

      if (!fromIsBridge && !toIsBridge) continue;

      bridgeTxCount += 1;

      if (toIsBridge && !fromIsBridge) {
        depositCount += 1;
        if (from) uniqueUsers.add(from);
      } else if (fromIsBridge && !toIsBridge) {
        withdrawCount += 1;
        if (to) uniqueUsers.add(to);
      } else {
        if (from) uniqueUsers.add(from);
        if (to) uniqueUsers.add(to);
      }
    }
  }

  const bridgeConfigured = bridgeAddresses.length > 0;

  let activity;
  let matchedRoutes;
  let inFlow;
  let outFlow;
  let samples;

  if (bridgeConfigured) {
    const denom = Math.max(1, blocksToScan * 12);
    activity = clamp01(bridgeTxCount / denom);
    matchedRoutes = bridgeTxCount;
    samples = bridgeTxCount;

    const totalDirectional = Math.max(1, depositCount + withdrawCount);
    inFlow = clamp01(depositCount / totalDirectional);
    outFlow = clamp01(withdrawCount / totalDirectional);
  } else {
    const avgTx = txTotal / Math.max(1, blocksToScan);
    const txScore = clamp01(avgTx / 200);
    activity = Number(txScore.toFixed(3));
    matchedRoutes = 0;
    inFlow = 0;
    outFlow = 0;
    samples = 0;
  }

  return {
    ok: true,
    ts: now,
    chainId,
    windowBlocks: blocksToScan,
    activity: Number(activity.toFixed(3)),
    matchedRoutes,
    inFlow: Number(inFlow.toFixed(3)),
    outFlow: Number(outFlow.toFixed(3)),
    depositCount,
    withdrawCount,
    uniqueUsers: uniqueUsers.size,
    samples,
    bridgeConfigured,
    selectedBridges: bridgeAddresses,
    isStale: false,
    source: 'worldchain:rpc',
  };
}

async function getCachedPayload({ lite, now, rpcUrl, bridgeAddresses, forceFail }) {
  const key = bridgeAddresses.join(',');
  const bucket = lite ? memoryCache.lite : memoryCache.full;

  if (bucket.entry && bucket.entry.key === key && now < bucket.entry.freshUntil) {
    return { ...bucket.entry.payload, isStale: false };
  }

  if (!bucket.inflight || bucket.key !== key) {
    bucket.key = key;
    bucket.inflight = buildLivePayload({ lite, now, rpcUrl, bridgeAddresses, forceFail })
      .then((payload) => {
        bucket.entry = {
          key,
          payload,
          freshUntil: now + CACHE_TTL_MS,
          staleUntil: now + CACHE_STALE_MS,
        };
        return payload;
      })
      .finally(() => {
        bucket.inflight = null;
      });
  }

  try {
    const payload = await bucket.inflight;
    return { ...payload, isStale: false };
  } catch (e) {
    if (bucket.entry && bucket.entry.key === key && now < bucket.entry.staleUntil) {
      return {
        ...bucket.entry.payload,
        isStale: true,
        staleReason: e instanceof Error ? e.message : 'upstream_error',
      };
    }
    throw e;
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const lite = url.searchParams.get('lite') === '1';
  const forceFail = url.searchParams.get('forceFail') === '1';

  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'public, max-age=0, s-maxage=6, stale-while-revalidate=45');

  const rpcUrl = env.WORLDCHAIN_RPC_URL;

  const queryAddresses = parseAddressList(url.searchParams.get('addresses'));
  const envAddresses = parseAddressList(env.WORLDCHAIN_BRIDGE_ADDRESSES);
  const bridgeAddresses = queryAddresses.length ? queryAddresses : envAddresses;

  if (!rpcUrl) {
    return new Response(JSON.stringify({
      ok: false,
      ts: Date.now(),
      source: 'worldchain:rpc',
      error: 'missing_worldchain_rpc_url',
      message: 'WORLDCHAIN_RPC_URL is not set',
      chainId: null,
      windowBlocks: lite ? 8 : 8,
      activity: 0,
      matchedRoutes: 0,
      inFlow: 0,
      outFlow: 0,
      depositCount: 0,
      withdrawCount: 0,
      uniqueUsers: 0,
      samples: 0,
      bridgeConfigured: bridgeAddresses.length > 0,
      selectedBridges: bridgeAddresses,
      isStale: true,
    }), { status: 500, headers });
  }

  try {
    const payload = await getCachedPayload({
      lite,
      now: Date.now(),
      rpcUrl,
      bridgeAddresses,
      forceFail,
    });
    return new Response(JSON.stringify(payload), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      ts: Date.now(),
      source: 'worldchain:rpc',
      error: 'worldchain_bridge_activity_failed',
      message: error instanceof Error ? error.message : 'unknown error',
      chainId: null,
      windowBlocks: lite ? 8 : 8,
      activity: 0,
      matchedRoutes: 0,
      inFlow: 0,
      outFlow: 0,
      depositCount: 0,
      withdrawCount: 0,
      uniqueUsers: 0,
      samples: 0,
      bridgeConfigured: bridgeAddresses.length > 0,
      selectedBridges: bridgeAddresses,
      isStale: true,
    }), { status: 503, headers });
  }
}
