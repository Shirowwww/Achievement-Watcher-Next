'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const tasklist = require('../util/tasklist');
const Timer = require('./timer.js');
const TimeTrack = require('./track.js');
const { findByReadingContentOfKnownConfigfilesIn } = require('./steam_appid_find.js');
const { loadSteamData } = require('../steam.js');
const { buildBinaryIndex, buildSeededSessions, getBinaryMatches, mergeGameIndexes, pickGameForProcess, snapshotActiveGames } = require('./seed.js');
const { createPollingProcessMonitor } = require('./pollingProcessMonitor.js');
const { userDataDir } = require('../util/userData.js');
const { configuredExecutable } = require('../util/exeList.js');
const watchdogSettings = require('../settings.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { loadRegodit } = require('../util/regodit.js');

const debug = new (require('../util/logger'))({
  console: true,
  file: path.join(userDataDir(), 'logs/playtime.log'),
});

// filter.json is optional; missing it means no extra process filters.
let blacklist;
try {
  blacklist = require('./filter.json');
} catch {
  blacklist = { ignore: [], mute: [] };
}
if (!blacklist || typeof blacklist !== 'object') blacklist = {};
if (!Array.isArray(blacklist.ignore)) blacklist.ignore = [];
if (!Array.isArray(blacklist.mute)) blacklist.mute = [];
let gameIndex;
let gameIndexByBinary;
let disabledOfficialSteamAppids = new Set();
// Whether official Steam games are a source: a game Steam launched that the index does not know is one.
let officialSteamTracked = false;
let appidByDirCache;
// The directory -> appid memo is capped and evicts in insertion order, since a long-running daemon
// sees unbounded process directories; losing an entry just costs one extra glob scan.
const APPID_BY_DIR_CACHE_MAX = 512;
function rememberAppidForDir(dirKey, appid) {
  if (appidByDirCache.size >= APPID_BY_DIR_CACHE_MAX) {
    const oldest = appidByDirCache.keys().next();
    if (!oldest.done) appidByDirCache.delete(oldest.value);
  }
  appidByDirCache.set(dirKey, appid);
}
let ignoredAppidsCache = { mtimeMs: null, set: new Set() };

const systemTempDir = os.tmpdir() || process.env['TEMP'] || process.env['TMP'];
const userExclusionFile = path.join(userDataDir(), 'cfg/exclusion.db');
const builtinIgnoredAppids = new Set([
  '480', // Space War
  '753', // Steam Config
  '250820', // SteamVR
  '228980', // Steamworks Common Redistributables
  '431960', // Wallpaper Engine
]);
const wallpaperProcessNames = new Set(['wallpaperui.exe', 'wallpaper32.exe', 'wallpaper64.exe', 'wallpaperservice32.exe', 'winrtutil32.exe', 'winrtutil64.exe']);

// Joins a path under an environment root, tolerating an unset variable: the mute list is built at
// module load, so a missing SystemRoot used to throw and take the whole monitor down with it.
function envPath(variable, ...segments) {
  const root = process.env[variable];
  return root ? path.join(root, ...segments) : '';
}

const filter = {
  ignore: blacklist.ignore, //WMI WQL FILTER
  mute: {
    dir: [
      systemTempDir,
      process.env['USERPROFILE'],
      process.env['APPDATA'],
      path.join(__dirname, '../..'),
      process.env['LOCALAPPDATA'],
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      envPath('SystemRoot', 'System32'),
      envPath('SystemRoot', 'SysWOW64'),
      envPath('SystemRoot'),
      ...(process.platform === 'linux' ? linuxMutedDirs() : []),
    ],
    file: blacklist.mute,
  },
};

// Linux counterparts of the roots above: the distribution's own programs, C:\windows in every Wine
// prefix, and the runtimes Steam, umu, Lutris, Heroic and Bottles run games through. A pattern
// stands for a folder that exists once per prefix or per Steam library; it is tested against the
// lower-case path with forward slashes.
function linuxMutedDirs() {
  return [
    '/bin',
    '/sbin',
    '/lib',
    '/lib32',
    '/lib64',
    '/usr/bin',
    '/usr/sbin',
    '/usr/lib',
    '/usr/lib32',
    '/usr/lib64',
    '/usr/libexec',
    '/usr/share',
    '/run',
    '/snap',
    /\/drive_c\/windows\//,
    /\/steamapps\/common\/(steamlinuxruntime[^/]*|proton( [^/]*)?|steamworks shared)\//,
    /\/ubuntu12_(32|64)\//,
    /\/compatibilitytools\.d\//,
    /\/umu\/steamrt[^/]*\//,
    /\/lutris\/(runners|runtime)\//,
    /\/heroic\/tools\//,
    /\/bottles\/(runners|dxvk|vkd3d)\//,
  ];
}

function normalizeAppid(appid) {
  return String(appid || '').trim();
}

// Ignore process paths listed in the optional mute filter: a folder and everything below it, or a
// pattern anywhere in the path.
function isMutedByPath(filepath, dirs) {
  if (!filepath) return false;
  // Normalize Windows paths even when tests run on another host.
  const norm = (p) => String(p).replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
  const file = norm(filepath);
  const lastSeparator = file.lastIndexOf('/');
  const dir = lastSeparator < 0 ? '' : file.slice(0, lastSeparator);
  return (Array.isArray(dirs) ? dirs : []).some((dirpath) => {
    if (!dirpath) return false;
    if (dirpath instanceof RegExp) return dirpath.test(file);
    const root = norm(dirpath);
    return root !== '' && (dir === root || dir.startsWith(root + '/'));
  });
}

function getIgnoredAppids() {
  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(userExclusionFile).mtimeMs;
  } catch {
    mtimeMs = -1;
  }
  if (ignoredAppidsCache.mtimeMs === mtimeMs) return ignoredAppidsCache.set;

  const ignored = new Set(builtinIgnoredAppids);
  try {
    const user = JSON.parse(fs.readFileSync(userExclusionFile, 'utf8'));
    if (Array.isArray(user)) {
      for (const appid of user) ignored.add(normalizeAppid(appid));
    }
  } catch {
    // Optional user file; built-ins still apply.
  }
  ignoredAppidsCache = { mtimeMs, set: ignored };
  return ignored;
}

