'use strict';

// Offline appid-to-name lookup with an mtime/size cache.
// cfg/steamdb.json overrides the appList dump when present.

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userDataPath.js');

const CACHE_BASE = userDataDir();

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

// filePath -> { mtimeMs, size, index }. Only the appid -> name Map is kept: the ~250k parsed rows are
// dropped after indexing, so a lookup does not hold them on the heap for the whole session.
const nameIndexCache = new Map();

function getNameIndex(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  const cacheKey = path.resolve(filePath);
  const mtimeMs = Number(stat.mtimeMs || 0);
  const size = Number(stat.size || 0);
  const cached = nameIndexCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.index;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const index = new Map();
  for (const row of parsed) {
    const id = String(row?.appid ?? '').trim();
    const name = String(row?.name ?? '').trim();
    if (id && name && !index.has(id)) index.set(id, name);
  }
  nameIndexCache.set(cacheKey, { mtimeMs, size, index });
  return index;
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
  // The id names a file, so it is filtered the same way imageOverrideStore filters its own: a
  // separator or a drive letter reaching path.join here would read outside the schema cache.
  const id = String(appid ?? '').trim().replace(/[^\w.-]/g, '_');
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
  lookupSteamDbName,
  lookupSchemaCacheName,
};
