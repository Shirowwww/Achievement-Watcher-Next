'use strict';

const path = require('path');
const fs = require('fs');
const { lazyRequire } = require('../util/lazyRequire.js');
const { hostPaths } = require('../util/winHosts.js');
const { writeFileAtomicSync } = require('../util/replaceFile.js');
const glob = lazyRequire('fast-glob');
const request = lazyRequire('request-zero');

let cacheRoot;
// A no-op until initDebug runs, so a caller that only set the data path still gets a working scan.
let debug = { log() {}, warn() {}, error() {} };
module.exports.initDebug = ({ isDev, userDataPath }) => {
  module.exports.setUserDataPath(userDataPath);
  debug = new (require('../util/logger'))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

module.exports.setUserDataPath = (p) => {
  cacheRoot = p;
};

// The GOG id -> Steam appid map, written by the scan and by the Watchdog's GOG unlock path.
const mappingFile = () => path.join(cacheRoot, 'steam_cache', 'gog.db');

// A broken optional cache must not block the GOG scan.
function readGogMappingCache(cacheFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, { encoding: 'utf8' }));
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
}

function mappingByGogId(cache) {
  const byGogId = new Map();
  for (const entry of Array.isArray(cache) ? cache : []) {
    const gogid = String(entry?.gogid || '').trim();
    if (gogid && !byGogId.has(gogid)) byGogId.set(gogid, entry);
  }
  return byGogId;
}

// The Steam release gamesdb.gog.com lists for a GOG id; undefined for a GOG-only title.
async function fetchSteamIdForGogId(gogId) {
  const gameinfo = await request.getJson(`https://gamesdb.gog.com/platforms/gog/external_releases/${gogId}`);
  const releases = Array.isArray(gameinfo?.game?.releases) ? gameinfo.game.releases : [];
  const steamRelease = releases.find((release) => String(release?.platform_id || '').toLowerCase() === 'steam');
  return steamRelease?.external_id;
}

/*
  One GOG id from the map, asking gamesdb only when the map lacks it and remembering the answer:
  without that every GOG unlock hit the network, and an offline moment cost the notification.
  A failed write only costs the same lookup next time, so it is logged, not thrown.
*/
module.exports.steamIdForGogId = async (gogId) => {
  const cache = readGogMappingCache(mappingFile());
  const cached = mappingByGogId(cache).get(String(gogId));
  if (cached) return cached.steamid;
  const steamid = await fetchSteamIdForGogId(gogId);
  if (!steamid) return undefined;
  try {
    writeFileAtomicSync(mappingFile(), JSON.stringify([...cache, { gogid: String(gogId), steamid }], null, 2));
  } catch (err) {
    debug.log(`[gog] could not write gog.db: ${err.message || err}`);
  }
  return steamid;
};

module.exports.getCachedData = async (cfg) => {
  const cache = readGogMappingCache(mappingFile());
  const cached = mappingByGogId(cache).get(String(cfg.appID));
  if (!cached) return;

  const schemaCache = path.join(cacheRoot, 'steam_cache/schema', cfg.lang);
  let result;
  try {
    const filePath = path.join(schemaCache, `${cached.steamid}.db`);

    if (fs.existsSync(filePath)) {
      result = JSON.parse(fs.readFileSync(filePath));
    }
  } catch (err) {
    if (err.code) throw `Could not load GOG data: ${err.code} - ${err.message}`;
    else throw `Could not load GOG data: ${err}`;
  }
  return result;
};

async function globDirs(roots, suffix) {
  const patterns = roots.map((root) => `${glob.convertPathToPattern(root)}/${suffix}`);
  return patterns.length > 0 ? glob(patterns, { onlyDirectories: true, absolute: true }) : [];
}

/*
  Saves keyed by GOG product id, under the save root of every host (see util/winHosts.js):
  NemirtingasGalaxyEmu\<user>\<id>\ and UniverseLAN\<id>\UniverseLANData\. A UniverseLAN install AW
  repaired itself is listed by gogUniverseLan.js, so its id is passed in `skipUniverseLanIds`.
*/
async function gogIdSaves(skipUniverseLanIds) {
  const nemirtingas = (await globDirs(hostPaths('APPDATA', 'NemirtingasGalaxyEmu'), '*/*/')).map((dir) => ({ gogId: path.basename(dir), source: 'gog', path: dir }));
  const universeLan = (await globDirs(hostPaths('LOCALAPPDATA', 'UniverseLAN'), '*/UniverseLANData/'))
    .map((dir) => ({ gogId: path.basename(path.dirname(dir)), source: 'UniverseLAN', path: dir }))
    .filter((save) => /^\d+$/.test(save.gogId) && !skipUniverseLanIds.includes(save.gogId));
  return [...nemirtingas, ...universeLan];
}

module.exports.scan = async ({ skipUniverseLanIds = [] } = {}) => {
  const cacheFile = mappingFile();
  const data = [];
  const cache = readGogMappingCache(cacheFile);
  let updateCache = false;
  const cachedByGogId = mappingByGogId(cache);

  for (const save of await gogIdSaves(skipUniverseLanIds.map(String))) {
    let game = {
      appid: save.gogId,
      source: save.source,
      data: {
        type: 'file',
        path: save.path,
      },
    };
    let steamid;
    const cached = cachedByGogId.get(String(game.appid));
    if (cached) {
      steamid = cached.steamid;
    } else {
      try {
        steamid = await fetchSteamIdForGogId(game.appid);
        if (steamid) {
          const entry = { gogid: game.appid, steamid };
          cache.push(entry);
          cachedByGogId.set(String(game.appid), entry);
          updateCache = true;
        }
      } catch (err) {
        // Without the Steam id this game is dropped from the scan entirely, so the reason has to
        // reach parser.log - a silent drop reads to the user as "the game disappeared".
        debug.log(`[gog] could not map GOG id ${game.appid} to a Steam appid: ${err.message || err}`);
      }
    }
    if (steamid) {
      game.appid = steamid;
      data.push(game);
    } else {
      debug.log(`[gog] no Steam release known for GOG id ${game.appid}; the game is not listed`);
    }
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  // Atomic: the Watchdog reads this map while a game runs, and half a file would cost every mapping.
  if (updateCache) writeFileAtomicSync(cacheFile, JSON.stringify(cache, null, 2));
  return data;
};
