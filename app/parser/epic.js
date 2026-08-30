'use strict';

const path = require('path');
const fs = require('fs');
const { lazyRequire } = require('../util/lazyRequire.js');
const glob = lazyRequire('fast-glob');
const request = lazyRequire('request-zero');
const epicIdentity = require('../util/epicIdentity.js');

let gameList;
let cacheRoot;
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

// A broken mapping cache must not block the library scan.
function readEpicMappingCache(cacheFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, { encoding: 'utf8' }));
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
}

function mappingByEpicId(cache) {
  const byEpicId = new Map();
  for (const entry of Array.isArray(cache) ? cache : []) {
    const epicid = String(entry?.epicid || '').trim();
    if (epicid && !byEpicId.has(epicid)) byEpicId.set(epicid, entry);
  }
  return byEpicId;
}

async function getEpicProductMapping() {
  const res = await request.get('https://store-content.ak.epicgames.com/api/content/productmapping');
  return res.body;
}

async function getEpicProductDetails(slug, locale = 'en-US') {
  const url = `https://store-content.ak.epicgames.com/api/${locale}/content/products/${slug}`;
  const res = await request.get(url);
  return res.body;
}

async function getGameTitleFromMapping(slug) {
  const product = JSON.parse(await getEpicProductDetails(slug));
  return product?.productName;
}

module.exports.isExclusive = (appid) => {
  const cacheFile = path.join(cacheRoot, 'steam_cache', 'epic.db');
  const cache = readEpicMappingCache(cacheFile);
  const key = String(appid);
  const cached = cache.find((game) => String(game?.epicid) === key || String(game?.steamid) === key);
  if (cached) return cached.steamid === undefined;
  // Unknown ids are not assumed to be Epic-only.
  return false;
};

module.exports.scan = async (dir) => {
  const cacheFile = path.join(cacheRoot, 'steam_cache', 'epic.db');
  const data = [];
  const cache = readEpicMappingCache(cacheFile);
  const cachedByEpicId = mappingByEpicId(cache);

  const directories = await glob(path.join(process.env['APPDATA'], 'NemirtingasEpicEmu', '*/*/').replace(/\\/g, '/'), {
    onlyDirectories: true,
    absolute: true,
  });
  const games = directories
    .map((gameDir) => ({
      appid: path.parse(gameDir).name,
      source: 'epic',
      data: {
        type: 'file',
        path: gameDir,
      },
    }))
    .filter((game) => game.appid.toLowerCase() !== 'invalidappid');

  // Fetch the large mapping only when an uncached game needs it.
  const hasUncachedGame = games.some((game) => !cachedByEpicId.has(String(game.appid)));
  if (hasUncachedGame && !gameList) {
    try {
      const parsed = JSON.parse(await getEpicProductMapping());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid Epic product mapping');
      gameList = parsed;
    } catch (err) {
      debug.log(`[epic] product mapping unavailable; uncached games will be retried next scan => ${err.message || err}`);
    }
  }

  let ipcRenderer = null;
  if (hasUncachedGame && gameList) {
    try {
      ({ ipcRenderer } = require('electron'));
    } catch {}
  }

  let updateCache = false;
  for (const game of games) {
    let steamid;
    const cached = cachedByEpicId.get(String(game.appid));
    if (cached) {
      steamid = cached.steamid;
    } else if (gameList) {
      try {
        const gameSlug = gameList[game.appid];
        let entry;
        if (!gameSlug) {
          entry = { epicid: game.appid };
        } else {
          const title = await getGameTitleFromMapping(gameSlug);
          // IPC keeps the hidden store lookup off the renderer's synchronous path.
          if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') throw new Error('Epic title resolver unavailable');
          steamid = await ipcRenderer.invoke('get-steam-appid-from-title', { title });
          entry = steamid ? { epicid: game.appid, steamid } : { epicid: game.appid };
        }
        cache.push(entry);
        cachedByEpicId.set(String(game.appid), entry);
        updateCache = true;
      } catch (err) {
        // A failed resolver is transient; do not turn it into a permanent Epic-only result.
        debug.log(`[epic ${game.appid}] Steam mapping unavailable; retrying => ${err.message || err}`);
      }
    }

    game.steamappid = steamid;
    data.push(game);
  }
  if (updateCache) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }
  return data;
};

function resetProductMappingCache() {
  gameList = undefined;
}

module.exports._internal = {
  readEpicMappingCache,
  mappingByEpicId,
  resetProductMappingCache,
};

module.exports.getCachedData = async () => undefined;

