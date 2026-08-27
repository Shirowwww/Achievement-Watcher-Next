'use strict';

const { crc32 } = require('crc');
const path = require('path');
const fs = require('fs');
const appPath = __dirname;
const { buildAchievementSchemaIndex, findAchievementInSchema } = require('./achievementSchemaIndex.js');
const { ipcInvoke } = require('../util/ipcInvoke.js');
const gog = require(path.join(appPath, 'gog.js'));
const gogOfficial = require(path.join(appPath, 'gogOfficial.js'));
const ubisoftOfficial = require(path.join(appPath, 'ubisoftOfficial.js'));
const epic = require(path.join(appPath, 'epic.js'));
const epicOfficial = require(path.join(appPath, 'epicOfficial.js'));
const ea = require(path.join(appPath, 'ea.js'));
const steam = require(path.join(appPath, 'steam.js'));
const exophase = require(path.join(appPath, 'exophase.js'));
const uplay = require(path.join(appPath, 'uplay.js'));
const rpcs3 = require(path.join(appPath, 'rpcs3.js'));
const shadps4 = require(path.join(appPath, 'shadps4.js'));
const xenia = require(path.join(appPath, 'xenia.js'));
const greenluma = require(path.join(appPath, 'greenluma.js'));
const userDir = require(path.join(appPath, 'userDir.js'));
const socialclub = require(path.join(appPath, 'socialclub.js'));
const ff7 = require(path.join(appPath, 'ff7.js'));
const xlln = require(path.join(appPath, 'xlln.js'));
const libraryDirs = require(path.join(appPath, 'libraryDirs.js'));
const saveRoots = require(path.join(appPath, 'saveRoots.js'));
const launcherDetect = require(path.join(appPath, 'launcherDetect.js'));
const blacklist = require(path.join(appPath, 'blacklist.js'));
const watchdog = require(path.join(appPath, 'watchdog.js'));
const goldberg = require(path.join(appPath, 'goldberg.js'));
const uplayR2 = require(path.join(appPath, 'uplayR2.js'));
const uplayR2Installer = require(path.join(appPath, 'uplayR2Installer.js'));
const uplayCatalogue = require(path.join(appPath, 'uplayCatalogue.js'));
const uplayAutoMap = require(path.join(appPath, 'uplayAutoMap.js'));
const gbeInstaller = require(path.join(appPath, 'gbeInstaller.js'));
const pe = require(path.join(appPath, '..', 'util', 'pe.js'));
const crackLoaderDetect = require(path.join(appPath, '..', 'util', 'crackLoaderDetect.js'));
const emulatorFixEligibility = require(path.join(appPath, '..', 'util', 'emulatorFixEligibility.js'));
const { computeFolderContentVersion } = require(path.join(appPath, '..', 'util', 'contentVersion.js'));
const steamless = require(path.join(appPath, 'steamless.js'));
const apiCheckBypass = require(path.join(appPath, 'apiCheckBypass.js'));
const crackFix = require(path.join(appPath, 'crackFix.js'));
const genEmuConfig = require(path.join(appPath, 'genEmuConfig.js'));
const gameIndex = require(path.join(appPath, 'gameIndex.js'));
const { userDataDir } = require(path.join(appPath, '..', 'util', 'userDataPath.js'));
const { resolveAchievementDataPath } = require(path.join(appPath, '..', 'util', 'achievementDataPath.js'));
const exeDetect = require(path.join(appPath, 'exeDetect.js'));
const installState = require(path.join(appPath, 'installState.js'));
const { applyLocalStatProgress } = require(path.join(appPath, 'statProgress.js'));
const scanScope = require(path.join(appPath, 'scanScope.js'));
const manualGames = require(path.join(appPath, 'manualGames.js'));
const gameNameCache = require(path.join(appPath, '..', 'util', 'gameNameCache.js'));
const perfTrace = require(path.join(appPath, '..', 'util', 'perfTrace.js'));
const dirCache = require(path.join(appPath, '..', 'util', 'dirCache.js'));
const exeCandidateCache = require(path.join(appPath, '..', 'util', 'exeCandidateCache.js'));
const dirFingerprint = require(path.join(appPath, '..', 'util', 'dirFingerprint.js'));
let debug;
let _userDataPath = null; // cache root for automatic emulator setup and downloaded tools

module.exports.initDebug = ({ isDev, userDataPath }) => {
  if (debug) {
    return;
  }
  _userDataPath = userDataPath;
  perfTrace.enable(isDev);
  exeCandidateCache.setUserDataPath(userDataPath);
  uplayR2.setUserDataPath(userDataPath);
  uplayCatalogue.initDebug({ isDev, userDataPath });
  uplayAutoMap.initDebug({ isDev, userDataPath });
  userDir.setUserDataPath(userDataPath);
  libraryDirs.setUserDataPath(userDataPath);
  manualGames.setUserDataPath(userDataPath);
  gog.initDebug({ isDev, userDataPath });
  gogOfficial.initDebug({ isDev, userDataPath });
  ubisoftOfficial.initDebug({ isDev, userDataPath });
  require(path.join(appPath, 'steamOfficial.js')).initDebug({ isDev, userDataPath });
  // Shared with the Watchdog, so it cannot require a logger of its own - see steamAppInfo.js.
  require(path.join(appPath, 'steamAppInfo.js')).initDebug({
    logger: new (require('../util/logger'))({
      console: isDev || false,
      file: path.join(userDataPath, 'logs/parser.log'),
    }),
  });
  epic.initDebug({ isDev, userDataPath });
  epicOfficial.initDebug({ isDev, userDataPath });
  ea.initDebug({ isDev, userDataPath });
  steam.initDebug({ isDev, userDataPath });
  exophase.initDebug({ isDev, userDataPath });
  uplay.initDebug({ isDev, userDataPath });
  socialclub.initDebug({ isDev, userDataPath });
  ff7.initDebug({ isDev, userDataPath });
  xlln.initDebug({ isDev, userDataPath });
  blacklist.initDebug({ isDev, userDataPath });
  debug = new (require('../util/logger'))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

function isTruthyFlag(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true';
  }
  return false;
}

// Reduce one raw save-file entry to {Achieved, CurProgress, MaxProgress?, UnlockTime}. Every local
// save format (Goldberg/GSE, RLD!, RUNE/Codex, 3DM, TENOKE, CreamAPI, UniverseLAN) funnels through
// here, hence the long key aliases - each emulator picked its own spelling for the same two facts. Pure, exported through _internal so a format's quirks can be pinned by a test.
function normalizeSaveEntry(entry, source) {
  // Does this entry carry an explicit unlocked/locked flag? Newer emu save formats (e.g. UniverseLAN
  // for GOG) write every achievement with Unlocked=true/false, so trust that flag rather than assume "present == unlocked".
  const hasExplicitState =
    entry != null &&
    typeof entry === 'object' &&
    ['Achieved', 'achieved', 'State', 'HaveAchieved', 'Unlocked', 'unlocked', 'earned'].some((k) => k in entry);

  // A non-object entry (e.g. the bare '1' some saves write) has no fields to read; guard the property access rather than special-case it in every alias chain below.
  const fields = entry != null && typeof entry === 'object' ? entry : {};

  // Leave MaxProgress unset (not defaulted to 0) when the save file has none: Object.assign at the
  // call site would otherwise stamp achievement.MaxProgress = 0 and permanently hide the schema's own max_progress (app.js reads `MaxProgress ?? max_progress`, and 0 isn't nullish, so the fallback never kicks in once a 0 is written).
  const rawMaxProgress = fields.MaxProgress || fields.max_progress;
  const parsed = {
    Achieved:
      isTruthyFlag(fields.Achieved) ||
      isTruthyFlag(fields.achieved) ||
      fields.State == 1 ||
      isTruthyFlag(fields.HaveAchieved) ||
      isTruthyFlag(fields.Unlocked) ||
      isTruthyFlag(fields.unlocked) ||
      isTruthyFlag(fields.earned) ||
      entry === '1'
        ? true
        : false,
    CurProgress: fields.CurProgress || fields.progress || 0,
    ...(rawMaxProgress ? { MaxProgress: rawMaxProgress } : {}),
    UnlockTime:
      fields.UnlockTime ||
      fields.unlocktime ||
      fields.HaveAchievedTime ||
      fields.HaveHaveAchievedTime ||
      fields.Time ||
      fields.earned_time ||
      fields.unlock_time ||
      fields.timestamp ||
      0,
  };

  //CODEX Gears5 (09/2019) && Gears tactics (05/2020): progress maxed out but the
  //Achieved flag was never written -> treat a fully completed progress bar as unlocked.
  if (!parsed.Achieved && parsed.MaxProgress != 0 && parsed.CurProgress != 0 && parsed.MaxProgress == parsed.CurProgress) {
    parsed.Achieved = true;
  }

  //RLD! writes no achieved flag: an entry carries only timestamps, and a locked achievement has
  //Time=0 - without this every achievement from such a save reads as locked. Restricted to entries with no explicit flag, so a format saying Unlocked=false is never overridden by a stray timestamp.
  if (!parsed.Achieved && !hasExplicitState && Number(parsed.UnlockTime) > 0) {
    parsed.Achieved = true;
  }

  //Legacy GOG/Epic emu saves list ONLY unlocked achievements with no explicit flag, so a bare entry
  //means "unlocked" - but formats that DO carry an explicit Unlocked=true/false (e.g. UniverseLAN) must be trusted instead of blanket-unlocking everything.
  if ((source === 'gog' || source === 'epic') && !hasExplicitState) {
    parsed.Achieved = true;
  }

  return parsed;
}

function normalizeGameName(name, appid) {
  if (typeof name === 'string') return name;
  if (name && typeof name === 'object') {
    if (typeof name.name === 'string' && name.name.trim()) return name.name;
    if (typeof name.english === 'string' && name.english.trim()) return name.english;
    const firstString = Object.values(name).find((v) => typeof v === 'string' && v.trim());
    if (firstString) return firstString;
  }
  if (typeof name === 'number') return String(name);
  return String(appid);
}

/*
  Everything the machine already knows about this appid's title, without touching the network. The
  bare appid is a legitimate LAST resort - a nameless product-info response shouldn't title a card
  "2012840" when the name sits in the schema cache, appList dump, or install folder's own name.
  Ordered most authoritative first; returns '' when nothing local knows the title.
*/
function resolveLocalGameName(appid) {
  const id = String((appid && appid.appid) || '').trim();
  const record = (appid && appid.data) || {};

  // cfg/gameIndex.json survives cache clearing and is shared with the Watchdog/menu paths; prefer its last resolved title while the disposable metadata caches rebuild.
  if (id) {
    const indexed = gameIndex.getName(id);
    if (indexed) return indexed;
  }

  // A name the discovery record itself carried (launcher manifests, manual entries, GBE configs).
  const declared = String((appid && appid.name) || '').trim();
  if (declared && declared !== id) return declared;

  if (id) {
    // Written for every game the app has ever listed, so it survives a failed lookup.
    try {
      const cached = gameNameCache.lookupSchemaCacheName(_userDataPath || userDataDir(), id);
      if (cached && cached !== id) return cached;
    } catch {
      /* cache unreadable - keep going */
    }
    // Offline appid -> name dump (cfg/steamdb.json, else the appList copy).
    try {
      const dumped = gameNameCache.lookupSteamDbName(id);
      if (dumped && dumped !== id) return dumped;
    } catch {
      /* dump missing - keep going */
    }
  }

  // Last local resort: the folder the game actually lives in - never the save folder, which is named after the appid and would just hand the appid back.
  const dir = String(record.gameDir || '').trim();
  if (dir) {
    const base = path.basename(dir);
    if (base && base !== id && !/^[0-9]+$/.test(base)) return base;
  }
  return '';
}

