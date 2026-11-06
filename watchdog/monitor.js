'use strict';

const { sharedAppModulePath } = require('./util/sharedAppModule.js');
const path = require('path');
const ini = require(sharedAppModulePath('util/ini.js'));
const parentFind = require(sharedAppModulePath('util/findUp.js'));
const fs = require(sharedAppModulePath('util/fsAsync.js'));
const debug = require('./util/log.js');
const { signatureWatchEntries } = require('./util/rootCascade.js');
const { SOCIALCLUB_ACHIEVEMENT_FILES, isUnderSocialClubRoot } = require(sharedAppModulePath('parser/socialclubNames.js'));
// The library's own save decoder and root table, so a format or a folder is described once.
const { readSaveFile, normalizeSaveEntry } = require(sharedAppModulePath('parser/emuSave.js'));
const { SAVE_ROOTS, SAVE_FILE_NAMES, GSE_WATCH, rowDir, watchOptions } = require(sharedAppModulePath('parser/emuSaveRoots.js'));
const { readUserDirEntries } = require(sharedAppModulePath('parser/userDirEntries.js'));
// Shared with the app so the bit-to-api-name table lives in exactly one place. Only its pure readers
// are used here.
const ff7 = require(sharedAppModulePath('parser/ff7.js'));
const winHosts = require(sharedAppModulePath('util/winHosts.js'));

// regodit is ESM-only; load lazily via dynamic import. Uses the sync API deliberately: under
// koffi 3.x the async DWORD write segfaults (0xC0000005) and kills the Watchdog.
const { loadRegodit: loadRegedit } = require('./util/regodit.js');

// The emulator configs a game folder may hold, tried in this order: the first that parses decides
// the save layout.
const CONFIG = {
  ALI213: 'ALI213.ini',
  VALVE: 'valve.ini',
  HOODLUM: 'hlm.ini',
  DARKSIDERS: 'ds.ini',
  STEAM_API: 'steam_api.ini',
  STEAM_CONFIG: 'SteamConfig.ini',
  TENOKE: 'tenoke.ini',
  UNIVERSE_LAN: 'UniverseLAN.ini',
};
const CONFIG_ORDER = Object.values(CONFIG);
const ALI213_CONFIGS = new Set([CONFIG.ALI213, CONFIG.VALVE, CONFIG.STEAM_CONFIG]);
// Hoodlum, DARKSiDERS, and Skidrow since about the end of 2019.
const HOODLUM_CONFIGS = new Set([CONFIG.DARKSIDERS, CONFIG.HOODLUM, CONFIG.STEAM_API]);

// ALI213-family emulators write either Achievements.Bin or Achievements.ini; watching only one
// missed builds using the other spelling, so unlocks never fired until the next refresh.
const ALI213_ACHIEVEMENT_FILES = ['Achievements.Bin', 'Achievements.ini'];

// The emulator save roots of one host (see app/util/winHosts.js), from the table the library reads
// too; a root whose base folder the host does not have is left out.
function builtinRoots(host, documents) {
  return SAVE_ROOTS.filter((row) => row.watch)
    .map((row) => ({ dir: rowDir(row, host, documents), options: watchOptions(row.watch) }))
    .filter((entry) => entry.dir);
}

// FINAL FANTASY VII (2013) rewrites achievement.dat beside its saves. The folder is watched
// only once it proves it is that game, since an 8-byte achievement.dat is far too generic.
function documentsRoots(mydocs) {
  const ff7Root = path.join(mydocs, 'FINAL FANTASY VII');
  if (!ff7.detect(ff7Root).detected) return [];
  return [{ dir: ff7Root, options: { appid: ff7.APPID, recursive: false, file: [ff7.STATE_FILE] } }];
}

async function windowsDocuments() {
  const regedit = await loadRegedit();
  return regedit.regQueryStringValueAndExpand('HKCU', winHosts.SHELL_FOLDERS_KEY, 'Personal');
}

// The Documents folder of the host a configured game folder sits in (its Wine prefix on Linux).
function documentsFor(dirPath, hosts, docsByHost) {
  return docsByHost.get(winHosts.hostsFor(dirPath, hosts)[0]) || null;
}

function saveWatch(dir, appid, file, extra = {}) {
  return { dir, options: { appid, ...extra, recursive: false, file } };
}

