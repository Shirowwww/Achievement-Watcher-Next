'use strict';

// Offline appid-to-name lookup with an mtime/size cache.
// cfg/steamdb.json overrides the appList dump when present.

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userDataPath.js');

const CACHE_BASE = userDataDir();

// filePath -> { mtimeMs, size, value, index }
const jsonArrayCache = new Map();

// Read a JSON array file through the mtime+size revalidated cache. Returns [] for a missing,
// unreadable or non-array file. The returned array must be treated as immutable by callers.
function loadJsonArrayCached(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const stat = fs.statSync(filePath);
    const cacheKey = path.resolve(filePath);
    const cached = jsonArrayCache.get(cacheKey);
    if (cached && cached.mtimeMs === Number(stat.mtimeMs || 0) && cached.size === Number(stat.size || 0)) {
      return cached.value;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const value = Array.isArray(parsed) ? parsed : [];
    jsonArrayCache.set(cacheKey, {
      mtimeMs: Number(stat.mtimeMs || 0),
      size: Number(stat.size || 0),
      value,
      index: null, // built lazily on first lookup, invalidated with the entry
    });
    return value;
  } catch {
    return [];
  }
}

function resolveSteamDbRuntimePath(opts = {}) {
  const explicit = String(opts.runtimePath || '').trim();
  if (explicit) return path.resolve(explicit);
  return path.join(CACHE_BASE, 'cfg', 'steamdb.json');
}

function resolveAppListFallbackPath(opts = {}) {
  const explicit = String(opts.fallbackPath || '').trim();
  if (explicit) return path.resolve(explicit);
  return path.join(CACHE_BASE, 'steam_cache', 'schema', 'appList.json');
}

function pickSourcePath(opts) {
  const runtime = resolveSteamDbRuntimePath(opts);
  if (fs.existsSync(runtime)) return runtime;
  const fallback = resolveAppListFallbackPath(opts);
  if (fs.existsSync(fallback)) return fallback;
  return '';
}

// appid -> name Map derived from a loaded dump; cached on the same entry as the rows so it lives
// and dies with the mtime+size revalidation (upstream scans linearly; our appList has ~250k rows).
function getNameIndex(filePath) {
  const rows = loadJsonArrayCached(filePath);
  if (rows.length === 0) return null;
  const entry = jsonArrayCache.get(path.resolve(filePath));
  if (!entry) return null;
  if (!entry.index) {
    entry.index = new Map();
    for (const row of rows) {
      const id = String(row?.appid ?? '').trim();
      const name = String(row?.name ?? '').trim();
      if (id && name && !entry.index.has(id)) entry.index.set(id, name);
    }
  }
  return entry.index;
}

// Instant, offline appid → name lookup. Returns the name or null (never throws).
// opts: { runtimePath?, fallbackPath? } - explicit paths, mainly for tests.
function lookupSteamDbName(appid, opts = {}) {
  const id = String(appid ?? '').trim();
  if (!id) return null;
  const source = pickSourcePath(opts);
  if (!source) return null;
  const index = getNameIndex(source);
  return (index && index.get(id)) || null;
}

/*
  Name from the per-game Steam schema cache (steam_cache/schema/<lang>/<appid>.db). Every language
  folder is tried, since the app only writes the one matching the user's setting - hard-coding
  "english" silently returned nothing for non-English profiles, letting a GOG game and its cracked
  Steam twin stay unmerged. Exists as soon as a game has been listed once, unlike the 250k-row dump.
*/
function lookupSchemaCacheName(userDataPath, appid) {
  const id = String(appid ?? '').trim();
  if (!id) return '';
  const schemaRoot = path.join(userDataPath || CACHE_BASE, 'steam_cache', 'schema');
  let langs;
  try {
    langs = fs.readdirSync(schemaRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return '';
  }
  for (const lang of langs) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(schemaRoot, lang, `${id}.db`), 'utf8'));
      const name = String((parsed && parsed.name) || '').trim();
      if (name) return name;
    } catch {
      /* missing/corrupt entry for this language - try the next one */
    }
  }
  return '';
}

module.exports = {
  loadJsonArrayCached,
  lookupSteamDbName,
  lookupSchemaCacheName,
};