// The watchdog cannot derive artwork from synthetic/manual appids: persist the already-resolved scan
// assets alongside the legacy Steam icon hash so playtime cards use the same cached cascade as the library. Empty fields are ignored by gameIndex.upsert, preserving a previously good asset.
function gameIndexArtwork(game) {
  const img = (game && game.img) || {};
  const iconSource = img.icon || img.logo || '';
  let icon = '';
  if (iconSource) {
    const clean = String(iconSource).split(/[?#]/)[0].replace(/\\/g, '/');
    icon = path.basename(clean, path.extname(clean));
  }
  return {
    icon,
    iconUrl: iconSource,
    headerUrl: img.background || img.header || img.landscape || '',
    portraitUrl: img.portrait || img.header || img.landscape || '',
  };
}

function cloneDiscoveryRecord(record) {
  if (!record || record.appid == null) return null;
  const copy = { ...record };
  if (record.data && typeof record.data === 'object') copy.data = { ...record.data };
  delete copy._sources;
  return copy;
}

function sourceKey(record) {
  const data = (record && record.data) || {};
  return [
    String(record && record.appid),
    String(record && record.source),
    String(data.type || ''),
    String(data.path || ''),
    String(data.root || ''),
    String(data.gameDir || ''),
    String(data.steamSettings || ''),
  ].join('\n');
}

function mergeDiscoveryData(target, incoming) {
  if (!incoming || typeof incoming !== 'object') return target || incoming;
  const data = target && typeof target === 'object' ? target : {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null || value === '') continue;
    if (key === 'needsSchema' || key === 'trustedInstalled' || key === 'hasSteamApiDll' || key === 'uplayR2') {
      data[key] = !!data[key] || !!value;
    } else if (data[key] == null || data[key] === '') {
      data[key] = value;
    }
  }
  return data;
}

function mergeDiscoveryRecord(target, incoming) {
  if (!target || !incoming) return target || incoming;

  if (!Array.isArray(target._sources)) target._sources = [cloneDiscoveryRecord(target)];
  const seen = new Set(target._sources.map(sourceKey));
  const incomingSources = Array.isArray(incoming._sources) && incoming._sources.length > 0 ? incoming._sources : [incoming];
  for (const rawSource of incomingSources) {
    const source = cloneDiscoveryRecord(rawSource);
    if (!source) continue;
    const key = sourceKey(source);
    if (!seen.has(key)) {
      target._sources.push(source);
      seen.add(key);
    }
  }

  if (!target.name && incoming.name) target.name = incoming.name;
  if (!target.source && incoming.source) target.source = incoming.source;
  if (!target.steamappid && incoming.steamappid) target.steamappid = incoming.steamappid;
  target.data = mergeDiscoveryData(target.data || {}, incoming.data || {});
  if (incoming.name && incoming.data && incoming.data.gameDir && !target.name) target.name = incoming.name;
  return target;
}

function consolidateDiscoveryList(list) {
  const byAppid = new Map();
  const order = [];
  for (const raw of list || []) {
    const record = cloneDiscoveryRecord(raw);
    if (!record || record.appid == null) continue;
    const key = String(record.appid);
    if (!byAppid.has(key)) {
      record._sources = [cloneDiscoveryRecord(record)];
      byAppid.set(key, record);
      order.push(key);
      continue;
    }
    byAppid.set(key, mergeDiscoveryRecord(byAppid.get(key), record));
  }
  const result = order.map((key) => byAppid.get(key)).filter(Boolean);
  const before = (list || []).length;
  if (debug && before !== result.length) debug.log(`[discover] consolidated ${before} source entr${before === 1 ? 'y' : 'ies'} into ${result.length} game(s)`);
  return result;
}

// Merge duplicate Ubisoft/Steam records without doing network work.
function mergeCrossSourceDuplicates(appidList) {
  const byAppid = new Map((appidList || []).map((g) => [String(g.appid), g]));
  const drop = new Set();
  const gameNameCache = require(path.join(appPath, '..', 'util', 'gameNameCache.js'));
  // Looks in every cached language, not just english - the app writes only the user's own, so an
  // english-only lookup found nothing on a non-English profile and the dedupe below never ran.
  const cachedSteamName = (appid) => gameNameCache.lookupSchemaCacheName(userDataDir(), appid);
  // Use named numeric appids as Steam targets; fill missing names from local caches.
  const steamTargets = (appidList || [])
    .filter((g) => /^\d+$/.test(String(g.appid)))
    .map((g) => ({
      appid: g.appid,
      name: g.name || cachedSteamName(String(g.appid)) || gameNameCache.lookupSteamDbName(String(g.appid)) || '',
    }))
    .filter((t) => t.name);
  const merged = [];
  for (const g of appidList || []) {
    if (drop.has(String(g.appid))) continue;
    const isUbisoft = g && g.data && (g.data.type === 'ubisoftOfficial' || g.data.type === 'uplay') && g.data.uplayId;
    if (isUbisoft) {
      try {
        const mapping = uplayR2.resolveSteamMapping({ appid: `UPLAY${g.data.uplayId}` });
        const target = mapping && byAppid.get(String(mapping.steam_appid));
        if (target && target !== g) {
          mergeDiscoveryRecord(target, g);
          debug && debug.log(`[merge] ${g.appid} (${g.source}) merged into Steam ${mapping.steam_appid}`);
          continue;
        }
      } catch {
        /* no mapping - keep both entries */
      }
    }
    // Drop a save-only Steam phantom when a matching GOG install exists.
    if (g && g.data && g.data.type === 'gogOfficial' && g.data.title) {
      try {
        const hit = require('../util/fuzzyAppid.js').bestConfidentAppid(String(g.data.title), steamTargets);
        const target = hit && byAppid.get(String(hit));
        if (target && target !== g && target.data && target.data.type === 'file' && !target.data.gameDir && !target.data.exe) {
          drop.add(String(target.appid));
          debug && debug.log(`[merge] ${g.appid} (${g.source}) deduped phantom Steam ${target.appid} (${g.data.title})`);
        }
      } catch {
        /* no confident match - keep both entries */
      }
    }
    merged.push(g);
  }
  // `drop` is filled while walking the list, so the skip at the top of the loop only catches entries
  // not visited yet: a phantom listed BEFORE the GOG install that supersedes it was already pushed and
  // survived. Discovery order is not stable, so filtering only at the end (not inline) keeps the
  // result from depending on the order records happen to arrive in.
  return drop.size > 0 ? merged.filter((g) => !drop.has(String(g.appid))) : merged;
}

function buildDiscoveryLookup(list) {
  const firstByAppid = new Map();
  const recordsByAppid = new Map();
  for (const record of Array.isArray(list) ? list : []) {
    if (!record) continue;
    const key = String(record.appid);
    if (!firstByAppid.has(key)) firstByAppid.set(key, record);
    let records = recordsByAppid.get(key);
    if (!records) {
      records = [];
      recordsByAppid.set(key, records);
    }
    records.push(record);
  }
  return { firstByAppid, recordsByAppid };
}

function getDiscoverySources(record, cachedList, lookup) {
  if (record && Array.isArray(record._sources) && record._sources.length > 0) return record._sources.map(cloneDiscoveryRecord).filter(Boolean);
  if (record && !record.data && cachedList) {
    const matches = lookup ? lookup.recordsByAppid.get(String(record.appid)) || [] : cachedList.filter((a) => String(a.appid) === String(record.appid));
    if (matches.length > 0) {
      return matches.flatMap((match) => (Array.isArray(match._sources) ? match._sources : [match])).map(cloneDiscoveryRecord).filter(Boolean);
    }
  }
  return [cloneDiscoveryRecord(record)].filter(Boolean);
}

/*
  Drop records that describe a game Steam has installed, unless official Steam games are shown. An
  emulator save folder under %APPDATA% is a source of its own, so skipping just the install folder is
  not enough - a leftover save would still list the game with no install folder attached. A separate
  cracked copy, or a Steam install cracked in place, is left alone (isOfficialLauncherInstall answers
  false for the latter); a manifest whose folder is gone proves nothing now, so that record stays too.
*/
async function dropSteamOwnedRecords(data, showLegitSteam) {
  if (showLegitSteam) return data;
  let installs;
  try {
    installs = await steam.scanLocalInstalls();
  } catch (err) {
    debug.log(`[steam] could not read local installs, keeping every record => ${err}`);
    return data;
  }
  if (!installs || installs.size === 0) return data;

  const dropped = new Map();
  const kept = data.filter((record) => {
    const owned = installs.get(String(record && record.appid));
    if (!owned || !owned.gameDir || !fs.existsSync(owned.gameDir)) return true;
    const gameDir = (record.data && record.data.gameDir) || null;
    if (gameDir && !isPathWithin(gameDir, owned.gameDir)) return true; // a cracked copy of its own
    if (gameDir && !launcherDetect.isOfficialLauncherInstall(gameDir)) return true; // cracked in place
    dropped.set(String(record.appid), owned.name || owned.gameDir);
    return false;
  });
  for (const [appid, name] of dropped) {
    debug.log(`[steam] "${name}" (${appid}) is installed by Steam - hidden because official Steam games are disabled`);
  }
  return kept;
}

function isPathWithin(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// Collect the roots shown in Settings; Smart Find persists automatic detections there first, so a scan never reaches into an invisible Desktop or drive location.
async function goldbergScanRoots(scope = _activeScanScope) {
  const roots = [];
  const add = (p) => {
    if (p && !roots.some((r) => r.toLowerCase() === String(p).toLowerCase())) roots.push(p);
  };
  if (scope) {
    // Keep a selective rescan limited to its requested roots.
    for (const dir of scope.libraryDirs || []) add(dir);
    for (const dir of scope.userDirs || []) add(dir);
    return roots;
  }
  try {
    for (const dir of await libraryDirs.get()) add(dir);
  } catch (err) {
    debug.log(`[goldberg-scan] could not read library folders: ${err}`);
  }
  try {
    for (const dir of await userDir.get()) add(dir.path);
  } catch (err) {
    debug.log(`[goldberg-scan] could not read user folders: ${err}`);
  }
  return roots;
}

// Index direct child folders so name-only installs can resolve their game directory.
let _folderIndex = null;
// Concurrent workers must share one folder-index build instead of each walking the same roots.
let _folderIndexPromise = null;
// Do not let name matching steal folders already linked by an authoritative appid.
let _claimedDirs = new Set();
// Keep the active scope with the folder index so later matching stays selective.
let _activeScanScope = null;

// Cache discovery walks briefly; unlock state is always read fresh.
let _discoverCache = null; // { key, time, appidList, folderIndex, claimedDirs }
const DISCOVER_TTL_MS = 60000;
// Timestamps of the folders the last full discovery walked, so the background poll can tell nothing on disk moved without walking them again.
let _discoverFingerprint = null;
const GAME_LOAD_TIMEOUT_MS = 30000;

async function buildDiscoverCacheKey(option) {
  try {
    return JSON.stringify({
      src: option.achievement_source,
      main: option.steam.main,
      udirs: (await userDir.get()).map((d) => d.path),
      ldirs: await libraryDirs.get(),
      manual: manualGames.list().map((entry) => [entry.id, entry.title, entry.exe, entry.platform, entry.storeAppId]),
      bl: await blacklist.get(),
      scope: scanScope.cacheValue(scanScope.normalizeScanScope(option.scanScope)),
    });
  } catch {
    return null;
  }
}

async function discoverWithCache(option, steamAccFilter) {
  const activeScope = scanScope.normalizeScanScope(option.scanScope);
  const cacheKey = await buildDiscoverCacheKey(option);
  if (cacheKey && _discoverCache && _discoverCache.key === cacheKey && Date.now() - _discoverCache.time < DISCOVER_TTL_MS) {
    _activeScanScope = activeScope;
    _folderIndex = _discoverCache.folderIndex;
    _folderIndexPromise = null;
    _claimedDirs = _discoverCache.claimedDirs;
    debug.log(`[discover] reusing cached scan (${((Date.now() - _discoverCache.time) / 1000).toFixed(1)}s old)`);
    return _discoverCache.appidList;
  }
  _activeScanScope = activeScope;
  _folderIndex = null;
  _folderIndexPromise = null;
  _claimedDirs = new Set();
  const discoverStarted = Date.now();
  perfTrace.reset('discover:');
  const appidList = await discover(option.achievement_source, steamAccFilter, activeScope);
  exeCandidateCache.flush();
  // Only a full scan is a usable baseline for the background poll; a scoped one looked at a subset.
  _discoverFingerprint = activeScope ? null : dirFingerprint.capture(dirCache.lastVisitedDirs());
  if (perfTrace.isEnabled()) debug.log(`[perf] discover ${Date.now() - discoverStarted}ms - ${perfTrace.summary({ prefix: 'discover:' })}`);
  if (cacheKey) _discoverCache = { key: cacheKey, time: Date.now(), appidList, folderIndex: _folderIndex, claimedDirs: _claimedDirs };
  return appidList;
}

// Track background emulator fixes so repeated scans do not launch the same fix twice.
let _emuFixInFlight = new Set();

// Same idea for the SteamDB launch-metadata lookup: it runs detached from the game load, so a second scan starting while the first fetches must not queue the same page again.
const _steamDbLaunchInFlight = new Set();

/*
  A library entry for a game whose metadata lookup failed or timed out. Discovery found real
  achievement data on disk - that's what makes the game exist; the Steam lookup only decorates it
  with a title and artwork, so a failed lookup must never remove it. Name/artwork here are all
  local/free (existing caches, appid-derived URLs). `provisional` marks it "known to exist, not yet described" - never cached, so the next scan replaces it once the lookup succeeds.
*/
function buildProvisionalGame(appid) {
  if (!appid || !appid.appid) return null;
  const id = String(appid.appid);
  const record = (appid && appid.data) || {};
  // Only for entries backed by something on disk; a record with no achievement data and no install folder is exactly the phantom cache import the keep-filter below exists to drop.
  const dataPath = resolveAchievementDataPath(record);
  const gameDir = record.gameDir || '';
  if (!dataPath && !gameDir) return null;

  const name = resolveLocalGameName(appid);
  // Steam's CDN builds these from the appid, so a numeric appid still gets its real artwork even under a numeric title.
  const img = /^[0-9]+$/.test(id)
    ? {
        header: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`,
        background: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/page_bg_generated_v6b.jpg`,
        portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
        icon: '',
      }
    : { header: '', background: '', portrait: '', icon: '' };

  /*
    A Ubisoft product with no Steam release has no Steam CDN to borrow from, so its card would be a blank rectangle - Ubisoft publishes boxart for it, on its own CDN, under this very id.
  */
  const productId = String(record.uplayId || '') || (id.startsWith('uplay-') ? id.slice('uplay-'.length) : '');
  if (!img.portrait && /^[0-9]+$/.test(productId)) {
    const official = uplayCatalogue.artworkFor(productId);
    if (official) {
      img.portrait = official.cover || img.portrait;
      img.background = official.background || img.background;
    }
  }

  return {
    appid: appid.appid,
    name: name || id,
    nameUnresolved: !name,
    source: appid.source || '',
    gameDir: gameDir || undefined,
    dataPath: dataPath || undefined,
    provisional: true,
    img,
    achievement: { total: 0, unlocked: 0, list: [] },
  };
}

/*
  Fetch a game's main executable from SteamDB and hand it to `apply`, off the critical path. The
  lookup goes through the main process's stealth browser (SteamDB 403s plain requests) and is
  serialized there, costing seconds per game. It only decorates the watchdog's gameIndex - the library entry doesn't depend on it - so it must never be awaited by a game load.
*/
function seedPlaytimeFromSteamDb(appid, apply) {
  const id = String(appid || '');
  if (!id || _steamDbLaunchInFlight.has(id)) return;
  _steamDbLaunchInFlight.add(id);
  (async () => {
    try {
      const meta = await ipcInvoke('get-steamdb-launch', id);
      if (meta && meta.best_process_name) apply(meta.best_process_name);
    } catch (err) {
      debug.log(`[${id}] SteamDB launch fallback failed: ${err.message || err}`);
    } finally {
      _steamDbLaunchInFlight.delete(id);
    }
  })();
}

/*
  An empty achievement file is a stable fact (game never played), re-read every scan; logged
  unconditionally it would dominate parser.log with repeats for the same handful of games, burying
  what actually changed. Reported once per file per session - the next launch reports it again, so nothing stays permanently hidden.
*/
const _emptyAchievementFilesWarned = new Set();

function warnEmptyAchievementFileOnce(appid, filePath) {
  const key = String(filePath || appid);
  if (_emptyAchievementFilesWarned.has(key)) return;
  _emptyAchievementFilesWarned.add(key);
  debug.warn(`[${appid}] Warning ! Achievement file in '${filePath}' is probably empty`);
}

// Record failed fixes and retry after a content change or cooldown.
let _emuSetupAttempts = new Map();
const EMU_SETUP_RETRY_MS = 6 * 60 * 60 * 1000;

// Cache emulator detection for the current scan; the filesystem is stable during it.
let _emuCache = new Map();
let _seededGameDirs = new Set();

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/*
  A repaired Uplay R1/R2 game is told to write its unlocks to GSE Saves\<steamAppid>, so discovery
  finds it through the Steam-emulator walker and the record reaches here with no Uplay marking at
  all. Everything Uplay-specific downstream is gated on that marking (objective-id remap turning the
  emulator's numeric keys back into Steam api-names, the self-heal after a repack update, the uplayId
  the Watchdog needs for a live unlock) - so all three were silently skipped and the game showed 0
  unlocked forever (seen on AC Origins: 67 saved achievements "not found in the game schema").

  Marks the record in place; safe to call for every game. Ordered cheapest-first: in-memory catalogue lookup, then one readdir, only then the recursive evidence walk.
*/
function promoteUplayRecord(appid, game, gameDir) {
  if (!gameDir || !appid || !appid.data) return false;
  if (appid.data.uplayR2 || appid.data.type === 'ubisoftOfficial' || appid.data.type === 'lumaplay') return false;
  try {
    if (!uplayR2.looksLikeUplayInstall(gameDir)) return false;
    const mapping = uplayR2.resolveSteamMapping({ name: game.name, gameDir });
    // The name match must land on THIS game: a fuzzy hit on a different Ubisoft title would attach the wrong product id, and the product id is what every save folder is named after.
    const catalogued = mapping && String(mapping.steam_appid) === String(appid.appid) ? String(mapping.uplay_id) : '';
    /*
      What the install itself says - the only answer for a game no shipped table lists, and the better answer when the two disagree, since the shipped row can be stale or name a different regional SKU while the loader log is this copy's own startup value.
    */
    const declared = uplayR2.readInstalledProductId(gameDir);
    const uplayId = declared || catalogued;
    if (!uplayId) return false;
    if (!uplayR2.hasEmulatorEvidence(gameDir)) return false;
    appid.data.uplayR2 = true;
    if (!appid.data.uplayId) appid.data.uplayId = uplayId;
    game.uplayR2 = true;
    game.system = 'uplay';
    // Remember it, so the synchronous lookups (Game Health, repair, the Watchdog's index) agree with
    // the scan instead of re-deriving - and so a game absent from the table stays resolved.
    if (!catalogued && /^[0-9]+$/.test(String(appid.appid))) {
      try {
        uplayR2.saveSteamMappingOverride({ gameDir, uplayId, steamAppid: String(appid.appid), steamName: game.name || '' });
      } catch (err) {
        debug.log(`[${appid.appid}] could not persist the learned Uplay mapping => ${err}`);
      }
    }
    debug.log(`[${appid.appid}] promoted to a Uplay record: emulator evidence in ${gameDir} (product ${uplayId})`);
    return true;
  } catch (err) {
    debug.log(`[${appid.appid}] Uplay promotion check failed => ${err}`);
    return false;
  }
}

/*
  Take back the settings folder AW Next left in a game it does not serve.

  Writing GSE configs beside a crack loader that supplies its own Steam emulation produced files that
  emulator never reads, and an empty achievement list among them then read as a fault against the
  game. Nothing writes them any more, but the ones already on disk stay wrong until they are gone.

  Removed only when EVERY entry in the folder is one AW Next itself wrote and none of it holds
  anything: a real achievement list, a user's own file, or an unknown entry means the folder is left
  exactly as it is. No backup is taken because there is provably nothing to restore.
*/
const AW_WRITTEN_SETTINGS = new Set(['achievements.json', 'configs.app.ini', 'configs.main.ini', 'configs.user.ini', 'images']);

function isEmptyAchievementList(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) return parsed.length === 0;
    return !!parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0;
  } catch {
    return false; // unreadable is not provably empty
  }
}

/*
  Sections and keys AW Next writes into a GSE config, and nothing else. goldberg.js UPSERTS into
  these files rather than owning them, so a config can carry somebody else's settings too - and one
  foreign key means the file is not ours to remove. configs.app.ini states its authorship in a
  comment; the other two are recognised by their contents.
*/
const AW_CONFIG_SECTIONS = new Set(['main::general', 'main::stats', 'user::general', 'app::dlcs']);
const AW_CONFIG_KEYS = new Set([
  'new_app_ticket',
  'gc_token',
  'stat_achievement_progress_functionality',
  'save_only_higher_stat_achievement_progress',
  'account_name',
  'language',
  'unlock_all',
]);

function isOwnEmulatorConfig(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  if (text.includes('Managed by AW Next')) return true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      if (!AW_CONFIG_SECTIONS.has(section[1].trim().toLowerCase())) return false;
      continue;
    }
    const key = line.match(/^([^=]+)=/);
    if (!key || !AW_CONFIG_KEYS.has(key[1].trim().toLowerCase())) return false;
  }
  return true;
}

function removeInertGoldbergSettings(steamSettings, appidLabel, loaderName) {
  let entries;
  try {
    entries = fs.readdirSync(steamSettings, { withFileTypes: true });
  } catch {
    return false; // nothing there, or not ours to read
  }
  if (entries.length === 0) return false;

  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (!AW_WRITTEN_SETTINGS.has(name)) return false;
    const full = path.join(steamSettings, entry.name);
    if (entry.isDirectory()) {
      // The only folder AW Next writes here is images/, and only an empty one carries nothing.
      try {
        if (name !== 'images' || fs.readdirSync(full).length > 0) return false;
      } catch {
        return false;
      }
      continue;
    }
    if (name === 'achievements.json' && !isEmptyAchievementList(full)) return false;
    if (name.startsWith('configs.') && !isOwnEmulatorConfig(full)) return false;
  }

  try {
    fs.rmSync(steamSettings, { recursive: true, force: true });
    debug.log(`[${appidLabel}] removed the inert steam_settings folder: ${loaderName} serves this game and never reads it`);
    return true;
  } catch (err) {
    debug.log(`[${appidLabel}] could not remove the inert steam_settings folder => ${err}`);
    return false;
  }
}

// Read Uplay R2 saves and remap Ubisoft objective ids to Steam api-names.
function readUplayR2Save(appid, game) {
  const data = (appid && appid.data) || {};
  const list = (game && game.achievement && Array.isArray(game.achievement.list) && game.achievement.list) || [];
  const apiNames = list.map((a) => a && a.name).filter(Boolean);
  const gameDir = data.gameDir || '';
  // A repack may place the loader below the install root.
  const loader = gameDir ? (uplayR2.detectEmulator(gameDir).dll || [])[0] : '';

  const dirs = uplayR2.resolveAchievementSaveDirs({
    gameDir,
    runtimeDir: loader ? path.dirname(loader) : gameDir,
    uplayId: data.uplayId,
    steamAppid: appid.appid,
  });
  // Always try the folder that produced this game record.
  if (data.path && !dirs.includes(data.path)) dirs.unshift(data.path);

  const save = uplayR2.readAchievementSave(dirs);
  if (!save) {
    debug.log(`[${appid.appid}] no Uplay R2 save found in: ${dirs.join(', ') || '(none)'}`);
    return {};
  }

  // The keying is also the proof that objective ids may be compared numerically, so a save the loader
  // keyed "<prefix>1" still reads back onto an api-name spelled "<prefix>001".
  const keying = uplayR2.resolveObjectiveKeying({ achievementList: list, uplayId: data.uplayId });
  const prefix = (keying || {}).prefix || '';
  const mapped = uplayR2.mapSaveToSchemaKeys(save.entries, {
    prefix,
    apiNames,
    canonical: !!keying,
    objectiveIds: keying && keying.origin === 'ubisoft-archive' ? keying.objectiveIds : null,
  });
  const found = Object.keys(mapped).length;
  const total = Object.keys(save.entries).length;
  debug.log(`[${appid.appid}] Uplay R2 save '${save.file}': matched ${found}/${total} entr${total === 1 ? 'y' : 'ies'} to the Steam schema`);
  if (found === 0 && total > 0) {
    debug.warn(`[${appid.appid}] Uplay R2 save keys do not match this game's Steam api-names - re-apply the Uplay R2 fix to regenerate achievements_schema.json`);
  }
  return mapped;
}

function isPspcGame(gameDir) {
  try {
    for (const f of fs.readdirSync(gameDir)) {
      if (/^PlayStationSdk\.dll$/i.test(f) || /^PsPcSdk.*\.(dll|exe|msi)$/i.test(f) || /pspc_sdk_runtime/i.test(f)) return true;
    }
  } catch {
    /* unreadable folder - treat as non-PSPC */
  }
  return false;
}

function crackFixNameCandidates({ gameDir, gameName, detectedExe } = {}) {
  const names = [];
  const add = (value) => {
    const name = String(value || '').trim();
    if (!name || name.length < 3 || names.some((existing) => existing.toLowerCase() === name.toLowerCase())) return;
    names.push(name);
  };
  add(gameName);
  add(path.basename(gameDir || ''));
  add(path.basename((detectedExe && (detectedExe.full || detectedExe.name)) || '').replace(/\.exe$/i, ''));
  return names;
}

async function tryApplyCrackFix({ gameDir, gameName, appid, detectedExe, proxyFallback = true }) {
  try {
    const arch = (detectedExe && detectedExe.full && pe.exeArch(detectedExe.full)) || null;
    const gameNames = crackFixNameCandidates({ gameDir, gameName, detectedExe });
    const cf = await crackFix.applyBestFix({
      cacheDir: path.join(_userDataPath, 'cache/crackfiles'),
      gameName: gameName || '',
      gameNames,
      gameDir,
      arch,
      proxyFallback,
      log: debug,
    });
    if (cf && cf.applied) {
      debug.log(
        `[${appid}] CrakFiles: applied "${cf.entry && cf.entry.name}" via "${cf.matchedName || gameName}" (${cf.fix && cf.fix.filename}, ${(cf.files || []).length} file(s)) - installing GBE DLL on top`
      );
      return true;
    }
    if (cf && cf.skipped && cf.reason === 'already-applied') {
      debug.log(`[${appid}] CrakFiles: "${cf.entry && cf.entry.name}" already applied via "${cf.matchedName || gameName}" - skipping Steamless, installing GBE DLL on top`);
      return true;
    }
    debug.log(`[${appid}] CrakFiles auto-apply did nothing (${cf && cf.reason})`);
    return false;
  } catch (e) {
    debug.log(`[${appid}] CrakFiles auto-apply failed => ${e}`);
    return false;
  }
}

// Called when a background emulator setup finishes successfully.
let _onEmulatorFixed = null;
module.exports.setEmulatorFixedHandler = (fn) => {
  _onEmulatorFixed = typeof fn === 'function' ? fn : null;
};

/*
  Somebody who only switched the automatic emulator repair on is not doing anything they would
  connect to a virus alert: the repair downloads a Steam emulator, nearly every antivirus engine
  flags one, and the alert then arrives out of nowhere while the repair fails silently in a log.

  So the window gets told. The renderer installs the handler; the Watchdog leaves it unset and the
  failure stays in the log, which is right for a process with no window to show it in.
*/
let emulatorPackageBlockedHandler = null;

function onEmulatorPackageBlocked(handler) {
  emulatorPackageBlockedHandler = typeof handler === 'function' ? handler : null;
}

function reportEmulatorPackageBlocked(err) {
  if (!err || err.code !== 'GBE_DOWNLOAD_BLOCKED' || !emulatorPackageBlockedHandler) return;
  try {
    emulatorPackageBlockedHandler(err);
  } catch (handlerErr) {
    debug.log(`could not report the blocked emulator package => ${handlerErr}`);
  }
}

module.exports.onEmulatorPackageBlocked = onEmulatorPackageBlocked;

