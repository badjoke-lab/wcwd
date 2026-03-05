const crypto = require('node:crypto');

const CATEGORY_KEYWORDS = {
  finance: ['finance', 'wallet', 'swap', 'trade', 'defi', 'token', 'dex', 'money', 'bank', 'pay'],
  games: ['game', 'play', 'quest', 'battle', 'arcade', 'puzzle', 'rpg', 'sport'],
  social: ['social', 'chat', 'community', 'friends', 'message', 'forum', 'dao'],
  utility: ['tool', 'utility', 'productivity', 'calendar', 'note', 'todo', 'converter', 'scan'],
  shopping: ['shop', 'store', 'market', 'commerce', 'coupon', 'deal', 'buy'],
  ai: ['ai', 'assistant', 'gpt', 'agent', 'model', 'generate']
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(input) {
  const value = String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return value || 'app';
}

function inferCategory(name, extra = '') {
  const haystack = `${name || ''} ${extra || ''}`.toLowerCase();
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((word) => haystack.includes(word))) return category;
  }
  return 'other';
}

function chooseName(raw) {
  return raw.name || raw.app || raw.title || raw.projectName || raw.miniApp || null;
}

function normalizeMiniApps(rawItems) {
  if (!Array.isArray(rawItems)) {
    throw new Error('normalizeMiniApps expected array input');
  }

  const usedSlugs = new Set();

  return rawItems
    .map((raw, idx) => {
      const name = chooseName(raw);
      if (!name) return null;

      const baseSlug = slugify(name);
      let slug = baseSlug;
      if (usedSlugs.has(slug)) {
        const shortHash = crypto
          .createHash('sha1')
          .update(`${name}:${idx}`)
          .digest('hex')
          .slice(0, 6);
        slug = `${baseSlug}-${shortHash}`;
      }
      usedSlugs.add(slug);

      const rank7d = toNumber(raw.rank7d ?? raw.rank_7d ?? raw.rank ?? raw.weekRank);
      const rankAll = toNumber(raw.rankAll ?? raw.rank_all ?? raw.allRank ?? raw.totalRank);
      const value7d = toNumber(raw.value7d ?? raw.value_7d ?? raw.volume7d ?? raw.weekValue ?? raw.users7d);
      const valueAll = toNumber(raw.valueAll ?? raw.value_all ?? raw.totalValue ?? raw.usersAll);

      return {
        slug,
        name: String(name).trim(),
        rank7d: rank7d ?? idx + 1,
        rankAll: rankAll ?? null,
        value7d: value7d ?? 0,
        valueAll,
        deltaRank7d: 0,
        flags: {
          hot: false,
          new: false,
          drop: false
        },
        category: inferCategory(name, raw.category || raw.tags || raw.description || ''),
        links: {
          official: raw.official || raw.url || raw.link || null
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank7d - b.rank7d);
}

module.exports = {
  normalizeMiniApps,
  slugify,
  inferCategory,
  toNumber
};
