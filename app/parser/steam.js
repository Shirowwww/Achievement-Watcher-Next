'use strict';

const path = require('path');
const { lazyRequire } = require('../util/lazyRequire.js');
const glob = lazyRequire('fast-glob');
const normalize = require('normalize-path');
const ini = require('../util/ini');
const omit = require('lodash.omit');
const moment = require('moment');
const request = lazyRequire('request-zero');
const { regKeyExists, readRegistryInteger, readRegistryString, listRegistryAllSubkeys } = require('../util/reg');
const appPath = path.join(__dirname, '../');
const steamID = require(path.join(appPath, 'util/steamID.js'));
const fuzzyAppid = require(path.join(appPath, 'util/fuzzyAppid.js'));
const { ipcInvoke, ipcAvailable } = require(path.join(appPath, 'util/ipcInvoke.js'));
const steamLanguages = require(path.join(appPath, 'locale/steam.json'));
const sse = require(path.join(appPath, 'parser/sse.js'));
const ff7 = require(path.join(appPath, 'parser/ff7.js'));
const fs = require('fs');
const saveRoots = require(path.join(appPath, 'parser/saveRoots.js'));
const uplayR2 = require(path.join(appPath, 'parser/uplayR2.js'));
const uplayCatalogue = require(path.join(appPath, 'parser/uplayCatalogue.js'));
const emuIni = require(path.join(appPath, 'util/emuIni.js'));
const steamAssets = require(path.join(appPath, 'util/steamAssets.js'));
const { userDataDir } = require(path.join(appPath, 'util/userDataPath.js'));
const { mergeTranslatedAchievements } = require('./achievementTranslations.js');
const steamSchemaFetch = require(path.join(appPath, 'util/steamSchemaFetch.js'));

let listReady = true;
// Set when the app-list download fails, so it is attempted once per session and not once per appid.
let appListRefreshFailed = false;
let steamUsersList;
let appidListMap = new Map();
/*
  Silent until initDebug() installs the real logger. The main process reaches getSteamUsersList()
  and fetchIcon() through electron/ipc.js without ever initializing the parser, and an undefined
  logger turned the first debug.log() into a TypeError that getSteamUsersList() swallowed as an
  empty Steam account list.
*/
let debug = { log: () => {}, info: () => {}, warn: () => {}, error: () => {} };
let cacheRoot;
const iconFetchInFlight = new Map();
const workingLinkCache = new Map();
const appSearchCache = new Map();
const TENOKE_SCHEMA_FILE = 'tenoke.ini';
// GetAppList is a bulk convenience lookup, not a reason to hold every game in the scan for the
// generic 30-second game timeout. If it is unavailable, each appid still has independent name and
// schema fallbacks below; fail this optional list quickly and only once per session.
const STEAM_APP_LIST_TIMEOUT_MS = 8000;
module.exports.setUserDataPath = (p) => {
  cacheRoot = p;
};

