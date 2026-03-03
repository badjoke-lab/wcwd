import { sampleByLimit, sampleByTimeWindow } from '../../../lib/data/sampler.js';

function buildEvents(total, now) {
  const events = [];
  for (let i = 0; i < total; i += 1) {
    const ageMs = Math.random() * 120000;
    const flow = Math.random();
    const direction = Math.random() > 0.5 ? 'in' : 'out';
    const whale = flow > 0.8 ? 1 : 0;

    events.push({
      ts: now - Math.floor(ageMs),
      direction,
      flow,
      whale,
    });
  }
  return events;
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const lite = url.searchParams.get('lite') === '1';

  const now = Date.now();
  const totalEvents = lite ? 80 : 220;
  const sampledLimit = lite ? 24 : 72;
  const events = buildEvents(totalEvents, now);
  const inWindow = sampleByTimeWindow(events, 45000, now);
  const sampled = sampleByLimit(inWindow, sampledLimit);

  let inTotal = 0;
  let outTotal = 0;
  let whalesIn = 0;
  let whalesOut = 0;

  sampled.forEach((event) => {
    if (event.direction === 'in') {
      inTotal += event.flow;
      whalesIn += event.whale;
    } else {
      outTotal += event.flow;
      whalesOut += event.whale;
    }
  });

  const sampleCount = sampled.length || 1;
  const payload = {
    ts: now,
    inFlow: Number((inTotal / sampleCount).toFixed(3)),
    outFlow: Number((outTotal / sampleCount).toFixed(3)),
    whalesIn,
    whalesOut,
    samples: sampled.length,
  };

  if (!lite) {
    payload.events = sampled;
  }

  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'public, max-age=0, s-maxage=2, stale-while-revalidate=8');

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers,
  });
}