// Steam sells non-game apps (DSX, Lossless Scaling, SteamVR, etc.) that would inflate playtime if
// tracked as one; appinfo.vdf's common.type is Steam's own local, offline verdict for excluding them.
const steamCatalogue = { path: '', resolved: false };
const nonGameVerdicts = new Map();

async function steamClientCandidates() {
  if (process.platform !== 'win32') return [require(sharedAppModulePath('parser/steamLibrary.js')).steamClientDir()];
  const regedit = await loadRegodit();
  // Same two hives, in the same order, as app/parser/steam.js getSteamPath(): some emulators
  // rewrite the HKCU value to the game's own folder, and the WOW6432Node install path is the
  // fallback the Steam client repairs on startup.
  return [
    ['HKCU', 'Software/Valve/Steam', 'SteamPath'],
    ['HKLM', 'Software/WOW6432Node/Valve/Steam', 'InstallPath'],
  ].map(([root, key, name]) => String(regedit.regQueryStringValue(root, key, name) || '').trim());
}

async function resolveSteamCataloguePath() {
  if (steamCatalogue.resolved) return steamCatalogue.path;
  steamCatalogue.resolved = true;
  try {
    for (const value of await steamClientCandidates()) {
      if (value && fs.existsSync(path.join(value, 'appcache', 'appinfo.vdf'))) {
        steamCatalogue.path = value;
        break;
      }
    }
    debug.log(steamCatalogue.path ? `[Playtime] Steam catalogue at "${steamCatalogue.path}"` : '[Playtime] no local Steam catalogue - type filtering is off');
  } catch (err) {
    debug.warn(`[Playtime] could not locate the Steam catalogue: ${err.message || err}`);
  }
  return steamCatalogue.path;
}

/*
  Judges every appid not judged yet from one parse of appinfo.vdf, then lets the parse go. Parsing
  per appid cost ~30 ms each, and a game index holds hundreds to tens of thousands of rows: a
  27,606-row legacy catalogue kept the monitor's event loop blocked for about 17 minutes (#137).
*/
function judgeSteamAppTypes(appids) {
  if (!steamCatalogue.path) return;
  const pending = [...new Set(appids.map(normalizeAppid))].filter((key) => key && !nonGameVerdicts.has(key));
  if (pending.length === 0) return;
  try {
    const appInfo = require(sharedAppModulePath('parser/steamAppInfo.js'));
    const byAppid = appInfo.load(steamCatalogue.path);
    for (const key of pending) {
      // Only a definite "not a game" excludes; null means the catalogue has no record of it.
      const verdict = appInfo.libraryVerdict(byAppid ? byAppid.get(key) : null) === false;
      if (verdict) debug.log(`[Playtime] ${key} is a Steam application/tool, not a game - not tracked`);
      nonGameVerdicts.set(key, verdict);
    }
    appInfo.releaseCache();
  } catch (err) {
    debug.warn(`[Playtime] Steam type lookup failed for ${pending.length} appid(s): ${err.message || err}`);
    for (const key of pending) nonGameVerdicts.set(key, false);
  }
}