module.exports.initDebug = ({ isDev, userDataPath }) => {
  this.setUserDataPath(userDataPath);
  debug = new (require('../util/logger'))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

module.exports.scan = async (additionalSearch = []) => {
  let search = saveRoots.defaultSteamScanRoots(additionalSearch);

  search = search.map((dir) => {
    return normalize(dir) + '/([0-9]+)';
  });

  let data = [];
  for (let dir of await glob(search, { onlyDirectories: true, absolute: true })) {
    let game = {
      appid: path.parse(dir).name,
      data: {
        type: 'file',
        path: dir,
      },
    };

    const dirKey = String(dir).replace(/\\/g, '/');
    const dirKeyLower = dirKey.toLowerCase();
    if (dirKeyLower.includes('codex')) {
      game.source = 'Codex';
    } else if (dirKeyLower.includes('rune')) {
      game.source = 'Rune';
    } else if (dirKeyLower.includes('onlinefix')) {
      game.source = 'OnlineFix';
    } else if (dirKeyLower.includes('goldberg uplayemu') || dirKeyLower.includes('r1 uplayemu')) {
      // "Goldberg UplayEmu Saves" (R2) and "R1 UplayEmu Saves" folders are named with the Ubisoft
      // product id, not a Steam AppID; translate it and skip ids with no Steam counterpart.
      const productId = String(game.appid);
      const mapping = uplayR2.resolveSteamMapping({ appid: `UPLAY${productId}` });
      if (!mapping) {
        // Nothing known about this product yet. Record the id so the automatic resolver can try it
        // after the scan; discovery itself stays synchronous and drops the folder as before.
        uplayR2.noteUnresolvedProduct(productId);
        // scan() can run before initDebug() (the watchdog seeds its index straight from it).
        if (debug) debug.log(`[uplay-r2] ignoring save folder '${dir}' - no Steam equivalent for Ubisoft product id ${productId}`);
        continue;
      }
      game.data.type = 'uplayR2';
      game.data.uplayId = productId;
      game.data.uplayR2 = true;
      game.data.system = 'uplay';
      // A known product can deliberately have NO Steam release (Rayman 3, Prince of Persia, ...): an
      // empty AppID is not the same as an unknown product, so it's kept under its own Ubisoft identity.
      const steamAppid = /^[0-9]+$/.test(String(mapping.steam_appid || '')) ? String(mapping.steam_appid) : '';
      game.source = 'Goldberg Uplay';
      if (steamAppid) {
        game.appid = steamAppid;
        game.name = mapping.steam_name;
      } else {
        game.appid = `uplay-${productId}`;
        game.name = mapping.uplay_name || uplayCatalogue.nameFor(productId) || '';
        if (debug) debug.log(`[uplay-r2] '${dir}': Ubisoft product ${productId} has no Steam release - kept as ${game.appid}`);
      }
    } else if (dirKeyLower.includes('goldberg') || dirKeyLower.includes('gse')) {
      game.source = 'Goldberg';
      // The automatic emulator fix pre-creates both GBE Fork and classic Goldberg save roots per
      // appid; when the same appid turns up under both, a later empty duplicate must not shadow real progress.
      const dupIndex = data.findIndex((g) => g.source === 'Goldberg' && String(g.appid) === String(game.appid));
      if (dupIndex !== -1) {
        const hasNew = fs.existsSync(path.join(dir, 'achievements.json'));
        const hasExisting = fs.existsSync(path.join(data[dupIndex].data.path, 'achievements.json'));
        if (hasNew && !hasExisting) data[dupIndex] = game;
        continue;
      }
    } else if (dirKeyLower.includes('empress')) {
      game.source = 'Goldberg (EMPRESS)';
      // Two shapes exist: <root>\<appid>\remote\<appid> (Public Documents) and
      // %APPDATA%\EMPRESS\remote\<appid>, where the matched folder already is the save folder.
      if (!/\/remote\/[0-9]+$/.test(dirKeyLower)) game.data.path = path.join(game.data.path, 'remote', game.appid);
    } else if (dirKeyLower.includes('.1911')) {
      game.source = 'Razor1911';
    } else if (dirKeyLower.includes('skidrow')) {
      game.source = 'Skidrow';
    } else if (dirKeyLower.includes('smartsteamemu')) {
      game.source = 'SmartSteamEmu';
    } else if (dirKeyLower.includes('programdata/steam')) {
      game.source = 'Reloaded - 3DM';
    } else if (dirKeyLower.includes('creamapi')) {
      game.source = 'CreamAPI';
    } else if (dirKeyLower.includes('steam')) {
      game.source = 'Steam';
    } else {
      // A custom watched folder that doesn't match any known emulator/scene layout by name still
      // holds a real numeric-AppID save folder - leaving source unset let the game object
      // downstream carry an undefined source instead of a readable label.
      game.source = 'Steam-emulator';
    }

    data.push(game);
  }
  return data;
};

// Widen the legit-Steam list from "played" to "owned or installed", without letting the noise in.
// `userID` is carried over from stats entries since the achievement reader is keyed by it.
async function addLocallyKnownSteamApps(
  list,
  {
    steamPath,
    listingType,
    stats,
    // Injected by the tests so they describe this function rather than the machine it runs on.
    readInstalls = () => module.exports.scanLocalInstalls(),
    readOwnedRegistry = () => listRegistryAllSubkeys('HKCU', 'Software/Valve/Steam/Apps'),
  }
) {
  const appInfo = require('./steamAppInfo.js');
  const catalogue = appInfo.load(steamPath);
  if (!catalogue || catalogue.size === 0) return list;

  const owners = [...new Set(stats.map((entry) => String(entry.userID)))];
  if (owners.length === 0) return list;

  const known = new Set(list.map((entry) => String(entry.appID)));
  const candidates = new Map(); // appid -> is it on disk right now?
  try {
    for (const appid of (await readInstalls()).keys()) candidates.set(String(appid), true);
  } catch {
    /* no readable steamapps folder - the registry pass below may still find something */
  }
  if (listingType == 2) {
    for (const appid of readOwnedRegistry() || []) {
      if (/^\d+$/.test(String(appid)) && !candidates.has(String(appid))) candidates.set(String(appid), false);
    }
  }

  const added = [];
  const rejected = new Map();
  for (const [appid, installed] of candidates) {
    if (known.has(appid)) continue;
    const entry = catalogue.get(appid);
    // An app the client has never catalogued is not evidence of a game - except when there is an
    // install manifest for it, because that folder IS the game sitting on this disk. Owned-only
    // entries get no such benefit: that list is where DLC and tooling would come in unchecked.
    const allowed = entry ? appInfo.LIBRARY_TYPES.has(entry.type) : installed;
    if (!allowed) {
      const reason = entry ? entry.type : 'unknown';
      rejected.set(reason, (rejected.get(reason) || 0) + 1);
      continue;
    }
    for (const userID of owners) added.push({ userID, appID: appid });
  }
  if (added.length || rejected.size) {
    const skipped = [...rejected.entries()].map(([type, count]) => `${count} ${type}`).join(', ');
    debug.log(`[steam] ${added.length} owned/installed game(s) added from the local Steam catalogue${skipped ? ` (skipped ${skipped})` : ''}`);
  }
  return list.concat(added);
}

module.exports.scanLegit = async (listingType = 0, steamAccFilter = '0') => {
  let data = [];

  if (regKeyExists('HKCU', 'Software/Valve/Steam') && listingType > 0) {
    let steamPath = await getSteamPath();
    let publicUsers = await getSteamUsers(steamPath);
    if (steamAccFilter !== '0' && publicUsers.find((p) => p.user === steamAccFilter))
      publicUsers = publicUsers.filter((u) => u.user === steamAccFilter);

    let steamCache = path.join(steamPath, 'appcache/stats');
    let list = (await glob('UserGameStats_*([0-9])_*([0-9]).bin', { cwd: steamCache, onlyFiles: true, absolute: false })).map((filename) => {
      let matches = filename.match(/([0-9]+)/g);
      return {
        userID: matches[0],
        appID: matches[1],
      };
    });

    // A stats file only exists once a game has reported statistics, so this source alone lists what
    // was PLAYED. App manifests and, in "owned" mode, registry keys close the gap to owned/installed.
    list = await addLocallyKnownSteamApps(list, { steamPath, listingType, stats: list });

    for (let stats of list) {
      // Steam's own per-game registry flag: 1 when the game is on disk, missing/0 when it is
      // merely owned. Capture it for every entry so "owned" mode never makes the installed
      // filter trust a game that isn't actually installed (e.g. Assassin's Creed Mirage).
      const installedFlag = readRegistryInteger('HKCU', `Software/Valve/Steam/Apps/${stats.appID}`, 'Installed') === 1;
      const isInstalled = listingType == 1 ? installedFlag : true;

      let user = publicUsers.find((user) => user.user == stats.userID);

      if (user && isInstalled) {
        data.push({
          appid: stats.appID,
          source: `Steam (${user.name})`,
          data: {
            type: 'steamAPI',
            userID: user,
            cachePath: steamCache,
            installed: installedFlag,
          },
        });
      }
    }
  } else {
    throw 'Legit Steam not found or disabled.';
  }

  return data;
};

module.exports.getCachedData = (cfg) => {
  if (!steamLanguages.some((language) => language.api === cfg.lang)) {
    throw 'Unsupported API language code';
  }

  const cache = path.join(cacheRoot, 'steam_cache/schema', cfg.lang);
  let result;
  try {
    let filePath = path.join(`${cache}`, `${cfg.appID}.db`);
    if (fs.existsSync(filePath)) {
      result = JSON.parse(fs.readFileSync(filePath));
    }
  } catch (err) {
    if (err.code) throw `Could not load Steam data: ${err.code} - ${err.message}`;
    else throw `Could not load Steam data: ${err}`;
  }
  return result;
};

module.exports.saveGameToCache = async (cfg) => {
  const cache = path.join(cacheRoot, 'steam_cache/schema', cfg.lang);
  const filePath = path.join(`${cache}`, `${cfg.appid}.db`);

  const result = {
    name: cfg.name,
    appid: cfg.appid,
    binary: null,
    img: {
      header: cfg.header,
      background: cfg.background,
      portrait: cfg.portrait,
      icon: cfg.icon,
    },
    achievement: {
      total: cfg.achievements.length,
      list: cfg.achievements,
    },
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
};

// A cached schema with a resolved name but an empty achievement list is ambiguous: genuinely none
// (UNDERTALE), or a fetch that reached the store page but not the schema. Re-checked once per window.
const EMPTY_SCHEMA_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

module.exports.isStaleEmptySchema = (cached, now = Date.now()) => {
  if (!cached || !cached.name) return false;
  const list = cached.achievement && cached.achievement.list;
  if (!Array.isArray(list) || list.length > 0) return false;
  const at = Number(cached.emptyCheckedAt);
  return !(Number.isFinite(at) && at > 0 && now - at < EMPTY_SCHEMA_RECHECK_MS);
};

// Cache definitive Steam misses briefly; never cache a network outage.
const NEGATIVE_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
let _negativeCache = null;

function negativeCacheFile() {
  return cacheRoot ? path.join(cacheRoot, 'steam_cache', 'unresolved.json') : '';
}

function loadNegativeCache() {
  if (_negativeCache) return _negativeCache;
  _negativeCache = new Map();
  try {
    const file = negativeCacheFile();
    if (file && fs.existsSync(file)) {
      for (const [key, at] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')) || {})) {
        if (Date.now() - Number(at) < NEGATIVE_CACHE_TTL_MS) _negativeCache.set(key, Number(at));
      }
    }
  } catch {
    /* A corrupt cache is equivalent to an empty cache. */
  }
  return _negativeCache;
}

function isKnownUnresolved(appID) {
  return loadNegativeCache().has(String(appID));
}

function rememberUnresolved(appID) {
  const cache = loadNegativeCache();
  cache.set(String(appID), Date.now());
  try {
    const file = negativeCacheFile();
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    /* The in-memory copy remains usable. */
  }
}

// A miss is meaningful only when the app list was available.
module.exports.shouldRememberUnresolved = ({ hasResult, inAppList, appListLoaded } = {}) =>
  !hasResult && !inAppList && !!appListLoaded;

// Drop the memo for one appid (or all of them) so a manual retry really re-checks Steam.
module.exports.forgetUnresolved = (appID) => {
  const cache = loadNegativeCache();
  if (appID == null) cache.clear();
  else cache.delete(String(appID));
  try {
    const file = negativeCacheFile();
    if (file) fs.writeFileSync(file, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    /* Best effort. */
  }
};

// Merges a fresh fetch into the cached list (matched by apiName): patches blank fields and appends
// achievements missing from `list`. Mutates in place; never removes an entry, so a short/failed
// fetch can't delete unlocked history.
module.exports.reconcileAchievementList = (list, fresh) => {
  if (!Array.isArray(list) || !Array.isArray(fresh) || fresh.length === 0) return { changed: false, addedCount: 0 };
  let changed = false;
  const freshByName = new Map(fresh.filter((a) => a && a.name != null).map((a) => [String(a.name).toUpperCase(), a]));
  for (const ach of list) {
    const f = freshByName.get(String(ach.name).toUpperCase());
    if (!f) continue;
    if ((!ach.description || String(ach.description).trim() === '') && f.description) {
      ach.description = f.description;
      changed = true;
    }
    if ((!ach.displayName || String(ach.displayName).trim() === '') && f.displayName) {
      ach.displayName = f.displayName;
      changed = true;
    }
    if (ach.hidden == null && f.hidden != null) {
      ach.hidden = f.hidden;
      changed = true;
    }
  }
  const knownNames = new Set(list.filter((a) => a && a.name != null).map((a) => String(a.name).toUpperCase()));
  const added = [];
  for (const achievement of fresh) {
    if (!achievement || achievement.name == null) continue;
    const key = String(achievement.name).toUpperCase();
    if (knownNames.has(key)) continue;
    knownNames.add(key);
    added.push(achievement);
  }
  if (added.length) {
    list.push(...added);
    changed = true;
  }
  return { changed, addedCount: added.length };
};

module.exports.getGameData = async (cfg) => {
  if (!steamLanguages.some((language) => language.api === cfg.lang)) {
    throw 'Unsupported API language code';
  }
  let result;
  let needSaving = false;
  const fastStart = cfg.fastStart === true;
  const cache = path.join(cacheRoot, 'steam_cache/schema', cfg.lang);
  let filePath = path.join(`${cache}`, `${cfg.appID}.db`);

  try {
    result = this.getCachedData(cfg);
    // Ambiguous empty entry (see isStaleEmptySchema): fall through to the fetch path below, but
    // keep the record so a failed re-check can hand it back untouched.
    const staleEmpty = module.exports.isStaleEmptySchema(result) ? result : undefined;
    if (staleEmpty) result = undefined;
    if ((!result || !result.name) && isKnownUnresolved(cfg.appID)) {
      debug.log(`[${cfg.appID}] skipped: known to have no Steam data (cached miss)`);
      return staleEmpty;
    }
    if (!result || !result.name) {
      // A brand-new appid may not be in the GetAppList dump yet; getProductInfo/store still resolve
      // it, so only give up when the fetch comes back empty AND the id was never listed.
      let inAppList = false;
      try {
        inAppList = await findInAppList(+cfg.appID);
        result = await getSteamDataFromSRV(cfg.appID, cfg.lang);
      } catch (err) {
        // Offline, every one of these lookups throws. This is a re-check of an entry we already
        // have, so a throw must not be able to lose it - otherwise one offline scan drops every
        // re-checked game at once. With nothing cached, the original error path is untouched.
        if (!staleEmpty) throw err;
        debug.log(`[${cfg.appID}] empty-schema re-check could not run, keeping the cached entry: ${err.code || err}`);
        return staleEmpty;
      }
      if (result && result.networkError === true && !staleEmpty) return null;
      // findInAppList() is an INDEPENDENT lookup from the product-info call in getSteamDataFromSRV,
      // so when that one comes back nameless the name is often already in hand here.
      const listedName = typeof inAppList === 'string' && inAppList.trim() ? inAppList.trim() : '';
      if (result && !result.name && listedName) {
        result.name = listedName;
        debug.log(`[${cfg.appID}] product info returned no name; using the app-list name "${listedName}"`);
      }

      if ((!result || !result.name) && staleEmpty) {
        // The re-check came back empty-handed (offline, rate-limited, store 404). Hand back the
        // record we already had and leave it unstamped: nothing was verified, so the next scan
        // is free to try again. Dropping it here would empty the list on every offline scan.
        return staleEmpty;
      }
      if ((!result || !result.name) && !inAppList) {
        // Only a miss against a list we actually have says anything about this appid (see the
        // negative-cache comment above); offline, everything misses.
        if (module.exports.shouldRememberUnresolved({ hasResult: !!(result && result.name), inAppList, appListLoaded: appListUsable() })) {
          rememberUnresolved(cfg.appID);
        }
        throw `Error trying to load steam data for ${cfg.appID}`;
      }
      needSaving = true;
    }

    if (staleEmpty && Array.isArray(result?.achievement?.list) && result.achievement.list.length === 0) {
      // Verified: this game really has no achievements. Keep the entry we already had - its
      // artwork may have been resolved over several runs - and stamp the check onto it.
      result = staleEmpty;
      result.emptyCheckedAt = Date.now();
      needSaving = true;
    }

    // Self-repair: patch blank fields and pick up achievements a game update added (Steam gives no
    // change notification). Runs every 3 days, or immediately if forced from Settings > Advanced.
    const DESC_RECHECK_MS = 3 * 24 * 60 * 60 * 1000;
    const triedRecently = !cfg.forceRecheck && result && result.descBackfilledAt && Date.now() - result.descBackfilledAt < DESC_RECHECK_MS;
    if ((!fastStart || cfg.forceRecheck) && result && result.achievement && Array.isArray(result.achievement.list) && !triedRecently) {
      let recheckSucceeded = false;
      try {
        const freshResult = await getSchemaAchievements(cfg);
        const fresh = Array.isArray(freshResult) ? freshResult : freshResult.achievements || [];
        recheckSucceeded = !(freshResult && freshResult.networkError === true);
        const { addedCount } = module.exports.reconcileAchievementList(result.achievement.list, fresh);
        if (addedCount) {
          result.achievement.total = result.achievement.list.length;
          debug.log(`[${cfg.appID}] picked up ${addedCount} new achievement(s) from a game update`);
        }
      } catch (err) {
        debug.log(`Could not refresh schema descriptions [${cfg.appID}]: ${err.code ? `${err.code} - ${err.message}` : err}`);
      }
      if (recheckSucceeded) {
        result.descBackfilledAt = Date.now();
        needSaving = true;
      }
    }

    needSaving = needSaving || (!fastStart && (await GetMissingData(result, cfg.showHidden, cfg.lang, cfg.steamSettings)));
    if (needSaving) {
      // A record with no name is a failed lookup wearing one, not a schema; keep it in memory for
      // this scan only and let the next one retry the fetch.
      if (result && result.name) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
      } else {
        debug.log(`[${cfg.appID}] not caching a schema with no name - the next scan will retry the lookup`);
      }
    }
    return result;
  } catch (err) {
    if (err.code) debug.log(`Could not load Steam data [${cfg.appID}]: ${err.code} - ${err.message}${err.url ? ' url=' + err.url : ''}`);
    else debug.log(`Could not load Steam data [${cfg.appID}]: ${err}`);
  }
};

// An RLD! value is a 5-byte hex blob (little-endian uint32 + a discarded trailing byte). Convert only
// a value that CANNOT also be a decimal timestamp - guessing wrong on an all-digit blob would move a
// real unlock to the 1990s.
const RLD_BLOB = /^[0-9a-fA-F]{10}$/;

function isUnambiguousRldBlob(value) {
  const s = String(value);
  return RLD_BLOB.test(s) && /[a-fA-F]/.test(s);
}

function decodeRldBlob(value) {
  return new DataView(new Uint8Array(Buffer.from(String(value), 'hex')).buffer).getUint32(0, true);
}

// RAZOR1911 (%APPDATA%\.1911\<appid>\achievement): plain text, one line per achievement,
// "<apiname> <0|1> <epoch seconds>". Lines that do not match are ignored.
function parseRazorAchievementFile(text) {
  const result = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^(\S+)\s+([01])\s+(\d+)\s*$/.exec(line.trim());
    if (m) result[m[1]] = { Achieved: m[2], UnlockTime: Number(m[3]) };
  }
  return result;
}

module.exports._internal = Object.assign({}, module.exports._internal, { isUnambiguousRldBlob, decodeRldBlob, parseRazorAchievementFile });

module.exports.getAchievementsFromFile = async (filePath) => {
  // FINAL FANTASY VII (2013) keeps an 8-byte bitfield in achievement.dat, checked only for a folder
  // proven to be that game - the filename is generic enough to otherwise misdecode another save.
  const ff7State = ff7.getAchievementsFromFile(filePath);
  if (ff7State) return ff7State;

  const files = [
    'achievements.ini',
    'achievements.json',
    'stats.json',
    'achiev.ini',
    'stats.ini',
    'Achievements.Bin',
    'achieve.dat',
    'Achievements.ini',
    'stats/achievements.ini',
    'stats.bin',
    'stats/CreamAPI.Achievements.cfg',
    'SteamEmu/UserStats/achiev.ini',
    'user_stats.ini',
    'achievement',
  ];

  const filter = ['SteamAchievements', 'Steam64', 'Steam'];

  let local;
  let matchedFile;
  // Most candidates simply do not exist in a given save folder, so a missing file is not worth
  // reporting. A file that IS there and could not be read is: keeping that error means the failure
  // says "locked by another process" or "corrupt" instead of the misleading "no achievement file".
  let lastReadError = null;
  for (let file of files) {
    try {
      if (path.parse(file).ext == '.json') {
        local = JSON.parse(fs.readFileSync(path.join(filePath, file), 'utf8'));
      } else if (file === 'stats.bin') {
        local = sse.parse(fs.readFileSync(path.join(filePath, file)));
      } else if (file === 'achievement') {
        local = parseRazorAchievementFile(fs.readFileSync(path.join(filePath, file), 'utf8'));
      } else {
        local = ini.parse(fs.readFileSync(path.join(filePath, file), 'utf8'));
      }
      matchedFile = file;
      break;
    } catch (e) {
      if (e && e.code !== 'ENOENT' && e.code !== 'ENOTDIR') lastReadError = { file, error: e };
    }
  }
  if (!local) {
    if (lastReadError) {
      throw `No readable achievement file in '${filePath}': ${lastReadError.file} => ${lastReadError.error.message || lastReadError.error}`;
    }
    throw `No achievement file found in '${filePath}'`;
  }

  let result = {};

  if (local.AchievementsUnlockTimes && local.Achievements) {
    //hoodlum DARKSiDERS

    for (let i in local.Achievements) {
      if (Object.prototype.hasOwnProperty.call(local.Achievements, i)) {
        if (local.Achievements[i] == 1) {
          result[`${i}`] = { Achieved: '1', UnlockTime: local.AchievementsUnlockTimes[i] || null };
        }
      }
    }
  } else if (local.State && local.Time) {
    //3DM

    for (let i in local.State) {
      if (Object.prototype.hasOwnProperty.call(local.State, i)) {
        if (local.State[i] == '0101') {
          result[i] = {
            Achieved: '1',
            UnlockTime: new DataView(new Uint8Array(Buffer.from(local.Time[i].toString(), 'hex')).buffer).getUint32(0, true) || null,
          };
        }
      }
    }
  } else if (local.ACHIEVEMENTS) {
    // TENOKE: cross-reference the sibling [STATS] section (raw stat values) by the achievement's own
    // key, since achievements.js can't see it once this function returns. Section casing varies, so
    // match it case-insensitively.
    const statsSectionKey = Object.keys(local).find((k) => String(k).toLowerCase() === 'stats');
    const statsSection = statsSectionKey && typeof local[statsSectionKey] === 'object' ? local[statsSectionKey] : {};
    const tenokeStatValues = {};
    for (let s in statsSection) {
      if (!Object.prototype.hasOwnProperty.call(statsSection, s)) continue;
      const statKey = s.replace(/^"|"$/g, '');
      const statNum = Number(String(statsSection[s]).replace(/,\s*$/, ''));
      if (statKey && Number.isFinite(statNum)) tenokeStatValues[statKey] = statNum;
    }

    for (let i in local.ACHIEVEMENTS) {
      if (!Object.prototype.hasOwnProperty.call(local.ACHIEVEMENTS, i)) continue;
      const key = i.replace(/^"|"$/g, '');
      const raw = local.ACHIEVEMENTS[i]; // e.g. "{unlocked=true, time=1712253396}"
      const unlockedMatch = /unlocked\s*=\s*(true|false)/i.exec(raw);
      const timeMatch = /time\s*=\s*(\d+)/i.exec(raw);
      // Older Tenoke saves can store progress inline on the achievement entry itself. Only trust
      // the value when it is a finite number (a malformed tail like "12.5.3" must not become NaN
      // in the baseline - it would poison progress notifications for the rest of the session).
      const progressMatch = /(?:progress|value)\s*=\s*([\d.]+)/i.exec(raw);
      const progressNum = progressMatch ? Number(progressMatch[1]) : NaN;

      const unlocked = unlockedMatch ? unlockedMatch[1].toLowerCase() === 'true' : false;
      const time = timeMatch ? Number(timeMatch[1]) : 0;

      result[key] = {
        Achieved: unlocked ? '1' : '0',
        UnlockTime: time,
      };
      if (Number.isFinite(progressNum)) {
        result[key].CurProgress = progressNum;
      } else if (key in tenokeStatValues) {
        result[key].CurProgress = tenokeStatValues[key];
      }
    }
  } else {
    result = omit(local.ACHIEVE_DATA || local, filter);
  }

  for (let i in result) {
    if (Object.prototype.hasOwnProperty.call(result, i)) {
      if (result[i].State) {
        //RLD!
        try {
          //uint32 little endian
          result[i].State = decodeRldBlob(result[i].State);
          result[i].CurProgress = decodeRldBlob(result[i].CurProgress);
          result[i].MaxProgress = decodeRldBlob(result[i].MaxProgress);
          result[i].Time = decodeRldBlob(result[i].Time);
        } catch (e) {}
      } else if (result[i] && typeof result[i] === 'object' && isUnambiguousRldBlob(result[i].Time)) {
        // RLD! build that writes no State key: the unlock is carried by Time alone, and
        // achievements.js turns a non-zero Time into Achieved (a locked entry is written Time=0).
        // Without decoding it here that timestamp reaches the normalizer as raw hex.
        try {
          result[i].Time = decodeRldBlob(result[i].Time);
          if (isUnambiguousRldBlob(result[i].CurProgress)) result[i].CurProgress = decodeRldBlob(result[i].CurProgress);
          if (isUnambiguousRldBlob(result[i].MaxProgress)) result[i].MaxProgress = decodeRldBlob(result[i].MaxProgress);
        } catch (e) {}
      } else if (result[i].unlocktime && result[i].unlocktime.length === 7) {
        //creamAPI
        result[i].unlocktime = +result[i].unlocktime * 1000; //cf: https://cs.rin.ru/forum/viewtopic.php?p=2074273#p2074273 | timestamp is invalid/incomplete
      }
    }
  }

  // Merge sibling Stats.ini values for progress-type achievements.
  if (matchedFile && /achievements\.ini$/i.test(matchedFile)) {
    for (const statsName of ['Stats.ini', 'stats.ini']) {
      const statsPath = path.join(filePath, path.dirname(matchedFile), statsName);
      let statsSize = -1;
      try {
        statsSize = fs.statSync(statsPath).size;
      } catch {
        continue; // doesn't exist under this casing - try the next candidate
      }
      if (statsSize === 0) break; // present but empty: nothing to merge, not an error
      try {
        const doc = emuIni.parseIni(fs.readFileSync(statsPath, 'utf8'));
        const values = emuIni.readIniSectionValues(doc, 'Stats');
        const resultKeys = new Set(Object.keys(result).map((k) => String(k).toUpperCase()));
        const rawStatKeys = [];
        for (const [name, raw] of Object.entries(values)) {
          // readIniSectionValues lower-cases stat names while achievement keys keep the repack's
          // original casing, so the shadow guard must be case-insensitive.
          if (resultKeys.has(String(name).toUpperCase())) continue; // never shadow a real achievement entry
          const num = Number(raw);
          if (Number.isFinite(num)) {
            result[name] = num;
            rawStatKeys.push(name);
          }
        }
        // These are raw stat values, not achievement records, kept so statProgress.js can resolve
        // progress-type achievements via operand1. Tagged non-enumerable so they're stripped from
        // `root` afterward rather than matched against a schema entry named "stat_1".
        if (rawStatKeys.length > 0) {
          Object.defineProperty(result, '__rawStatKeys', { value: rawStatKeys, enumerable: false, configurable: true });
        }
      } catch (e) {}
      break;
    }
  }

  return result;
};

module.exports.getAchievementsFromAPI = async (cfg) => {
  try {
    let result;

    let cache = {
      local: path.join(cacheRoot, 'steam_cache/user', cfg.user.user, `${cfg.appID}.db`),
      steam: path.join(`${cfg.path}`, `UserGameStats_${cfg.user.user}_${cfg.appID}.bin`),
    };

    let time = {
      local: 0,
      steam: 0,
    };

    if (fs.existsSync(cache.local)) {
      let local = fs.statSync(cache.local);
      if (Object.keys(local).length > 0) time.local = moment(local.mtime).valueOf();
    }

    if (!fs.existsSync(cache.steam)) {
      // Owned or installed, never played: Steam writes no stats file until the game first reports
      // one. That is a complete answer - nothing is unlocked - and it must not throw, or every
      // never-played game in the library would fail to load instead of showing 0%.
      if (time.local > 0) return JSON.parse(fs.readFileSync(cache.local));
      return [];
    }
    let steamStats = fs.statSync(cache.steam);
    if (Object.keys(steamStats).length > 0) {
      time.steam = moment(steamStats.mtime).valueOf();
    } else {
      throw 'No Steam cache file found';
    }

    if (time.steam > time.local) {
      // Local-first: parse the freshly rewritten bin together with the sibling UserGameStatsSchema
      // bin instead of asking the network. Falls back to the WebAPI round-trip only when unreadable.
      const steamOfficial = require('./steamOfficial.js');
      result = steamOfficial.readLocalUserStats({ statsDir: cfg.path, appid: cfg.appID, accountId: cfg.user.user });
      if (result) {
        debug.log(`[${cfg.appID}] user stats read locally from appcache (${result.filter((r) => r.achieved).length} unlocked)`);
      } else {
        result = await getSteamUserStatsFromSRV(cfg.user.id, cfg.appID);
      }
      fs.mkdirSync(path.dirname(cache.local), { recursive: true });
      fs.writeFileSync(cache.local, JSON.stringify(result, null, 2));
    } else {
      result = JSON.parse(fs.readFileSync(cache.local));
    }

    return result;
  } catch (err) {
    if (err.code) throw `Could not load Steam User Stats: ${err.code} - ${err.message}`;
    else throw `Could not load Steam User Stats: ${err}`;
  }
};

const getSteamPath = (module.exports.getSteamPath = async () => {
  // Some SteamEmu change HKCU/Software/Valve/Steam/SteamPath to the game's dir; fall back to
  // Software/WOW6432Node/Valve/Steam/InstallPath (the Steam client corrects the key on startup).

  const regHives = [
    { root: 'HKCU', key: 'Software/Valve/Steam', name: 'SteamPath' },
    { root: 'HKLM', key: 'Software/WOW6432Node/Valve/Steam', name: 'InstallPath' },
  ];

  let steamPath;

  for (let regHive of regHives) {
    steamPath = readRegistryString(regHive.root, regHive.key, regHive.name);
    if (steamPath) {
      if (fs.existsSync(path.join(steamPath, 'steam.exe'))) {
        break;
      }
    }
  }

  if (!steamPath) throw 'Steam Path not found';
  return steamPath;
});

// A Steam install's folder is authoritative: appmanifest_<appid>.acf names the installdir, and
// libraryfolders.vdf names every library root - powers exe detection for the launch panel.
function unescapeSteamVdf(value) {
  return String(value || '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function parseSteamLibraryFoldersVdf(text) {
  const roots = [];
  const re = /^\s*"path"\s+"([^"]+)"/gm;
  let m = null;
  while ((m = re.exec(String(text || '')))) roots.push(unescapeSteamVdf(m[1]));
  return roots;
}