module.exports.getGameData = async (cfg) => {
  const { ipcRenderer } = require('electron');
  const filePath = path.join(cacheRoot, 'steam_cache', 'schema', cfg.lang, `${cfg.appID}.db`);
  let result;
  try {
    if (fs.existsSync(filePath)) {
      result = JSON.parse(fs.readFileSync(filePath));
      return result;
    }
  } catch (err) {
    debug.log(`Failed to load cache file for ${cfg.appID}. Fetching updated info`);
  }
  let list = [];
  let title;

  let identity = null;
  try {
    identity = await epicIdentity.resolveEpicArtifactIdentity(cfg.appID);
  } catch (err) {
    debug.log(`[epic ${cfg.appID}] egdata artifact identity lookup failed => ${err}`);
  }
  if (identity && identity.namespace) {
    try {
      const epicOfficial = require('./epicOfficial.js');
      const schema = await epicOfficial.getSchemaByNamespace(identity.namespace, cfg.lang);
      if (schema && Array.isArray(schema.list) && schema.list.length > 0) list = schema.list;
    } catch (err) {
      debug.log(`[epic ${cfg.appID}] namespace schema fetch failed => ${err}`);
    }
    if (identity.displayName) title = identity.displayName;
  }

  if (!title) {
    try {
      if (!gameList) gameList = JSON.parse(await getEpicProductMapping());
      const gameSlug = gameList[cfg.appID];
      if (!gameSlug) throw !gameSlug;
      title = await getGameTitleFromMapping(gameSlug);
    } catch (err) {
      // The mapping may not contain new or custom ids; fall back to the store lookup.
      title = (await ipcRenderer.invoke('get-title-from-epic-id', { appid: cfg.appID })) || 'Unknown game';
    }
  }
  if (!title) return result;

  if (list.length === 0) {
    try {
      // Ask for the user's language, not English: this path only runs when the namespace lookup
      // above found nothing, and it used to pin every fallback schema to en-us regardless of cfg.lang.
      let locale = 'en';
      try {
        locale = require('./epicOfficial.js').localeFor(cfg.lang);
      } catch {
        /* mapping unavailable - the default locale below still answers */
      }
      const achievements = await request.getJson(
        `https://api.epicgames.dev/epic/achievements/v1/public/achievements/product/${cfg.appID}/locale/${encodeURIComponent(
          locale
        )}?includeAchievements=true`
      );
      // Epic fills either the locked or the unlocked half depending on the title, so each field takes
      // the other as its fallback. Reading lockedDescription alone left descriptions blank on every
      // game that only ships the unlocked texts.
      const firstText = (...values) => {
        for (const value of values) {
          const text = value == null ? '' : String(value).trim();
          if (text) return text;
        }
        return '';
      };
      for (let achievement of achievements.achievements) {
        const a = achievement.achievement;
        list.push({
          name: a.name,
          default_value: 0,
          displayName: firstText(a.lockedDisplayName, a.unlockedDisplayName, a.name),
          hidden: a.hidden ? 1 : 0,
          description: firstText(a.lockedDescription, a.unlockedDescription),
          icon: firstText(a.unlockedIconLink, a.lockedIconLink),
          icongray: firstText(a.lockedIconLink, a.unlockedIconLink),
        });
      }
    } catch (err) {
      // Hidden or unavailable Epic data: try the Steam schema when possible.
      if (err.code !== 404) debug.log(err);
      if (!cfg.steamappid) return result;
      const achs = await ipcRenderer.invoke('get-steam-data', { appid: cfg.steamappid, type: 'steamhunters' });
      list = Array.isArray(achs?.achievements) ? achs.achievements : []; //guard: empty scrape must not throw and drop the game
    }
  }

  result = {
    name: title,
    appid: cfg.appID,
    binary: null,
    achievement: {
      total: list.length,
      list,
    },
  };
  if (!cfg.steamappid) {
    // if its exclusive then use epic images instead of steam's
    const links = (await ipcRenderer.invoke('get-images-for-game', { name: title })) || {};
    result.img = {
      header: links.landscape,
      background: links.background,
      portrait: links.portrait,
      icon: links.icon,
    };
    if (links.background) ipcRenderer.send('stylize-background-for-appid', { background: links.background, appid: cfg.appID });
  } else {
    const imgs = (await ipcRenderer.invoke('get-steam-data', { appid: cfg.steamappid, type: 'common' })) || {};
    result.img = {
      header: imgs.header || 'header',
      background: imgs.background || 'page_bg_generated_v6b.jpg',
      portrait: imgs.portrait || 'library_600x900.jpg',
      icon: imgs.icon,
    };
  }
  // Do not cache an empty result; it is usually a transient fetch failure.
  if (list.length > 0) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  }
  return result;
};
