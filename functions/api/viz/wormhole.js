import { sampleByLimit, sampleByTimeWindow } from '../../../lib/data/sampler.js';
import { WORMHOLE_ROUTE_CANDIDATES } from '../../../lib/config/wormhole-routes.js';

const API_URL = 'https://api.wormholescan.io/api/v1/transactions';
const FULL_WINDOW_SEC = 240;
const LITE_WINDOW_SEC = 90;
const FULL_FETCH_LIMIT = 120;
const LITE_FETCH_LIMIT = 40;
const FULL_SAMPLE_LIMIT = 80;
const LITE_SAMPLE_LIMIT = 24;
const FULL_ROUTE_LIMIT = 8;
const LITE_ROUTE_LIMIT = 3;
const CACHE_TTL_MS = 6000;
const CACHE_STALE_MS = 45000;
const FETCH_TIMEOUT_MS = 3200;
const WHALE_USD_THRESHOLD = 100000;

const memoryCache = {
  full: { entry: null, inflight: null },
  lite: { entry: null, inflight: null },
};

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase();
}

function extractTransactions(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const direct = payload.transactions || payload.data || payload.items || payload.results;
  if (Array.isArray(direct)) return direct;

  return [];
}

function readTxValue(tx, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const value = tx[keys[i]];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function txTimestampMs(tx) {
  const raw = readTxValue(tx, ['timestamp', 'blockTimestamp', 'indexedAt', 'createdAt']);
  if (raw === null) return 0;
  if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) return asNum > 1e12 ? asNum : asNum * 1000;
  const asDate = Date.parse(String(raw));
  return Number.isFinite(asDate) ? asDate : 0;
}

function buildAliases(values) {
  return new Set(values.map((value) => normalizeValue(value)));
}

function routeMatches(route, tx) {
  const fromRaw = readTxValue(tx, ['emitterChain', 'sourceChain', 'fromChain', 'chainFrom', 'originChain']);
  const toRaw = readTxValue(tx, ['targetChain', 'destinationChain', 'toChain', 'chainTo']);
  const from = normalizeValue(fromRaw);
  const to = normalizeValue(toRaw);
  if (!from || !to) return false;

  const fromAliases = buildAliases(route.identifiers.chainFromIds || []);
  const toAliases = buildAliases(route.identifiers.chainToIds || []);
  return fromAliases.has(from) && toAliases.has(to);
}

function flowScore(tx) {
  const usd = parseNumber(readTxValue(tx, ['notionalUSD', 'amountUSD', 'usdAmount', 'valueUsd']));
  if (usd <= 0) return 0.08;
  return Math.max(0.05, Math.min(1, Math.log10(usd + 10) / 6));
}

function isWhale(tx) {
  const usd = parseNumber(readTxValue(tx, ['notionalUSD', 'amountUSD', 'usdAmount', 'valueUsd']));
  return usd >= WHALE_USD_THRESHOLD ? 1 : 0;
}

async function fetchRecentTransactions(limit) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort('timeout'), FETCH_TIMEOUT_MS);

  try {
    const endpoint = `${API_URL}?pageSize=${limit}&sortOrder=DESC`;
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!response.ok) {
      throw new Error(`upstream status ${response.status}`);
    }
    const json = await response.json();
    return extractTransactions(json);
  } finally {
    clearTimeout(timeout);
  }
}