function parseSteamAppManifestAcf(text) {
  const out = { appid: '', name: '', installDir: '' };
  const re = /^\s*"(appid|name|installdir)"\s+"([^"]*)"/gm;
  let m = null;
  while ((m = re.exec(String(text || '')))) {
    if (m[1] === 'appid') out.appid = unescapeSteamVdf(m[2]);
    else if (m[1] === 'name') out.name = unescapeSteamVdf(m[2]);
    else if (m[1] === 'installdir') out.installDir = unescapeSteamVdf(m[2]);
  }
  return out;
}

// Map of appid -> { name, gameDir } for every app with an appmanifest on disk. Rebuilt on each
// scan (a handful of small ACF files) so newly installed Steam games are picked up immediately.
module.exports.scanLocalInstalls = async () => {
  let steamPath;
  try {
    steamPath = await getSteamPath();
  } catch {
    return new Map();
  }
  if (!steamPath || !fs.existsSync(path.join(steamPath, 'steam.exe'))) return new Map();

  const libraryFile = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');

  const roots = [path.join(steamPath, 'steamapps')];
  try {
    if (fs.existsSync(libraryFile)) {
      roots.push(...parseSteamLibraryFoldersVdf(fs.readFileSync(libraryFile, 'utf8')).map((r) => path.join(r, 'steamapps')));
    }
  } catch {
    /* unreadable library file - the main steamapps root still works */
  }

  const installs = new Map();
  const seen = new Set();
  for (const root of roots) {
    let files = [];
    try {
      files = fs.readdirSync(root).filter((f) => /^appmanifest_\d+\.acf$/i.test(f));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const manifest = parseSteamAppManifestAcf(fs.readFileSync(path.join(root, file), 'utf8'));
        const appid = String(manifest.appid || '').trim();
        if (!/^\d+$/.test(appid) || seen.has(appid)) continue;
        const installDir = String(manifest.installDir || '').trim();
        if (!installDir) continue;
        seen.add(appid);
        installs.set(appid, {
          name: String(manifest.name || '').trim(),
          gameDir: path.join(root, 'common', installDir),
        });
      } catch {
        /* skip one corrupt manifest */
      }
    }
  }

  return installs;
};