module.exports.autoApplyEmulatorFix = autoApplyEmulatorFix;
async function autoApplyEmulatorFix({ gameDir, gameName, appid, steamSettings, option, detectedEmu = null, detectedExe = null, skipAdvanced = false, schema = null, requireGameExecutable = false, onlyIfUnconfigured = false } = {}) {
  if (!gameDir || !_userDataPath) throw new Error('game folder/user data path unavailable');
  if (onlyIfUnconfigured) {
    const eligibility = emulatorFixEligibility.inspect({ gameDir });
    if (!eligibility.eligible) {
      const existing = eligibility.existingFix ? ` (${eligibility.existingFix.name})` : '';
      debug.log(`[${appid}] automatic emulator fix skipped - ${eligibility.reason}${existing} in ${gameDir}`);
      return { skipped: true, reason: eligibility.reason, tag: '', steamSettingsDirs: [], eligibility };
    }
  }
  const cfg = option.emulator || {};
  detectedEmu = detectedEmu || goldberg.detectEmulator(gameDir);
  detectedExe = detectedExe || exeDetect.detect(gameDir, gameName || '', { dllPaths: detectedEmu.dll });
  const gameExePresent = () => !!(detectedExe && detectedExe.full && fs.existsSync(detectedExe.full));
  if (requireGameExecutable && !gameExePresent()) {
    debug.log(`[${appid}] automatic emulator fix skipped - no game executable found in ${gameDir}`);
    return { skipped: true, reason: 'no-game-executable', tag: '', steamSettingsDirs: [], emulator: detectedEmu };
  }
  // Apply a confident CrakFiles fix first; it is opt-in, backed up, and idempotent.
  const pspc = isPspcGame(gameDir);
  if (pspc) debug.log(`[${appid}] PlayStation-PSPC game detected - applying Goldberg/GBE anyway, plus trying a community crack; note PSN trophies never reach the Steam API, so live tracking needs a RUNE release`);
  let crackApplied = false;
  if (cfg.autoApplyCrackFix !== false) {
    crackApplied = await tryApplyCrackFix({ gameDir, gameName, appid, detectedExe, proxyFallback: cfg.pixeldrainProxyFallback !== false });
    if (crackApplied) {
      detectedEmu = goldberg.detectEmulator(gameDir);
      detectedExe = exeDetect.detect(gameDir, gameName || '', { dllPaths: detectedEmu.dll }) || detectedExe;
    } else if (pspc) {
      debug.log(`[${appid}] PSPC: no confident community crack for "${gameName}" - install a RUNE release; AW tracks it via %PUBLIC%\\Documents\\Steam\\RUNE`);
    }
  }

  // STEP 2 - SteamStub DRM. AW applies the emulator the SteamAutoCrack way: strip the stub with
  // Steamless so the plain GBE steam_api DLL loads, then replace the DLL below. There is no ColdClient
  // fallback - if Steamless can't strip a detected stub the DLL is still installed (the game may fail
  // to launch, the same tradeoff SteamAutoCrack makes).
  const hasSteamStub = !crackApplied && !!(detectedExe && detectedExe.full && pe.detectSteamStub(detectedExe.full));
  const shouldRunSteamless = !crackApplied && !!(detectedExe && detectedExe.full && (cfg.steamlessAutoUnpack || hasSteamStub));
  if (shouldRunSteamless) {
    let stripped = false;
    let reason = '';
    try {
      const cli = await steamless.ensureSteamless({ cacheDir: path.join(_userDataPath, 'cache/steamless'), log: debug });
      const r = await steamless.stripDrm({ steamless: cli, exePath: detectedExe.full, experimental: !!cfg.steamlessExperimental, log: debug });
      stripped = !!(r && r.stripped);
      reason = (r && r.reason) || '';
      const prefix = hasSteamStub ? 'SteamStub' : 'Steamless';
      debug.log(`[${appid}] ${prefix}: Steamless ${stripped ? 'stripped the exe; using the plain DLL' : `did not strip (${reason})`}`);
    } catch (e) {
      reason = e.message || String(e);
      debug.log(`[${appid}] SteamStub: Steamless failed => ${e}`);
    }
    if (hasSteamStub && !stripped) {
      debug.log(`[${appid}] SteamStub: not stripped (${reason || 'unknown'}); installing the plain DLL anyway - the game may fail to launch`);
    }
  }

  const cacheDir = path.join(_userDataPath, 'cache/gse_fork');
  // Automatic discovery must never force a full release download for every new game. The cache
  // helper already performs the configured daily update check; `force` is reserved for the explicit
  // right-click action. Forcing here could leave the final worker stuck at 98% on a large .7z.
  const dlls = await gbeInstaller.ensureEmulatorDlls({ cacheDir, force: false, log: debug });
  const steamSettingsDirs = [];
  const wantedArch = (detectedExe && detectedExe.full ? pe.exeArch(detectedExe.full) : 'x64') || 'x64';
  const runtimeDllDirs = gbeInstaller.runtimeDllDirs({
    gameDir,
    dllPaths: detectedEmu.dll,
    exePath: detectedExe && detectedExe.full,
    steamSettings,
    fallbackDir: gameDir,
  });
  const runtimeDirKeys = new Set(runtimeDllDirs.map((dir) => path.resolve(dir).toLowerCase()));

  // Official GSE setup requires steam_interfaces.txt generated from the ORIGINAL game DLL. Do this
  // before replacement; generateInterfaces also prefers AW's one-time .bak on repeat/manual repairs.
  const interfaceDlls = detectedEmu.dll.filter(
    (file) => /^steam_api(64)?\.dll$/i.test(path.basename(file)) && runtimeDirKeys.has(path.resolve(path.dirname(file)).toLowerCase())
  );
  for (const dllPath of interfaceDlls) {
    const dest = path.join(path.dirname(dllPath), 'steam_settings');
    const interfaces = await gbeInstaller.generateInterfaces({ dllPath, steamSettings: dest, dlls, log: debug });
    if (!interfaces.generated) debug.log(`[${appid}] steam_interfaces.txt skipped (${interfaces.reason})`);
  }

  // Standalone (replace steam_api dll): the only emulator-apply path.
  const fallbackDllDir =
    steamSettings && path.basename(steamSettings).toLowerCase() === 'steam_settings'
      ? path.dirname(steamSettings)
      : gameDir;
  const dllDirs = runtimeDllDirs.length > 0 ? runtimeDllDirs : [fallbackDllDir];
  const wantedFile = gbeInstaller.ARCH[wantedArch] && gbeInstaller.ARCH[wantedArch].file;
  const hasWantedDll =
    wantedFile &&
    detectedEmu.dll.some(
      (file) => path.basename(file).toLowerCase() === wantedFile && runtimeDirKeys.has(path.resolve(path.dirname(file)).toLowerCase())
    );
  if (requireGameExecutable && !gameExePresent()) {
    debug.log(`[${appid}] automatic emulator fix cancelled - game executable disappeared from ${gameDir}`);
    return { skipped: true, reason: 'game-executable-gone', tag: '', steamSettingsDirs: [], emulator: detectedEmu };
  }
  gbeInstaller.installDlls({ dllDirs, dlls, writeIfMissing: wantedArch, log: debug });
  if (wantedArch && wantedFile && detectedEmu.dll.length > 0 && !hasWantedDll) {
    const exeDir = detectedExe && detectedExe.full ? path.dirname(detectedExe.full) : fallbackDllDir;
    if (requireGameExecutable && !gameExePresent()) {
      debug.log(`[${appid}] automatic emulator fix cancelled - game executable disappeared from ${gameDir}`);
      return { skipped: true, reason: 'game-executable-gone', tag: '', steamSettingsDirs: [], emulator: detectedEmu };
    }
    gbeInstaller.installDlls({ dllDirs: [exeDir], dlls, ensureArch: wantedArch, log: debug });
    if (!dllDirs.some((dir) => dir.toLowerCase() === exeDir.toLowerCase())) dllDirs.push(exeDir);
    debug.log(`[${appid}] seeded missing ${wantedFile} beside ${detectedExe && detectedExe.name ? detectedExe.name : 'the detected executable'}`);
  }
  steamSettingsDirs.push(...dllDirs.map((dir) => path.join(dir, 'steam_settings')));
  if (steamSettings) steamSettingsDirs.push(steamSettings);

  // Create both Goldberg save roots; discovery deduplicates them by appid.
  try {
    for (const saveFolder of goldbergSaveFolders(appid)) fs.mkdirSync(saveFolder, { recursive: true });
  } catch (e) {
    debug.log(`[${appid}] could not pre-create Goldberg/GBE save folder => ${e}`);
  }

  // Optionally apply SteamAutoCrack's ownership-check bypass.
  if (cfg.apiCheckBypass && detectedExe && detectedExe.full) {
    try {
      const bypassDlls = await apiCheckBypass.ensureBypassDlls({ cacheDir: path.join(_userDataPath, 'cache/api_check_bypass'), log: debug });
      const r = apiCheckBypass.applyBypass({ gameDir, exePath: detectedExe.full, dlls: bypassDlls, log: debug });
      debug.log(`[${appid}] Steam API check bypass: ${r.applied ? `applied (${r.dll}, ${r.arch})` : `skipped (${r.reason})`}`);
    } catch (e) {
      debug.log(`[${appid}] Steam API check bypass failed => ${e}`);
    }
  }

  // Advanced setup is anonymous and best-effort; never block discovery on Steam Guard.
  if (cfg.steamSettingsMode === 'advanced' && !skipAdvanced) {
    try {
      const tool = await genEmuConfig.ensureGenerateEmuConfig({
        cacheDir: path.join(_userDataPath, 'cache/gse_emu_config'),
        preferredTag: dlls.tag || null,
        log: debug,
      });
      // Cap unattended generation so one stalled game cannot block a batch repair. The short idle
      // budget matters more than the hard one here: an anonymous run that hangs after reaching a
      // Steam CM says nothing at all, and this path runs per game inside the scan.
      const generated = await genEmuConfig.generate({ tool, appid, login: null, timeout: 90000, idleTimeout: 20000, log: debug });
      try {
        for (const dir of new Set(steamSettingsDirs)) genEmuConfig.mergeIntoGame(generated.steamSettings, dir);
      } finally {
        try { fs.rmSync(generated.workDir, { recursive: true, force: true }); } catch {}
      }
    } catch (err) {
      debug.log(`[${appid}] advanced steam_settings skipped => ${err}`);
    }
  } else if (cfg.steamSettingsMode === 'advanced' && skipAdvanced) {
    debug.log(`[${appid}] advanced steam_settings skipped in bulk repair; regular GBE setup + AW schema repair will be applied`);
  }

  try {
    const seedDir =
      steamSettingsDirs.find((dir) => goldberg.readLocalSchema(dir).length > 0) ||
      steamSettings ||
      steamSettingsDirs[0] ||
      null;
    const runtime = goldberg.seedRuntimeSave({
      appid,
      schema,
      steamSettings: seedDir,
      types: ['gbe'],
    });
    if (runtime.created.length > 0) {
      debug.log(`[${appid}] seeded GBE runtime achievements (${runtime.entries} locked entries) at ${runtime.created.map((r) => r.file).join(', ')}`);
    } else if (runtime.skipped.length > 0) {
      debug.log(`[${appid}] GBE runtime achievements already present at ${runtime.skipped.map((r) => r.file).join(', ')}`);
    } else if (runtime.entries === 0) {
      debug.log(`[${appid}] GBE runtime achievements seed skipped (no schema entries available yet)`);
    }
  } catch (e) {
    debug.log(`[${appid}] could not seed GBE runtime achievements => ${e}`);
  }

  const refreshedEmu = refreshEmulatorCache(gameDir);
  return { tag: dlls.tag || '', steamSettingsDirs: [...new Set(steamSettingsDirs)], emulator: refreshedEmu };
}
function setEmulatorCache(gameDir, result) {
  if (!gameDir || !result) return result;
  _emuCache.set(gameDir.toLowerCase(), result);
  return result;
}
function refreshEmulatorCache(gameDir) {
  if (!gameDir) return goldberg.detectEmulator(gameDir);
  // A repair just wrote into this folder, and it may have written below its root - which leaves the
  // root's timestamp alone and would keep the memoized executable walk alive.
  exeCandidateCache.forget(gameDir);
  return setEmulatorCache(gameDir, goldberg.detectEmulator(gameDir));
}
function detectEmulatorCached(gameDir) {
  if (!gameDir) return goldberg.detectEmulator(gameDir);
  const key = gameDir.toLowerCase();
  const hit = _emuCache.get(key);
  if (hit) return hit;
  const r = goldberg.detectEmulator(gameDir);
  return setEmulatorCache(gameDir, r);
}

async function getFolderIndex() {
  if (_folderIndex) return _folderIndex;
  if (!_folderIndexPromise) {
    _folderIndexPromise = (async () => {
      const index = [];
      const seen = new Set();
      const desktopSet = new Set(desktopRoots().map((d) => d.toLowerCase()));
      const addDir = (dir) => {
        const key = dir.toLowerCase();
        if (seen.has(key)) return;
        if (_claimedDirs.has(key)) return; // already linked by appid - never name-match it
        seen.add(key);
        index.push({ dir, name: path.basename(dir) });
      };
      for (const root of await goldbergScanRoots()) {
        const entries = dirCache.readdir(root);
        if (!entries) continue;
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          const dir = path.join(root, e.name);
          addDir(dir);
          // One safe extra level under Desktop: only descend into library-like subfolders
          // (Desktop\Jeux\<game>), never loose Desktop folders.
          if (desktopSet.has(root.toLowerCase()) && saveRoots.isLibraryLikeFolderName(e.name)) {
            const children = dirCache.readdir(dir);
            if (!children) continue;
            for (const child of children) {
              if (child.isDirectory()) addDir(path.join(dir, child.name));
            }
          }
        }
      }
      _folderIndex = index;
      return index;
    })().catch((err) => {
      // A failed build must not poison the cache for the rest of the scan; retry next time.
      _folderIndexPromise = null;
      throw err;
    });
  }
  return _folderIndexPromise;
}

function desktopRoots() {
  return [process.env['USERPROFILE'] && path.join(process.env['USERPROFILE'], 'Desktop'), process.env['PUBLIC'] && path.join(process.env['PUBLIC'], 'Desktop')].filter(Boolean);
}

// Prefer product metadata, then the folder name, then the executable name.
function unconfiguredDisplayName(folderName, exeName, productName) {
  if (productName) return productName;
  return /^[0-9]+$/.test(folderName) || folderName.length < 3 ? exeName.replace(/\.exe$/i, '') : folderName;
}

/*
  Is this folder a collection root rather than a game folder - i.e. does it merely CONTAIN other
  games' installs? "The Jackbox Party Pack Collection" holds one subfolder per pack, each linked to
  its own appid; without this check, name-matching an uninstalled "The Jackbox Party Pack" against
  that root scores above threshold and hands it a different pack's binary. A real game folder can
  still legitimately contain a claimed sub-install, so the verdict also requires no exe of its own.
*/
function isGameCollectionDir(dir) {
  if (!dir) return false;
  const prefix = path.resolve(dir).toLowerCase() + path.sep;
  let holdsAnotherGame = false;
  for (const claimed of _claimedDirs) {
    if (path.resolve(claimed).toLowerCase().startsWith(prefix)) {
      holdsAnotherGame = true;
      break;
    }
  }
  if (!holdsAnotherGame) return false;
  return !exeDetect.shallowGameExe(dir);
}

async function resolveGameDirByName(gameName) {
  if (!gameName) return null;
  try {
    const candidates = (await getFolderIndex()).filter((f) => !isGameCollectionDir(f.dir));
    return exeDetect.bestFolderMatch(gameName, candidates);
  } catch {
    return null;
  }
}

function goldbergSaveFolder(emulator, appid) {
  const appdata = process.env['APPDATA'];
  if (!appdata) return null;
  const dirName = emulator === 'goldberg' ? 'Goldberg SteamEmu Saves' : 'GSE Saves';
  return path.join(appdata, dirName, String(appid));
}

function goldbergSaveFolders(appid) {
  return [goldbergSaveFolder('gbe', appid), goldbergSaveFolder('goldberg', appid)].filter(Boolean);
}

function isKnownNonGameToolInstall(gameDir) {
  if (!gameDir) return false;
  const base = path.basename(gameDir).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['dolphin', 'dolphinx64', 'dolphinx86', 'dolphinmpn', 'dolphinemulator'].includes(base)) return true;
  const entries = dirCache.readdir(gameDir); // null for an unreadable folder - let the normal scanner decide
  if (!entries) return false;
  const names = new Set(entries.map((e) => e.name.toLowerCase()));
  const dirs = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase()));
  if (names.has('dolphin.exe') && (names.has('dolphintool.exe') || dirs.has('sys') || dirs.has('qtplugins'))) return true;
  return false;
}

function isEmuSaveRecord(record) {
  const data = record && record.data;
  if (!data || data.type !== 'file' || !data.path) return false;
  return /[\\/]?(gse saves|goldberg steamemu saves)[\\/]/i.test(String(data.path));
}