// The nearest folder at or above `cwd` holding `relative`, joined with it; undefined when none does.
async function findAbove(cwd, relative) {
  const base = await parentFind(async (directory) => (await parentFind.exists(path.join(directory, relative))) && directory, { cwd, type: 'directory' });
  return base ? path.join(base, relative) : undefined;
}

// The emulator config that parsed first, or null when the folder holds none.
async function readEmulatorConfig(dirPath) {
  for (const file of CONFIG_ORDER) {
    try {
      return { file, info: ini.parse(await fs.readFile(path.join(dirPath, file), 'utf8')) };
    } catch {
      /* not this emulator: try the next config */
    }
  }
  return null;
}

async function ali213Roots(dirPath, settings, mydocs) {
  const { AppID: appid, PlayerName: player, SaveType: saveType } = settings;
  if (!appid) return [];
  let dir;
  if (player && saveType == 0) dir = await findAbove(dirPath, `Profile/${player}/Stats`);
  else if (player && saveType == 1) dir = mydocs ? path.join(mydocs, `VALVE/${appid}/${player}/Stats`) : undefined;
  else if (!saveType) dir = await findAbove(dirPath, 'Profile/Stats');
  return dir ? [saveWatch(dir, appid, ALI213_ACHIEVEMENT_FILES)] : [];
}

async function hoodlumRoots(dirPath, file, settings, mydocs) {
  const { UserDataFolder: dataFolder, AppId: appid, UserName: user } = settings;
  if (dataFolder === '.' && appid) {
    const userStats = await findAbove(dirPath, 'SteamEmu/UserStats');
    if (userStats) return [saveWatch(userStats, appid, ['achiev.ini'])];
    const steamEmu = await findAbove(dirPath, 'SteamEmu');
    if (steamEmu) return [saveWatch(steamEmu, appid, ['stats.ini'])];
    if (file !== CONFIG.HOODLUM) return [];
    // Hoodlum (pre-~Sept 2019) behaves like ALI213 with defaults: playerName VALVE, saveType 0, and
    // writes achievement data only on game exit.
    const stats = await findAbove(dirPath, 'Profile/VALVE/Stats');
    const lenient = { disableCheckIfProcessIsRunning: true, disableCheckTimestamp: true };
    return stats ? [saveWatch(stats, appid, ALI213_ACHIEVEMENT_FILES, lenient)] : [];
  }
  if (dataFolder === 'mydocs' && appid && user && mydocs) {
    const steamEmu = path.join(mydocs, user, appid, 'SteamEmu');
    if (await fs.exists(path.join(steamEmu, 'UserStats/achiev.ini'))) return [saveWatch(path.join(steamEmu, 'UserStats'), appid, ['achiev.ini'])];
    return [saveWatch(steamEmu, appid, ['stats.ini'])];
  }
  return [];
}

async function catherineRoots(dirPath, settings) {
  if (!settings.AppId || !settings.SteamID) return [];
  const profile = await findAbove(dirPath, `SteamProfile/${settings.SteamID}`);
  return profile ? [saveWatch(profile, settings.AppId, ['Achievements.ini'])] : [];
}

// The save folders an in-folder emulator config points at.
async function configRoots(dirPath, { file, info }, mydocs) {
  if (ALI213_CONFIGS.has(file) && info.Settings) return ali213Roots(dirPath, info.Settings, mydocs);
  if (HOODLUM_CONFIGS.has(file) && info.GameSettings) return hoodlumRoots(dirPath, file, info.GameSettings, mydocs);
  if (file === CONFIG.STEAM_API && info.Settings) return catherineRoots(dirPath, info.Settings);
  if (file === CONFIG.TENOKE) return [saveWatch(path.join(dirPath, 'SteamData'), info.TENOKE.id.split('#')[0].trim(), ['user_stats.ini'])];
  if (file === CONFIG.UNIVERSE_LAN) return [saveWatch(path.join(dirPath, 'UniverseLANData'), info.GameSettings.AppID, ['Achievements.ini'])];
  return [];
}