// Which local Steam accounts were confirmed public, remembered across runs. Only a real answer is
// written here, never a guess made while offline; read only when the check could not run at all.
function publicSteamUsersPath() {
  return cacheRoot ? path.join(cacheRoot, 'steam_cache', 'steamUsers.json') : '';
}

function readPublicSteamUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(publicSteamUsersPath(), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePublicSteamUsers(users) {
  const file = publicSteamUsersPath();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(users || [], null, 2));
  } catch {
    /* cache write failure is non-fatal */
  }
}

const getSteamUsers = (module.exports.getSteamUsers = async (steamPath) => {
  let result = [];

  let users = listRegistryAllSubkeys('HKCU', 'Software/Valve/Steam/Users');
  if (!users || users.length == 0) users = await glob('*([0-9])', { cwd: path.join(steamPath, 'userdata'), onlyDirectories: true, absolute: false });

  if (users.length == 0) throw 'No Steam User ID found';

  const remembered = readPublicSteamUsers();
  let unreachable = false;
  result = await Promise.all(
    users.map(async (user) => {
      const id = steamID.to64(user);
      const data = await steamID.whoIs(id);
      if (data.privacyState === 'public') {
        debug.log(`${user} - ${id} (${data.steamID}) is public`);
        return {
          user,
          id,
          name: data.steamID,
          profile: data,
        };
      }
      if (data.networkError === true) {
        // Not an answer about the account. A profile confirmed public on an earlier scan does not
        // become private because the network is down, and treating it as private drops the entire
        // legit-Steam source - the largest part of most libraries - from an offline scan.
        unreachable = true;
        const known = remembered.find((entry) => entry && String(entry.user) === String(user));
        if (known) {
          debug.log(`${user} - ${id} could not be checked (offline); reusing the profile confirmed public earlier`);
          return known;
        }
        debug.log(`${user} - ${id} could not be checked (offline) and was never confirmed public`);
        return null;
      }
      debug.log(`${user} - ${id} (${data.steamID}) is not public`);
      return null;
    })
  );
  result = result.filter(Boolean);
  if (!unreachable) writePublicSteamUsers(result);
  if (result.length === 0) throw unreachable ? 'Public profile: unknown (offline).' : 'Public profile: none.';
  return result;
});

const getSteamUsersList = (module.exports.getSteamUsersList = async () => {
  if (steamUsersList) return steamUsersList;
  if (!regKeyExists('HKCU', 'Software/Valve/Steam')) return [];
  try {
    let steamPath = await getSteamPath();
    let publicUsers = await getSteamUsers(steamPath);
    steamUsersList = publicUsers;
    return publicUsers;
  } catch (e) {
    return [];
  }
});

async function getSteamUserStatsFromSRV(user, appID) {
  const result = await ipcInvoke('get-steam-data', { appid: appID, user, type: 'user' });
  // ipcInvoke answers null outside a renderer and on a rejected handler. The caller caches whatever
  // comes back, so a null must not get through: it would record "this user unlocked nothing" for a
  // question that was never actually asked.
  if (!result) throw 'Steam user stats could not be fetched';
  return result;
}

// Resolve a game's library portrait: product info first, then SteamDB's hashed store_item_assets
// path, then SteamGridDB. Shared by the cache-MISS and cached-schema repair paths. A truthy
// non-http value is a fetch-icon token the renderer resolves itself, returned untouched.
// How long a single game will hold its scan worker waiting for the shared SteamDB browser queue.
const STEAMDB_COVER_WAIT_MS = 6000;

