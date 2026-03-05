const fs = require('node:fs/promises');
const path = require('node:path');

const { fetchMiniAppsStats, MINIAPPS_SOURCE } = require('./fetch_miniapps_stats');
const { normalizeMiniApps } = require('../lib/normalize');
const { applyDiff } = require('../lib/diff');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
const LATEST_PATH = path.join(DATA_DIR, 'latest.json');
const META_PATH = path.join(DATA_DIR, 'meta.json');
const PIPELINE_VERSION = '1.0.0';

async function readJsonOrNull(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicWriteJson(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function buildDaily() {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  const previousLatest = await readJsonOrNull(LATEST_PATH);
  const previousApps = previousLatest?.apps || [];

  const rawItems = await fetchMiniAppsStats();
  const normalized = normalizeMiniApps(rawItems);
  const apps = applyDiff(normalized, previousApps);

  const updatedAt = new Date().toISOString();
  const datePart = updatedAt.slice(0, 10);
  const snapshotPath = path.join(SNAPSHOT_DIR, `${datePart}.json`);

  const snapshotFiles = await fs.readdir(SNAPSHOT_DIR).catch(() => []);

  const latest = {
    ok: true,
    updatedAt,
    source: MINIAPPS_SOURCE,
    counts: {
      apps: apps.length,
      snapshots: new Set([...snapshotFiles, `${datePart}.json`]).size
    },
    apps
  };

  const snapshot = {
    updatedAt,
    source: MINIAPPS_SOURCE,
    apps
  };

  const meta = {
    ok: true,
    updatedAt,
    source: MINIAPPS_SOURCE,
    version: PIPELINE_VERSION,
    counts: {
      apps: apps.length,
      snapshots: latest.counts.snapshots
    }
  };

  await atomicWriteJson(snapshotPath, snapshot);
  await atomicWriteJson(LATEST_PATH, latest);
  await atomicWriteJson(META_PATH, meta);

  return {
    latestPath: LATEST_PATH,
    snapshotPath,
    metaPath: META_PATH,
    apps: apps.length
  };
}

if (require.main === module) {
  buildDaily()
    .then((result) => {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  buildDaily
};
