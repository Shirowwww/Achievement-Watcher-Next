'use strict';

const path = require('path');
const fs = require('./util/fsAsync');

let cacheDir = path.join(require('./util/userData.js').userDataDir(), 'steam_cache', 'data');

// Keep an in-memory baseline when disk persistence fails.
const memoryCache = new Map();

// Serialize writes per appid.
const writeQueues = new Map();

function cacheKey(appID) {
  return String(appID);
}

function cacheFilePath(appID) {
  return path.join(cacheDir, `${cacheKey(appID)}.db`);
}

// Test hook for an isolated cache.
module.exports.setCacheDir = (dir) => {
  cacheDir = dir;
  memoryCache.clear();
  writeQueues.clear();
};

// The app deletes the .db on reset, but this process's memoryCache keeps the old baseline until
// forget() clears it too - otherwise the re-earned achievement diffs as "already unlocked" until
// the monitor restarts.
module.exports.forget = async (appID) => {
  const key = cacheKey(appID);
  memoryCache.delete(key);
  // Let an in-flight save finish first, or it would write the baseline straight back.
  const pending = writeQueues.get(key);
  if (pending) await pending.catch(() => {});
  await fs.unlink(cacheFilePath(key)).catch(() => {});
};

module.exports.load = async (appID) => {
  const key = cacheKey(appID);
  if (memoryCache.has(key)) return snapshotOf(memoryCache.get(key));

  try {
    const parsed = JSON.parse(await fs.readFile(cacheFilePath(key), 'utf8'));
    const normalized = Array.isArray(parsed) ? parsed : [];
    memoryCache.set(key, normalized);
    return snapshotOf(normalized);
  } catch {
    return [];
  }
};

module.exports.save = async (appID, achievements) => {
  if (!Array.isArray(achievements)) {
    throw new TypeError('track.save requires an achievements array');
  }
  // Snapshot before storing so callers cannot mutate the baseline.
  const key = cacheKey(appID);
  const normalized = snapshotOf(achievements);
  memoryCache.set(key, normalized);

  const filePath = cacheFilePath(key);
  const previous = writeQueues.get(key) || Promise.resolve();
  const pending = previous.then(() => persist(filePath, normalized));
  // Keep later saves serializable after a failure.
  const tracked = pending.catch(() => {});
  writeQueues.set(key, tracked);
  tracked.finally(() => {
    if (writeQueues.get(key) === tracked) writeQueues.delete(key);
  });
  await pending;
};

function snapshotOf(entries) {
  return entries.map((entry) => ({ ...entry }));
}

// Temp sibling + rename, so a crash can never leave a half-written baseline behind.
async function persist(filePath, achievements) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const data = JSON.stringify(achievements);
  const tmpPath = `${filePath}.tmp`;

  try {
    await fs.writeFile(tmpPath, data, 'utf8');
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }

  // Retry Windows rename races, then fall back to an in-place write.
  try {
    await renameWithRetry(tmpPath, filePath);
  } catch {
    try {
      await fs.writeFile(filePath, data, 'utf8');
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }
}

async function renameWithRetry(tmpPath, filePath, attempts = 3, delayMs = 25) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fs.rename(tmpPath, filePath);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