async function buildLivePayload({ lite, now, forceFail }) {
  const windowSec = lite ? LITE_WINDOW_SEC : FULL_WINDOW_SEC;
  const routeLimit = lite ? LITE_ROUTE_LIMIT : FULL_ROUTE_LIMIT;
  const fetchLimit = lite ? LITE_FETCH_LIMIT : FULL_FETCH_LIMIT;
  const sampleLimit = lite ? LITE_SAMPLE_LIMIT : FULL_SAMPLE_LIMIT;
  const routeCandidates = WORMHOLE_ROUTE_CANDIDATES.slice(0, routeLimit);

  if (forceFail) {
    throw new Error('forced failure');
  }

  const transactions = await fetchRecentTransactions(fetchLimit);
  const inWindow = sampleByTimeWindow(
    transactions
      .map((tx) => ({ ...tx, ts: txTimestampMs(tx) }))
      .filter((tx) => tx.ts > 0),
    windowSec * 1000,
    now
  );

  const sampled = sampleByLimit(inWindow, sampleLimit);
  const routeStats = routeCandidates.map((route) => ({ ...route, in: 0, out: 0, whalesIn: 0, whalesOut: 0, samples: 0 }));

  let inFlow = 0;
  let outFlow = 0;
  let whalesIn = 0;
  let whalesOut = 0;

  sampled.forEach((tx) => {
    for (let i = 0; i < routeStats.length; i += 1) {
      const route = routeStats[i];
      if (!routeMatches(route, tx)) continue;

      const score = flowScore(tx);
      const whale = isWhale(tx);
      route.out += score;
      route.whalesOut += whale;
      route.samples += 1;

      outFlow += score;
      whalesOut += whale;
      return;
    }
  });

  const reverseSampled = sampled;
  reverseSampled.forEach((tx) => {
    for (let i = 0; i < routeStats.length; i += 1) {
      const route = routeStats[i];
      const reversedRoute = {
        identifiers: {
          chainFromIds: route.identifiers.chainToIds,
          chainToIds: route.identifiers.chainFromIds,
        },
      };
      if (!routeMatches(reversedRoute, tx)) continue;

      const score = flowScore(tx);
      const whale = isWhale(tx);
      route.in += score;
      route.whalesIn += whale;

      inFlow += score;
      whalesIn += whale;
      return;
    }
  });

  const scale = Math.max(1, sampled.length);
  const payload = {
    ts: now,
    windowSec,
    inFlow: Number(Math.min(1, inFlow / scale).toFixed(3)),
    outFlow: Number(Math.min(1, outFlow / scale).toFixed(3)),
    whalesIn,
    whalesOut,
    samples: sampled.length,
    source: 'wormholescan:transactions',
  };

  if (!lite) {
    payload.routes = routeStats.map((route) => ({
      name: route.name,
      type: route.type,
      chainFrom: route.chainFrom,
      chainTo: route.chainTo,
      in: Number(route.in.toFixed(3)),
      out: Number(route.out.toFixed(3)),
      whalesIn: route.whalesIn,
      whalesOut: route.whalesOut,
      samples: route.samples,
    }));
  }

  return payload;
}

async function getCachedPayload({ lite, now, forceFail }) {
  const bucket = lite ? memoryCache.lite : memoryCache.full;
  if (bucket.entry && now < bucket.entry.freshUntil) {
    return { ...bucket.entry.payload, isStale: false };
  }

  if (!bucket.inflight) {
    bucket.inflight = buildLivePayload({ lite, now, forceFail })
      .then((payload) => {
        bucket.entry = {
          payload,
          freshUntil: Date.now() + CACHE_TTL_MS,
          staleUntil: Date.now() + CACHE_STALE_MS,
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
  } catch (error) {
    if (bucket.entry && now < bucket.entry.staleUntil) {
      return {
        ...bucket.entry.payload,
        isStale: true,
        staleReason: error instanceof Error ? error.message : 'upstream-error',
      };
    }
    throw error;
  }
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const lite = url.searchParams.get('lite') === '1';
  const forceFail = url.searchParams.get('forceFail') === '1';

  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'public, max-age=0, s-maxage=6, stale-while-revalidate=45');

  try {
    const payload = await getCachedPayload({ lite, now: Date.now(), forceFail });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ts: Date.now(),
        error: 'wormhole_source_unavailable',
        message: error instanceof Error ? error.message : 'unknown error',
        source: 'wormholescan:transactions',
      }),
      {
        status: 503,
        headers,
      }
    );
  }
}
