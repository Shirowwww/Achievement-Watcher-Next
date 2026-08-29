'use strict';

/*
  Where a SteamGridDB artwork answer is kept, and how to read one.

  The answer is a small JSON file, and the library scan asks for one per game. Going through the
  main process for every one of them put a hundred and sixty round trips on the thread that is also
  serving every icon of every tile, and each of those waits was paid by the scan. The file is in the
  app's own data folder, so whoever wants it reads it; only fetching a *new* answer has to go
  through the main process, where there is no origin and one shared rate limit to respect.
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function assetKey(name, platform, gameId) {
  return crypto
    .createHash('sha1')
    .update(`${String(name || '').toLowerCase()}\0${String(platform || '').toLowerCase()}\0${String(gameId || '').toLowerCase()}`)
    .digest('hex');
}

function cacheFile(userDataDir, name, platform, gameId) {
  return path.join(userDataDir || '', 'steam_cache', 'steamgriddb_assets', `${assetKey(name, platform, gameId)}.json`);
}

/*
  The cached answer, or undefined when there is none to serve and the question has to be asked
  again. A remembered "nothing found" reads back as null, exactly like a fresh one, so a caller
  never has to tell the two apart.
*/
function readCached(userDataDir, name, platform, gameId) {
  const file = cacheFile(userDataDir, name, platform, gameId);
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached && cached.notFound === true) return age < MISS_TTL_MS ? null : undefined;
    if (cached && typeof cached === 'object' && age < HIT_TTL_MS) return cached;
  } catch {
    /* absent or corrupt - ask again */
  }
  return undefined;
}

module.exports = { assetKey, cacheFile, readCached, HIT_TTL_MS, MISS_TTL_MS };
