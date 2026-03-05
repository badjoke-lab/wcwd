const fs = require('node:fs/promises');

const MINIAPPS_SOURCE = {
  name: 'miniapps.world',
  url: 'https://www.miniapps.world/',
  note: 'daily-updated stats'
};

function extractArrayCandidatesFromJsonObject(input, results) {
  if (!input || typeof input !== 'object') return;
  if (Array.isArray(input)) {
    const hasNamedObjects = input.some((item) => item && typeof item === 'object' && (item.name || item.app || item.title));
    if (hasNamedObjects) results.push(input);
    for (const item of input) extractArrayCandidatesFromJsonObject(item, results);
    return;
  }
  for (const value of Object.values(input)) {
    extractArrayCandidatesFromJsonObject(value, results);
  }
}

function parseTableRows(html) {
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html))) {
    const rawCells = [...trMatch[1].matchAll(/<(t[dh])[^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    const cellMatches = rawCells.map((m) => m[2]);
    if (cellMatches.length < 2) continue;
    if (rawCells.some((m) => String(m[1]).toLowerCase() === 'th')) continue;
    const cells = cellMatches.map((cell) =>
      cell
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
    if (!cells[1]) continue;

    const rank7d = Number(cells[0].replace(/[^\d.-]/g, ''));
    rows.push({
      rank7d: Number.isFinite(rank7d) && rank7d > 0 ? rank7d : rows.length + 1,
      name: cells[1],
      value7d: Number((cells[2] || '').replace(/[^\d.-]/g, '')) || 0,
      rankAll: Number((cells[3] || '').replace(/[^\d.-]/g, '')) || null,
      valueAll: Number((cells[4] || '').replace(/[^\d.-]/g, '')) || null,
      official: null
    });
  }
  return rows;
}

function parseCandidatesFromHtml(html) {
  const candidates = [];
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html))) {
    const body = (match[1] || '').trim();
    if (!body) continue;

    const jsonBlocks = body.match(/\{[\s\S]*\}|\[[\s\S]*\]/g) || [];
    for (const block of jsonBlocks) {
      try {
        const parsed = JSON.parse(block);
        extractArrayCandidatesFromJsonObject(parsed, candidates);
      } catch {
        // best-effort parser only
      }
    }
  }

  const tableRows = parseTableRows(html);
  if (tableRows.length) candidates.push(tableRows);

  return candidates;
}

function pickBestCandidate(candidates) {
  if (!candidates.length) return [];
  return candidates.sort((a, b) => b.length - a.length)[0];
}

async function loadSourceHtml() {
  if (process.env.MINIAPPS_SAMPLE_FILE) {
    return fs.readFile(process.env.MINIAPPS_SAMPLE_FILE, 'utf8');
  }

  const response = await fetch(MINIAPPS_SOURCE.url, {
    headers: {
      'user-agent': 'wcwd-miniapps-pipeline/1.0 (+https://github.com/)'
    }
  });
  if (!response.ok) {
    throw new Error(`Source fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchMiniAppsStats() {
  const html = await loadSourceHtml();
  const candidates = parseCandidatesFromHtml(html);
  const items = pickBestCandidate(candidates);

  if (!items.length) {
    throw new Error('No candidate mini app rows found in source HTML');
  }

  return items;
}

if (require.main === module) {
  fetchMiniAppsStats()
    .then((items) => {
      console.log(JSON.stringify({ ok: true, count: items.length }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  MINIAPPS_SOURCE,
  fetchMiniAppsStats
};