// A folder with no emulator config, classified by what it holds.
async function signatureRoots(dirPath) {
  if (ff7.detect(dirPath).detected) return [saveWatch(path.resolve(dirPath), ff7.APPID, [ff7.STATE_FILE])];
  if (isUnderSocialClubRoot(dirPath)) {
    return [{ dir: dirPath, options: { recursive: true, filter: () => true, file: SOCIALCLUB_ACHIEVEMENT_FILES, socialClub: true } }];
  }
  // Only platforms without a dedicated live watcher are added from signatures (GOG .info, UniverseLAN).
  // A detection that fails still leaves the folder under the generic watch below, as it always did.
  const found = await signatureWatchEntries(dirPath).catch((err) => {
    debug.warn(`[monitor] signature check failed for ${dirPath}: ${err && err.message ? err.message : err}`);
    return [];
  });
  return found.length ? found : [{ dir: dirPath, options: { recursive: true, filter: /([0-9]+)/, file: [...SAVE_FILE_NAMES] } }];
}

// The watches of one folder saved in Settings; a folder that fails is logged and left out.
async function configuredRoots(dirPath, mydocs) {
  try {
    const config = await readEmulatorConfig(dirPath);
    return config ? await configRoots(dirPath, config, mydocs) : await signatureRoots(dirPath);
  } catch (err) {
    debug.warn(`[monitor] saved folder ${dirPath} is not watched: ${err && err.message ? err.message : err}`);
    return [];
  }
}

// The GBE save folder chosen in Settings (issue #123) has the GSE Saves shape: one folder per appid,
// and so has GBE's GseSavePath when the session sets it for every game.
// A per-game local_save_path keeps the same shape under its own folder (cfg/saveRedirects.json).
function customSaveRoots(options, redirectedSaves) {
  const customSaves = [(options && options.emulator && options.emulator.savePath) || '', process.env.GseSavePath || '', ...redirectedSaves];
  return [...new Set(customSaves.map((value) => String(value).trim()))]
    .filter((dir) => dir && path.isAbsolute(dir))
    .map((dir) => ({ dir, options: watchOptions(GSE_WATCH) }));
}

// userDir.js seeds userdir.db with the built-in roots, so each arrived twice. Built-ins come first,
// so first-wins keeps their uplayR2 / socialClub flags and narrow `file` list.
function firstPerFolder(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = winHosts.pathKey(entry && entry.dir);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withoutDisabled(entries, configuredDirs) {
  const disabled = configuredDirs.filter((entry) => !entry.enabled).map((entry) => winHosts.pathKey(entry.path));
  if (!disabled.length) return entries;
  return entries.filter((entry) => {
    const candidate = winHosts.pathKey(entry && entry.dir);
    return !disabled.some((root) => candidate === root || candidate.startsWith(root + path.sep));
  });
}

module.exports.getFolders = async (userDir_file, options = {}, redirectedSaves = []) => {
  const configuredDirs = readUserDirEntries(userDir_file);
  const nativeDocs = process.platform === 'win32' ? await windowsDocuments().catch(() => null) : null;
  const hosts = winHosts.listHosts({ nativeDocuments: () => nativeDocs });
  const docsByHost = new Map(hosts.map((host) => [host, host.documents()]));

  const roots = [
    ...hosts.flatMap((host) => builtinRoots(host, docsByHost.get(host))),
    ...customSaveRoots(options, redirectedSaves),
    ...[...docsByHost.values()].filter(Boolean).flatMap(documentsRoots),
  ];
  for (const dir of configuredDirs.filter((entry) => entry.enabled)) {
    roots.push(...(await configuredRoots(dir.path, documentsFor(dir.path, hosts, docsByHost))));
  }
  return withoutDisabled(firstPerFolder(roots), configuredDirs);
};

// One decoded entry in the shape the notification path reads, judged by the library's own rule.
function watchdogEntry(key, entry) {
  const parsed = normalizeSaveEntry(entry);
  const result = {
    name: entry.id || entry.apiname || entry.name || entry.AchievementId || key,
    Achieved: parsed.Achieved,
    // A raw stat (GBE stats.json) carries its count as `value`, which statProgress.js maps.
    CurProgress: parsed.CurProgress || entry.value || entry.Value || 0,
    MaxProgress: parsed.MaxProgress || 0,
    UnlockTime: parsed.UnlockTime,
  };
  if (entry.crc) result.crc = entry.crc;
  return result;
}

module.exports.parse = async (filePath) => {
  const local = await readSaveFile(filePath);
  const achievements = [];
  for (const [key, entry] of Object.entries(local)) {
    if (entry != null) achievements.push(watchdogEntry(key, entry));
  }
  achievements.sort((a, b) => b.UnlockTime - a.UnlockTime);
  return achievements;
};