// Resolve to null once the budget is spent, leaving the underlying request running. Rejections are
// swallowed the same way the direct call already did.
function waitBounded(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

async function resolvePortrait({ appid, name, portrait, invoke, steamdbWaitMs = STEAMDB_COVER_WAIT_MS }) {
  // ipcInvoke, not ipcRenderer: GetMissingData also runs from the main process, where ipcRenderer is
  // undefined and a direct call would throw out of this function instead of falling through.
  const send = invoke || ipcInvoke;
  if (!name && !appid) return portrait || null;

  if (portrait && /^https?:\/\//i.test(portrait)) {
    // Verify a guessable CDN url actually downloads: modern titles live under hashed
    // store_item_assets paths, so a dead url would leave the tile blank while SteamDB knows better.
    try {
      const local = await send('fetch-icon', portrait, appid).catch(() => null);
      if (!local || local === portrait) portrait = null;
    } catch {
      return portrait; // keep the product-info url; the renderer will retry it
    }
  }

  // Steam CDN is cheap and deterministic for the portrait path. Try it before SteamDB's browser
  // scrape, and stop the chain immediately when its status says the network is unavailable. This
  // keeps a cache-clear scan from launching one 45-second SteamDB page per game while offline.
  if (!portrait) {
    const cdn = await send('get-steam-cdn-covers-status', appid, 'portrait').catch(() => null);
    if (cdn && cdn.networkError === true) return null;
    for (const url of Array.isArray(cdn?.urls) ? cdn.urls : []) {
      const local = await send('fetch-icon', url, appid).catch(() => null);
      if (local && local !== url) {
        // Keep the source URL in the schema. The downloaded file belongs to steam_cache and must be
        // disposable when the user clears caches; the renderer can resolve this URL again later.
        portrait = url;
        break;
      }
    }
  }
  // SteamDB is the only step that runs a browser, and every game shares one global queue to reach
  // it, so a cold scan can wait out the 30s per-game budget. Bound the wait, not the chain: the
  // scrape keeps running and writes its cache entry regardless.
  if (!portrait) portrait = (await waitBounded(send('get-steamdb-cover', appid), steamdbWaitMs)) || null;
  // The appid lets SteamGridDB answer by identity; the name is only the fallback handle for a game
  // that has no Steam appid at all.
  if (!portrait) portrait = (await send('get-steamgriddb-cover', name, appid).catch(() => null)) || null;
  return portrait || null;
}

module.exports.resolvePortrait = resolvePortrait;

async function getSteamDataFromSRV(appID, lang) {
  const langObj = steamLanguages.find((language) => language.api === lang);
  // ipcInvoke, not ipcRenderer: this runs from the main process too, where ipcRenderer is undefined
  // and every one of these calls threw the same bare "Cannot read properties of undefined (reading
  // 'invoke')" into parser.log, once per game. Each result below is already treated as optional.
  // Product info and achievements are independent: fetch them in parallel so the keyless HTTP
  // chain (official endpoint / SteamHunters JSON) never waits behind the anonymous Steam login.
  const [resultRaw, steamhunters] = await Promise.all([
    ipcInvoke('get-steam-data', { appid: appID, type: 'common', lang: langObj }),
    ipcInvoke('get-steam-data', { appid: appID, type: 'steamhunters', lang }),
  ]);
  const result = resultRaw || {};
  const networkError = result.networkError === true && steamhunters && steamhunters.networkError === true;

  // The supplemental fetchers can legitimately come back empty (obscure title, scrape failed, site
  // unreachable). Default to [] instead of dereferencing `.achievements` on the result, or the whole
  // load throws and the game silently vanishes from the list.
  let achievements = result.isGame && Array.isArray(steamhunters?.achievements) ? steamhunters.achievements : [];

  // SteamCommunity translations are only needed when the primary source is English-only
  // (SteamHunters JSON or the browser scrape). The official endpoint is already localized.
  const needsTranslations =
    result.isGame &&
    lang !== 'english' &&
    result.translated &&
    steamhunters?.source !== 'official' &&
    steamhunters?.source !== 'steamcommunity';
  const steamcommunity = needsTranslations ? await ipcInvoke('get-steam-data', { appid: appID, type: 'steamcommunity', lang: langObj }) : null;
  const translatedAchievements = Array.isArray(steamcommunity?.achievements) ? steamcommunity.achievements : [];

  mergeTranslatedAchievements(achievements, translatedAchievements);

  // SteamHunters groups tag DLC/update achievements by apiName. Only worth asking for a real game
  // with achievements. Best-effort: untagged entries are left untouched, a failure never fails the load.
  let groupsResult = { ok: false, groups: [] };
  if (result.isGame && achievements.length > 0) {
    groupsResult = (await ipcInvoke('get-steam-data', { appid: appID, type: 'steamgroups' })) || { ok: false, groups: [] };
  }
  if (Array.isArray(groupsResult.groups) && groupsResult.groups.length) {
    achievements = steamSchemaFetch.applySteamHuntersGroups(achievements, groupsResult.groups);
  }

  // Product info often carries no library capsule at all (brand-new appids above all); see
  // resolvePortrait for the recovery chain. If both Steam transports already reported an outage,
  // don't launch SteamDB/Puppeteer to confirm the same missing portrait - retry next scan.
  const portrait = networkError ? null : await resolvePortrait({ appid: appID, name: result.name, portrait: result.portrait });

  return {
    name: result.name,
    appid: appID,
    binary: null,
    img: {
      header: result.header || 'header',
      background: result.background || 'page_bg_generated_v6b',
      // Never fall back to the literal "portrait" placeholder: it is truthy, so the portrait view
      // would prefer it over the real header and render a blank tile. Null lets the grid use the
      // header (or the alternate fallback) instead.
      portrait: portrait || null,
      icon: result.icon,
    },
    achievement: {
      total: achievements.length,
      list: achievements,
    },
    ...(networkError ? { networkError: true } : {}),
  };
}

// IPlayerService/GetGameAchievements gives real descriptions for hidden achievements too, unlike
// the legacy GetSchemaForGame (which always blanks them). Mapped to the same achievement-list shape
// so it's a drop-in replacement for every caller below.
async function getGameAchievementsFromWebAPI(cfg) {
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetGameAchievements/v1/?appid=${cfg.appID}&language=${cfg.lang}`;
    const data = await request.getJson(url);
    return steamSchemaFetch.mapOfficialAchievements(data && data.response, cfg.appID);
  } catch (err) {
    debug.log(`[${cfg.appID}] keyless GetGameAchievements failed (${err.code || err.message || err})`);
    return []; // keep the game visible; the local-schema backfill can still fill the list
  }
}

// Lean, schema-only fetch: just the authoritative achievement list (no Steam store page, no icon
// downloads). Used to backfill blank descriptions/displayNames into a stale cached schema without
// paying for the full getSteamDataFromSRV() round-trip.
async function getSchemaAchievements(cfg) {
  // In the renderer, reuse the main process's complete official -> SteamHunters ->
  // SteamCommunity -> browser chain. Anywhere else - the main process, plain-Node tests - there is
  // no channel to reach it through, and the direct, browser-free endpoint below answers instead.
  if (ipcAvailable()) {
    const result = await ipcInvoke('get-steam-data', { appid: cfg.appID, type: 'steamhunters', lang: cfg.lang });
    if (result && result.networkError === true) return { achievements: [], networkError: true };
    // Any answer at all is the answer, empty included. Only a null - no channel, or a handler that
    // rejected - is a non-answer, and falls through to the direct endpoint below.
    if (result) return Array.isArray(result.achievements) ? result.achievements : [];
  }
  return getGameAchievementsFromWebAPI(cfg);
}

// Fetch and cache DLC names for GBE repair; a store failure is non-fatal.
const getDLCList = (module.exports.getDLCList = async (appID) => {
  const id = parseInt(appID, 10);
  if (!Number.isInteger(id) || id <= 0) return [];

  const cacheFile = path.join(cacheRoot, 'steam_cache/dlc', `${id}.json`);
  const TTL = 14 * 24 * 60 * 60 * 1000;
  try {
    if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < TTL) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Array.isArray(cached.dlcs)) return cached.dlcs;
    }
  } catch {
    /* corrupt cache - refetch */
  }

  const writeCache = (dlcs) => {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify({ time: Date.now(), dlcs }, null, 2));
    } catch {
      /* cache write failure is non-fatal */
    }
    return dlcs;
  };

  try {
    const base = await request.getJson(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english`, { timeout: 20000 });
    const ids = (base && base[id] && base[id].success && base[id].data && Array.isArray(base[id].data.dlc) ? base[id].data.dlc : [])
      .map((d) => parseInt(d, 10))
      .filter((d) => Number.isInteger(d) && d > 0);
    if (ids.length === 0) return writeCache([]);

    const names = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      try {
        const detail = await request.getJson(
          `https://store.steampowered.com/api/appdetails?appids=${chunk.join(',')}&filters=basic&l=english`,
          { timeout: 20000 }
        );
        for (const did of chunk) {
          const entry = detail && detail[did];
          if (entry && entry.success && entry.data && entry.data.name) names.set(did, String(entry.data.name).trim());
        }
      } catch {
        /* this chunk's names stay blank -> fall back to a generic label below */
      }
    }

    const dlcs = ids.map((did) => ({ appid: did, name: names.get(did) || `DLC ${did}` }));
    if (debug) debug.log(`[${id}] resolved ${dlcs.length} DLC(s) from the Steam store`);
    return writeCache(dlcs);
  } catch (err) {
    if (debug) debug.log(`[${id}] DLC list fetch failed => ${err}`);
    return [];
  }
});

