'use strict';

const fs = require('fs');
const path = require('path');
const epicIdentity = require('./epicIdentity.js');

/*
  Names an Epic game only known by id, cached on disk so a scan never asks twice. A miss is asked
  again after a few days; a network failure is not remembered at all.
*/
const MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function readCache(cacheFile) {
  try {
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeCache(cacheFile, cache) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const partial = `${cacheFile}.tmp`;
  fs.writeFileSync(partial, JSON.stringify(cache, null, 2));
  fs.renameSync(partial, cacheFile);
}

async function lookup(id, identity) {
  const artifact = await identity.resolveEpicArtifactIdentity(id);
  if (artifact && artifact.displayName) return artifact.displayName;
  return identity.resolveEpicNamespaceName((artifact && artifact.namespace) || id);
}

async function resolveEpicTitle(id, { cacheFile, now = Date.now, identity = epicIdentity } = {}) {
  const key = String(id || '').trim();
  if (!key) return '';
  const cache = readCache(cacheFile);
  const entry = cache[key.toLowerCase()];
  if (entry && entry.title) return entry.title;
  if (entry && now() - Number(entry.missedAt || 0) < MISS_TTL_MS) return '';

  const title = await lookup(key, identity);
  cache[key.toLowerCase()] = title ? { title } : { missedAt: now() };
  try {
    writeCache(cacheFile, cache);
  } catch {
    // An unwritable cache only costs the same lookup on the next scan.
  }
  return title;
}

module.exports = { resolveEpicTitle, MISS_TTL_MS };