function isNonGameSteamApp(appid) {
  const key = normalizeAppid(appid);
  if (!key || !steamCatalogue.path) return false;
  if (!nonGameVerdicts.has(key)) judgeSteamAppTypes([key]);
  return nonGameVerdicts.get(key) === true;
}

function isIgnoredAppid(appid, ignored = getIgnoredAppids()) {
  const key = normalizeAppid(appid);
  if (key === '') return false;
  return ignored.has(key) || isNonGameSteamApp(key);
}

// Official Steam-library records are gated by achievement_source.legitSteam; the renderer already
// applies it to discovery, but the playtime monitor has its own game-index loader and must check too.
function isOfficialSteamLibraryGame(game) {
  return /^steam\s*\(/i.test(String((game && game.source) || '').trim());
}

function tracksOfficialSteam(options) {
  return Number(options && options.achievement_source && options.achievement_source.legitSteam) > 0;
}

function filterGamesByAchievementSources(games, options) {
  const showOfficialSteam = tracksOfficialSteam(options);
  return (Array.isArray(games) ? games : []).filter((game) => showOfficialSteam || !isOfficialSteamLibraryGame(game));
}

async function loadWatchdogOptions() {
  try {
    return await watchdogSettings.load(path.join(userDataDir(), 'cfg', 'options.ini'));
  } catch (err) {
    // The safe fallback is the default source setting: official Steam games are not tracked.
    debug.warn(`[Playtime] could not load source settings; official Steam tracking disabled: ${err.message || err}`);
    return { achievement_source: { legitSteam: 0 } };
  }
}

// Steam starts its overlay beside every game it launches, from a folder left unmuted when Steam is
// not on C:, so an appid lookup there could file the overlay under any game.
const steamClientProcessNames = new Set(['steam', 'steamwebhelper', 'steamservice', 'gameoverlayui', 'gameoverlayui64', 'steamerrorreporter', 'steamerrorreporter64']);

function isSteamClientProcess(name) {
  return steamClientProcessNames.has(String(name || '').toLowerCase().replace(/\.exe$/, ''));
}

function isWallpaperEngineProcess(process, filepath) {
  const proc = String(process || '').toLowerCase();
  const file = String(filepath || '').toLowerCase();
  return wallpaperProcessNames.has(proc) || file.includes('\\wallpaper_engine\\') || file.includes('/wallpaper_engine/');
}

// Process-name matching stays indexed, but user exclusions and demo filtering run per event since
// both can change while the Watchdog runs, which would make an indexed match stale.
function getTrackableGameMatches(binaryIndex, process, isIgnored = isIgnoredAppid) {
  return getBinaryMatches(binaryIndex, process).filter((game) => !isIgnored(game.appid) && !String(game.name || '').toLowerCase().includes('demo'));
}

const STEAM_LIBRARY_GAME = /[\\/]steamapps[\\/]common[\\/]/i;
const STEAM_INSTALL_ROOT = /^(.*[\\/]steamapps[\\/]common[\\/][^\\/]+)/i;

// The process belongs to the install the recorded exe belongs to: same folder or below it, or the
// same Steam game folder (a launcher at the root starting Binaries\Win64\Game.exe, or the reverse).
function sameInstall(knownExe, filepath) {
  if (isUnderDir(path.dirname(knownExe), filepath)) return true;
  const root = STEAM_INSTALL_ROOT.exec(String(knownExe));
  return Boolean(root) && isUnderDir(root[1], filepath);
}

function shouldMuteProcessPath(filepath, dirs, indexedMatches, exePathFor) {
  if (!isMutedByPath(filepath, dirs)) return false;
  const matches = (indexedMatches || []).filter(Boolean);
  if (matches.length === 0) return true;
  // The muted roots hold system and launcher noise, but they are also where Steam's default library
  // and most launchers install games (#110). A process an indexed game claims is muted only when
  // nothing ties it to that game: a manual entry, a Steam library folder or the game's own folder.
  if (matches.some((game) => String(game.source || '').toLowerCase() === 'manual')) return false;
  // A recorded exe that no longer exists (moved or reinstalled game) says nothing about this one.
  const knownPaths = matches
    .map((game) => game.exePath || (typeof exePathFor === 'function' ? exePathFor(game.appid) : ''))
    .filter((known) => known && fs.existsSync(known));
  if (knownPaths.some((known) => sameInstall(known, filepath))) return false;
  // Every claimant lives somewhere else: this is another program sharing the name, not the game.
  if (knownPaths.length === matches.length) return true;
  return !STEAM_LIBRARY_GAME.test(String(filepath));
}

// A bundled JRE never carries the game's own binary name (java.exe/javaw.exe are excluded from
// exe-detection on purpose), so it never appears in gameIndexByBinary. Its install folder still
// does: it launches from a few levels under the game's own root, e.g. <install>\jre\bin\javaw.exe.
const INTERPRETER_EXE = new Set(['java.exe', 'javaw.exe']);

function isInterpreterProcess(process) {
  return INTERPRETER_EXE.has(String(process || '').toLowerCase());
}

function isUnderDir(dir, filepath) {
  if (!dir || !filepath) return false;
  const root = path.resolve(dir).toLowerCase();
  const file = path.resolve(filepath).toLowerCase();
  return file === root || file.startsWith(root + path.sep);
}

// A known game's install folder identifies a spawned interpreter the way a binary name would for a
// native exe. Only tried for interpreters - a system-wide java.exe running some unrelated tool must
// never be attributed to whichever game happens to sit deepest in the index. `list` defaults to the
// live gameIndex; tests pass their own.
function findGameForInterpreterChild(process, filepath, list = gameIndex) {
  if (!isInterpreterProcess(process) || !filepath) return null;
  for (const game of list || []) {
    const known = (game && game.exePath) || (game && configuredExecutable(game.appid));
    if (known && isUnderDir(path.dirname(known), filepath)) return game;
  }
  return null;
}

// How many parent folders to try above a spawned interpreter's own directory when looking for a
// steam_appid.txt/steam_emu.ini marker. Bounded, and only for an interpreter: climbing for every
// unmatched process would risk picking up an unrelated marker from a shared parent folder.
const INTERPRETER_ANCESTOR_CLIMB = 4;

// Folders that hold many installs: a recursive marker glob there reads every game below it (the
// whole drive, for a root) and can return an unrelated game's appid.
const SHARED_PARENT_NAMES = new Set(['program files', 'program files (x86)', 'programdata', 'windows', 'users', 'appdata', 'local', 'roaming', 'games', 'common', 'steamapps', 'steamlibrary', 'epic games', 'gog galaxy']);

function isSharedParent(dir) {
  return path.parse(dir).root === dir || path.dirname(dir) === dir || SHARED_PARENT_NAMES.has(path.basename(dir).toLowerCase());
}

function candidateConfigDirs(dir, process) {
  const dirs = [dir];
  if (!isInterpreterProcess(process)) return dirs;
  let current = dir;
  for (let i = 0; i < INTERPRETER_ANCESTOR_CLIMB; i++) {
    const parent = path.dirname(current);
    if (!parent || parent === current || isSharedParent(parent)) break;
    dirs.push(parent);
    current = parent;
  }
  return dirs;
}

// A home folder or a drive root holds everything: a recursive marker glob there reads the whole disk.
function isTooBroadToSearch(dir) {
  return path.parse(dir).root === dir || path.resolve(dir) === path.resolve(os.homedir());
}

// The appid an emulator config next to the process names (steam_appid.txt, steam_emu.ini...), or null.
async function findAppidInConfigFiles(process, filepath) {
  // A bundled JRE sits a few levels under the game's own root, so the appid marker it ships lives in
  // an ancestor of javaw's own directory, never inside it.
  for (const dir of candidateConfigDirs(path.dirname(filepath), process)) {
    if (isTooBroadToSearch(dir)) break;
    const dirKey = dir.toLowerCase();
    let appid;
    if (appidByDirCache.has(dirKey)) {
      appid = appidByDirCache.get(dirKey);
    } else {
      // findByReadingContentOfKnownConfigfilesIn() globs the whole game tree, so cache the miss too:
      // otherwise every relaunch of the same non-game binary re-walks it.
      debug.log(`Try to find appid from a cfg file in "${dir}"`);
      appid = await findByReadingContentOfKnownConfigfilesIn(dir).catch(() => null);
      rememberAppidForDir(dirKey, appid);
    }
    if (appid) return appid;
  }
  return null;
}

function isObservedProcess(process) {
  const name = String(process || '').toLowerCase();
  return !filter.ignore.some((bin) => bin.toLowerCase() === name);
}

// The appid a running process was launched for, unless it is one of the runtime or system processes
// a launch also starts (the muted folders): those never stand for the game.
function launchedGameAppid(pid) {
  const appid = tasklist.getLaunchAppid(pid);
  return appid && !isMutedByPath(tasklist.getProcessPath(pid), filter.mute.dir) ? appid : '';
}

// The processes still running for this launch appid, among those the process monitor reports exits for.
async function launchSurvivors(appid) {
  try {
    const launched = new Set(tasklist.pidsWithLaunchAppid(appid));
    if (launched.size === 0) return [];
    return (await tasklist.list()).filter((row) => launched.has(row.pid) && isObservedProcess(row.process)).map((row) => row.pid);
  } catch (err) {
    debug.warn(`[Process trail] could not look for the rest of launch ${appid}: ${err.message || err}`);
    return [];
  }
}

// Loose local echo of exeDetect.js's nameSimilarity(), kept separate rather than pulling the
// app-side exe-detection module into this long-running daemon for one heuristic.
function normalizeForSimilarity(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Does the running process's own folder look like it belongs to this game? Used to corroborate a
// single binary-name hit that comes only from the stale bundled catalogue (see catalogueOnly below).
function tokenizeForSimilarity(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function relatedToFolder(name, filepath) {
  const folder = path.basename(path.dirname(String(filepath || '')));
  const a = normalizeForSimilarity(name);
  const b = normalizeForSimilarity(folder);
  if (!a || !b) return false;
  if (a === b) return true;
  const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  if ((a.includes(b) || b.includes(a)) && ratio >= 0.55) return true;
  // A short, generic install folder ("Khazan") is fair evidence for a longer subtitled title ("The
  // First Berserker: Khazan") even though the substring-ratio check above is too strict for it - a
  // whole distinctive word shared between the name and the folder is real corroboration either way.
  const nameTokens = tokenizeForSimilarity(name);
  return nameTokens.includes(b) || tokenizeForSimilarity(folder).some((t) => nameTokens.includes(t));
}

const PLAYTIME_SAVE_INTERVAL_MS = 60_000;

function saveSessionProgress(game) {
  const seconds = game.timer.checkpoint();
  if (seconds <= 0) return Promise.resolve();
  return TimeTrack(game.appid, seconds).catch((err) => {
    debug.error(err);
  });
}

async function init() {
  const emitter = new EventEmitter();
  // Resolved once, before the first process event, so the synchronous filter above has an answer.
  await resolveSteamCataloguePath();

  let nowPlaying = [];
  // Expose startup sessions without replaying launch notifications.
  emitter.getActiveGames = () => snapshotActiveGames(nowPlaying);
  // Saves what the running sessions played since the last save; also called on the way out.
  emitter.saveActiveSessions = () => Promise.all(nowPlaying.map(saveSessionProgress));
  setInterval(emitter.saveActiveSessions, PLAYTIME_SAVE_INTERVAL_MS).unref();
  // The app re-seeds cfg/gameIndex.json after a library scan (e.g. a freshly installed non-Steam
  // game); reloading here lets the monitor track it without a full Watchdog restart.
  emitter.reloadGameIndex = async () => {
    const next = await getGameIndex();
    // A transient read failure can surface as an empty list while the Watchdog's own auto-detect is
    // writing the same file; never replace a working index with an empty one.
    if (next.length === 0 && gameIndex && gameIndex.length > 0) {
      debug.warn('[Playtime] gameIndex reload returned an empty index; keeping the current one');
      return gameIndex.length;
    }
    const filteredOutSessions = nowPlaying.filter((game) => disabledOfficialSteamAppids.has(normalizeAppid(game.appid)));
    for (const playing of filteredOutSessions) {
      const index = nowPlaying.indexOf(playing);
      if (index !== -1) nowPlaying.splice(index, 1);
      playing.timer.stop();
      emitter.emit('source-disabled', playing);
    }
    gameIndex = next;
    gameIndexByBinary = buildBinaryIndex(next);
    debug.log(`[Playtime] gameIndex reloaded ! ${next.length} game(s)`);
    return next.length;
  };
  appidByDirCache = new Map();
  gameIndex = await getGameIndex();
  gameIndexByBinary = buildBinaryIndex(gameIndex);

  // Seed unambiguous games that were already running at startup.
  let snapshot = [];
  try {
    snapshot = await tasklist.list();
  } catch (err) {
    debug.warn(`[Process trail] process snapshot failed => ${err}`);
  }
  for (const playing of buildSeededSessions({
    gameIndex,
    processes: snapshot,
    now: Date.now(),
    createTimer: () => new Timer(),
    resolvePath: tasklist.getProcessPath,
    exePathFor: configuredExecutable,
    launchAppidFor: launchedGameAppid,
  })) {
    nowPlaying.push(playing);
    debug.log(`[Process trail] tracking already-running ${playing.name}(${playing.appid}) pid=${[...playing.pids].join(',')}`);
  }

  let processMonitor;
  if (process.env.AW_PROCESS_MONITOR === 'wql') {
    const WQL = await import('wql-process-monitor');
    processMonitor = await WQL.subscribe({
      bin: { filter: filter.ignore, whitelist: false },
    });
    debug.log('[Process trail] using native WQL monitor');
  } else {
    processMonitor = createPollingProcessMonitor({
      list: tasklist.list,
      initialProcesses: snapshot,
      // Resolved per creation event only: without it the polling monitor has no image path, so the
      // "shared binary" disambiguation and the mute-by-directory filter below could never fire.
      resolvePath: tasklist.getProcessPath,
      onError: (err) => debug.warn(`[Process trail] process poll failed => ${err}`),
      shouldObserve: ({ process }) => isObservedProcess(process),
    });
    debug.log(
      `[Process trail] using polling monitor over ${tasklist.usingNativeSnapshot() ? 'the native process snapshot' : 'tasklist.exe (native snapshot unavailable)'}`
    );
  }

  processMonitor.on('creation', async ([process, pid, filepath]) => {
    const games = getTrackableGameMatches(gameIndexByBinary, process);
    if (isWallpaperEngineProcess(process, filepath) || isSteamClientProcess(process)) return;
    if (filter.mute.file.some((bin) => bin.toLowerCase() === process.toLowerCase())) return;

    // A spawned interpreter never matches by binary name; a known game's install folder is a
    // stronger signal than the generic mute-by-path filter below, so it is tried first and is never
    // muted by it (a bundled JRE regularly sits under Program Files, one of the muted roots).
    let game = games.length === 0 ? findGameForInterpreterChild(process, filepath) : null;
    // The appid Steam (or umu) launched this process for; always '' on Windows.
    const launchAppid = tasklist.getLaunchAppid(pid);

    if (!game) {
      if (filepath && shouldMuteProcessPath(filepath, filter.mute.dir, games, configuredExecutable)) {
        if (games.length > 0) debug.log(`"${process}" matches ${games[0].name}(${games[0].appid}) but runs from a muted folder ("${filepath}"); ignoring`);
        return;
      }

      if (games.length === 1) {
        // A single hit from the bundled legacy catalogue (steam_cache/schema/gameIndex.json) is a
        // guess about every copy of that executable name, not about this one - accept it only when
        // this process's own folder actually looks like the game it claims to be.
        const candidate = games[0];
        if (candidate.catalogueOnly && normalizeAppid(candidate.appid) !== launchAppid && !relatedToFolder(candidate.name, filepath)) {
          debug.log(`"${process}" only matches the bundled catalogue entry for ${candidate.name}(${candidate.appid}); no local corroboration - ignoring`);
        } else {
          game = candidate;
        }
      } else if (games.length > 1) {
        // Several games answer to this name; the install folder says which one just started, else
        // the appid it was launched for.
        game = pickGameForProcess(games, filepath, configuredExecutable) || games.find((g) => normalizeAppid(g.appid) === launchAppid) || null;
        if (game) debug.log(`"${process}" is shared by ${games.length} games; "${filepath}" is ${game.name}(${game.appid})`);
        else debug.log(`More than 1 entry for "${process}" and no install path settles it`);
      } else if (launchAppid) {
        // A name the index does not know, e.g. a Proton game's launcher or a native binary: the
        // appid Steam launched it for still names the game.
        game = gameIndex.find((g) => normalizeAppid(g.appid) === launchAppid) || null;
        if (game) debug.log(`"${process}" was launched for ${game.name}(${game.appid})`);
      }
    }
    if (!game) {
      // An unmatched process is expected (most running processes are not games) and is not logged
      // to avoid filling playtime.log on a busy machine.
      if (!filepath) return;
      try {
        // A launch appid outside the index is an official Steam game: only taken when that source is on.
        const appid = (officialSteamTracked && launchAppid) || (await findAppidInConfigFiles(process, filepath));
        if (!appid) return;
        debug.log(`Found appid: ${appid}`);
        if (isIgnoredAppid(appid)) {
          debug.log(`Ignoring blacklisted appid ${appid} for "${process}"`);
          return;
        }
        if (disabledOfficialSteamAppids.has(normalizeAppid(appid))) {
          debug.log(`Ignoring disabled official Steam appid ${appid} for "${process}"`);
          return;
        }
        //double check that the appid is not on gameIndex:
        game = gameIndex.find((g) => normalizeAppid(g.appid) === normalizeAppid(appid));
        if (!game) {
          const settings = require('../settings.js');
          const options = await settings.load(path.join(userDataDir(), 'cfg', 'options.ini'));
          const lang = options.achievement.lang;
          let d = await loadSteamData(appid, lang, process);
          // Not every app has a Steam "clienticon" (e.g. brand-new releases) - d.img.icon can be
          // undefined; guard it the same way achievements.js does instead of throwing here.
          const iconHash = d.img && d.img.icon ? String(d.img.icon).split('/').pop().split('.')[0] : '';
          // Record where it ran from: another game can ship the same executable name, and the folder
          // is what the next match uses to tell them apart.
          game = { appid, binary: process, icon: iconHash, name: d.name, exePath: filepath };
          addToGameIndex(game).catch((err) => debug.warn(`[Playtime] could not save ${game.name} to gameIndex.json: ${err.message}`));
        }
        // The lookups above take time: a launcher can be gone already, and a session holding a dead
        // pid would never see its exit.
        if (game && !(await tasklist.isProcessRunning(pid))) {
          debug.log(`"${process}"(${pid}) exited before ${game.name}(${game.appid}) was resolved`);
          return;
        }
      } catch (err) {
        debug.warn(err);
      }
    }

    if (!game) return;
    if (isIgnoredAppid(game.appid)) {
      debug.log(`Ignoring blacklisted appid ${game.appid} for "${process}"`);
      return;
    }
    if (disabledOfficialSteamAppids.has(normalizeAppid(game.appid))) {
      debug.log(`Ignoring disabled official Steam appid ${game.appid} for "${process}"`);
      return;
    }
    debug.log(`DB Hit for ${game.name}(${game.appid}) ["${filepath || process}"]`);
    // Track child processes in one session so the timer starts and stops once.
    const alreadyPlaying = nowPlaying.find((g) => normalizeAppid(g.appid) === normalizeAppid(game.appid));
    if (alreadyPlaying) {
      alreadyPlaying.pids.add(pid);
      if (launchAppid === normalizeAppid(game.appid)) alreadyPlaying.launchAppid = launchAppid;
      debug.log(`Tracking additional process "${process}"(${pid}) for ${game.name}`);
    } else {
      // The live image path, else where the scan found the binary (a process whose path could
      // not be read still has an install folder for the artwork lookups).
      const exePath = filepath || game.exePath || '';
      const playing = Object.assign(game, {
        pids: new Set([pid]),
        timer: new Timer(),
        exePath,
        gameDir: exePath ? path.parse(exePath).dir : '',
        launchAppid: launchAppid === normalizeAppid(game.appid) ? launchAppid : '',
      });
      debug.log(playing);

      nowPlaying.push(playing);
      emitter.emit('enable-overlay', game.appid);
      emitter.emit('notify', [game]);
    }
  });

  processMonitor.on('deletion', async ([, pid]) => {
    // PID is authoritative; process names may differ at exit.
    const game = nowPlaying.find((g) => g.pids.has(pid));

    if (!game) return;

    game.pids.delete(pid);
    if (game.pids.size > 0) return; //other processes of this game are still running

    // A launcher that hands over to the game exits first; Steam's reaper and the Proton processes
    // started for the same appid keep the session open until the game is really gone.
    if (game.launchAppid) {
      const survivors = await launchSurvivors(game.launchAppid);
      if (game.pids.size > 0) return;
      if (survivors.length > 0) {
        for (const survivor of survivors) game.pids.add(survivor);
        debug.log(`${game.name}(${game.appid}) is still running through pid=${survivors.join(',')}`);
        return;
      }
    }

    debug.log(`Stop playing ${game.name}(${game.appid})`);
    game.timer.stop();
    const playedtime = game.timer.played;

    let index = nowPlaying.indexOf(game);
    if (index !== -1) {
      nowPlaying.splice(index, 1);
    }

    debug.log('playtime: ' + Math.floor(playedtime / 60) + 'min');

    saveSessionProgress(game);
    emitter.emit('disable-overlay');
    // Emit the raw played seconds; the watchdog formats & localizes the notification text.
    emitter.emit('notify', [game, playedtime]);
  });

  return emitter;
}

async function addToGameIndex(game) {
  if (isIgnoredAppid(game.appid) || disabledOfficialSteamAppids.has(normalizeAppid(game.appid))) return;
  let userOverride;
  try {
    userOverride = JSON.parse(fs.readFileSync(path.join(userDataDir(), 'cfg', 'gameIndex.json'), 'utf8'));
  } catch (err) {
    // A locked or half-written file is left alone: rewriting it from scratch would drop the
    // user's other entries; the caller still tracks this run, and the next launch retries.
    if (err.code !== 'ENOENT') {
      debug.warn(`[Playtime] gameIndex.json unreadable, ${game.name} not saved to it: ${err.message}`);
      return;
    }
    userOverride = [];
  }
  if (userOverride.find((g) => normalizeAppid(g.appid) === normalizeAppid(game.appid))) return;
  userOverride.push(game);
  fs.writeFileSync(path.join(userDataDir(), 'cfg', 'gameIndex.json'), JSON.stringify(userOverride), 'utf8');
  gameIndex.push(game);
  gameIndexByBinary = buildBinaryIndex(gameIndex);
  debug.log(`Added ${game.name} to GameIndex.json`);
}

async function getGameIndex() {
  const filePath = {
    cache: path.join(userDataDir(), 'steam_cache/schema', 'gameIndex.json'),
    user: path.join(userDataDir(), 'cfg', 'gameIndex.json'),
  };

  let cached = [],
    userOverride = [];

  try {
    if (fs.existsSync(filePath.cache)) {
      cached = JSON.parse(fs.readFileSync(filePath.cache, 'utf8'));
    }
    if (cached) debug.log(`[Playtime] gameIndex loaded ! ${cached.length} game(s)`);
  } catch (err) {
    debug.error(err);
    cached = [];
  }

  try {
    userOverride = JSON.parse(fs.readFileSync(filePath.user, 'utf8'));
    debug.log(`[Playtime] user gameIndex loaded ! ${userOverride.length} override(s)`);
  } catch (err) {
    if (err) if (err.code !== 'ENOENT') debug.error(err);
    userOverride = [];
  }

  const { list: merged, yielded } = mergeGameIndexes(cached, userOverride);
  // One line, not one per row: an old catalogue yields over a thousand rows on every start.
  if (yielded.length > 0) {
    const sample = yielded.slice(0, 3).map((game) => `${game.name}(${game.appid}) "${game.binary}"`);
    debug.log(`[Playtime] ${yielded.length} catalogue row(s) yield their executable to the library's own entry, e.g. ${sample.join(', ')}`);
  }
  // Marks a row that exists only in the bundled legacy catalogue - a guess about every install that
  // shares its binary name, never corroborated by anything found on this machine. See the
  // single-candidate check in the creation handler above.
  const scannedAppids = new Set((Array.isArray(userOverride) ? userOverride : []).filter((g) => g && g.appid != null).map((g) => normalizeAppid(g.appid)));
  for (const game of merged) {
    if (game && !scannedAppids.has(normalizeAppid(game.appid))) game.catalogueOnly = true;
  }
  const options = await loadWatchdogOptions();
  const sourceFiltered = filterGamesByAchievementSources(merged, options);
  officialSteamTracked = tracksOfficialSteam(options);
  const kept = new Set(sourceFiltered);
  disabledOfficialSteamAppids = new Set(
    merged.filter((game) => isOfficialSteamLibraryGame(game) && !kept.has(game)).map((game) => normalizeAppid(game.appid))
  );
  judgeSteamAppTypes(sourceFiltered.map((game) => game.appid));
  const ignored = getIgnoredAppids();
  return sourceFiltered.filter((game) => !isIgnoredAppid(game.appid, ignored));
}

module.exports = {
  init,
  isMutedByPath,
  linuxMutedDirs,
  shouldMuteProcessPath,
  getTrackableGameMatches,
  isOfficialSteamLibraryGame,
  filterGamesByAchievementSources,
  // Exported for the test suite: the Steam type filter is invisible when it works, so it needs to be
  // exercised directly against the real local catalogue rather than inferred from a quiet log.
  resolveSteamCataloguePath,
  isNonGameSteamApp,
  judgeSteamAppTypes,
  // Exported for the test suite: pure helpers behind the interpreter-child and legacy-catalogue
  // matching in the creation handler above.
  isInterpreterProcess,
  isSteamClientProcess,
  findGameForInterpreterChild,
  candidateConfigDirs,
  relatedToFolder,
};