async function findInAppList(appID) {
  if (!appID || !(Number.isInteger(appID) && appID > 0)) throw 'ERR_INVALID_APPID';

  const cache = path.join(cacheRoot, 'steam_cache/schema');
  const filepath = path.join(cache, 'appList.json');

  while (!listReady) await new Promise((r) => setTimeout(r, 50));
  if (appidListMap.size === 0) {
    listReady = false;
    try {
      let list;
      // Use a cached copy if it exists and is < 3 days old. Anything thrown here escapes
      // findInAppList() and leaves listReady false, freezing every later lookup.
      if (fs.existsSync(filepath) && Date.now() - fs.statSync(filepath).mtimeMs < 60 * 60 * 1000 * 24 * 3) {
        try {
          list = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        } catch {
          list = undefined; // corrupt/partial cache -> fall through and re-download
        }
      }
      if ((!Array.isArray(list) || list.length === 0) && !appListRefreshFailed) {
        try {
          const url = 'https://api.steampowered.com/ISteamApps/GetAppList/v2/?format=json';
          const data = await request.getJson(url, { timeout: STEAM_APP_LIST_TIMEOUT_MS });
          list = data.applist.apps;
          fs.mkdirSync(path.dirname(filepath), { recursive: true });
          fs.writeFileSync(filepath, JSON.stringify(list, null, 2));
        } catch (err) {
          // Steam retired ISteamApps/GetAppList entirely; the keyless replacement is the app search
          // in searchAppsByName(). A failed refresh falls back to any existing cache (even stale) and
          // sets appListRefreshFailed so only one dead round trip happens per session.
          appListRefreshFailed = true;
          debug.log(`GetAppList refresh failed (${err.code || err}); falling back to cached appList if present`);
          if (fs.existsSync(filepath)) {
            try {
              list = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
            } catch {
              list = undefined;
            }
          }
        }
      }
      if (Array.isArray(list) && list.length > 0) {
        appidListMap = new Map(list.map((a) => [a.appid, a]));
      }
    } finally {
      listReady = true; // always release the lock, even on a network/parse failure
    }
  }

  const app = appidListMap.get(appID);
  if (app) return app.name;
  // Steam retired GetAppList, so the map above is usually empty; the Steam client's own local
  // catalogue answers the same "what's this appid called" question from disk instead of the network.
  const localName = await localSteamCatalogueName(appID);
  if (localName) return localName;
  // Every caller already treats a non-string as "not found" and keeps its own fallback name.
  const name = await ipcInvoke('get-steam-data', { appid: appID, type: 'name' });
  return name;
}

// Steam's local appinfo cache. The registry lookup behind it is resolved once per session, and a
// machine with no Steam install simply has no answer here - every caller keeps its own fallback.
let steamCataloguePath = null;
async function localSteamCatalogueName(appID) {
  try {
    if (steamCataloguePath === null) steamCataloguePath = (await getSteamPath().catch(() => '')) || '';
    if (!steamCataloguePath) return '';
    return require('./steamAppInfo.js').nameOf(steamCataloguePath, appID) || '';
  } catch {
    return '';
  }
}

// Resolve an AppID back to its canonical store name (app-list cache first, then the store data
// IPC). Returns '' when neither path is reachable; callers keep their own fallback name.
const getAppNameByAppid = (module.exports.getAppNameByAppid = async (appid) => {
  try {
    const name = await findInAppList(Number(appid));
    return name && String(name).trim() ? String(name).trim() : '';
  } catch {
    return '';
  }
});

// Did the Steam app-list actually load? When it did not (offline, endpoint down and no cached copy
// yet) EVERY appid misses it, so a miss carries no information and must not be cached as a negative.
function appListUsable() {
  return appidListMap.size > 0;
}

// Since GetAppList was retired, this search is the only way a title resolves to an AppID; its memo
// is written to disk so a launch doesn't re-search every unconfigured install over the network.
// Only a completed request is stored, empty results included; a failed request throws uncached, so
// an outage is never remembered as an answer.
const APP_SEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let _appSearchDisk = null;

function appSearchCacheFile() {
  return cacheRoot ? path.join(cacheRoot, 'steam_cache', 'appsearch.json') : '';
}

function loadAppSearchCache() {
  if (_appSearchDisk) return _appSearchDisk;
  _appSearchDisk = new Map();
  try {
    const file = appSearchCacheFile();
    if (file && fs.existsSync(file)) {
      for (const [key, entry] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')) || {})) {
        if (entry && Array.isArray(entry.apps) && Date.now() - Number(entry.at) < APP_SEARCH_TTL_MS) _appSearchDisk.set(key, entry);
      }
    }
  } catch {
    /* A corrupt cache is equivalent to an empty cache. */
  }
  return _appSearchDisk;
}

function rememberAppSearch(key, apps) {
  const cache = loadAppSearchCache();
  cache.set(key, { at: Date.now(), apps });
  try {
    const file = appSearchCacheFile();
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    /* The in-memory copy remains usable. */
  }
}

// Manual refresh means "look again properly", so the remembered searches must not survive it.
module.exports.forgetAppSearches = () => {
  appSearchCache.clear();
  _appSearchDisk = new Map();
  try {
    const file = appSearchCacheFile();
    if (file && fs.existsSync(file)) fs.rmSync(file, { force: true });
  } catch {
    /* Best effort. */
  }
};

async function searchAppsByName(name) {
  const term = String(name || '').trim();
  if (!term) return [];
  const key = term.toLowerCase();
  if (appSearchCache.has(key)) return appSearchCache.get(key);
  const stored = loadAppSearchCache().get(key);
  if (stored) {
    appSearchCache.set(key, Promise.resolve(stored.apps));
    return stored.apps;
  }

  const pending = (async () => {
    const url = `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(term)}`;
    const data = await request.getJson(url, { timeout: 20000 });
    if (!Array.isArray(data)) return [];
    return data
      .map((app) => ({
        appid: /^[0-9]+$/.test(String(app.appid || '')) ? Number(app.appid) : app.appid,
        name: app.name,
        icon: app.icon,
        logo: app.logo,
      }))
      .filter((app) => app.appid && app.name);
  })();

  appSearchCache.set(key, pending);
  try {
    const apps = await pending;
    rememberAppSearch(key, apps);
    return apps;
  } catch (err) {
    if (debug) debug.log(`Steam app search failed for "${term}" (${err.code || err})`);
    appSearchCache.delete(key);
    return [];
  }
}

async function loadAppListBestEffort() {
  try {
    await findInAppList(753); // ensures appidListMap is loaded (Steam/Spacewar always resolves)
  } catch {
    /* list unavailable - callers can fall back to direct Steam search */
  }
}

// The raw candidate list behind findAppidByName, for callers needing a stricter rule than "best
// confident match" - the Uplay product mapping refuses anything but a single exact title.
module.exports.searchAppsByName = (name) => searchAppsByName(name);

module.exports.findAppidByName = async (name) => {
  if (!name) return null;
  await loadAppListBestEffort();

  if (appidListMap.size > 0) {
    const hit = fuzzyAppid.bestConfidentAppid(name, appidListMap.values());
    if (hit) return hit;
  }

  // GetAppList is not guaranteed to be reachable anymore and stale cached copies miss brand-new
  // releases. Fall back to Steam's lightweight app search, then apply the same confident matcher.
  const apps = await searchAppsByName(name);
  return fuzzyAppid.bestConfidentAppid(name, apps);
};

function stripIniValue(value) {
  return String(value == null ? '' : value)
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^"|"$/g, '');
}

function localizedTenokeValue(local, key, lang) {
  let item = local && local[key];
  if (!item && local) item = key.split('.').reduce((value, part) => value && value[part], local);
  if (!item || typeof item !== 'object') return '';
  const language = String(lang || 'english').toLowerCase();
  return stripIniValue(item[language] || item.english || Object.values(item).find((v) => v != null) || '');
}

// Locating a local schema means walking an entire game install (depth 6, synchronous) - 0.3-2.1s on
// a large install, blocking the renderer's event loop. Two guards keep that off the per-scan path:
// probe the handful of places emulators actually drop these files, and memoize the outcome.
//
// The memo is written to disk and read back on the next launch, since "no schema here" never expires
// on its own. A hit is revalidated by a single stat; a miss expires on the TTL, and every schema
// write calls forgetLocalSchemaLocations() so a file just created is never hidden behind one.
const LOCATE_MISS_TTL_MS = 24 * 60 * 60 * 1000;
// A walk cut short by the budget below proved nothing, so it keeps the old short-lived memo.
const LOCATE_PARTIAL_TTL_MS = 10 * 60 * 1000;
const SCHEMA_WALK_MAX_DEPTH = 6;
// A depth-6 walk of a large install visits tens of thousands of entries. The probe above already
// covers the places an emulator actually writes to, so cap the long shot rather than let one
// oversized install hold the scan.
const SCHEMA_WALK_MAX_DIRS = 4000;
const _locateCache = new Map();
let _locateCacheLoaded = false;
let _locateFlushPending = false;

function locateCacheFile() {
  return cacheRoot ? path.join(cacheRoot, 'steam_cache', 'schemaLocations.json') : '';
}

function loadLocateCache() {
  if (_locateCacheLoaded) return;
  _locateCacheLoaded = true;
  try {
    const file = locateCacheFile();
    if (!file || !fs.existsSync(file)) return;
    for (const [key, entry] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')) || {})) {
      if (entry && Number.isFinite(Number(entry.at))) _locateCache.set(key, { path: entry.path || null, at: Number(entry.at), partial: false });
    }
  } catch {
    /* A corrupt cache is equivalent to an empty cache. */
  }
}

// Coalesced: a cold scan fills this map a few hundred times in a burst, and the walks it saves are
// worth far more than writing the file each time. Losing the last entries to an abrupt exit only
// costs one more walk on the next launch.
function scheduleLocateFlush() {
  if (_locateFlushPending) return;
  _locateFlushPending = true;
  setTimeout(() => {
    _locateFlushPending = false;
    try {
      const file = locateCacheFile();
      if (!file) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const durable = [..._locateCache].filter(([, entry]) => entry && !entry.partial).map(([key, entry]) => [key, { path: entry.path, at: entry.at }]);
      fs.writeFileSync(file, JSON.stringify(Object.fromEntries(durable)));
    } catch {
      /* The in-memory copy remains usable. */
    }
  }, 1000);
}

// The directories an emulator actually drops a schema in, nearest first.
function schemaCandidateDirs(dir) {
  const dirs = [dir, path.join(dir, 'steam_settings'), path.join(dir, 'SteamData')];
  let top;
  try {
    top = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return dirs;
  }
  for (const entry of top) {
    // Unity keeps the emulator dll - and whatever it dumped beside it - under <Game>_Data/Plugins.
    if (!entry.isDirectory() || !/_Data$/i.test(entry.name)) continue;
    const plugins = path.join(dir, entry.name, 'Plugins');
    dirs.push(plugins);
    for (const arch of ['x86_64', 'x86', 'x64']) {
      dirs.push(path.join(plugins, arch));
      dirs.push(path.join(plugins, arch, 'steam_settings'));
    }
  }
  return dirs;
}