// Find installed Goldberg/GBE games and flag known entries that need schema repair.
async function scanInstalledGoldbergGames(data, scope = _activeScanScope) {
  const additions = [];
  try {
    const roots = await goldbergScanRoots(scope);
    if (roots.length === 0) return additions;
    debug.log(`[goldberg-scan] scanning ${roots.length} root(s): ${roots.join(', ')}`);

    const found = goldberg.findCompatibleGames(roots, {
      onSkip: (gameDir, steamAppid) => debug.log(`[goldberg-scan] skipped Steam library install (appid ${steamAppid}): ${gameDir}`),
    });
    for (const g of found) {
      if (g.gameDir && isKnownNonGameToolInstall(g.gameDir)) {
        if (g.appid) {
          for (let i = data.length - 1; i >= 0; i--) {
            if (String(data[i] && data[i].appid) === String(g.appid) && isEmuSaveRecord(data[i])) data.splice(i, 1);
          }
        }
        continue;
      }
      if (g.gameDir) _claimedDirs.add(g.gameDir.toLowerCase());
    }
    const byAppid = new Map(data.map((g) => [String(g.appid), g]));
    let attached = 0;

    for (const g of found) {
      if (isKnownNonGameToolInstall(g.gameDir)) {
        debug.log(`[goldberg-scan] skipped non-game tool folder: ${g.gameDir}`);
        continue;
      }
      let appid = g.appid && /^[0-9]+$/.test(String(g.appid)) ? String(g.appid) : null;
      let detectedExe = null;
      let detectedEmu = null;
      // Exe detection runs regardless of whether the appid is already known: an install whose identity
      // marker (steam_settings/steam_appid.txt) sits in a nested engine folder can still resolve its
      // appid directly, but that tells us nothing about where the launchable exe lives. Without this, a
      // game already tracked via its %APPDATA% save folder would never get an exe attached once scanned.
      if (g.gameDir) {
        try {
          detectedEmu = detectEmulatorCached(g.gameDir);
          detectedExe = goldberg.findGameExe(g.gameDir, detectedEmu.dll);
        } catch {
          /* leave exe/emu detection empty - the merge/creation below tolerates nulls */
        }
      }
      if (!appid && g.gameDir) {
        try {
          const resolved = await resolveUnconfiguredSteamAppid({
            name: path.basename(g.gameDir),
            data: {
              gameDir: g.gameDir,
              exe: detectedExe && detectedExe.full,
              hasSteamApiDll: detectedEmu && detectedEmu.dll.length > 0,
            },
          });
          if (resolved) {
            appid = String(resolved.appid);
            debug.log(`[goldberg-scan] resolved "${path.basename(g.gameDir)}" (${resolved.matchedName}) to appid ${appid}`);
          }
        } catch {
          /* no confident name match */
        }
      }

      if (!appid) {
        // This scan claims the steam_settings folder, so a missing steam_appid.txt must not drop the
        // game: keep it visible as a local install whenever a real exe identifies it.
        detectedEmu = detectedEmu || (g.gameDir ? detectEmulatorCached(g.gameDir) : null);
        detectedExe = detectedExe || (g.gameDir && detectedEmu ? goldberg.findGameExe(g.gameDir, detectedEmu.dll) : null);
        if (g.gameDir && detectedExe) {
          const id = 'local-' + (crc32(g.gameDir.toLowerCase()) >>> 0).toString(16);
          if (!byAppid.has(id)) {
            byAppid.set(id, true);
            additions.push({
              appid: id,
              name: path.basename(g.gameDir),
              source: 'Unconfigured',
              data: {
                type: 'unconfigured',
                gameDir: g.gameDir,
                steamSettings: (detectedEmu && detectedEmu.steamSettings) || g.steamSettings || (g.gameDir ? path.join(g.gameDir, 'steam_settings') : null),
                exe: detectedExe.full,
                hasSteamApiDll: !!(detectedEmu && detectedEmu.dll.length > 0),
              },
            });
          }
        }
        continue;
      }

      const emulatorType = g.emulator === 'goldberg' ? 'goldberg' : 'gbe';
      const steamSettings = g.steamSettings || (g.gameDir ? path.join(g.gameDir, 'steam_settings') : null);
      const hasSchema = steamSettings ? goldberg.readLocalSchema(steamSettings).length > 0 || g.hasSchema : g.hasSchema;
      /*
        Portable repacks routinely redirect the emulator's save folder back into the game directory
        (`[user::saves] local_save_path`, or classic Goldberg's local_save.txt). Nothing is then ever
        written to %APPDATA%\\GSE Saves, so pointing the record at the standard root read a fully
        played game as a permanent 0%. Read the setup's own configured folder when it has one.
      */
      let savePath = goldbergSaveFolder(emulatorType, appid);
      let saveSource = null;
      try {
        const redirected = goldberg.resolveLocalSaveDir({ steamSettings, appid });
        if (redirected) {
          savePath = redirected;
          debug.log(`[goldberg-scan] ${appid} reads its saves from the configured local_save_path: ${redirected}`);
        } else if (g.emulator === 'none' && g.gameDir) {
          /*
            The scan also reaches installs that are not Goldberg at all: a CODEX/RUNE release is
            recognised here through its steam_emu.ini, and pointing it at %APPDATA%\\GSE Saves - a
            folder its emulator never writes - would read a played game as 0%. Those releases keep the
            same Steam\\<SOURCE>\\<appid> tree the installed ones put under %PUBLIC%, only inside the
            game folder when portable.
          */
          const scene = userDir.findSceneSaveDir(g.gameDir, appid);
          if (scene) {
            savePath = scene.path;
            saveSource = scene.source;
            debug.log(`[goldberg-scan] ${appid} is a scene-emulator install; saves read from ${scene.path}`);
          }
        }
      } catch (err) {
        debug.log(`[goldberg-scan] ${appid} save-folder resolution failed => ${err}`);
      }

      const existing = byAppid.get(appid);
      if (existing) {
        // Already discovered (save folder / other source). Always attach the install steam_settings so
        // the offline description backfill can read its local schema; flag for repair only if broken.
        if (existing.data) {
          if (!existing.data.steamSettings && steamSettings) existing.data.steamSettings = steamSettings;
          if (!existing.data.gameDir && g.gameDir) existing.data.gameDir = g.gameDir;
          if (detectedExe && !existing.data.exe) existing.data.exe = detectedExe.full;
          if (detectedEmu && detectedEmu.dll.length > 0) existing.data.hasSteamApiDll = true;
          // The record found earlier (from an empty %APPDATA% save folder that the emulator created
          // once and then abandoned) points at a path with nothing in it. The install tells us where
          // the unlocks really are, so it wins - but only when that folder actually holds a save.
          if (
            existing.data.type === 'file' &&
            savePath !== existing.data.path &&
            fs.existsSync(path.join(savePath, 'achievements.json')) &&
            !fs.existsSync(path.join(String(existing.data.path || ''), 'achievements.json'))
          ) {
            debug.log(`[goldberg-scan] ${appid} save folder corrected to ${savePath} (nothing written in ${existing.data.path})`);
            existing.data.path = savePath;
          }
          if (!hasSchema && !existing.data.needsSchema) {
            existing.data.needsSchema = true;
            attached++;
          }
        }
        continue;
      }

      const item = {
        appid,
        // Naming a CODEX/RUNE install "GBE Fork" is wrong on the badge and wrong in every diagnosis
        // that keys off the source, so the resolved scene source wins when there is one.
        source: saveSource || (emulatorType === 'gbe' ? 'GBE Fork' : 'Goldberg'),
        data: {
          type: 'file',
          path: savePath,
          steamSettings,
          gameDir: g.gameDir,
          exe: detectedExe && detectedExe.full,
          hasSteamApiDll: !!(detectedEmu && detectedEmu.dll.length > 0),
          needsSchema: !hasSchema, // schema achievements.json missing/empty -> repair it lazily
        },
      };
      byAppid.set(appid, item);
      additions.push(item);
    }
    debug.log(`[goldberg-scan] ${found.length} install(s) found; added ${additions.length} new, flagged ${attached} for schema repair`);
  } catch (err) {
    debug.log(`[goldberg-scan] failed: ${err}`);
  }
  return additions;
}

  // Skip common redistributable, tool, and launcher folders.
const UNCONFIG_SKIP_DIR = /^(_?CommonRedist|_?Redist|redist|DirectX|dx|dotnet|prerequisites|prereq|Installers|__Installer|steam_settings|steamapps|common|SaveConverter|tools|Extras|Updater|app|bin|backups|cache|httpcache|media|Patches|support|Redistributables|Binaries|Engine|plugins|Modding)$/i;

// Configs a Steam emulator drops beside a game, each stating the AppID it stands in for.
const EMULATOR_APPID_CONFIGS = new Set(['ali213.ini', 'valve.ini', 'steamconfig.ini', 'steam_emu.ini', 'steam_api.ini', 'cpy.ini', 'hlm.ini', 'ds.ini']);

function declaredEmulatorAppid(dir, entries) {
  for (const entry of entries || []) {
    if (!entry.isFile() || !EMULATOR_APPID_CONFIGS.has(entry.name.toLowerCase())) continue;
    try {
      const declared = fs.readFileSync(path.join(dir, entry.name), 'utf8').match(/^\s*App(?:ID|Id)\s*=\s*([0-9]+)\s*$/im);
      if (declared && Number(declared[1]) > 0) return String(Number(declared[1]));
    } catch {
      /* unreadable config states nothing */
    }
  }
  return '';
}

async function scanUnconfiguredInstalls(linkedExes = [], scope = _activeScanScope) {
  const out = [];
  // Folders that already host a game configured under a real appid (from exeList): never surface them
  // again as "unconfigured", or the same game shows twice (e.g. LEGO Batman).
  const linked = linkedExes.map((p) => String(p).toLowerCase());
  const isLinkedSubtree = (dir) => {
    const d = dir.toLowerCase();
    return linked.some((p) => p === d || p.startsWith(d + path.sep) || p.startsWith(d + '/'));
  };
  const readEntries = (dir) => dirCache.readdir(dir);
  const desktopSet = new Set(desktopRoots().map((p) => p.toLowerCase()));
  const roots = [];
  for (const dir of await goldbergScanRoots(scope)) {
    if (desktopSet.has(dir.toLowerCase())) {
      // The Desktop itself is never scanned for unconfigured installs (too many shortcuts/random
      // folders), but a library-like subfolder (Desktop\Jeux, Desktop\Games, …) is a legitimate
      // games root and gets scanned like any other library.
      const entries = readEntries(dir);
      if (!entries) continue;
      for (const e of entries) {
        if (e.isDirectory() && saveRoots.isLibraryLikeFolderName(e.name)) roots.push(path.join(dir, e.name));
      }
    } else {
      roots.push(dir);
    }
  }

  const hasDll = (entries) => entries.some((e) => e.isFile() && /^steam_api(64)?\.dll$/i.test(e.name));
  const hasAppidMarker = (entries) =>
    entries.some((e) => (e.isFile() && e.name.toLowerCase() === 'steam_appid.txt') || (e.isDirectory() && e.name.toLowerCase() === 'steam_settings'));

  const isGameFolder = (dir, entries) => (entries && hasDll(entries)) || !!exeDetect.shallowGameExe(dir);

  const emit = (dir, entries) => {
    if (_claimedDirs.has(dir.toLowerCase())) return;
    if (isKnownNonGameToolInstall(dir)) return;
    if (launcherDetect.isOfficialLauncherInstall(dir)) return; // legit launcher game - never "Unconfigured"
    if (isLinkedSubtree(dir)) return; // this folder already hosts a real-appid game (avoid duplicate)
    const exe = exeDetect.detect(dir, path.basename(dir), {});
    if (!exe) return;
    // Repacks often rename the folder ("Game123", "0xDEADBEEF"); the exe's own version resource
    // (FileDescription/ProductName) is a much better display name.
    // Some tools expose only a generic descriptor ("Installer", "Launcher", "Application") - those
    // say nothing about the game, so fall back to the folder/exe name instead.
    const rawProductName = (pe.readExeProductName(exe.full) || '').trim();
    const productName = rawProductName && !/^(application|app|installer|setup|launcher|loader|program|game|update|updater|uninstall|uninstaller|config|configuration|service|daemon|tool|tools|client)$/i.test(rawProductName)
      ? rawProductName
      : '';
    const folderName = path.basename(dir);
    const name = unconfiguredDisplayName(folderName, exe.name, productName && productName.trim().length >= 3 ? productName.trim() : '');
    /*
      A crack loader states the Steam AppID it emulates, right there in its own config: ALI213.ini
      and the Hoodlum/CODEX-style inis all carry "AppID = <n>". A folder that says which game it is
      is not an unidentified install, and giving it a synthetic "local-…" id instead produced a
      second card for a game the library already had under its real AppID.
    */
    const id = declaredEmulatorAppid(dir, entries) || 'local-' + (crc32(dir.toLowerCase()) >>> 0).toString(16);
    // A shallow hasDll() check misses Goldberg files under nested Unity/UE engine folders; use the
    // same recursive detection as the Goldberg scan so the record carries its Steam evidence.
    const emu = detectEmulatorCached(dir);
    out.push({
      appid: id,
      name,
      source: 'Unconfigured',
      data: {
        type: 'unconfigured',
        gameDir: dir,
        exe: exe.full,
        hasSteamApiDll: hasDll(entries || []) || emu.dll.length > 0,
        steamSettings: emu.steamSettings || null,
        productName: productName || '',
      },
    });
  };

  const walk = (dir, depth) => {
    if (depth > 4) return;
    if (_claimedDirs.has(dir.toLowerCase())) return;
    if (isKnownNonGameToolInstall(dir)) return;
    if (launcherDetect.isOfficialLauncherInstall(dir)) return; // Ubisoft/GOG/Epic/MS legit install
    const entries = readEntries(dir);
    if (!entries) return;
    if (hasAppidMarker(entries)) return; // appid path handles this folder
    const subdirs = entries.filter((e) => e.isDirectory() && !UNCONFIG_SKIP_DIR.test(e.name) && !exeDetect.ENGINE_DATA_DIRS.test(e.name));
    const childGameFolders = subdirs.filter((e) => {
      const cd = path.join(dir, e.name);
      return (
        !_claimedDirs.has(cd.toLowerCase()) &&
        !isKnownNonGameToolInstall(cd) &&
        !launcherDetect.isOfficialLauncherInstall(cd) &&
        isGameFolder(cd, readEntries(cd))
      );
    });
    // A folder holding a game exe of its own IS the game: whatever sits below it is its engine, runtime
    // or tooling payload, not a sibling install. Only a container with no executable of its own - a
    // collection root such as a Jackbox pack folder - is descended into (same rule as
    // isGameCollectionDir()); without it a Godot C# export's runtime folder could be picked over the game.
    const ownExe = !!exeDetect.shallowGameExe(dir);
    if (ownExe || (isGameFolder(dir, entries) && childGameFolders.length === 0)) {
      emit(dir, entries); // game folder
      return;
    }
    for (const e of subdirs) walk(path.join(dir, e.name), depth + 1);
  };

  for (const root of roots) {
    if (root && fs.existsSync(root)) {
      const entries = readEntries(root);
      if (!entries) continue;
      for (const e of entries) {
        if (e.isDirectory() && !UNCONFIG_SKIP_DIR.test(e.name)) {
          const dir = path.join(root, e.name);
          if (!isKnownNonGameToolInstall(dir)) walk(dir, 1);
        }
      }
    }
  }
  return out;
}

function unconfiguredNameCandidates(u) {
  const values = [];
  const add = (v) => {
    const s = String(v || '').trim();
    if (!s || values.some((x) => x.toLowerCase() === s.toLowerCase())) return;
    values.push(s);
  };
  add(u && u.name);
  if (u && u.data) {
    add(u.data.productName);
    add(path.basename(u.data.gameDir || ''));
    add(path.basename(u.data.exe || '').replace(/\.exe$/i, ''));
  }
  return values.filter((name) => !/^[0-9]+$/.test(name) && name.length >= 3);
}

