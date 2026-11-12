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

/*
  A lookup that found nothing is remembered too. Without it, every game SteamGridDB has no artwork
  for was searched again on every single scan - five requests each, on a key shared by every install
  - which is both why those scans dragged and why the answer was sometimes a rate-limited nothing
  for a game that does have artwork. Kept far shorter than a hit: artwork gets added over time.
*/
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
    // A console game's artwork picked before the console's launch year counted is asked once more.
    if (consoleLaunchYear(platform) && !(cached && cached.byLaunchYear)) return undefined;
    if (cached && typeof cached === 'object' && age < HIT_TTL_MS) return cached;
  } catch {
    /* absent or corrupt - ask again */
  }
  return undefined;
}

/*
  The year a console came out, for a name two games share: God of War is a 2005 game and a 2018 one,
  and a PS4 list can only be the second (#160). Platforms as the PlayStation lists name them.
*/
const CONSOLE_LAUNCH_YEAR = { PS3: 2006, 'PS VITA': 2011, PSVITA: 2011, PS4: 2013, PS5: 2020 };

function consoleLaunchYear(platform) {
  return CONSOLE_LAUNCH_YEAR[String(platform || '').trim().toUpperCase()] || 0;
}

// The platform a scanned game's artwork is asked under. A console list names its console on the game
// itself (the record only says "psnLibrary"), and only a console may change an existing cache key.
function artPlatform(record, game) {
  const data = (record && record.data) || {};
  if (data.platform) return data.platform;
  if (game && consoleLaunchYear(game.platform)) return game.platform;
  return (game && game.system) || data.type;
}

module.exports = { assetKey, cacheFile, readCached, consoleLaunchYear, artPlatform, HIT_TTL_MS, MISS_TTL_MS };