// `candidates` lets a caller probing several filenames list the install root once instead of per file.
function probeFileByName(dir, filename, candidates) {
  if (!dir) return null;
  for (const candidate of candidates || schemaCandidateDirs(dir)) {
    const full = path.join(candidate, filename);
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch {
      /* Not in this spot - try the next one. */
    }
  }
  return null;
}

// Drop remembered locations (misses included) so a schema the app just wrote, or a manual refresh,
// is picked up at once instead of waiting out LOCATE_MISS_TTL_MS.
module.exports.forgetLocalSchemaLocations = (dir) => {
  loadLocateCache();
  if (dir == null) {
    _locateCache.clear();
    scheduleLocateFlush();
    return;
  }
  const prefix = `${dir}\u0000`;
  for (const key of _locateCache.keys()) if (key.startsWith(prefix)) _locateCache.delete(key);
  scheduleLocateFlush();
};

// `probed` is the caller's own probeFileByName result, so the probe is not repeated here; pass
// `undefined` when the caller has not probed at all.
function findFileByName(dir, filename, probed) {
  if (!dir || !fs.existsSync(dir)) return null;
  loadLocateCache();
  const key = `${dir}\u0000${filename}`;
  const memo = _locateCache.get(key);
  if (memo) {
    // A remembered hit is revalidated with a single stat; a remembered miss expires, so a file that
    // appears later is still found - just not at the price of a walk on every scan in between.
    if (memo.path) {
      if (fs.existsSync(memo.path)) return memo.path;
    } else if (Date.now() - memo.at < (memo.partial ? LOCATE_PARTIAL_TTL_MS : LOCATE_MISS_TTL_MS)) {
      return null;
    }
    _locateCache.delete(key);
  }
  const wanted = filename.toLowerCase();
  let budget = SCHEMA_WALK_MAX_DIRS;
  const walk = (current, depth) => {
    if (depth > SCHEMA_WALK_MAX_DEPTH || budget-- <= 0) return null;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === wanted) return full;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const hit = walk(path.join(current, entry.name), depth + 1);
      if (hit) return hit;
    }
    return null;
  };

  const found = (probed === undefined ? probeFileByName(dir, filename) : probed) || walk(dir, 0);
  // A walk that ran out of budget did not prove anything: the file may still be deeper in. Remember
  // it only long enough to keep this scan cheap, and never persist it as a definitive answer.
  const partial = !found && budget <= 0;
  _locateCache.set(key, { path: found, at: Date.now(), partial });
  if (!partial) scheduleLocateFlush();
  return found;
}

module.exports._internal = Object.assign({}, module.exports._internal, { findFileByName });

function getTenokeSchemaFromFile(file, appid, lang = 'english') {
  let local;
  try {
    local = ini.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  const tenokeAppid = stripIniValue(local.TENOKE && local.TENOKE.id).match(/^[0-9]+/)?.[0];
  if (appid != null && tenokeAppid && String(tenokeAppid) !== String(appid)) return [];

  const prefix = 'ACHIEVEMENTS.';
  const nestedAchievements = local.ACHIEVEMENTS && typeof local.ACHIEVEMENTS === 'object' ? local.ACHIEVEMENTS : null;
  const names = nestedAchievements
    ? Object.keys(nestedAchievements).filter((name) => nestedAchievements[name] && typeof nestedAchievements[name] === 'object')
    : Object.keys(local)
        .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('.'))
        .map((key) => key.slice(prefix.length));

  return names.map((name) => {
    const base = `${prefix}${name}`;
    const entry = (nestedAchievements && nestedAchievements[name]) || local[base] || {};
    const icon = stripIniValue(entry.icon);
    const icongray = stripIniValue(entry.icon_gray || entry.icongray);
    const hidden = stripIniValue(entry.hidden) === '1' ? 1 : 0;
    const maxProgress = Number(stripIniValue(entry.progress_max || entry.max_progress || '0'));
    const achievement = {
      name,
      default_value: 0,
      displayName: localizedTenokeValue(local, `${base}.name`, lang) || name,
      hidden,
      description: localizedTenokeValue(local, `${base}.desc`, lang) || '',
      icon: icon && tenokeAppid ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${tenokeAppid}/${icon}` : '',
      icongray: icongray && tenokeAppid ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${tenokeAppid}/${icongray}` : '',
    };
    if (Number.isFinite(maxProgress) && maxProgress > 0) achievement.max_progress = maxProgress;
    return achievement;
  });
}

// A Goldberg/GBE-Fork achievements.json field can be a plain string or a localized object
// ({english, french, …}); resolve to the requested language, then English, then any value.
function pickLocalized(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value[lang] || value.english || Object.values(value).find((v) => typeof v === 'string') || '';
  return String(value);
}