async function resolveUnconfiguredSteamAppid(u) {
  for (const name of unconfiguredNameCandidates(u)) {
    try {
      const sid = await steam.findAppidByName(name);
      if (sid) return { appid: String(sid), matchedName: name };
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/*
  A Ubisoft install found by the unconfigured scan has no Steam markers, so resolve it via
  uplay-steam.json like the Uplay R2 fix does. Returns the Steam mapping or null (still surfaced so the
  app offers the Uplay R2 fix rather than GBE Fork).
*/
async function resolveUplayR2Mapping(u) {
  const byInstallState = uplayR2.resolveSteamMapping({ gameDir: u && u.data && u.data.gameDir });
  if (byInstallState) return { ...byInstallState, matchedName: 'uplay_install.state' };
  for (const name of unconfiguredNameCandidates(u)) {
    const mapping = uplayR2.resolveSteamMapping({ name });
    if (mapping) return { ...mapping, matchedName: name };
  }

  // Reuse the same full-catalog name resolver that already identifies Steam counterparts for
  // Ubisoft rarity percentages and unconfigured Steam-emulator installs. The static asset remains
  // the deterministic first choice; this automatic result is validated again against the Steam
  // achievement schema before any Uplay R2 repair writes files.
  const automatic = await resolveUnconfiguredSteamAppid(u);
  if (!automatic) return null;
  const gameDir = u && u.data && u.data.gameDir;
  const identity = uplayR2.resolveGameIdentity({
    ...u,
    gameDir,
    steamappid: automatic.appid,
    uplayR2: true,
  });
  const mapping = identity.mapping || uplayR2.resolvedSteamMapping({ steamAppid: automatic.appid, steamName: automatic.matchedName });
  /*
    Ask the install for its own Ubisoft product id and remember the pair. The shipped table cannot
    list a game that did not exist when it was written, and the product id is what every save folder
    is named after - without it the automatic result knows which Steam game this is but not which
    folder to watch. Learned once, the override is what every later (synchronous) lookup reads, so
    the table becomes a fast path rather than the mechanism.
  */
  const learnedUplayId = String((mapping && mapping.uplay_id) || '') || uplayR2.readInstalledProductId(gameDir);
  if (gameDir && /^\d+$/.test(String(automatic.appid))) {
    try {
      const stored = uplayR2.saveSteamMappingOverride({
        gameDir,
        uplayId: learnedUplayId,
        steamAppid: String(automatic.appid),
        steamName: automatic.matchedName || (mapping && mapping.steam_name) || '',
      });
      debug.log(`[uplay] learned mapping for ${gameDir}: Ubisoft ${learnedUplayId || '(unknown)'} -> Steam ${automatic.appid}`);
      return { ...stored, matchedName: automatic.matchedName };
    } catch (err) {
      debug.log(`[uplay] could not persist the learned mapping for ${gameDir} => ${err}`);
    }
  }
  return { ...mapping, uplay_id: learnedUplayId || (mapping && mapping.uplay_id) || '', matchedName: automatic.matchedName };
}

async function discover(source, steamAccFilter, scope = null) {
  // One pass reads the same folders from several walkers; serve each directory listing once.
  return dirCache.withScope(() => discoverInScope(source, steamAccFilter, scope));
}

async function discoverInScope(source, steamAccFilter, scope) {
  let data = [];
  // Dev timings: each mark closes the phase above it (see util/perfTrace.js).
  let phaseStart = Date.now();
  const mark = (label) => {
    if (!perfTrace.isEnabled()) return;
    const now = Date.now();
    perfTrace.record(`discover:${label}`, now - phaseStart);
    phaseStart = now;
  };

  let additionalSearch = [];
  try {
    const configuredDirs = await userDir.get();
    const userDirs = scope ? scanScope.filterSelectedDirectories(configuredDirs, scope.userDirs, (dir) => dir.path) : configuredDirs;
    for (let dir of userDirs) {
      debug.log(`[userdir] ${dir.path}`);

      let scanned = [];
      if (source.rpcs3) scanned = await rpcs3.scan(dir.path);
      if (scanned.length > 0) debug.log('-> RPCS3 data added');
      if (scanned.length === 0 && source.shadps4) {
        scanned = await shadps4.scan(dir.path);
        if (scanned.length > 0) debug.log('-> ShadPS4 data added');
      }
      if (scanned.length === 0 && source.xenia) {
        scanned = await xenia.scan(dir.path);
        if (scanned.length > 0) debug.log('-> Xenia data added');
      }
      if (scanned.length === 0 && source.xlln) {
        // Games for Windows LIVE installs running XLiveLessNess. Like the console emulators these
        // are game folders, so they are resolved before the appid-named save scan below.
        scanned = xlln.scan(dir.path);
        if (scanned.length > 0) debug.log('-> XLiveLessNess data added');
      }
      if (scanned.length > 0) {
        data = data.concat(scanned);
        debug.log('-> emulator data added');
      } else if (source.socialClub && socialclub.isSocialClubPath(dir.path)) {
        // Goldberg SocialClub Emu Saves: game folders are named after the game, not a numeric AppID.
        scanned = await socialclub.scan(dir.path);
        if (scanned.length > 0) {
          data = data.concat(scanned);
          debug.log('-> Goldberg SocialClub data added');
        }
      } else if (source.steamEmu) {
        // FINAL FANTASY VII (2013) first: it is a game folder, not an appid-named save folder, so
        // the generic emulator scan can never recognise it.
        scanned = ff7.scan(dir.path);
        if (scanned.length > 0) {
          data = data.concat(scanned);
          debug.log('-> FINAL FANTASY VII (2013) data added');
        } else {
          scanned = await userDir.scan(dir.path);
          if (scanned.length > 0) {
            data = data.concat(scanned);
            debug.log('-> Steam emu data added');
          } else {
            additionalSearch.push(dir.path);
            debug.log('-> will be scanned for appid folder(s)');
          }
        }
      }
    }
  } catch (err) {
    debug.log(err);
  }

  mark('userdir');

  //Goldberg SocialClub Emulator - %APPDATA%\Goldberg SocialClub Emu Saves is auto-scanned like the
  //other known emulator roots, even when the user never added it to Settings.
  if (!scope && source.socialClub) {
    try {
      const scRoot = socialclub.defaultRoot();
      const scanned = scRoot ? await socialclub.scan(scRoot) : [];
      const have = new Set(data.map((g) => `${g.source}:${g.appid}`));
      const extra = scanned.filter((g) => !have.has(`${g.source}:${g.appid}`));
      if (extra.length > 0) {
        data = data.concat(extra);
        debug.log(`-> Goldberg SocialClub (APPDATA) data added (${extra.length})`);
      }
    } catch (err) {
      debug.error(err);
    }
  }

  mark('socialClub');

  //FINAL FANTASY VII (2013) writes achievement.dat beside its saves in Documents\FINAL FANTASY VII.
  //That folder is auto-scanned like the other known locations, so nobody has to add it by hand.
  if (!scope && source.steamEmu) {
    try {
      const have = new Set(data.map((g) => `${g.source}:${g.appid}`));
      for (const root of ff7.defaultRoots()) {
        const extra = ff7.scan(root).filter((g) => !have.has(`${g.source}:${g.appid}`));
        if (extra.length === 0) continue;
        extra.forEach((g) => have.add(`${g.source}:${g.appid}`));
        data = data.concat(extra);
        debug.log('-> FINAL FANTASY VII (2013) (Documents) data added');
      }
    } catch (err) {
      debug.log(err);
    }
  }

  mark('ff7');

  //ShadPS4 stores trophies in %APPDATA%/shadPS4 regardless of where the .exe lives - auto-scan that
  //known location so the user doesn't have to add it as a watched folder. De-dupe against anything the
  //watched-folder pass already found (portable installs that keep game_data next to the binary).
  if (!scope && source.shadps4) {
    try {
      const known = await shadps4.scan(path.join(process.env['APPDATA'] || '', 'shadPS4'));
      const have = new Set(data.map((g) => `${g.source}:${g.appid}`));
      const extra = known.filter((g) => !have.has(`${g.source}:${g.appid}`));
      if (extra.length > 0) {
        data = data.concat(extra);
        debug.log(`-> ShadPS4 (APPDATA) data added (${extra.length})`);
      }
    } catch (err) {
      debug.log(err);
    }
  }

  mark('shadps4');
  if (source.steamEmu) {
    try {
      data = data.concat(await steam.scan(additionalSearch));
    } catch (err) {
      debug.error(err);
    }
  }

  mark('steamEmu');

  if (!scope && source.greenLuma) {
    try {
      data = data.concat(await greenluma.scan());
    } catch (err) {
      debug.error(err);
    }
  }

  mark('greenLuma');

  if (!scope && source.legitSteam > 0) {
    try {
      const legit = await steam.scanLegit(source.legitSteam, steamAccFilter);
      // Attach the authoritative install folder from Steam's own library manifests so the Play button /
      // launch panel can auto-detect the exe. This also corrects scanLegit's per-app registry
      // "Installed" flag, which can go stale (a folder deleted outside Steam, or a manifest left
      // pointing at a common\<installdir> that no longer exists) and would otherwise keep an uninstalled game "installed".
      let localInstalls;
      let localInstallsScanned = false;
      try {
        localInstalls = await steam.scanLocalInstalls();
        localInstallsScanned = true;
      } catch (err) {
        debug.log(`[steam] local install scan failed => ${err}`);
      }
      if (localInstallsScanned) {
        let attached = 0;
        let corrected = 0;
        for (const rec of legit) {
          const local = localInstalls.get(String(rec.appid));
          rec.data = rec.data || {};
          if (local && local.gameDir && fs.existsSync(local.gameDir)) {
            // A live appmanifest is stronger proof than the registry flag: the folder exists.
            rec.data.gameDir = local.gameDir;
            rec.data.installed = true;
            attached++;
          } else if (rec.data.installed) {
            // The registry says installed but Steam's own manifest disagrees (missing entirely, or
            // its installdir isn't on disk) - trust the manifest over the stale registry flag.
            rec.data.installed = false;
            corrected++;
          }
        }
        if (attached > 0) debug.log(`[steam] linked ${attached} installed game(s) to their Steam install folders`);
        if (corrected > 0) debug.log(`[steam] corrected ${corrected} stale "installed" registry flag(s) with no matching on-disk install`);
      }
      data = data.concat(legit);
    } catch (err) {
      // Every Steam account on the machine having a private profile is a user setting, not a
      // malfunction: the legit-Steam source simply contributes nothing. Keep it out of the error
      // channel so a genuine scan failure still stands out in the log.
      if (String(err) === 'Public profile: none.') debug.log('[steam] no public Steam profile - skipping the legit Steam source');
      // Same for an offline scan on a machine that has never had a confirmed-public profile: nothing
      // is wrong with the install, the question could just not be asked.
      else if (String(err) === 'Public profile: unknown (offline).')
        debug.log('[steam] could not check the Steam profile (offline) - the legit Steam source is skipped for this scan');
      else debug.error(err);
    }
  }

  mark('legitSteam');

  if (!scope && source.lumaPlay) {
    //Lumaplay (emulated/cracked Ubisoft - the actual point of this source toggle)
    try {
      data = data.concat(await uplay.scan());
    } catch (err) {
      debug.error(err);
    }

    // uplay.scanLegit() (legit Ubisoft Connect cache) is intentionally NOT called here: legit Ubisoft
    // Connect exposes no local unlock-state, so those entries always resolve to root = {} (see
    // getAchievements 'uplay' branch) and would show as permanent 0% clutter for games the user owns
    // legitimately. The "Émulateur Ubisoft Connect" toggle is for emulated saves only.
  }

  mark('lumaPlay');

  if (!scope && source.gog) {
    try {
      data = data.concat(await gog.scan());
    } catch (err) {
      debug.error(err);
    }
  }

  mark('gog');

  //GOG Galaxy official (legit client data - schema, unlocks and rarity read from Galaxy's SQLite)
  if (!scope && source.gogOfficial) {
    try {
      data = data.concat(await gogOfficial.scan());
    } catch (err) {
      debug.error(err);
    }
  }

  mark('gogOfficial');

  //Ubisoft Connect official (legit client data - spool unlock state + cached achievements archive)
  if (!scope && source.ubisoftOfficial) {
    try {
      // A Steam purchase that launches Ubisoft Connect is an owned Steam game, so "don't display
      // official Steam games" has to hide it too, even though its achievement data comes from Ubisoft.
      const ubisoft = ubisoftOfficial.partitionBySteamFilter(ubisoftOfficial.scan(), source.legitSteam > 0);
      if (ubisoft.hidden.length > 0) {
        debug.log(`-> ${ubisoft.hidden.length} Ubisoft entrie(s) hidden: Steam purchases, and official Steam games are disabled`);
      }
      data = data.concat(ubisoft.kept);
    } catch (err) {
      debug.error(err);
    }
  }

  mark('ubisoftOfficial');

  //Epic official (installed Epic games - public localized schema + rarity; unlocks when connected)
  if (!scope && source.epicOfficial) {
    try {
      data = data.concat(epicOfficial.scan());
    } catch (err) {
      debug.error(err);
    }
  }

  mark('epicOfficial');

  if (!scope && source.epic) {
    try {
      data = data.concat(await epic.scan());
    } catch (err) {
      debug.error(err);
    }
  }

  mark('epic');

  if (!scope && source.ea) {
    try {
      data = data.concat(await ea.scan());
    } catch (err) {
      debug.error(err);
    }
  }

  mark('ea');

  //Xbox PC (Game Pass / Microsoft Store / Online-Fix) - local installs + imported Xbox Network cache.
  if (!scope && source.xboxPc) {
    try {
      const xboxPc = require(path.join(appPath, 'xboxPc.js'));
      xboxPc.setUserDataPath(_userDataPath || userDataDir());
      for (const titleId of xboxPc.listCachedTitles()) {
        data.push({ appid: titleId, source: xboxPc.XBOX_PC_SOURCE, data: { type: 'xboxPc' } });
      }
      // Locally discovered installs (fs-only scan; Appx enumeration is reserved for the import action).
      const installed = await xboxPc.discoverXboxPcInstallations({ skipAppx: true });
      const known = new Set(data.filter((g) => g.data && g.data.type === 'xboxPc').map((g) => String(g.appid)));
      for (const inst of installed) {
        if (inst.titleId && !known.has(String(inst.titleId))) {
          const exeCandidate =
            inst.executable && inst.installLocation
              ? path.isAbsolute(inst.executable)
                ? inst.executable
                : path.join(inst.installLocation, inst.executable)
              : '';
          data.push({
            appid: inst.titleId,
            name: inst.title,
            source: xboxPc.XBOX_PC_SOURCE,
            data: {
              type: 'xboxPc',
              gameDir: inst.installLocation,
              executable: inst.executable,
              exe: exeCandidate && fs.existsSync(exeCandidate) ? exeCandidate : null,
              exeAuthoritative: !!(exeCandidate && fs.existsSync(exeCandidate)),
              aumid: inst.aumid,
            },
          });
          known.add(String(inst.titleId));
        }
      }
    } catch (err) {
      debug.log(err);
    }
  }

  mark('xboxPc');

  if (!scope && source.importCache) {
    try {
      data = data.concat(await watchdog.scan());
    } catch (err) {
      debug.error(err);
    }
  }

  mark('importCache');

  //Installed Goldberg/GBE games never launched yet (no %APPDATA% save folder). Runs last so it can
  //dedupe against every other source by appid.
  if (source.steamEmu) {
    try {
      data = data.concat(await scanInstalledGoldbergGames(data, scope));
    } catch (err) {
      debug.error(err);
    }
    mark('goldbergInstalls');

    // Installed games with no usable appid (no steam_appid.txt/steam_settings): surface them anyway so
    // they show in the app and can be right-clicked (Install GBE Fork, etc.). Runs after the Goldberg
    // scan so _claimedDirs is populated and these don't duplicate appid-identified installs.
    try {
      let linkedExes = [];
      try {
        const exeList = require(path.join(appPath, 'exeList.js'));
        linkedExes = (await exeList.list()).filter((e) => e.exe && /^[0-9]+$/.test(String(e.appid))).map((e) => e.exe);
      } catch {
        /* no exeList yet */
      }
      const unconfigured = await scanUnconfiguredInstalls(linkedExes, scope);
      mark('unconfiguredScan');
      // Resolve unconfigured entries before concurrent game loading so installed detection sees gameDir.
      let added = 0,
        merged = 0;
      for (const u of unconfigured) {
        let real = null;
        let resolved = null;

        // Ubisoft/uPlay install (Goldberg Uplay R2 territory - no steam_api.dll to look at). Identify it
        // against the deterministic map first, then the automatic Steam catalog resolver, and promote
        // it to its Steam appid: the game then gets its title, art, schema and global percentages from
        // the ordinary Steam pipeline, with unlocks read from GSE Saves\<steamAppid>, where the repair redirects them.
        if (u.data && uplayR2.isUbisoftInstall(u.data.gameDir) && uplayR2.hasEmulatorEvidence(u.data.gameDir)) {
          u.source = 'Uplay R2';
          u.data.uplayR2 = true;
          u.data.system = 'uplay';
          const mapping = await resolveUplayR2Mapping(u);
          if (!mapping) {
            data.push(u); // keep it visible; the Uplay R2 fix can still be run on it manually
            added++;
            debug.log(`[unconfigured-scan] Ubisoft install "${u.name}" has no safe automatic Steam match - left unconfigured`);
            continue;
          }
          const known = data.find((g) => String(g.appid) === String(mapping.steam_appid));
          if (known) {
            if (!known.data || typeof known.data !== 'object') known.data = {};
            if (!known.data.gameDir) known.data.gameDir = u.data.gameDir;
            if (!known.data.exe) known.data.exe = u.data.exe;
            known.data.uplayR2 = true;
            known.data.system = 'uplay';
            merged++;
          } else {
            data.push({
              appid: String(mapping.steam_appid),
              source: 'Uplay R2',
              data: {
                type: 'file',
                path: goldbergSaveFolder('gbe', mapping.steam_appid),
                gameDir: u.data.gameDir,
                exe: u.data.exe,
                uplayR2: true,
                system: 'uplay',
                hasSteamApiDll: false,
              },
            });
            added++;
          }
          // Also read the emulator's own save location for loaders that ignore redirection.
          data.push({
            appid: String(mapping.steam_appid),
            source: 'Uplay R2',
            data: {
              type: 'uplayR2',
              path: '',
              uplayId: String(mapping.uplay_id || ''),
              gameDir: u.data.gameDir,
              exe: u.data.exe,
              uplayR2: true,
              system: 'uplay',
            },
          });
          debug.log(`[unconfigured-scan] Ubisoft install "${u.name}" (${mapping.matchedName}) mapped to Steam appid ${mapping.steam_appid} (${mapping.steam_name})`);
          continue;
        }

        const hasLocalSteamEvidence = !!(u.data && (u.data.hasSteamApiDll || u.data.steamSettings));
        try {
          if (hasLocalSteamEvidence) resolved = await resolveUnconfiguredSteamAppid(u);
          if (resolved) real = data.find((g) => String(g.appid) === String(resolved.appid));
        } catch {
          /* no match - keep as unconfigured */
        }
        if (real) {
          if (real.data) {
            if (!real.data.gameDir) real.data.gameDir = u.data.gameDir;
            if (!real.data.exe) real.data.exe = u.data.exe;
            if (u.data.hasSteamApiDll) real.data.hasSteamApiDll = true;
          }
          merged++;
          debug.log(`[unconfigured-scan] matched "${u.name}" (${resolved.matchedName}) to existing appid ${resolved.appid}`);
        } else if (resolved) {
          // findAppidByName only returns confident exact/strong-token matches. Promote that detected
          // game even when steam_api is entirely absent: the full setup must be able to seed the
          // architecture-matching GSE DLL, not require the file it is responsible for creating.
          data.push({
            appid: String(resolved.appid),
            source: 'GBE Fork',
            data: {
              type: 'file',
              path: goldbergSaveFolder('gbe', resolved.appid),
              steamSettings: path.join(u.data.gameDir, 'steam_settings'),
              gameDir: u.data.gameDir,
              exe: u.data.exe,
              hasSteamApiDll: !!u.data.hasSteamApiDll,
              needsSchema: true,
            },
          });
          merged++;
          debug.log(`[unconfigured-scan] promoted "${u.name}" (${resolved.matchedName}) to appid ${resolved.appid}`);
        } else {
          data.push(u);
          added++;
        }
      }
      if (added + merged > 0) {
        debug.log(`[unconfigured-scan] surfaced ${added} install(s) without an appid, merged ${merged} into already-known appid(s)`);
      }
    } catch (err) {
      debug.error(err);
    }
  }

  mark('unconfiguredResolve');

  if (!scope) {
    try {
      for (const entry of manualGames.list()) {
        data.push({
          appid: entry.id,
          name: entry.title,
          source: 'Manual',
          steamappid: /^\d+$/.test(entry.storeAppId) ? entry.storeAppId : undefined,
          data: {
            type: 'manual',
            gameDir: path.dirname(entry.exe),
            exe: entry.exe,
            exeAuthoritative: true,
            platform: entry.platform,
            storeAppId: entry.storeAppId,
          },
        });
      }
    } catch (err) {
      debug.log(`[manual-games] could not load entries: ${err.message || err}`);
    }
  }

  mark('manual');

  data = await dropSteamOwnedRecords(data, source.legitSteam > 0);

  mark('dropSteamOwned');

  data = consolidateDiscoveryList(data);

  mark('consolidate');

  try {
    let exclude = await blacklist.get();
    data = data.filter((appid) => {
      return !exclude.some((id) => id == appid.appid);
    });
  } catch (err) {
    debug.error(err);
  }

  mark('blacklist');

  return data;
}

module.exports.getGameFromCache = async (appid, source, option) => {
  let result;
  switch (source) {
    case 'gog':
      return gog.getCachedData({ appID: appid, lang: option.achievement.lang });
    case 'epic':
      return epic.getCachedData({ appID: appid, lang: option.achievement.lang });
    case 'uplay':
      return uplay.getGameFromCache(appid);
    case 'steam':
    default:
      result = await steam.getCachedData({ appID: appid, lang: option.achievement.lang });
  }
  return result;
};

module.exports.saveGameToCache = async (info, lang) => {
  switch (info.source) {
    case 'steam':
    default:
      let cfg = info.game;
      cfg.lang = lang;
      cfg.appid = info.appid;
      steam.saveGameToCache(cfg);
  }
};

module.exports.getAchievementsForAppid = async (option, requestedAppid) => {
  try {
    let game;
    if (/^[0-9]+$/.test(requestedAppid)) {
      game = await steam.getGameData({ appID: requestedAppid, lang: option.achievement.lang });
    } else {
      game = await epic.getGameData({ appID: requestedAppid });
    }
    return game;
  } catch (err) {
    debug.log(err);
    return {};
  }
};

module.exports.getSavedAchievementsForAppid = async (option, requestedAppid, cachedList, cachedLookup) => {
  let game;
  let isDuplicate = false;

  try {
    const appidList = cachedList || (await discover(option.achievement_source, option.steam.main));
    let appids = getDiscoverySources(requestedAppid, appidList, cachedLookup);
    let appid =
      cloneDiscoveryRecord(cachedLookup ? cachedLookup.firstByAppid.get(String(requestedAppid.appid)) : appidList.find((a) => String(a.appid) === String(requestedAppid.appid))) ||
      cloneDiscoveryRecord(requestedAppid) ||
      appids[0];
    for (const sourceRecord of appids) appid = mergeDiscoveryRecord(appid, sourceRecord);
    if (!appid) return;

    // Unconfigured install (no appid): there is no Steam schema to fetch - return a minimal game so it
    // shows in the list (achievement-less) and can be right-clicked. Empty img fields are tolerated by
    // the renderer (guarded `if (game.img.*)`), so the box keeps its placeholder background.
    if (appid.data && appid.data.type === 'unconfigured') {
      const uname = appid.name || path.basename(appid.data.gameDir || '');
      // Borrow real Steam store art when the name resolves to a known appid (free GetAppList lookup),
      // otherwise leave img empty and the box keeps its placeholder background.
      let img = { header: '', icon: '', background: '', portrait: '' };
      let steamappid = null;
      try {
        const canBorrowSteamArt = !!(appid.data && (appid.data.hasSteamApiDll || appid.data.steamSettings));
        const sid = canBorrowSteamArt ? await steam.findAppidByName(uname) : null;
        if (sid) {
          steamappid = sid;
          img = {
            header: `https://cdn.akamai.steamstatic.com/steam/apps/${sid}/header.jpg`,
            background: `https://cdn.akamai.steamstatic.com/steam/apps/${sid}/page_bg_generated_v6b.jpg`,
            portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${sid}/library_600x900.jpg`,
            icon: `https://cdn.akamai.steamstatic.com/steam/apps/${sid}/capsule_231x87.jpg`,
          };

        }
      } catch {
        /* no art - placeholder */
      }
      if (!img.header || !img.portrait || !img.background || !img.icon) {
        try {
          const fallback = (await ipcInvoke('get-images-for-game', {
            name: uname,
            platform: appid.data.platform || 'PC',
            gameId: steamappid || appid.appid,
          })) || {};
          img.header = img.header || fallback.landscape || '';
          img.portrait = img.portrait || fallback.portrait || '';
          img.background = img.background || fallback.background || '';
          img.icon = img.icon || fallback.icon || fallback.logo || '';
          img.logo = img.logo || fallback.logo || '';
        } catch {
          /* no community art - placeholder */
        }
      }
      return {
        appid: appid.appid,
        steamappid,
        name: uname,
        source: appid.source || 'Unconfigured',
        system: appid.data.uplayR2 ? 'uplay' : undefined,
        gameDir: appid.data.gameDir,
        unconfigured: true,
        uplayR2: !!appid.data.uplayR2,
        installed: true,
        img,
        achievement: { total: 0, unlocked: 0, list: [] },
      };
    }

    if (appid.data.type === 'manual') {
      const requestedTitle = appid.name || path.basename(appid.data.exe || '', path.extname(appid.data.exe || ''));
      let steamappid = /^\d+$/.test(String(appid.data.storeAppId || '')) ? String(appid.data.storeAppId) : '';
      if (!steamappid) {
        try {
          steamappid = String((await steam.findAppidByName(requestedTitle)) || '');
        } catch {}
      }
      if (steamappid) {
        try {
          game = await steam.getGameData({
            appID: steamappid,
            lang: option.achievement.lang,
            showHidden: !!option.achievement.showHidden,
            fastStart: option.fastStart === true,
          });
        } catch {}
      }
      if (!game) {
        let links = {};
        try {
          links = (await ipcInvoke('get-images-for-game', {
            name: requestedTitle,
            platform: appid.data.platform,
            gameId: appid.data.storeAppId,
          })) || {};
        } catch {}
        game = {
          name: links.title || requestedTitle,
          appid: appid.appid,
          img: {
            header: links.landscape || '',
            background: links.background || '',
            portrait: links.portrait || '',
            icon: links.icon || links.logo || '',
            logo: links.logo || '',
          },
          achievement: { total: 0, unlocked: 0, list: [] },
        };
      }
      game.appid = appid.appid;
      game.steamappid = steamappid || undefined;
      game.name = game.name || requestedTitle;
      game.manual = true;
      game.installed = fs.existsSync(appid.data.exe);
      game.gameDir = path.dirname(appid.data.exe);
      game.exe = appid.data.exe;
      game.exeConfident = true;
      const platform = String(appid.data.platform || '').toLowerCase();
      if (/playstation/.test(platform)) game.system = 'playstation';
      else if (/xbox/.test(platform)) game.system = 'xbox';
      else if (/nintendo|switch/.test(platform)) game.system = 'nintendo';
    } else if (appid.data.type === 'rpcs3') {
      game = await rpcs3.getGameData(appid.data.path);
    } else if (appid.data.type === 'shadps4') {
      game = await shadps4.getGameData(appid.data.path, option.achievement.lang);
    } else if (appid.data.type === 'xlln') {
      game = await xlln.getGameData(appid.data, option.achievement.lang);
    } else if (appid.data.type === 'xenia') {
      game = await xenia.getGameData(appid.data.path);
    } else if (appid.data.type === 'socialclub') {
      game = await socialclub.getGameData(appid, option.achievement.lang, option);
    } else if (appid.data.type === 'uplay' || appid.data.type === 'lumaplay') {
      game = await uplay.getGameData(appid.appid, option.achievement.lang);
      // If local image extraction yielded no header (e.g. Uplay configurations YAML doesn't carry
      // image filenames for newer titles), fall back to Steam store art looked up by game name -
      // same pattern used for unconfigured installs. Uses the in-memory appList (no extra request
      // when already loaded) so the cost is a single find() on the cached array.
      if (game && game.name && game.img && !game.img.header) {
        try {
          const sid = await steam.findAppidByName(game.name);
          if (sid) {
            game.steamappid = game.steamappid || sid;
            game.img.header = `https://cdn.akamai.steamstatic.com/steam/apps/${sid}/header.jpg`;
            game.img.background = game.img.background || `https://cdn.akamai.steamstatic.com/steam/apps/${sid}/page_bg_generated_v6b.jpg`;
            game.img.portrait = game.img.portrait || `https://cdn.akamai.steamstatic.com/steam/apps/${sid}/library_600x900.jpg`;
          }
        } catch {}
      }
    } else if (appid.data.type === 'ea') {
      game = await ea.getGameData(appid, option.achievement.lang);
    } else if (appid.data.type === 'gogOfficial') {
      game = await gogOfficial.getGameData(appid);
    } else if (appid.data.type === 'ubisoftOfficial') {
      game = await ubisoftOfficial.getGameData(appid, option.achievement.lang);
    } else if (appid.data.type === 'epicOfficial') {
      game = await epicOfficial.getGameData(appid, option.achievement.lang);
    } else if (appid.source === 'epic') {
      game = await epic.getGameData({ appID: appid.appid, steamappid: appid.steamappid, lang: option.achievement.lang });
    } else if (appid.data.type === 'xboxPc') {
      const xboxPc = require(path.join(appPath, 'xboxPc.js'));
      xboxPc.setUserDataPath(_userDataPath || userDataDir());
      game =
        (await xboxPc.getGameData(appid.appid, option.achievement.lang)) || {
          appid: appid.appid,
          name: appid.name || `Xbox ${appid.appid}`,
          source: xboxPc.XBOX_PC_SOURCE,
          img: {},
          achievement: { total: 0, unlocked: 0, list: [] },
          installed: true,
          xboxPc: true,
        };
    } else {
      game = await steam.getGameData({
        appID: appid.appid,
        lang: option.achievement.lang,
        showHidden: !!(option.achievement && option.achievement.showHidden),
        fastStart: option.fastStart === true,
        forceRecheck: option.forceAchievementRecheck === true,
        // Known emulator config dir (Goldberg discover) - lets the schema fetch resolve cover art
        // from the local app_product_info.json dump before hitting the network.
        steamSettings: (appid.data && appid.data.steamSettings) || null,
      });
    }
    if (!game) return;

    // Fill gaps only. SteamGridDB returns the full asset set in one cached lookup, which is useful
    // for emulator/manual entries where the native provider often has a title but no library art.
    game.img = game.img && typeof game.img === 'object' ? game.img : {};
    const needsPrimaryArt = !game.img.header && !game.img.portrait;
    const benefitsFromFullFallback = ['rpcs3', 'shadps4', 'xenia', 'manual', 'unconfigured'].includes(appid.data.type);
    if (game.name && (needsPrimaryArt || benefitsFromFullFallback)) {
      try {
        const fallback = (await ipcInvoke('get-images-for-game', {
          name: game.name,
          platform: appid.data.platform || game.system || appid.data.type,
          gameId: appid.appid,
        })) || {};
        game.img.header = game.img.header || fallback.landscape || '';
        game.img.portrait = game.img.portrait || fallback.portrait || '';
        game.img.background = game.img.background || fallback.background || '';
        game.img.logo = game.img.logo || fallback.logo || '';
        game.img.icon = game.img.icon || fallback.icon || fallback.logo || '';
      } catch (err) {
        debug.log(`[${appid.appid}] artwork fallback failed: ${err.message || err}`);
      }
    }

    if (
      game.achievement &&
      Array.isArray(game.achievement.list) &&
      game.achievement.list.length === 0 &&
      appid.data &&
      appid.data.gameDir
    ) {
      const localSchema = steam.getLocalAchievementSchema(appid.data.gameDir, appid.appid, option.achievement.lang);
      if (localSchema.length > 0) {
        game.achievement.list = localSchema;
        game.achievement.total = localSchema.length;
        debug.log(`[${appid.appid}] loaded ${localSchema.length} achievement(s) from local TENOKE schema`);
      }
    }

    // Game titles are strings by contract, but some language-specific fetch/cache paths can leave
    // game.name as a non-string (e.g. a localized {english:"…", turkish:"…"} object), which renders as
    // "object"/"[object Object]" in the UI and only for certain languages. Normalize to a plain string
    // at this single chokepoint so every consumer gets a usable title, and log the raw value to pin down the source.
    if (typeof game.name !== 'string' || !game.name.trim() || game.name.trim() === String(appid.appid)) {
      const raw = game.name;
      const normalized = normalizeGameName(raw, appid.appid);
      // normalizeGameName's own fallback is the bare appid. Only accept that once every offline
      // source has been asked - a numeric title is a failure the user has to look at, not a name.
      game.name = normalized && normalized !== String(appid.appid) ? normalized : resolveLocalGameName(appid) || String(appid.appid);
      if (game.name === String(appid.appid)) {
        game.nameUnresolved = true;
        debug.warn(`[${appid.appid}] no title from Steam and none known locally - showing the appid. Raw: ${JSON.stringify(raw)}`);
      } else {
        debug.warn(`[${appid.appid}] schema 'name' was ${raw === null ? 'null' : typeof raw}, resolved to "${game.name}". Raw: ${JSON.stringify(raw)}`);
      }
    }

    if (appid.steamappid) game.steamappid = appid.steamappid;
    if (appid.data && appid.data.uplayR2) {
      game.uplayR2 = true;
      game.system = 'uplay';
    }
    game.source = appid.source;
    if (!option.achievement.mergeDuplicate && appid.source) game.source = appid.source;
    const dataType = appid.data && appid.data.type;

    // Surface the auto-discovered install folder on the game object itself so the renderer
    // (Play button, Diagnose, Install GBE Fork) can reuse it instead of asking the user to
    // re-browse to a path the app already found during discover().
    // Prefer the folder found by the Goldberg scan; fall back to a name-based folder match so
    // non-Goldberg installs (GOG/standalone, bare cracks) also get an install dir.
    let resolvedGameDir = appid.data && appid.data.gameDir ? appid.data.gameDir : null;
    if (!resolvedGameDir && game.name) resolvedGameDir = await resolveGameDirByName(game.name);
    if (resolvedGameDir) game.gameDir = resolvedGameDir;
    promoteUplayRecord(appid, game, resolvedGameDir);
    if (appid.data && appid.data.steamSettings) game.steamSettings = appid.data.steamSettings;
    // The folder this entry's achievement data was parsed from, for the right-click "Open
    // achievement data folder" action. Empty for registry-backed sources.
    const dataPath = resolveAchievementDataPath(appid.data);
    if (dataPath) game.dataPath = dataPath;
    // One entry per source that contributed to this card. A merged card is the case where "where
    // does this come from?" is hardest to answer - the same game read from two emulators, or a GOG
    // copy sitting next to a Steam one - so each source keeps its own folder rather than collapsing
    // to whichever record happened to win the merge.
    const perSource = [];
    for (const record of Array.isArray(appid._sources) && appid._sources.length > 0 ? appid._sources : [appid]) {
      const p = resolveAchievementDataPath(record?.data);
      if (p && !perSource.some((s) => s.path.toLowerCase() === p.toLowerCase())) {
        perSource.push({ source: record?.source || appid.source || '', path: p });
      }
    }
    if (perSource.length > 0) game.dataPaths = perSource;
    let resolvedEmu = null;
    let resolvedExe = null;
    let resolvedExeConfident = false;
    let resolvedExeHint = null; // an unverified path from discovery: used only if detection finds nothing
    if (appid.data && appid.data.exe) {
      try {
        if (fs.existsSync(appid.data.exe)) {
          // Launcher manifests/DBs (Epic, GOG Galaxy, EA logs, Xbox config) name the exact exe the
          // launcher runs - that is authoritative. Unconfigured-scan hints are NOT authoritative:
          // they go through the same conservative confidence gate as any other folder.
          const authoritative = appid.data.exeAuthoritative === true;
          const supplied = {
            name: path.basename(appid.data.exe),
            full: appid.data.exe,
            size: fs.statSync(appid.data.exe).size,
            score: 0,
            confident: authoritative,
            confidence: authoritative ? 'authoritative' : 'hint',
          };
          if (authoritative) {
            resolvedExe = supplied;
            resolvedExeConfident = true;
          } else {
            /*
              A hint is a starting point, never a veto. Assigned to resolvedExe it short-circuited
              every `resolvedExe || exeDetect.detect(...)` below, so the gate the comment above
              promises never ran and the exe stayed unconfirmed forever - which is why the launch
              panel had no executable for games whose folder detection answers confidently.
            */
            resolvedExeHint = supplied;
          }
        }
      } catch {
        resolvedExe = null;
      }
    }

    // Detect emulators for name-resolved file entries that skipped the strict Goldberg scan.
    if (appid.data && appid.data.type === 'file') {
      // Every emulated/cracked ('file') game needs a definite boolean or the UI dot appears on only
      // some of them. False = no dll verified; legit Steam / RPCS3 / Uplay stay undefined (no dot).
      game.hasSteamApiDll = false;
      if (resolvedGameDir) {
        try {
          resolvedEmu = detectEmulatorCached(resolvedGameDir);
          game.hasSteamApiDll = resolvedEmu.dll.length > 0;
          if ((resolvedEmu.dll.length > 0 || resolvedEmu.steamSettings) && !appid.data.steamSettings) {
            const steamSettingsDir = resolvedEmu.steamSettings || path.join(path.dirname(resolvedEmu.dll[0]), 'steam_settings');
            game.steamSettings = steamSettingsDir;
            appid.data.steamSettings = steamSettingsDir;
            appid.data.needsSchema = goldberg.readLocalSchema(steamSettingsDir).length === 0;
          }
        } catch (err) {
          debug.log(`[${appid.appid}] emulator auto-detect on resolved gameDir failed => ${err}`);
        }
      }
    }

    // Auto-repair needs a real game binary; an uninstalled folder may only keep emulator files.
    if (resolvedGameDir && !(appid.data && appid.data.type === 'socialclub')) {
      resolvedExe = resolvedExe || exeDetect.detect(resolvedGameDir, game.name || '', { dllPaths: resolvedEmu ? resolvedEmu.dll : [] });
    }
    const realGameExePresent = () => !!(resolvedExe && resolvedExe.full && fs.existsSync(resolvedExe.full));

    // Repair missing emulator schemas and backfill blank descriptions from local files.
    if (appid.data && appid.data.steamSettings && game.achievement && Array.isArray(game.achievement.list)) {
      const showHidden = !!(option.achievement && option.achievement.showHidden);
      const hasBlank = game.achievement.list.some(
        (ac) => (ac.hidden != 1 || showHidden) && (!ac.description || String(ac.description).trim() === '')
      );
      if (hasBlank) {
        try {
          const local = goldberg.readLocalSchema(appid.data.steamSettings);
          if (local.length > 0) {
            const byName = new Map(local.filter((a) => a && a.name != null).map((a) => [String(a.name).toUpperCase(), a]));
            let filled = 0;
            for (const ac of game.achievement.list) {
              if (ac.hidden == 1 && !showHidden) continue; // skip hidden unless toggle is on
              const l = byName.get(String(ac.name).toUpperCase());
              if (!l) continue;
              if ((!ac.description || String(ac.description).trim() === '') && l.description && String(l.description).trim()) {
                ac.description = l.description;
                filled++;
              }
              if ((!ac.displayName || String(ac.displayName).trim() === '') && l.displayName && String(l.displayName).trim()) ac.displayName = l.displayName;
            }
            if (filled > 0) debug.log(`[${appid.appid}] backfilled ${filled} blank description(s) from local steam_settings schema`);
          }
        } catch (err) {
          debug.log(`[${appid.appid}] local schema backfill failed => ${err}`);
        }
      }
    }

    /*
      A folder already served by a known crack loader (ALI213, OnlineFix, TENOKE, SmartSteamEmu, ...)
      supplies its own Steam emulation and never reads a Goldberg steam_settings folder. AW Next
      already refuses to swap its DLL; writing GSE configs beside it was the same mistake by another
      route - inert files that then made Game Health report a missing achievement list for a game
      whose achievements come from somewhere else entirely (seen on ZOMBI: an empty achievement list
      inside a steam_settings folder, next to ALI213's own steam_api.dll).
    */
    const foreignCrackLoader = resolvedGameDir ? crackLoaderDetect.detectWorkingCrackLoader(resolvedGameDir) : null;
    if (foreignCrackLoader && appid.data && appid.data.steamSettings && option.emulator && option.emulator.autoApplyNewGames !== false) {
      removeInertGoldbergSettings(appid.data.steamSettings, appid.appid, foreignCrackLoader.name);
    }

    // Runtime GSE configs are required even when achievements.json already existed before AW saw the
    // game: a valid schema must not permanently skip DLC + identity/language generation. Create
    // missing files independently and keep user identity synchronized without repatching the emulator
    // DLL or rewriting the achievement schema.
    if (appid.data && appid.data.steamSettings && !foreignCrackLoader && /^[0-9]+$/.test(String(appid.appid)) && realGameExePresent()) {
      const steamSettings = appid.data.steamSettings;
      try {
        const appConfigFile = path.join(steamSettings, 'configs.app.ini');
        let needsDlcConfig = true;
        try {
          const current = fs.readFileSync(appConfigFile, 'utf8');
          needsDlcConfig = !/^\s*\[app::dlcs\][\s\S]*?^\s*unlock_all\s*=\s*1\s*$/im.test(current);
        } catch {}
        if (needsDlcConfig) {
          let dlcs = [];
          try { dlcs = await steam.getDLCList(appid.appid); } catch {}
          if (realGameExePresent()) {
            const dlc = goldberg.writeDlcConfig({ steamSettings, dlcs, unlockAll: true });
            debug.log(`[${appid.appid}] created configs.app.ini (unlock_all=1, ${dlc.count} DLC(s))`);
          }
        }
        if (realGameExePresent()) {
          const main = goldberg.writeMainConfig({ steamSettings });
          if (main && main.changed) debug.log(`[${appid.appid}] updated configs.main.ini (new_app_ticket=1, gc_token=1)`);
        }
        if (realGameExePresent()) {
          const user = goldberg.writeUserConfig({
            steamSettings,
            accountName: option.general && option.general.username,
            language: option.achievement && option.achievement.lang,
          });
          if (user && user.changed) debug.log(`[${appid.appid}] updated configs.user.ini (${user.accountName || 'default'}, ${user.language || 'default'})`);
        }
      } catch (err) {
        debug.log(`[${appid.appid}] runtime GSE config generation failed => ${err}`);
      }
    }

    const hasSteamAchievementSchema = !!(game.achievement && Array.isArray(game.achievement.list) && game.achievement.list.length > 0);

    /*
      Keep a Uplay R2 setup alive across game updates: a repack update re-extracts its own files and
      disables achievements. Re-apply the already-in-hand Steam schema locally, like the GBE side
      self-heals.
    */
    if (appid.data && appid.data.uplayR2 && resolvedGameDir && /^[0-9]+$/.test(String(appid.appid))) {
      try {
        const repairIdentity = uplayR2.resolveGameIdentity(
          { ...game, appid: appid.appid, data: appid.data, gameDir: resolvedGameDir, uplayR2: true },
          appid.appid
        );
        /*
          Skip the loader log: it can be tens of megabytes and only answers "why did nothing unlock",
          which is the panel's question, not the scan's. The setup verdict below needs the rest.
        */
        const report = uplayR2.diagnose({
          gameDir: resolvedGameDir,
          appid: appid.appid,
          name: game.name,
          mapping: repairIdentity.mapping,
          readLog: false,
        });
        /*
          The tile's status dot, answered by the scan instead of guessed at. Before this it fell back
          to "is steam_api.dll on disk?", which a Uplay game never has - so a correctly configured one
          showed the "not tracked" dot until someone opened Game health, and any change made there was
          invisible on the tile until the next scan.
        */
        game.uplayHealthy = report.issues.every((issue) => issue.level !== 'error');
        const selfHealAllowed = !!(
          hasSteamAchievementSchema &&
          option.emulator &&
          option.emulator.autoApplyNewGames !== false
        );
        const repairableCodes = new Set([
          'NO_UPLAY_R2_DLL',
          'NOT_UPLAY_R2_LOADER',
          'LOADER_ARCH_MISMATCH',
          'LOADER_ARCH_UNKNOWN',
          'NO_SCHEMA_JSON',
          'BAD_SCHEMA_JSON',
          'ACHIEVEMENTS_DISABLED',
          'NO_INI',
          'BAD_SAVE_REDIRECT',
          'SCHEMA_KEYS_NOT_CANONICAL',
        ]);
        const broken = selfHealAllowed && report.issues.some((issue) => repairableCodes.has(issue.code));
        // Same reason as the interactive repair: a game keyed from Ubisoft's own data needs that data
        // present, and it is fetchable rather than something to ask the user to go and produce.
        if (broken && report.mapping) await ubisoftOfficial.ensureAchievementsArchive(report.mapping.uplay_id).catch(() => '');
        const prefixInfo =
          broken && report.mapping
            ? uplayR2.resolveObjectiveKeying({ achievementList: game.achievement.list, uplayId: report.mapping.uplay_id })
            : null;
        if (broken && prefixInfo) {
          const loaderPaths = report.dll || [];
          const loader = report.loader || uplayR2.inspectInstalledLoaders(loaderPaths);
          const needsLoader = loaderPaths.length === 0 || !loader.supportsAchievements || !loader.architectureValid;
          let installPlan = null;
          if (needsLoader) {
            if (!_userDataPath) throw new Error('user data path unavailable for Uplay package cache');
            resolvedExe = resolvedExe || exeDetect.detect(resolvedGameDir, game.name || '', { dllPaths: loaderPaths });
            // The generation the install actually loads decides which package may be seeded.
            const flavour =
              uplayR2Installer.detectInstallFlavour({
                gameDir: resolvedGameDir,
                loaderPaths,
                exePath: resolvedExe && resolvedExe.full,
              }) || 'r2';
            const cache = await uplayR2Installer.ensureBundledEmulatorDlls({
              cacheDir: path.join(_userDataPath, `cache/${uplayR2Installer.packageFor(flavour).cacheName}`),
              flavour,
              log: debug,
            });
            installPlan = uplayR2Installer.planInstall({
              gameDir: resolvedGameDir,
              dlls: cache,
              loaderPaths,
              exePath: resolvedExe && resolvedExe.full,
              trustedInstall: true, // appid.data.uplayR2 was persisted by emulator-evidence discovery
            });
            if (!installPlan.safe) {
              throw new Error(`no architecture-safe loader target (${installPlan.issues.map((issue) => issue.code).join(', ')})`);
            }
          }
          const summary = uplayR2Installer.repairInstallation({
            gameDir: resolvedGameDir,
            installPlan,
            loaderPaths,
            steamAppid: report.mapping.steam_appid,
            uplayId: report.mapping.uplay_id,
            name: game.name,
            mapping: report.mapping,
            schema: game,
            prefix: prefixInfo.prefix,
            objectiveIds: prefixInfo.objectiveIds,
            accountName:
              (option.emulator && String(option.emulator.uplayUsername || '').trim()) ||
              (option.general && option.general.username),
            language:
              option.emulator && option.emulator.uplayLanguage && option.emulator.uplayLanguage !== 'auto'
                ? option.emulator.uplayLanguage
                : option.achievement && option.achievement.lang,
            logging: !!(option.emulator && option.emulator.uplayLogging),
            log: debug,
          });
          debug.log(
            `[${appid.appid}] Uplay R2 setup was incomplete (${report.issues.map((i) => i.code).join(', ')}) - validated repair in ${summary.runtimeDirs.join(', ')}`
          );
        } else if (broken) {
          debug.log(`[${appid.appid}] Uplay R2 setup is incomplete but cannot be auto-repaired (${report.issues.map((i) => i.code).join(', ')})`);
        }
      } catch (err) {
        debug.log(`[${appid.appid}] Uplay R2 auto-repair failed => ${err}`);
      }
    }

    let needsRuntimeFix = false;
    let runtimeFixReason = '';
    if (
      appid.data &&
      appid.data.type === 'file' &&
      resolvedGameDir &&
      hasSteamAchievementSchema &&
      /^[0-9]+$/.test(String(appid.appid)) &&
      option.emulator &&
      option.emulator.autoApplyNewGames !== false
    ) {
      try {
        resolvedEmu = resolvedEmu || detectEmulatorCached(resolvedGameDir);
        resolvedExe = resolvedExe || exeDetect.detect(resolvedGameDir, game.name || '', { dllPaths: resolvedEmu.dll });
        const arch = (resolvedExe && resolvedExe.full && pe.exeArch(resolvedExe.full)) || 'x64';
        const wanted = gbeInstaller.ARCH[arch] && gbeInstaller.ARCH[arch].file;
        const runtimeDirs = gbeInstaller.runtimeDllDirs({
          gameDir: resolvedGameDir,
          dllPaths: resolvedEmu.dll,
          exePath: resolvedExe && resolvedExe.full,
          steamSettings: appid.data.steamSettings,
          fallbackDir: resolvedGameDir,
        });
        const runtimeDirKeys = new Set(runtimeDirs.map((dir) => path.resolve(dir).toLowerCase()));
        const wantedDll =
          wanted &&
          resolvedEmu.dll.find(
            (file) => path.basename(file).toLowerCase() === wanted && runtimeDirKeys.has(path.resolve(path.dirname(file)).toLowerCase())
          );
        const cacheDir = _userDataPath ? path.join(_userDataPath, 'cache/gse_fork') : null;
        const hasWantedGbeDll = wantedDll && gbeInstaller.matchesCachedDll(wantedDll, cacheDir, arch);
        needsRuntimeFix = !!wanted && !!appid.data.steamSettings && !hasWantedGbeDll;
        runtimeFixReason = needsRuntimeFix ? (wantedDll ? `refresh-${wanted}` : `missing-${wanted}`) : '';
      } catch (err) {
        debug.log(`[${appid.appid}] runtime emulator fix check failed => ${err}`);
      }
    }

    if (
      appid.data &&
      appid.data.steamSettings &&
      hasSteamAchievementSchema &&
      (appid.data.needsSchema || needsRuntimeFix)
    ) {
      // Run slow emulator repair in the background, but never on a game a loader like OnlineFix
      // already hooks in place - swapping the DLL breaks its emulation. The manual "Apply emulator
      // fix" action can still override.
      const workingCrackLoader = foreignCrackLoader;
      if (workingCrackLoader) {
        debug.log(`[${appid.appid}] automatic emulator fix skipped - ${workingCrackLoader.name} loader already present in ${resolvedGameDir}`);
      }
      const canAutoApply = !!(
        option.emulator &&
        option.emulator.autoApplyNewGames !== false &&
        resolvedGameDir &&
        realGameExePresent() &&
        _userDataPath &&
        !workingCrackLoader
      );
      const fixKey = `${appid.appid}:${resolvedGameDir || appid.data.steamSettings}`;
      // Fingerprint the steam_settings content BEFORE the attempt: a successful setup writes into
      // the folder (schema/configs), so an unchanged version on a later scan means the last attempt
      // achieved nothing - don't relaunch it until the cool-down passes or someone changes the folder.
      let settingsVersion = null;
      try {
        settingsVersion = computeFolderContentVersion(appid.data.steamSettings, { prefix: 'emusetup' });
      } catch (err) {
        debug.log(`[${appid.appid}] steam_settings content-version failed => ${err}`);
      }
      const lastAttempt = settingsVersion ? _emuSetupAttempts.get(fixKey) : null;
      if (!realGameExePresent()) {
        debug.log(`[${appid.appid}] automatic emulator fix skipped - no game executable found in ${resolvedGameDir}`);
      } else if (_emuFixInFlight.has(fixKey)) {
        debug.log(`[${appid.appid}] emulator setup already running in background - will appear fixed on a later scan`);
      } else if (lastAttempt && lastAttempt.version === settingsVersion && Date.now() - lastAttempt.at < EMU_SETUP_RETRY_MS) {
        debug.log(`[${appid.appid}] emulator setup skipped - steam_settings unchanged since the last attempt (cool-down)`);
      } else {
        if (settingsVersion) _emuSetupAttempts.set(fixKey, { version: settingsVersion, at: Date.now() });
        _emuFixInFlight.add(fixKey);
        const bgAppid = appid.appid;
        const bgGameDir = resolvedGameDir;
        const bgSteamSettings = appid.data.steamSettings;
        const bgNeedsSchema = !!appid.data.needsSchema;
        const bgWorkingCrackLoader = workingCrackLoader;
        const bgGameName = game.name;
        const bgEmu = resolvedEmu;
        const bgExe = resolvedExe;
        // Snapshot the schema (shallow-copied list entries) so goldberg.repair reads a stable copy and
        // never races the foreground unlock-state merge that mutates the original list elements below.
        const bgSchema = {
          name: game.name,
          achievement: {
            total: game.achievement && game.achievement.total,
            list: game.achievement && Array.isArray(game.achievement.list) ? game.achievement.list.map((a) => ({ ...a })) : [],
          },
        };
        (async () => {
          let fixedSteamSettingsDirs = [];
          let fixApplied = false;
          if (canAutoApply) {
            try {
              const setup = await autoApplyEmulatorFix({
                gameDir: bgGameDir,
                gameName: bgGameName,
                appid: bgAppid,
                steamSettings: bgSteamSettings,
                option,
                detectedEmu: bgEmu,
                detectedExe: bgExe,
                schema: bgSchema,
                requireGameExecutable: true,
                onlyIfUnconfigured: true,
              });
              fixedSteamSettingsDirs = setup.steamSettingsDirs || [];
              fixApplied = !setup.skipped;
              if (setup.skipped) {
                debug.log(`[${bgAppid}] automatic emulator fix skipped - ${setup.reason}`);
              } else {
                debug.log(
                  `[${bgAppid}] automatic emulator fix complete (GBE Fork ${setup.tag || 'cached'}${runtimeFixReason ? `, ${runtimeFixReason}` : ''})`
                );
              }
            } catch (err) {
              debug.log(`[${bgAppid}] automatic emulator fix failed => ${err}`);
              reportEmulatorPackageBlocked(err);
            }
          }

          const schemaRepairDirs = new Set();
          const gameExeStillPresent = () => !!(bgExe && bgExe.full && fs.existsSync(bgExe.full));
          if (!bgWorkingCrackLoader && bgNeedsSchema && gameExeStillPresent() && goldberg.readLocalSchema(bgSteamSettings).length === 0) schemaRepairDirs.add(bgSteamSettings);
          for (const dir of fixedSteamSettingsDirs) {
            if (dir && gameExeStillPresent() && goldberg.readLocalSchema(dir).length === 0) schemaRepairDirs.add(dir);
          }

          /*
            Icons the last repair gave up on, retried on the same three-day cadence steam.js uses for
            descriptions and covers. The schema write only runs when there is no local schema, so
            without this pass a game whose art was not published yet would keep its empty images/
            folder forever - the marker suppresses the warning but nothing would look again.
          */
          const iconRecheckDirs = new Set();
          for (const dir of [bgSteamSettings, ...fixedSteamSettingsDirs]) {
            if (!dir || schemaRepairDirs.has(dir) || !gameExeStillPresent()) continue;
            if (goldberg.needsArtworkRecheck(dir)) iconRecheckDirs.add(dir);
          }

          if (schemaRepairDirs.size > 0) {
            const downloadIcon =
              option.achievement && option.achievement.goldbergDownloadIcons
                ? (() => {
                    const request = require('request-zero');
                    return async (url, dir) => {
                      // The raw schema URL routinely 404s for a new appid whose achievement art is
                      // not on Steam's primary CDN yet (see resolveWorkingIconUrl); try the mirror
                      // list the same way AW's own icon cache already does before giving up on it.
                      const resolved = (await steam.resolveWorkingIconUrl(bgAppid, url)) || url;
                      const r = await request.download(resolved, dir);
                      return r && r.path;
                    };
                  })()
                : undefined;
            for (const steamSettingsDir of schemaRepairDirs) {
              try {
                const summary = await goldberg.repair({
                  steamSettings: steamSettingsDir,
                  appid: bgAppid,
                  schema: bgSchema,
                  downloadIcon,
                  fetchDlc: (id) => steam.getDLCList(id),
                  accountName: option.general && option.general.username,
                  language: option.achievement && option.achievement.lang,
                });
                debug.log(
                  `[${bgAppid}] wrote missing achievements.json schema (${summary.achievementsJson.length} entries) to ${steamSettingsDir}` +
                    (downloadIcon ? ` + icons: ${summary.icons.downloaded} dl, ${summary.icons.failed} fail` : '') +
                    // Say why, or the log reads as 150 mystery failures. A whole set that 404s is
                    // Steam not hosting this appid's achievement art yet, not a broken install.
                    (summary.icons.unavailable ? ' (no achievement artwork published for this appid yet)' : '') +
                    (summary.dlc ? ` + ${summary.dlc.count} DLC(s)` : '') +
                    (summary.user && summary.user.language ? ` + lang ${summary.user.language}` : '')
                );
                // The schema this repair just wrote must not sit behind a remembered "not here".
                steam.forgetLocalSchemaLocations();
                try {
                  const runtime = goldberg.seedRuntimeSave({
                    appid: bgAppid,
                    schema: bgSchema,
                    steamSettings: steamSettingsDir,
                    types: ['gbe'],
                  });
                  if (runtime.created.length > 0) {
                    debug.log(`[${bgAppid}] seeded GBE runtime achievements (${runtime.entries} locked entries) at ${runtime.created.map((r) => r.file).join(', ')}`);
                  }
                } catch (seedErr) {
                  debug.log(`[${bgAppid}] could not seed GBE runtime achievements after schema repair => ${seedErr}`);
                }
              } catch (err) {
                debug.log(`[${bgAppid}] could not auto-write achievements.json schema to ${steamSettingsDir} => ${err}`);
              }
            }
          }

          if (iconRecheckDirs.size > 0 && option.achievement && option.achievement.goldbergDownloadIcons) {
            const request = require('request-zero');
            for (const steamSettingsDir of iconRecheckDirs) {
              try {
                const summary = await goldberg.repair({
                  steamSettings: steamSettingsDir,
                  appid: bgAppid,
                  schema: bgSchema,
                  downloadIcon: async (url, dir) => {
                    const resolved = (await steam.resolveWorkingIconUrl(bgAppid, url)) || url;
                    const r = await request.download(resolved, dir);
                    return r && r.path;
                  },
                  // Art only: leave the schema, the appid file and every config exactly as they are.
                  preserveRichSchema: true,
                  writeAppId: false,
                  writeDlc: false,
                  writeMain: false,
                });
                debug.log(
                  `[${bgAppid}] artwork recheck in ${steamSettingsDir}: ${summary.icons.downloaded} dl, ${summary.icons.failed} fail` +
                    (summary.icons.unavailable ? ' (still not published - will look again in 3 days)' : '')
                );
              } catch (err) {
                debug.log(`[${bgAppid}] artwork recheck failed for ${steamSettingsDir} => ${err}`);
              }
            }
          }

          // Notify the daemon so it can fire the "emulator fix applied" toast (the old in-band
          // emulatorJustFixed marker can't reach it anymore - this setup finishes after onGame ran).
          if (fixApplied && _onEmulatorFixed) {
            try {
              _onEmulatorFixed({ appid: bgAppid, name: bgGameName });
            } catch (err) {
              debug.log(`[${bgAppid}] emulator-fixed handler failed => ${err}`);
            }
          }
        })()
          .catch((err) => debug.log(`[${bgAppid}] background emulator setup error => ${err}`))
          .finally(() => _emuFixInFlight.delete(fixKey));
      }
    }

    // Auto-seed playtime tracking: when we know the game's install folder, detect its main executable
    // and pre-register it in the watchdog gameIndex so playtime is tracked without the user having to
    // launch the game once first. The same exe detection also doubles as the "really installed" disk
    // proof used by the "show installed only" toggle (see game.installed below).
    let hasResolvedExe = false;
    // Goldberg SocialClub has its own dedicated seed below (it needs the resolved Steam release and has
    // no install folder to run exe detection on). Without this guard the generic playtime seed would
    // run exe detection on the emulator's SAVE directory and register e.g. "SmartSteamEmu" as a real
    // game when a non-SocialClub watched folder was misclassified - folder roots must never become gameIndex entries.
    // A card titled with its bare appid must never reach the watchdog's index: that name is what
    // playtime cards and live notifications would show, and it would outlive the failed lookup that
    // produced it. Skip the seed and let the next scan write the real title.
    if (game.name && !game.nameUnresolved && !(appid.data && appid.data.type === 'socialclub')) {
      // Carry the Ubisoft product id into the watchdog's index. The emulator names its save folder
      // with that id, so without the pair the watchdog cannot tell which game an unlock under
      // "Goldberg UplayEmu Saves\<uplayId>" belongs to, and Uplay R2 games never fire a live
      // notification - they only appear after a manual refresh.
      const seedUplayId = (appid.data && appid.data.uplayId) || (appid.data && appid.data.uplayR2 ? uplayR2.resolveGameIdentity({ appid: appid.appid, name: game.name, gameDir: resolvedGameDir }).uplayId : '');
      const seed = (binary, how) => {
        // A binary another game claims with a better-matching name stays there; writing the losing
        // claim only made reconcile() clear it again after every scan. The identity row still seeds.
        const claimable = !gameIndex.binaryClaimedByBetterMatch(appid.appid, game.name, binary);
        gameIndex.upsert({
          appid: appid.appid,
          name: game.name,
          binary: claimable ? binary : '',
          ...gameIndexArtwork(game),
          source: appid.source,
          steamappid: game.steamappid || undefined,
          uplayId: seedUplayId,
        });
        if (claimable) debug.log(`[${appid.appid}] auto-seeded playtime tracking${how}: binary="${binary}"`);
        else debug.log(`[${appid.appid}] playtime seed kept without binary: "${binary}" belongs to another game`);
      };

      try {
        let seeded = false;
        // 1) On-disk detection, when the install folder is known. This is also the "really
        //    installed" proof used by the "show installed only" toggle, so only a real executable
        //    found here may set hasResolvedExe.
        if (resolvedGameDir) {
          const gameDirKey = path.resolve(resolvedGameDir).toLowerCase();
          if (_seededGameDirs.has(gameDirKey)) {
            debug.log(`[${appid.appid}] playtime auto-seed skipped: install folder already has a detected executable`);
            seeded = true;
          } else {
            const emu = resolvedEmu || detectEmulatorCached(resolvedGameDir);
            const exeInfo = resolvedExe || exeDetect.detect(resolvedGameDir, game.name, { dllPaths: emu.dll }) || resolvedExeHint;
            resolvedExe = exeInfo || resolvedExe;
            hasResolvedExe = !!exeInfo;
            if (!resolvedExeConfident && exeInfo && exeInfo.confident) resolvedExeConfident = true;
            if (exeInfo) {
              _seededGameDirs.add(gameDirKey);
              seed(exeInfo.name, '');
              seeded = true;
            }
          }
        }

        // 2) Launch metadata, for every game step 1 could not name a binary for - an obfuscated/renamed
        //    exe, a launcher-only install, or no install folder at all (the normal state for a game AW
        //    only knows through its emulator's save folder). Fetched through the main-process stealth
        //    browser (SteamDB 403s plain requests), disk-cached, best-effort - NOT awaited, since a
        //    5-20s serialized page load per game would blow the per-game load timeout and drop games.
        if (!seeded && /^[0-9]+$/.test(String(appid.appid)) && !gameIndex.has(appid.appid)) {
          const dirToMark = resolvedGameDir;
          seedPlaytimeFromSteamDb(appid.appid, (binary) => {
            if (dirToMark) _seededGameDirs.add(path.resolve(dirToMark).toLowerCase());
            seed(binary, ' from SteamDB');
          });
        }
      } catch (err) {
        debug.log(`[${appid.appid}] playtime auto-seed failed: ${err}`);
      }
    }

    // Surface the launch exe for the renderer's launch panel only when it is either supplied by
    // the launcher itself (Epic/GOG/EA/Xbox manifests) or passed the conservative confidence gate.
    // Ambiguous folders are deliberately NOT exposed here - reconcile() / Play will ask the user
    // instead of guessing.
    resolvedExe = resolvedExe || resolvedExeHint;
    if (resolvedExe && resolvedExeConfident) {
      game.exe = resolvedExe.full;
      game.exeConfident = true;
    }

    // Goldberg SocialClub has no install folder (its data lives in %APPDATA%), but the Watchdog
    // still needs a gameIndex entry (with the resolved Steam release) to attribute a live unlock
    // under "Goldberg SocialClub Emu Saves\<Game>\<profile>\…" back to this game.
    if (appid.data && appid.data.type === 'socialclub' && game.name && game.steamappid && /^[0-9]+$/.test(String(game.steamappid))) {
      try {
        // The row itself is what the Watchdog needs; the binary only sharpens process matching.
        // Write the row now and let the (slow, browser-backed) SteamDB lookup fill the binary in
        // afterwards, so this never sits on the game-load critical path either.
        const row = {
          appid: appid.appid,
          name: game.name,
          ...gameIndexArtwork(game),
          source: appid.source,
          steamappid: game.steamappid,
        };
        gameIndex.upsert(row);
        debug.log(`[${appid.appid}] seeded SocialClub gameIndex (Steam ${game.steamappid})`);
        seedPlaytimeFromSteamDb(game.steamappid, (binary) => {
          gameIndex.upsert({ ...row, binary });
          debug.log(`[${appid.appid}] SocialClub gameIndex binary resolved: "${binary}"`);
        });
      } catch (err) {
        debug.log(`[${appid.appid}] SocialClub gameIndex seed failed: ${err.message || err}`);
      }
    }

    // Ubisoft Connect official entries also need a gameIndex row so the Watchdog's live spool watcher
    // can attribute a <productId>.spool change back to the app's resolved game name and Steam release
    // - including titles resolved generically from the configurations block or the local Steam library.
    if (appid.data && appid.data.type === 'ubisoftOfficial' && game.name && appid.data.uplayId) {
      try {
        gameIndex.upsert({
          appid: appid.appid,
          name: game.name,
          binary: '',
          ...gameIndexArtwork(game),
          source: appid.source,
          steamappid: game.steamappid || undefined,
          uplayId: String(appid.data.uplayId),
        });
        debug.log(`[${appid.appid}] seeded Ubisoft Connect gameIndex (${game.name}${game.steamappid ? `, Steam ${game.steamappid}` : ''})`);
      } catch (err) {
        debug.log(`[${appid.appid}] Ubisoft Connect gameIndex seed failed: ${err.message || err}`);
      }
    }

    for (let appid of appids) {
      if (isDuplicate && !option.achievement.mergeDuplicate) continue;

      let root = {};
      try {
        if (dataType === 'file') {
          root = await steam.getAchievementsFromFile(appid.data.path);
          /*
            The same folder can hold a Steam-emulator save AND the redirect target of a Uplay
            loader - that is exactly what "AchSavePath = GSE Saves\<steamAppid>" produces, and a
            dual-layer repack has both for real. Keys the Uplay side can translate win, because a
            bare objective id means nothing to the Steam reader; keys that already are api-names
            pass through the translation untouched, so nothing is lost either way.
          */
          if (appid.data.uplayR2) root = { ...root, ...readUplayR2Save(appid, game) };
          // An empty file is a 0% game, not an error - warn instead of throwing.
          if (root.constructor === Object && Object.entries(root).length === 0) warnEmptyAchievementFileOnce(appid.appid, appid.data.path);
        } else if (dataType === 'uplayR2') {
          // Goldberg Uplay R2. Unlike the Steam emus there is no single well-known folder: the loader
          // resolves its save dir from its own ini (SaveType/SavePath, plus AchSavePath on
          // redirect-capable builds), and a game update that re-extracts the repack's ini moves it
          // without warning. Ask uplayR2 for every plausible location, then translate the emulator's
          // Ubisoft objective ids onto Steam api-names.
          root = readUplayR2Save(appid, game);
        } else if (dataType === 'reg') {
          root = await greenluma.getAchievements(appid.data.root, appid.data.path);
        } else if (dataType === 'steamAPI') {
          root = await steam.getAchievementsFromAPI({
            appID: appid.appid,
            user: appid.data.userID,
            path: appid.data.cachePath,
          });
        } else if (dataType === 'rpcs3') {
          root = await rpcs3.getAchievements(appid.data.path, game.achievement.total);
        } else if (dataType === 'shadps4') {
          root = await shadps4.getAchievements(appid.data.path);
        } else if (dataType === 'xlln') {
          root = xlln.getAchievements(appid.data);
        } else if (dataType === 'xenia') {
          root = await xenia.getAchievements(appid.data.path);
        } else if (dataType === 'socialclub') {
          root = await socialclub.getAchievements(appid);
        } else if (dataType === 'lumaplay') {
          root = uplay.getAchievementsFromLumaPlay(appid.data.root, appid.data.path);
        } else if (dataType === 'ea') {
          root = await ea.getAchievements(appid);
        } else if (dataType === 'gogOfficial') {
          root = gogOfficial.getAchievements(appid);
        } else if (dataType === 'ubisoftOfficial') {
          root = ubisoftOfficial.getAchievements(appid);
        } else if (dataType === 'epicOfficial') {
          root = await epicOfficial.getAchievements(appid);
        } else if (dataType === 'manual') {
          root = {};
        } else if (dataType === 'cached') {
          root = await watchdog.getAchievements(appid.appid);
        } else if (dataType === 'uplay') {
          // Legit Ubisoft Connect exposes no local unlock-state file the way the Steam emus do, so
          // only the schema is available (already loaded into `game`). Show the game with everything
          // locked instead of throwing a misleading "Not yet implemented" FAIL on every scan.
          root = {};
        } else if (!dataType) {
          // No discovery record (e.g. the overlay was opened for an appid that is not in the
          // library): there is no local save to read, so the schema-only game still loads.
          root = {};
        } else {
          throw `Unsupported achievement source type "${dataType}" for appid ${appid.appid}`;
        }
      } catch (err) {
        // A missing save file is the normal 0%-game case (emulator made the folder but nothing is
        // unlocked yet) - the game still shows with its full schema, all locked. Log it as info, not
        // a scary error, so the debug log highlights real parse failures instead of expected 0% games.
        if (String(err).includes('No achievement file found')) {
          debug.log(`[${appid.appid}] No unlocked achievements yet (0%) in '${appid.data.path}'`);
        } else {
          debug.error(`[${appid.appid}] Error parsing local achievements data => ${err}`);
        }
      }

      if (appid.data && appid.data.steamSettings && root && typeof root === 'object') {
        try {
          const applied = applyLocalStatProgress(root, goldberg.readLocalSchema(appid.data.steamSettings));
          if (applied > 0) debug.log(`[${appid.appid}] mapped ${applied} stat progress entr${applied === 1 ? 'y' : 'ies'} through local GBE schema`);
        } catch (err) {
          debug.log(`[${appid.appid}] local stat progress mapping failed => ${err}`);
        }
      }

      if (root && typeof root === 'object' && Array.isArray(root.__rawStatKeys)) {
        // Raw Stats.ini values merged in by steam.js purely to feed applyLocalStatProgress above -
        // not real achievement records. Left in place they'd each fail schema matching below (e.g.
        // a schema entry literally named "stat_1" never exists) and spam one warning per stat.
        for (const key of root.__rawStatKeys) delete root[key];
      }

      if (game.achievement.list.length === 0 && root && typeof root === 'object' && Object.keys(root).length > 0) {
        // No schema to match against at all (e.g. the game has no real Steam achievements) -
        // iterating would just spam one ACH_NOT_FOUND_IN_SCHEMA warning per save entry.
        debug.warn(`[${appid.appid}] Local save has ${Object.keys(root).length} achievement entr${Object.keys(root).length === 1 ? 'y' : 'ies'} but the schema has none - skipping match`);
        root = {};
      }

      const rootEntries = root == null ? [] : Object.values(root);
      const schemaIndex = buildAchievementSchemaIndex(game.achievement.list, {
        includeCrc: rootEntries.some((entry) => entry && entry.crc),
      });

      // Counted, not logged one by one: a save whose api-names no longer line up with the schema
      // (renamed prefix, deleted achievements, a repack that swapped the emulator layer) misses on
      // every entry, and logging each one writes hundreds of identical lines per game per scan -
      // enough to churn the 2 MB parser.log rotation on its own. The aggregate carries the same signal.
      let schemaMissCount = 0;
      for (let i in root) {
        if (Object.prototype.hasOwnProperty.call(root, i)) {
          try {
            let achievement = findAchievementInSchema(schemaIndex, root[i], i);
            if (!achievement) throw 'ACH_NOT_FOUND_IN_SCHEMA';

            let parsed = normalizeSaveEntry(root[i], game.source);

            if (isDuplicate) {
              if (parsed.Achieved && !achievement.Achieved) {
                achievement.Achieved = true;
              }

              if (
                (!achievement.CurProgress && parsed.CurProgress > 0) ||
                (parsed.CurProgress > 0 && parsed.MaxProgress == achievement.MaxProgress && parsed.CurProgress > achievement.CurProgress)
              ) {
                achievement.CurProgress = parsed.CurProgress;
              }

              if (!achievement.MaxProgress && parsed.MaxProgress > 0) {
                achievement.MaxProgress = parsed.MaxProgress;
              }

              if (option.achievement.timeMergeRecentFirst) {
                if (!achievement.UnlockTime || achievement.UnlockTime == 0 || parsed.UnlockTime > achievement.UnlockTime) {
                  achievement.UnlockTime = parsed.UnlockTime;
                }
              } else {
                if (!achievement.UnlockTime || achievement.UnlockTime == 0 || (parsed.UnlockTime > 0 && parsed.UnlockTime < achievement.UnlockTime)) {
                  achievement.UnlockTime = parsed.UnlockTime;
                }
              }
            } else {
              Object.assign(achievement, parsed);
              isDuplicate = true;
            }
          } catch (err) {
            if (err === 'ACH_NOT_FOUND_IN_SCHEMA') {
              schemaMissCount++;
            } else {
              debug.error(`[${appid.appid}] Unexpected Error: ${err}`);
            }
          }
        }
      }
      if (schemaMissCount > 0) {
        debug.warn(
          `[${appid.appid}] ${schemaMissCount} saved achievement${schemaMissCount === 1 ? '' : 's'} not found in the game schema - probably deleted or renamed over time`
        );
      }
    }
    game.achievement.unlocked = game.achievement.list.filter((ach) => ach.Achieved == 1).length;
    // Reconcile the denominator with the real achievement list. A schema/list desync could leave
    // `total` at 0 (or below the number actually displayed), producing the "39 / 0" the UI shows for a
    // completed game and percentages above 100%. The list is what the detail view renders, so it is the
    // authoritative count; never let total be smaller than it.
    if (!Number.isFinite(game.achievement.total) || game.achievement.total < game.achievement.list.length) {
      game.achievement.total = game.achievement.list.length;
    }

    /*
      Does anything other than a cache entry say this game exists? Owning a game and not having played
      it yet is not a reason to hide it - the filter must not require achievements or a verified
      install. The one entry with genuinely nothing behind it is a watchdog cache import with no save
      file and no install folder: a record of a game seen once on some machine, which is what this
      filter is for. Everything else was found by looking at this PC - an account library, a save, an
      install - and is real.
    */
    game.evidenceless =
      dataType === 'cached' && !resolveAchievementDataPath(appid.data || {}) && !(appid.data && appid.data.gameDir);

    // Mark whether the game has a verified installation for the filter.
    game.installed = installState.isInstalled({
      dataType,
      hasResolvedExe,
      trustedInstalled:
        (appid.data && appid.data.installed === true) ||
        !!(appid.data && appid.data.trustedInstalled) ||
        (dataType === 'uplay' ? uplay.isInstalled(appid.appid) : false) ||
        (dataType === 'ubisoftOfficial' && appid.data && appid.data.uplayId ? uplay.isInstalled(appid.data.uplayId) : false),
    });

    // The renderer never receives appid.data, but it needs to know an entry came from the legitimate
    // Steam account to offer a client install instead of a file picker.
    game.steamOfficial = dataType === 'steamAPI';

    // With no Steam connection, the Map is empty and everything stays owned: today's behavior.
    game.ownership = game.steamOfficial ? _steamOwnership.get(String(appid.appid)) || 'owned' : '';
    game.familyOwners = game.ownership === 'family' ? _steamFamilyOwners.get(String(appid.appid)) || [] : [];

    return game;
  } catch (err) {
    // `requestedAppid` is a discovery RECORD ({appid, data}), not an id - interpolating it printed
    // "[object Object]" and made the one error line in the log useless for finding the game.
    debug.error(`[${requestedAppid?.appid ?? requestedAppid}] Error parsing local achievements data => ${err} > SKIPPING`);
  }
};

/*
  True when every folder the last full discovery read still has the timestamp it had then.

  The background new-install poll uses this to skip a scan it does not need. It only sees the
  filesystem sources, so a caller must still run a real discovery from time to time for the ones
  that live in a database or the registry, and "no baseline yet" reports false so the first tick
  always scans.
*/
module.exports.discoveryInputsUnchanged = () => dirFingerprint.matches(_discoverFingerprint);

// Manual refresh: forget the memoized install-folder walks so a game patched in place is re-read.
module.exports.forgetInstallScanCache = () => {
  exeCandidateCache.forget();
  exeCandidateCache.flush();
  _discoverFingerprint = null;
};

// Lightweight discovery-only pass: runs the same folder/library walk makeList uses but skips the
// heavy per-game achievement/icon loading. Returns the list of discovered appids (as strings).
// Used by the renderer's periodic background detection to spot newly-installed games cheaply and
// decide whether a full refresh (which re-seeds the watchdog gameIndex) is worth running.
module.exports.detectInstalledAppids = async (option) => {
  try {
    const list = await discoverWithCache(option, option.steam.main);
    return list.map((g) => String(g.appid));
  } catch (err) {
    debug.error(`detectInstalledAppids failed => ${err}`);
    return [];
  }
};

// Steam ownership for the current refresh. Empty by default: with no Steam connection the Map stays
// empty, classify() reports nothing, and every entry keeps today's behavior.
// The whole step blocks the scan, and none of the calls under it carries its own deadline: a Steam
// endpoint that accepts the connection and then never answers used to hold the game list forever.
// Ownership only decorates entries, so giving up on it is always better than not listing the games.
const STEAM_OWNERSHIP_TIMEOUT_MS = 15000;
let _steamOwnership = new Map();
let _steamFamilyOwners = new Map();

// One read per refresh: steamAccount's 6-hour cache absorbs closely-spaced scans, and classify()
// marks nothing stale when the list comes back empty. The token comes from the main process, which
// owns the encrypted session; outside the renderer ipcInvoke returns null and this step is just skipped.
// Steam playtime copied into the local counter. A game played on another machine, or played for years
// before AW was installed, used to show an empty time even though Steam knew about it. The local
// counter stays authoritative afterward: the watchdog keeps incrementing from this value, and
// seedFromSteam only writes when it advances, so a scan that learns nothing never touches the registry.
async function seedPlaytimeFromSteamLibrary(steamPlaytime) {
  if (!steamPlaytime || steamPlaytime.size === 0) return;
  const playtime = require('./playtime.js');
  let seeded = 0;
  for (const [appid, value] of steamPlaytime) {
    try {
      if (await playtime.seedFromSteam(appid, value)) seeded++;
    } catch (err) {
      debug.log(`[steam] playtime seed failed for ${appid}: ${err && err.message ? err.message : err}`);
    }
  }
  if (seeded > 0) debug.log(`[steam] playtime: ${seeded} counter(s) advanced from the Steam library`);
}

async function refreshSteamOwnership(appidList) {
  _steamOwnership = new Map();
  _steamFamilyOwners = new Map();
  try {
    const steamRecords = (appidList || []).filter((rec) => rec && rec.data && rec.data.type === 'steamAPI');
    if (steamRecords.length === 0) return;

    const { token, steamid } =
      (await withTimeout(ipcInvoke('steam:ensure-token'), STEAM_OWNERSHIP_TIMEOUT_MS, 'steam:ensure-token timed out')) || {};
    if (!token || !steamid) return;

    const steamAccount = require('./steamAccount.js');
    const cacheDir = path.join(_userDataPath || userDataDir(), 'steam_cache');
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const library = await withTimeout(
      steamAccount.loadLibrary({
        cacheFile: path.join(cacheDir, 'library.json'),
        token,
        steamid,
        log: (message) => debug.log(message),
      }),
      STEAM_OWNERSHIP_TIMEOUT_MS,
      'steam library fetch timed out'
    );

    _steamOwnership = steamAccount.classify({
      owned: library.owned,
      family: library.family,
      installed: steamRecords.filter((rec) => rec.data.installed === true).map((rec) => rec.appid),
      listed: steamRecords.map((rec) => rec.appid),
    });
    _steamFamilyOwners = library.owners;

    let stale = 0;
    for (const state of _steamOwnership.values()) if (state === 'stale') stale++;
    debug.log(`[steam] ownership: ${_steamOwnership.size} listed, ${library.owned.length} owned, ${library.family.length} family, ${stale} stale`);

    await seedPlaytimeFromSteamLibrary(library.playtime);
  } catch (err) {
    debug.log(`[steam] ownership check skipped: ${err}`);
  }
}

/*
  Pair the Ubisoft product ids this scan could not resolve with their Steam releases, and remember
  what is learned so the next scan resolves them synchronously.

  Deliberately after the scan and never awaited by it: it needs the network, and discovery must stay
  a function of what is on disk. It refuses far more often than it answers - see uplayAutoMap for
  why a wrong AppID here is worse than no AppID at all.
*/
async function learnUplayProductMappings() {
  /*
    Refresh first and unconditionally: the catalogue is what NAMES a Ubisoft product and what carries
    its official boxart, both of which matter for games the shipped table already maps. Gating it on
    "did anything fail to resolve" meant a library where everything resolves - which is every library
    today - never fetched it at all. refresh() is a no-op inside its own TTL, so this is one request
    a week, off the critical path.
  */
  try {
    await uplayCatalogue.refresh();
  } catch (err) {
    debug.log(`[uplay-automap] catalogue refresh failed => ${err}`);
  }

  const ids = uplayR2.takeUnresolvedProducts();
  if (ids.length === 0) return 0;
  let learned = 0;
  for (const id of ids) {
    try {
      const resolved = await uplayAutoMap.resolve(id, { steam });
      if (!resolved) continue;
      if (uplayR2.saveProductMapping({ uplayId: id, steamAppid: resolved.steamAppid, steamName: resolved.steamName })) learned++;
    } catch (err) {
      debug.log(`[uplay-automap] ${id} could not be resolved => ${err}`);
    }
  }
  if (learned > 0) {
    // A learned pairing is read synchronously by the next discovery, so the cached one - which
    // dropped those very save folders for having no Steam equivalent - must not be served again.
    // Without this the game stayed missing until the cache aged out or the app was restarted.
    _discoverCache = null;
    debug.log(`[uplay-automap] learned ${learned} Ubisoft product mapping(s) of ${ids.length} unknown - they apply from the next scan`);
  }
  return learned;
}

module.exports.learnUplayProductMappings = learnUplayProductMappings;

module.exports.makeList = async (option, callbackProgress, onGame = () => {}) => {
  try {
    debug.log('Scanning for games ...');
    _emuCache = new Map();
    _seededGameDirs = new Set();
    const scanStart = Date.now();

    let result = [];

    // Reuse the discovery phase if an identical scan ran within DISCOVER_TTL_MS (e.g. a settings-save
    // rescan moments after load). Per-game unlock state is still loaded fresh below.
    let appidList = await discoverWithCache(option, option.steam.main);
    let finalList = appidList;
    if (option.achievement.mergeDuplicate) {
      appidList = mergeCrossSourceDuplicates(appidList);

      const seen = new Map();
      const duplicates = new Set();
      const result = [];
      for (const game of appidList) {
        if (seen.has(game.appid)) {
          duplicates.add(game.appid);
        } else {
          seen.set(game.appid, game);
        }
      }
      for (const game of appidList) {
        if (duplicates.has(game.appid)) {
          if (!result.some((g) => g.appid === game.appid)) {
            result.push({
              appid: game.appid,
              source: game.source,
            });
          }
        } else {
          result.push(game);
        }
      }
      finalList = result;
    }
    const discoveryLookup = buildDiscoveryLookup(appidList);
    // Announce the real total before the first game resolves, so the UI can size its placeholders to
    // what is actually coming instead of guessing from the previous session. Reported before the
    // ownership call, not after: that call is network-bound, and until it returned the progress bar
    // had nothing to show but the previous scan's percentage.
    if (finalList.length > 0) callbackProgress(0, finalList.length);
    await refreshSteamOwnership(appidList);
    if (finalList.length > 0) {
      gameIndex.beginBatch();
      try {
        let count = 0;
        // Bounded concurrency: firing every game at once would spike disk reads/sockets/file handles
        // all together. A small worker pool caps how many games load in parallel while they still
        // stream into the UI via onGame as each one resolves. The keyless schema path is plain HTTP
        // now, so this pool no longer needs to stay small to protect a Puppeteer browser - browser
        // fallbacks (SteamDB covers, top-owners) already serialize on their own queues.
        const CONCURRENCY = 8;
        let cursor = 0;
        const worker = async () => {
          while (cursor < finalList.length) {
            const appid = finalList[cursor++];
            const startTime = Date.now();
            debug.log(`[${appid.appid}] loading data...`);
            let game;
            try {
              game = await withTimeout(
                this.getSavedAchievementsForAppid(option, appid, appidList, discoveryLookup),
                GAME_LOAD_TIMEOUT_MS,
                `[${appid.appid}] timed out after ${GAME_LOAD_TIMEOUT_MS / 1000}s`
              );
            } catch (err) {
              debug.error(`[${appid.appid}] load failed => ${err}`);
            }
            const endTime = Date.now();
            if (!game) {
            // Do NOT auto-blacklist on a failed load: getGameData() swallows every error (network
            // hiccup, rate-limit, CDN down) and returns undefined, so a single transient failure must
            // not permanently hide a real game. Just skip it for this scan and retry next time.
            // Intentional exclusions (hardcoded bogus list, server list, manual "blacklist" action) keep working untouched.
            debug.log(`[${appid.appid}] could not load (will retry next scan) - took ${(endTime - startTime) / 1000} seconds.`);
            // ...but the card must still appear. The achievement data on disk is what proves the game
            // exists; the lookup that failed only decorates it. Dropping the entry would make the
            // library depend on network luck - each scan listing a different handful of games, a
            // missing card indistinguishable from one that was never installed.
            game = buildProvisionalGame(appid);
            }
            // Everything a real source found on this PC belongs in the library, whether or not it has
            // achievements and whether or not it is installed right now - a game with none renders as
            // "No achievements", the truth about it. Only an evidenceless cache import is dropped (see
            // game.evidenceless); a provisional entry stands for on-disk data found but not yet decorated.
            if (game && !game.evidenceless) {
              result.push(game);
            /*
              Hand the game straight to the caller - never via requestAnimationFrame: rAF only fires for
              a VISIBLE document, and this tray window is usually hidden with backgroundThrottling, so
              deferred callbacks never run and a background scan would look empty, retriggering full
              refreshes every few minutes.
            */
              onGame?.(game);

              debug.log(`[${game.appid}] ${game.name} took ${(endTime - startTime) / 1000} seconds.`);
            }
            count++;
            callbackProgress(Math.floor((count / finalList.length) * 100), finalList.length);
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, finalList.length) }, () => worker()));
      } finally {
        gameIndex.endBatch();
      }
    }
    debug.log(`makeList: ${result.length} game(s) in ${((Date.now() - scanStart) / 1000).toFixed(2)}s`);
    // Not awaited: the library is complete without it, and what it learns lands on the next scan.
    learnUplayProductMappings().catch((err) => debug.log(`[uplay-automap] background pass failed => ${err}`));
    callbackProgress(100);
    await new Promise((r) => setTimeout(r, 10));
    return result;
  } catch (err) {
    debug.error(err);
    throw err;
  }
};

// Exposed for unit tests.
module.exports._internal = {
  normalizeSaveEntry,
  removeInertGoldbergSettings,
  declaredEmulatorAppid,
  promoteUplayRecord,
  buildProvisionalGame,
  resolveLocalGameName,
  buildDiscoveryLookup,
  getDiscoverySources,
  mergeCrossSourceDuplicates,
  isOfficialLauncherInstall: (dir) => launcherDetect.isOfficialLauncherInstall(dir),
  dropSteamOwnedRecords,
  isLibraryLikeFolderName: (name) => saveRoots.isLibraryLikeFolderName(name),
};