// Read a Goldberg / GBE-Fork steam_settings/achievements.json (the emulator's own SCHEMA) into AW's
// schema shape - the offline schema a cracked game already ships, so brand-new titles not yet on
// SteamHunters still show real names/descriptions/icons instead of an empty list.
function getGoldbergSchemaFromFile(file, appid, lang = 'english') {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const cdn = (icon) => {
    const base = icon ? path.basename(String(icon).split('?')[0]) : '';
    return base && appid ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${appid}/${base}` : '';
  };
  return parsed
    .filter((entry) => entry && entry.name != null)
    .map((entry) => {
      const achievement = {
        name: String(entry.name),
        default_value: 0,
        displayName: pickLocalized(entry.displayName, lang) || String(entry.name),
        hidden: String(entry.hidden) === '1' || entry.hidden === 1 ? 1 : 0,
        description: pickLocalized(entry.description, lang) || '',
        icon: cdn(entry.icon),
        icongray: cdn(entry.icongray || entry.icon_gray),
      };
      const maxProgress = Number(entry?.progress?.max_progress || entry?.progress?.value?.operand1 || 0);
      if (Number.isFinite(maxProgress) && maxProgress > 0) achievement.max_progress = maxProgress;
      return achievement;
    });
}

module.exports.getLocalAchievementSchema = (gameDir, appid, lang = 'english') => {
  // Probe the known emulator locations for BOTH layouts before walking anything: tenoke.ini is rare,
  // and looking for it first without probing would force a full walk of every non-TENOKE install.
  const candidates = gameDir ? schemaCandidateDirs(gameDir) : [];
  const probedTenoke = probeFileByName(gameDir, TENOKE_SCHEMA_FILE, candidates);
  if (probedTenoke) {
    const schema = getTenokeSchemaFromFile(probedTenoke, appid, lang);
    if (schema.length > 0) return schema;
  }
  const probedGoldberg = probeFileByName(gameDir, 'achievements.json', candidates);
  if (probedGoldberg) {
    const schema = getGoldbergSchemaFromFile(probedGoldberg, appid, lang);
    if (schema.length > 0) return schema;
  }

  // Unusual layout: fall back to the walk, whose result - hit or miss - is memoized. The probes
  // above are handed down so neither is repeated.
  const tenoke = findFileByName(gameDir, TENOKE_SCHEMA_FILE, probedTenoke);
  if (tenoke) {
    const schema = getTenokeSchemaFromFile(tenoke, appid, lang);
    if (schema.length > 0) return schema;
  }
  // Fall back to the emulator's own schema dump (Goldberg / GBE Fork) - present on cracked installs.
  const goldberg = findFileByName(gameDir, 'achievements.json', probedGoldberg);
  if (goldberg) return getGoldbergSchemaFromFile(goldberg, appid, lang);
  return [];
};

// Ranked AppID candidates for a name, best first: [{ appid, name, score, tier }]. Includes fuzzy
// (typo-tolerant) matches - meant for a confirm/pick dialog, not silent auto-application.
module.exports.findAppidCandidatesByName = async (name, limit = 6) => {
  if (!name) return [];
  await loadAppListBestEffort();

  const apps = appidListMap.size > 0 ? Array.from(appidListMap.values()) : [];
  for (const app of await searchAppsByName(name)) {
    if (!apps.some((candidate) => String(candidate.appid) === String(app.appid))) apps.push(app);
  }
  if (apps.length === 0) return [];
  return fuzzyAppid.rankAppidCandidates(name, apps, { limit });
};

const cdnProviders = [
  'https://cdn.akamai.steamstatic.com/steam/apps/',
  'https://cdn.cloudflare.steamstatic.com/steam/apps/',
  'https://media.steampowered.com/steam/apps/',
  'https://steamcdn-a.akamaihd.net/steam/apps/',
  'https://shared.fastly.steamstatic.com/steam/apps/',
  'https://shared.fastly.steamstatic.com/community_assets/images/apps/',
  'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/',
  'https://steampipe.akamaized.net/steam/apps/',
  'https://google2.cdn.steampipe.steamcontent.com/steam/apps/',
  'https://steamcdn-a.akamaihd.net/steam/apps/',
  'https://media.steampowered.com/steam/apps/',
];
// A HEAD that answers 200 with a content type. Injectable so the CDN walk can be unit-tested.
async function probeUrl(url) {
  try {
    const res = await request(url, { method: 'HEAD' });
    return res.code === 200 && !!res.headers['content-type'];
  } catch {
    return false;
  }
}

async function findWorkingLink(appid, basename, probe = probeUrl) {
  const key = `${appid}:${basename}`;
  if (workingLinkCache.has(key)) return workingLinkCache.get(key);
  for (const ext of ['.jpg', '.png']) {
    for (const cdn of cdnProviders) {
      const url = `${cdn}${appid}/${basename}${ext}`;
      if (await probe(url)) {
        workingLinkCache.set(key, url);
        return url;
      }
    }
  }
  workingLinkCache.set(key, null);
  return null;
}

// Steam's library artwork moved to hashed store_item_assets directories, so product info hands out
// a token carrying one ("<hash>/library_capsule.jpg"); keeping that directory is not optional, since
// a newer appid has no flat /steam/apps/<id>/library_600x900.jpg to fall back on.
async function findWorkingAssetPath(appid, relativePath, probe = probeUrl) {
  const key = `${appid}:/${relativePath}`;
  if (workingLinkCache.has(key)) return workingLinkCache.get(key);
  for (const url of steamAssets.buildSteamAssetUrls(appid, [relativePath])) {
    if (await probe(url)) {
      workingLinkCache.set(key, url);
      return url;
    }
  }
  workingLinkCache.set(key, null);
  return null;
}

// `showHidden` is accepted for call-site compatibility but no longer gates hidden-description
// backfill: the detail view reveals hidden descriptions on click regardless of the setting, so the
// real text must always be fetched.
async function GetMissingData(data, showHidden, lang, steamSettings) {
  let updated = false;
  try {
    let updatedImgs, updatedDesc;
    if (Object.values(data.img).some((im) => !im)) {
      updated = true;
      // Local-first: a GBE/Goldberg install often ships the store's own library-asset metadata in
      // app_product_info.json. Resolve cover/header from that dump first - it still works for
      // delisted games whose store page is gone.
      if (steamSettings) {
        try {
          for (const [purpose, key] of [
            ['portrait', 'portrait'],
            ['header', 'header'],
          ]) {
            if (data.img[key]) continue;
            const local = steamAssets.resolveSteamProductAssetUrls({ appid: data.appid, configPath: steamSettings, purpose, language: lang });
            if (local.ok) data.img[key] = local.urls[0];
          }
        } catch (err) {
          debug.log(`[${data.appid}] local product-info asset lookup failed: ${err.message || err}`);
        }
      }
      if (Object.values(data.img).some((im) => !im)) {
        // Optional enrichment: an unreachable channel leaves every field on the value it already had.
        updatedImgs = (await ipcInvoke('get-steam-data', { appid: data.appid, type: 'common' })) || {};
        data.img.header = data.img.header || updatedImgs.header || 'header';
        data.img.background = data.img.background || updatedImgs.background || 'page_bg_generated_v6b';
        data.img.portrait = data.img.portrait || updatedImgs.portrait || null;
        data.img.icon = data.img.icon || updatedImgs.icon;
      }

      // Still no portrait: run the same SteamDB -> SteamGridDB chain the first fetch uses, stamped on
      // the same three-day cadence so a game with genuinely no cover costs one lookup, not one per scan.
      const PORTRAIT_RECHECK_MS = 3 * 24 * 60 * 60 * 1000;
      const portraitTriedRecently = data.portraitCheckedAt && Date.now() - data.portraitCheckedAt < PORTRAIT_RECHECK_MS;
      if (!data.img.portrait && data.name && !portraitTriedRecently) {
        data.img.portrait = await resolvePortrait({ appid: data.appid, name: data.name, portrait: null });
        data.portraitCheckedAt = Date.now(); // remember the attempt even when nothing was found
        if (data.img.portrait) debug.log(`[${data.appid}] recovered a library cover for "${data.name}"`);
      }
    }
    // Backfill blank descriptions every 3 days; key-based schemas already include hidden text.
    const DESC_RECHECK_MS = 3 * 24 * 60 * 60 * 1000;
    const triedRecently = data.descBackfilledAt && Date.now() - data.descBackfilledAt < DESC_RECHECK_MS;
    const hasBlankVisible = data.achievement.list.some((ac) => ac.hidden != 1 && (!ac.description || String(ac.description).trim() === ''));
    const hasBlankHidden = data.achievement.list.some((ac) => ac.hidden == 1 && (!ac.description || String(ac.description).trim() === ''));
    if (!triedRecently && (hasBlankVisible || hasBlankHidden)) {
      updatedDesc = await ipcInvoke('get-steam-data', { appid: data.appid, type: 'steamhunters', lang });
      // For obscure titles the supplemental lookup can return nothing, leaving `achievements`
      // undefined. Guard against it so a missing response never throws and drops the game.
      const supplemental = updatedDesc && Array.isArray(updatedDesc.achievements) ? updatedDesc.achievements : [];
      if (supplemental.length) {
        // The scraper falls back to a single space for achievements it doesn't know; drop those here
        // or a truthy-but-blank value would survive the UI fallback and block future retries.
        const map = new Map(
          supplemental.filter((item) => item.description && String(item.description).trim() !== '').map((item) => [item.name, item.description])
        );
        for (let ach of data.achievement.list) {
          // Treat a whitespace-only description (e.g. the scraper's single-space fallback baked into an
          // older cache) as blank too - otherwise `!ach.description` is false for " " and the real text
          // never replaces it, leaving the achievement stuck on the UI's "..." fallback forever.
          if ((!ach.description || String(ach.description).trim() === '') && (map.has(ach.displayName) || map.has(ach.name))) {
            ach.description = map.get(ach.displayName) || map.get(ach.name);
          }
        }
      }
      // Exophase fallback for whatever SteamHunters still left blank; unlike SteamHunters it also
      // serves the schema's own language. Matching is by displayName only, never by list position,
      // so a miss can't attach another achievement's description.
      const stillBlank = data.achievement.list.some((ac) => !ac.description || String(ac.description).trim() === '');
      if (stillBlank && data.name) {
        try {
          const exophase = require('./exophase.js');
          const langKey = lang && exophase.EXOPHASE_LANG_MAP[lang] ? lang : 'english';
          const res = await exophase.fetchExophaseAchievementsMultiLang({
            platform: 'steam',
            title: data.name,
            langKeys: [langKey],
          });
          const norm = (s) => String(s || '').trim().toLowerCase();
          const byTitle = new Map();
          for (const item of res.items) {
            const desc = item.descriptions[langKey] || item.descriptions.english;
            if (!desc || String(desc).trim() === '') continue;
            for (const title of [item.titles[langKey], item.titles.english]) {
              if (title) byTitle.set(norm(title), desc);
            }
          }
          for (const ach of data.achievement.list) {
            if (ach.description && String(ach.description).trim() !== '') continue;
            const desc = byTitle.get(norm(ach.displayName));
            if (desc) ach.description = desc;
          }
        } catch (err) {
          debug.log(`[${data.appid}] exophase description fallback failed: ${err.code || err.message || err}`);
        }
      }
      data.descBackfilledAt = Date.now(); // remember the attempt (even when nothing improved) and persist it
      updated = true;
    }
  } catch (e) {
    debug.log(e);
  }
  return updated;
}

// A schema `icon`/`icongray` URL, checked and swapped for a mirror that actually answers - new
// appids routinely have the schema URL 404 for days before the CDN catches up.
async function resolveWorkingIconUrl(appID, url, { probe = probeUrl } = {}) {
  if (!url || typeof url !== 'string') return url;
  const basenameOf = (value) => value.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '');
  // Schemas do not always store a URL: `img.header` is often bare "header.jpg", `img.portrait` a
  // hashed path, `img.icon` a naked hash. These tokens must route through the CDN walk too, or a
  // relative-path download fails and reads back as "no artwork" when the CDN has it live.
  if (!url.startsWith('http')) {
    if (path.isAbsolute(url) || fs.existsSync(url)) return url;
    const relative = url.split('?')[0];
    if (relative.includes('/')) {
      const hashed = await findWorkingAssetPath(appID, relative, probe);
      if (hashed) return hashed;
    }
    const working = await findWorkingLink(appID, basenameOf(url), probe);
    return working || url;
  }
  if (await probe(url)) return url;
  const working = await findWorkingLink(appID, basenameOf(url), probe);
  return working || url;
}
module.exports.resolveWorkingIconUrl = resolveWorkingIconUrl;

/*
  The file an icon URL is cached as. Steam puts an icon's identity in its path, so the basename is
  unique per achievement and is kept exactly as it was. Xbox serves every icon of a game from one
  `/image` path and carries the identity in the query string: taking the basename collapsed a whole
  game onto a single cache file that each download overwrote in turn, and the game screen showed 306
  empty squares. A query means the basename is not the identity, so the query is folded in.
*/
function iconCacheFilename(rawUrl) {
  const raw = String(rawUrl || '');
  const mark = raw.indexOf('?');
  const base = path.parse(mark >= 0 ? raw.slice(0, mark) : raw).base;
  if (mark < 0) return base;
  const digest = require('crypto').createHash('sha1').update(raw).digest('hex').slice(0, 16);
  return `${base || 'icon'}-${digest}`;
}
module.exports.iconCacheFilename = iconCacheFilename;

const fetchIcon = (module.exports.fetchIcon = async (url, appID) => {
  // Some games have no icon/background/portrait URL (null in the schema). Bail out instead of letting
  // `url.startsWith`/`path.parse(null)` throw - that surfaced as a noisy "Error occurred in handler
  // for 'fetch-icon': Cannot read property 'startsWith' of null" on every scan with such a game.
  if (!url || typeof url !== 'string') return null;
  // Local file paths (e.g. Uplay schemas' absolute Windows paths): new URL('C:/...') parses without
  // throwing (protocol: 'c:'), so the network branch below would stall forever on a bogus HTTP HEAD.
  if (!url.startsWith('http') && fs.existsSync(url)) return url;
  const inFlightKey = `${appID}:${url}`;
  if (iconFetchInFlight.has(inFlightKey)) return iconFetchInFlight.get(inFlightKey);
  const pending = (async () => {
  let validUrl;
  let filePath;
  try {
    const cache = path.join(userDataDir(), `steam_cache/icon/${appID}`);
    let filename = iconCacheFilename(url);
    filePath = path.join(cache, filename);
    if (fs.existsSync(filePath)) return filePath;
    let exts = ['.jpg', '.png'];
    if (!url.endsWith('.jpg') && !url.endsWith('.png'))
      for (let ext of exts) {
        filePath = path.join(cache, filename + ext);
        if (fs.existsSync(filePath)) return filePath;
      }
    //legacy url are full urls, check if they are still valid
    validUrl = await resolveWorkingIconUrl(appID, url);

    filename = iconCacheFilename(validUrl);

    filePath = path.join(cache, filename);

    if (fs.existsSync(filePath)) {
      return filePath;
    } else {
      // Only name the file when its URL carries a query: left to itself the downloader derives the
      // same basename Steam has always been cached under, and renaming those would re-fetch every
      // icon already on disk.
      const named = validUrl.includes('?') ? { filename } : {};
      return (await request.download(validUrl, cache, { validateFileSize: false, ...named })).path;
    }
  } catch (err) {
    if (err.code === 'ESIZEMISMATCH') {
      try {
        const res = await fetch(validUrl);
        if (!res.ok) return validUrl;
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        return filePath;
      } catch (e) {
        return validUrl;
      }
    }
    return url;
  }
  })();
  iconFetchInFlight.set(inFlightKey, pending);
  try {
    return await pending;
  } finally {
    iconFetchInFlight.delete(inFlightKey);
  }
});

// Exposed for unit tests: the widened legit-Steam discovery is easier to describe directly than
// through a scanLegit run that depends on the machine's registry and Steam install.
module.exports._internal = Object.assign({}, module.exports._internal, { addLocallyKnownSteamApps });
