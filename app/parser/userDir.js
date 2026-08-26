'use strict';

const path = require('path');
const appPath = path.join(__dirname, '../');
const ini = require('../util/ini');
const parentFind = require('../util/findUp');
const glob = require('fast-glob');
const fs = require('fs');
const { readRegistryStringAndExpand } = require('../util/reg');
const saveRoots = require(path.join(appPath, 'parser/saveRoots.js'));

let file;

module.exports.setUserDataPath = async (p) => {
  file = path.join(p, 'cfg/userdir.db');
};

const steam_emu_cfg_file_supported = [
  'ALI213.ini',
  'valve.ini',
  'hlm.ini',
  'ds.ini',
  'steam_api.ini',
  'SteamConfig.ini',
  'tenoke.ini',
  'UniverseLAN.ini',
  // CODEX/RUNE and the CPY variant. Their default save root (%PUBLIC%\Documents\Steam\<SOURCE>) is
  // already scanned, but a PORTABLE release never writes there: it keeps that same tree inside the
  // game folder instead, so nothing was discovered and the game was absent from the library
  // entirely - no card, no 0% entry, indistinguishable from a game that was never installed.
  'steam_emu.ini',
  'cpy.ini',
];

// Scene-emulator save roots, relative to the folder holding the emulator config. A portable release
// keeps the same layout it would otherwise write to %PUBLIC%\Documents\Steam, so these are the
// shapes actually seen on disk, most specific first.
const PORTABLE_SCENE_SAVE_DIRS = [
  path.join('Steam', 'RUNE'),
  path.join('Steam', 'CODEX'),
  path.join('Steam', 'CPY'),
  path.join('Documents', 'Steam', 'RUNE'),
  path.join('Documents', 'Steam', 'CODEX'),
  'RUNE',
  'CODEX',
  'SteamEmu',
  'Saves',
  'Save',
];

// The unlock-state files steam.getAchievementsFromFile() knows how to read. Used to tell a real save
// folder from a folder that merely happens to be named right.
const SCENE_SAVE_FILES = ['achievements.ini', 'achievements.json', 'Achievements.ini', 'stats.ini', 'achiev.ini', 'user_stats.ini'];

function hasSceneSaveFile(dir) {
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
  } catch {
    return false;
  }
  return SCENE_SAVE_FILES.some((name) => {
    try {
      return fs.statSync(path.join(dir, name)).isFile();
    } catch {
      return false;
    }
  });
}

/*
  Where a portable CODEX/RUNE release keeps its unlock state, for `appid`. Every known layout is
  probed with the appid folder appended and again without it; a candidate only wins if it actually
  holds a save file the Steam parser can read. Returns { path, source }, or null.
*/
function findSceneSaveDir(dir, appid) {
  if (!dir || !appid) return null;
  const candidates = [];
  const push = (base, source) => {
    if (!base) return;
    candidates.push({ path: path.join(base, String(appid)), source });
    candidates.push({ path: base, source });
  };
  for (const relative of PORTABLE_SCENE_SAVE_DIRS) {
    push(path.join(dir, relative), /rune/i.test(relative) ? 'Rune' : /codex/i.test(relative) ? 'Codex' : 'Steam-emulator');
  }
  push(dir, 'Steam-emulator');
  for (const root of saveRoots.defaultSteamEmuSaveRoots({ existingOnly: true })) {
    push(root, /rune/i.test(root) ? 'Rune' : /codex/i.test(root) ? 'Codex' : 'Steam-emulator');
  }

  const seen = new Set();
  for (const candidate of candidates) {
    const key = path.resolve(candidate.path).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (hasSceneSaveFile(candidate.path)) return candidate;
  }
  return null;
}

/*
  A portable release whose emulator config is missing, renamed or never shipped still keeps the save
  tree next to the game. Since findSceneSaveDir() needs the appid the config would have carried, this
  walks the known portable layouts instead and takes the appid from whichever folder actually holds a
  readable unlock file.
*/
function collectPortableSceneSaves(dir) {
  const found = [];
  for (const relative of PORTABLE_SCENE_SAVE_DIRS) {
    const base = path.join(dir, relative);
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    const source = /rune/i.test(relative) ? 'Rune' : /codex|cpy/i.test(relative) ? 'Codex' : 'Steam-emulator';
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Only a numeric Steam appid: a hex profile folder here belongs to a different emulator family.
      if (!/^\d{3,10}$/.test(entry.name)) continue;
      const candidate = path.join(base, entry.name);
      if (!hasSceneSaveFile(candidate)) continue;
      found.push({ appid: entry.name, source, data: { type: 'file', path: candidate, gameDir: dir } });
    }
  }
  return found;
}

// The same probe over a games LIBRARY: one level of game folders, each looked at as if it had been
// added directly. Bounded on purpose - a library root is routinely 100 GB and deep globbing it is
// what a user notices as "adding a folder hangs".
function collectPortableSceneSavesBelow(dir) {
  const result = [];
  const seen = new Set();
  const push = (records) => {
    for (const record of records) {
      const key = `${record.appid}|${path.resolve(record.data.path).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(record);
    }
  };
  push(collectPortableSceneSaves(dir));
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    push(collectPortableSceneSaves(path.join(dir, entry.name)));
  }
  return result;
}

/*
  Markers of an EA app (EA Desktop / Origin) release. Such a game keeps no Steam-shaped anything in
  its folder - no steam_api dll, no appid file, no emulator ini, no unlock file - because the
  achievement state lives with the EA account rather than on disk. Without this, the folder is
  rejected the same way as a random directory with nothing in it.
*/
const EA_APP_MARKER_GLOBS = [
  '__Installer/installerdata.xml',
  'Support/mnfst.txt',
  '**/eadpsdk.json',
  '**/Activation.dll',
  '**/Activation64.dll',
  '**/EADesktop.exe',
  '**/EACoreServer.exe',
];

async function detectEaAppMarkers(dirpath) {
  try {
    return await glob(EA_APP_MARKER_GLOBS, { cwd: dirpath, onlyFiles: true, deep: 5, caseSensitiveMatch: false, suppressErrors: true });
  } catch {
    return [];
  }
}

const EMULATOR_BINARIES = ['rpcs3.exe', 'shadPS4.exe', 'shadps4.exe', 'xenia.exe', 'xenia_canary.exe'];

/*
  Steam emulators that keep a game's unlocks INSIDE the game folder rather than under %APPDATA%.
  Their %APPDATA% cousins are found by defaultSteamEmuSaveRoots() above; these are not, because the
  data lives wherever the game was installed - so unless the game's own folder is a watched folder,
  the Watchdog never looks at it and the game's unlocks only surface on the next library refresh.
  The Watchdog re-reads each config itself and decides where the save actually is; all this has to do
  is put the folder in front of it.
*/
const IN_FOLDER_EMULATOR_CONFIGS = ['ALI213.ini', 'valve.ini', 'SteamConfig.ini', 'hlm.ini', 'ds.ini', 'steam_api.ini', 'steam_emu.ini'];

/*
  Emulator folders Windows already knows about, with no file system search at all.

  "App Paths" is the key an installer writes so `start rpcs3` works, and the uninstall index carries
  an InstallLocation for anything that shipped an installer. Both are a handful of registry reads and
  they cover the case no folder-name heuristic can: an emulator installed under a name nobody would
  think to probe. Read-only and failure-tolerant - a machine with neither key simply contributes
  nothing, and the folder-based search below still runs.
*/
function emulatorRootsFromRegistry(registry = require('../util/reg.js')) {
  const roots = [];
  const seen = new Set();
  const add = (value) => {
    const dir = String(value || '').trim().replace(/^"+|"+$/g, '');
    if (!dir) return;
    // App Paths stores the executable; the uninstall index stores the folder.
    const normalized = /\.exe$/i.test(dir) ? path.dirname(dir) : dir.replace(/[\\/]+$/, '');
    const key = path.normalize(normalized).toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    roots.push(normalized);
  };

  const APP_PATHS = 'Software/Microsoft/Windows/CurrentVersion/App Paths';
  for (const hive of ['HKCU', 'HKLM']) {
    for (const binary of EMULATOR_BINARIES) {
      try {
        add(registry.readRegistryStringAndExpand(hive, `${APP_PATHS}/${binary}`, ''));
      } catch {
        /* a missing key is the normal case */
      }
    }
  }

  const UNINSTALL_ROOTS = [
    ['HKLM', 'Software/Microsoft/Windows/CurrentVersion/Uninstall'],
    ['HKLM', 'Software/WOW6432Node/Microsoft/Windows/CurrentVersion/Uninstall'],
    ['HKCU', 'Software/Microsoft/Windows/CurrentVersion/Uninstall'],
  ];
  const EMULATOR_NAME = /^(rpcs3|shadps4|xenia)\b/i;
  for (const [hive, root] of UNINSTALL_ROOTS) {
    let keys = [];
    try {
      keys = registry.listRegistryAllSubkeys(hive, root) || [];
    } catch {
      continue;
    }
    for (const key of keys) {
      // Match on the key name first: reading DisplayName for every installed program would be
      // hundreds of registry enumerations on an ordinary machine.
      if (!EMULATOR_NAME.test(key)) continue;
      try {
        add(registry.readRegistryStringAndExpand(hive, `${root}/${key}`, 'InstallLocation'));
      } catch {
        /* skip one unreadable entry */
      }
    }
  }

  return roots;
}

function isProbableAppIdFolderName(name) {
  const value = String(name || '').trim();
  if (!/^[0-9a-fA-F]+$/.test(value)) return false;
  if (/^7656\d{13}$/.test(value)) return false; // SteamID64 user folder, not a game appid.
  if (/^\d{12,}$/.test(value)) return false;
  if (value.length < 6 && /[a-f]/i.test(value)) return false;
  return true;
}

// Quarantine a corrupted config file (rename to <file>.corrupt-<timestamp>) so its raw bytes are
// preserved for manual recovery while a clean default is written in its place.
function quarantineCorruptConfig(f, err) {
  try {
    const backup = `${f}.corrupt-${Date.now()}`;
    fs.renameSync(f, backup);
    console.warn(`[userDir] corrupt config ${f} (${err.message}); quarantined to ${backup}, resetting`);
  } catch (e) {
    try { fs.unlinkSync(f); } catch {}
    console.warn(`[userDir] corrupt config ${f} (${err.message}); could not quarantine (${e.message}), overwriting`);
  }
}

module.exports.get = async () => {
  return (await module.exports.getEntries()).filter((entry) => entry.enabled !== false);
};

module.exports.getEntries = async () => {
  try {
    if (!fs.existsSync(file)) {
      await this.save([]);
      return [];
    }
    const raw = fs.readFileSync(file, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry) => (typeof entry === 'string' ? { path: entry, notify: true, origin: 'manual', enabled: true } : { ...entry, notify: true }))
        .map((entry) => ({ ...entry, origin: entry.origin === 'auto' ? 'auto' : 'manual', enabled: entry.enabled !== false }))
        .filter((entry) => entry.path);
    } catch (parseErr) {
      // Genuine corruption (e.g. a write interrupted by a crash/power loss). A transient I/O lock
      // throws before JSON.parse and is handled by the outer catch - so we never quarantine a good
      // file just because antivirus/the indexer held it open for a moment.
      quarantineCorruptConfig(file, parseErr);
      try { await this.save([]); } catch {}
      return [];
    }
  } catch (err) {
    // I/O error (file locked, permission issue, …) - degrade to empty without destroying the file.
    console.warn(`[userDir] could not read ${file}: ${err.message}`);
    return [];
  }
};

module.exports.save = async (data) => {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    throw err;
  }
};

module.exports.find = async () => {
  return (await module.exports.findEntries()).map((entry) => entry.path);
};

module.exports.findEntries = async () => {
  try {
    const result = [];
    const addDetected = (dir, detector) => {
      if (!dir) return;
      const key = path.normalize(String(dir)).toLowerCase();
      if (result.some((item) => path.normalize(item.path).toLowerCase() === key)) return;
      result.push({ path: dir, notify: true, origin: 'auto', enabled: true, detector });
    };
    for (const dir of saveRoots.defaultSteamEmuSaveRoots({ existingOnly: true, expandProgramDataSteam: true })) {
      addDetected(dir, 'Known achievement-data location');
    }

    // Console-emulator data has a few stable per-user locations. RPCS3 additionally honours its own
    // RPCS3_CONFIG_DIR, which is the only pointer to a configuration root kept outside both the
    // emulator folder and AppData.
    for (const dir of [
      process.env.APPDATA && path.join(process.env.APPDATA, 'rpcs3'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'rpcs3'),
      process.env.RPCS3_CONFIG_DIR,
      process.env.APPDATA && path.join(process.env.APPDATA, 'shadPS4'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'shadPS4'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'xenia'),
      process.env.APPDATA && path.join(process.env.APPDATA, 'xenia'),
    ]) {
      try {
        if (dir && fs.statSync(dir).isDirectory()) addDetected(dir, 'Known emulator data location');
      } catch {}
    }

    /*
      Where a portable emulator binary is actually looked for. Never a whole-drive walk: three
      bounded sources, in increasing cost.

        - the registry Windows itself keeps for installed programs (App Paths and the uninstall
          index): no file system work at all, and it is the only route that finds an emulator
          installed somewhere nobody would think to name;
        - dedicated emulator folders ("D:\Emulators", "~/Desktop/Emulation", ...), which is where a
          portable build normally lives and which the game-library allowlist by definition misses;
        - the detected game libraries, as before.
    */
    for (const dir of emulatorRootsFromRegistry()) {
      try {
        if (fs.statSync(dir).isDirectory()) addDetected(dir, 'Installed emulator (registry)');
      } catch {}
    }

    const search = EMULATOR_BINARIES.map((name) => `**/${name}`);
    const libraryRoots = await saveRoots.discoverLibraryRoots();
    const searchRoots = [
      ...(await saveRoots.discoverEmulatorRoots()).map((root) => ({ root, detector: 'Supported emulator in detected folder' })),
      ...libraryRoots.map((root) => ({ root, detector: 'Supported emulator in detected library' })),
    ];
    for (const { root, detector } of searchRoots) {
      for (const filepath of await glob(search, { cwd: root, deep: 3, onlyFiles: true, absolute: true, suppressErrors: true })) {
        addDetected(path.parse(filepath).dir, detector);
      }
    }

    // A game whose emulator writes its unlocks beside it. Same bounded walk as above, over the game
    // libraries only: the config has to name an AppID, or the folder is not a game this can follow.
    const inFolderSearch = IN_FOLDER_EMULATOR_CONFIGS.map((name) => `**/${name}`);
    for (const root of libraryRoots) {
      for (const filepath of await glob(inFolderSearch, { cwd: root, deep: 3, onlyFiles: true, absolute: true, suppressErrors: true })) {
        try {
          if (!/^\s*App(?:ID|Id)\s*=\s*[0-9]+\s*$/im.test(fs.readFileSync(filepath, 'utf8'))) continue;
        } catch {
          continue; // unreadable config names nothing
        }
        addDetected(path.parse(filepath).dir, 'Emulator saving inside the game folder');
      }
    }

    return result;
  } catch (err) {
    throw err;
  }
};

/*
  Why a folder was accepted or rejected, not just whether it was: a rejected folder and a folder that
  was never examined must not look the same, so every branch below names itself and the rejection
  branches say what WAS found instead. Returns { accepted, code, evidence }; the UI turns the code
  into a sentence - nothing here is user-visible text.
*/
module.exports.diagnose = async (dirpath) => {
  const accepted_files = steam_emu_cfg_file_supported.concat(EMULATOR_BINARIES);
  const evidence = { layouts: PORTABLE_SCENE_SAVE_DIRS.length };

  let entries;
  try {
    entries = await glob('*', { cwd: dirpath, onlyDirectories: true, deep: 1, suppressErrors: true });
  } catch (err) {
    return { accepted: false, code: 'unreadable', evidence: { ...evidence, error: err.message } };
  }

  // Goldberg SocialClub Emu Saves keeps game folders named after the game (GTA V, RDR2, ...) with
  // hex profile subfolders - there is no numeric AppID and no emulator .ini to match. Accept the
  // root, a game folder or a profile folder explicitly.
  const socialclub = require('./socialclub.js');
  if (socialclub.isSocialClubPath(dirpath)) return { accepted: true, code: 'socialclub', evidence };

  // Some emulators use hex ids; isProbableAppIdFolderName rejects obvious user-id/noise folders.
  const appidFolders = entries.filter(isProbableAppIdFolderName);
  if (appidFolders.length > 0) return { accepted: true, code: 'appid-folders', evidence: { ...evidence, appidFolders } };

  // Accept parent community roots like Public\Documents\Steam when the real appid folders are inside
  // RUNE/CODEX. Users commonly add the parent from guides, while AW scans the concrete child source.
  const expandedRoots = saveRoots.expandKnownSteamSourceRoots(dirpath).filter((root) => path.resolve(root) !== path.resolve(dirpath));
  for (const root of expandedRoots) {
    const nested = await glob('*', { cwd: root, onlyDirectories: true, deep: 1, suppressErrors: true });
    const found = nested.filter(isProbableAppIdFolderName);
    if (found.length > 0) return { accepted: true, code: 'known-root', evidence: { ...evidence, root, appidFolders: found } };
  }

  const topLevel = await glob('*.{ini,exe}', { cwd: dirpath, onlyFiles: true, suppressErrors: true });
  const config = topLevel.find((name) => accepted_files.some((filename) => filename === name));
  if (config) return { accepted: true, code: 'emulator-config', evidence: { ...evidence, config } };

  /*
    A console emulator's DATA folder, with no binary in it. RPCS3 can relocate its virtual disk
    (vfs.yml) and shadPS4 keeps its trophies under %APPDATA%, so the folder that actually holds the
    achievements is routinely not the folder that holds the executable - and adding it by hand used
    to be refused. The emulator readers own the layout rules; this only asks them.
  */
  try {
    const rpcs3Roots = require('./rpcs3.js').trophyRoots(dirpath);
    if (rpcs3Roots.length > 0) {
      return { accepted: true, code: 'emulator-data', evidence: { ...evidence, emulator: 'rpcs3', roots: rpcs3Roots.map((r) => r.path) } };
    }
  } catch {
    /* layout probing must never turn into a rejection reason of its own */
  }
  try {
    // A CUSA folder inside, not merely a folder named game_data: a game_data sibling belonging to
    // another emulator install must not make an unrelated game folder look watchable.
    const shadRoots = require('./shadps4.js')._internal.gameDataRootCandidates(dirpath).filter((candidate) => {
      try {
        return fs.readdirSync(candidate, { withFileTypes: true }).some((entry) => entry.isDirectory() && /^CUSA\d{5}$/i.test(entry.name));
      } catch {
        return false;
      }
    });
    if (shadRoots.length > 0) return { accepted: true, code: 'emulator-data', evidence: { ...evidence, emulator: 'shadps4', roots: shadRoots } };
  } catch {
    /* same */
  }

  // Some GOG/UniverseLAN and repack layouts keep the config below the selected game root
  // (for example <Game>/Engine/Binaries/.../UniverseLAN.ini). Accept that root, then scan()
  // will resolve the real config folder at low depth.
  const nestedConfigs = await glob(steam_emu_cfg_file_supported.map((name) => `**/${name}`), { cwd: dirpath, onlyFiles: true, deep: 4, suppressErrors: true });
  if (nestedConfigs.length > 0) return { accepted: true, code: 'emulator-config-nested', evidence: { ...evidence, config: nestedConfigs[0] } };

  /*
    No config anywhere: the save tree itself is the better anchor than the emulator ini, since it
    carries the appid in its folder name and is what the parser reads anyway. A release that ships
    no ini (or whose ini the user deleted) is still discoverable this way.
  */
  const portable = collectPortableSceneSavesBelow(dirpath);
  if (portable.length > 0) {
    return { accepted: true, code: 'portable-save-tree', evidence: { ...evidence, saves: portable.map((record) => record.data.path) } };
  }

  /*
    Rejected. Say which kind of folder this is instead of stopping at "nothing found", so the answer
    separates a layout AW cannot read from a folder that genuinely holds no unlock data.
  */
  const eaMarkers = await detectEaAppMarkers(dirpath);
  if (eaMarkers.length > 0) return { accepted: false, code: 'ea-app-release', evidence: { ...evidence, markers: eaMarkers.slice(0, 5) } };

  const executables = topLevel.filter((name) => /\.exe$/i.test(name));
  const nestedExecutables = executables.length > 0 ? executables : await glob('**/*.exe', { cwd: dirpath, onlyFiles: true, deep: 4, suppressErrors: true });
  if (nestedExecutables.length > 0) {
    return { accepted: false, code: 'game-folder-no-data', evidence: { ...evidence, executable: nestedExecutables[0] } };
  }

  return { accepted: false, code: 'no-marker', evidence };
};

module.exports.check = async (dirpath) => {
  return (await module.exports.diagnose(dirpath)).accepted;
};

/*
  Emulator configs kept below the selected folder: one per game under a library root, or a repack
  that buries its config a few levels down (<Game>/Engine/Binaries/.../UniverseLAN.ini). Each config
  folder is scanned as if the user had picked it directly.
*/
async function scanBelow(dir) {
  const nested = await glob(steam_emu_cfg_file_supported.map((name) => `**/${name}`), {
    cwd: dir,
    onlyFiles: true,
    absolute: true,
    deep: 4,
    suppressErrors: true,
  });
  const result = [];
  const seen = new Set([path.resolve(dir).toLowerCase()]);
  for (const filepath of nested) {
    // fast-glob returns posix separators even on Windows, and this path is handed on as the game
    // folder: resolve it so every record carries a native path.
    const cfgDir = path.resolve(path.parse(filepath).dir);
    const key = cfgDir.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(...(await module.exports.scan(cfgDir)));
  }
  return result;
}

module.exports.scan = async (dir) => {
  let result = [];

  try {
    let info;
    for (var file of steam_emu_cfg_file_supported) {
      try {
        info = ini.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        break;
      } catch (e) {}
    }
    /*
      No emulator config at the top of the selected folder. That is the ordinary case when the user
      adds their games LIBRARY rather than one game folder - check() accepts such a folder because of
      the configs sitting below it, so scan() must look in the same place rather than return empty.
    */
    if (!info) {
      const below = await scanBelow(dir);
      /*
        Still nothing: no config at the top and none below it either. A release can ship with no
        emulator ini at all (or the user removed it) - read the save tree directly instead of relying
        on the ini, since the appid is right there in its folder name.
      */
      return below.length > 0 ? below : collectPortableSceneSavesBelow(dir);
    }

    /*
      parentFind: usually the cfg/dll pair sits next to the game binary, so the UserDataFolder should
      be right there too. Otherwise, walk up parent directories until it is found.
    */

    if ((file === 'ALI213.ini' || file === 'valve.ini' || file === 'SteamConfig.ini') && info.Settings) {
      //ALI213

      if (info.Settings.AppID && info.Settings.PlayerName && info.Settings.SaveType == 0) {
        let dirpath = await parentFind(
          async (directory) => {
            let has = await parentFind.exists(path.join(directory, `Profile/${info.Settings.PlayerName}/Stats`));
            return has && directory;
          },
          { cwd: dir, type: 'directory' }
        );

        if (dirpath) {
          result.push({
            appid: info.Settings.AppID,
            source: 'ALI213',
            data: {
              type: 'file',
              path: path.join(dirpath, `Profile/${info.Settings.PlayerName}/Stats`),
            },
          });
        }
      } else if (info.Settings.AppID && info.Settings.PlayerName && info.Settings.SaveType == 1) {
        const mydocs = readRegistryStringAndExpand('HKCU', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'Personal');
        if (mydocs) {
          result.push({
            appid: info.Settings.AppID,
            source: 'ALI213',
            data: {
              type: 'file',
              path: path.join(mydocs, `VALVE/${info.Settings.AppID}/${info.Settings.PlayerName}/Stats`),
            },
          });
        }
      } else if (info.Settings.AppID && !info.Settings.SaveType) {
        let dirpath = await parentFind(
          async (directory) => {
            let has = await parentFind.exists(path.join(directory, 'Profile/Stats'));
            return has && directory;
          },
          { cwd: dir, type: 'directory' }
        );

        if (dirpath) {
          result.push({
            appid: info.Settings.AppID,
            source: 'ALI213',
            data: {
              type: 'file',
              path: path.join(dirpath, 'Profile/Stats'),
            },
          });
        }
      }
    } else if ((file === 'ds.ini' || file === 'hlm.ini' || file === 'steam_api.ini') && info.GameSettings) {
      //Hoodlum - DARKSiDERS - Skidrow(since end of 2019 ?)

      if (info.GameSettings.UserDataFolder === '.' && info.GameSettings.AppId) {
        let dirpath = await parentFind(
          async (directory) => {
            let has = await parentFind.exists(path.join(directory, 'SteamEmu/UserStats'));
            return has && directory;
          },
          { cwd: dir, type: 'directory' }
        );

        if (dirpath) {
          result.push({
            appid: info.GameSettings.AppId,
            source: file === 'ds.ini' ? 'DARKSiDERS' : file === 'hlm.ini' ? 'Hoodlum' : 'Skidrow',
            data: {
              type: 'file',
              path: path.join(dirpath, 'SteamEmu/UserStats'),
            },
          });
        } else {
          dirpath = await parentFind(
            async (directory) => {
              let has = await parentFind.exists(path.join(directory, 'SteamEmu'));
              return has && directory;
            },
            { cwd: dir, type: 'directory' }
          );

          if (dirpath) {
            result.push({
              appid: info.GameSettings.AppId,
              source: file === 'ds.ini' ? 'DARKSiDERS' : file === 'hlm.ini' ? 'Hoodlum' : 'Skidrow',
              data: {
                type: 'file',
                path: path.join(dirpath, 'SteamEmu'),
              },
            });
          } else if (file === 'hlm.ini') {
            //Hoodlum using ALI213 like emu (before ~ september 2019 ?)
            //User reported that setting it to mydocs has no effect. But should be double confirmed.
            //Seems to be using defaults: playerName VALVE and saveType 0

            dirpath = await parentFind(
              async (directory) => {
                let has = await parentFind.exists(path.join(directory, 'Profile/VALVE/Stats'));
                return has && directory;
              },
              { cwd: dir, type: 'directory' }
            );

            if (dirpath) {
              result.push({
                appid: info.GameSettings.AppId,
                source: 'Hoodlum',
                data: {
                  type: 'file',
                  path: path.join(dirpath, 'Profile/VALVE/Stats'),
                },
              });
            }
          }
        }
      } else if (
        info.GameSettings.UserDataFolder === 'mydocs' &&
        info.GameSettings.AppId &&
        info.GameSettings.UserName &&
        info.GameSettings.UserName !== ''
      ) {
        const mydocs = readRegistryStringAndExpand('HKCU', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'Personal');
        if (mydocs) {
          let dirpath = path.join(mydocs, info.GameSettings.UserName, info.GameSettings.AppId, 'SteamEmu');

          result.push({
            appid: info.GameSettings.AppId,
            source: file === 'ds.ini' ? 'DARKSiDERS' : file === 'hlm.ini' ? 'Hoodlum' : 'Skidrow',
            data: {
              type: 'file',
              path: fs.existsSync(path.join(dirpath, 'UserStats')) ? path.join(dirpath, 'UserStats') : dirpath,
            },
          });
        }
      }
    } else if (file === 'steam_api.ini' && info.Settings) {
      //Catherine

      if (info.Settings.AppId && info.Settings.SteamID) {
        let dirpath = await parentFind(
          async (directory) => {
            let has = await parentFind.exists(path.join(directory, `SteamProfile/${info.Settings.SteamID}`));
            return has && directory;
          },
          { cwd: dir, type: 'directory' }
        );

        if (dirpath) {
          result.push({
            appid: info.Settings.AppId,
            data: {
              type: 'file',
              path: path.join(dirpath, `SteamProfile/${info.Settings.SteamID}`),
            },
          });
        }
      }
    } else if (file === 'tenoke.ini') {
      if (info.TENOKE && info.TENOKE.id) {
        let steamDataDir = path.join(dir, 'SteamData');
        if (!fs.existsSync(steamDataDir)) {
          // Unreal Engine titles keep tenoke.ini at the game root but the SteamData folder nested
          // deeper (e.g. <game>/<Name>/Binaries/Win64/SteamData) - locate it instead of assuming
          // it sits next to the cfg. Bounded depth keeps the search cheap.
          const found = await glob('**/SteamData', { cwd: dir, onlyDirectories: true, absolute: true, deep: 6, suppressErrors: true });
          if (found.length > 0) steamDataDir = found[0];
        }
        result.push({
          appid: info.TENOKE.id.split('#')[0].trim(),
          data: { type: 'file', path: steamDataDir },
        });
      }
    } else if (file === 'UniverseLAN.ini') {
      if (info.GameSettings && info.GameSettings.AppID)
        result.push({ appid: info.GameSettings.AppID, data: { type: 'file', path: path.join(dir, 'UniverseLANData') } });
    } else if (file === 'steam_emu.ini' || file === 'cpy.ini') {
      /*
        CODEX / RUNE / CPY. Section and key casing vary between builds and between the releases of a
        single group, so the appid is read case-insensitively from whatever section carries it rather
        than from one hard-coded path.
      */
      let appid = '';
      for (const section of Object.values(info || {})) {
        if (!section || typeof section !== 'object') continue;
        for (const [key, value] of Object.entries(section)) {
          if (!/^app_?id$/i.test(key)) continue;
          const digits = String(value).match(/\d+/);
          if (digits) {
            appid = digits[0];
            break;
          }
        }
        if (appid) break;
      }
      if (appid) {
        const found = findSceneSaveDir(dir, appid);
        /*
          A game with no save folder yet is still added, pointing at the layout this release would
          write to. steam.getAchievementsFromFile() treats a missing file as a plain 0% game, so the
          card appears with its full achievement list all locked - which is the whole point: a
          missing card is indistinguishable from a game that was never installed and tells the user
          nothing, while a 0% card says "found, nothing unlocked yet" and starts being watched.
        */
        const fallback = path.join(dir, 'Steam', 'RUNE', appid);
        result.push({
          appid,
          source: found ? found.source : 'Steam-emulator',
          data: { type: 'file', path: found ? found.path : fallback, gameDir: dir },
        });
      }
    }

    if (result.length === 0) result.push(...(await scanBelow(dir)));
    if (result.length === 0) result.push(...collectPortableSceneSavesBelow(dir));
  } catch (err) {
    console.warn(err);
  }

  return result;
};

// Exposed so the library scan can point a scene-emulator game at the folder its release actually
// writes to, instead of the %APPDATA% root that only the Goldberg family uses.
module.exports.findSceneSaveDir = findSceneSaveDir;
// Exposed for the same reason, for a release that carries no emulator config to anchor on.
module.exports.collectPortableSceneSaves = collectPortableSceneSaves;
module.exports.collectPortableSceneSavesBelow = collectPortableSceneSavesBelow;
// Exposed for unit testing the registry route, which cannot be exercised against a real machine.
module.exports._internal = { EMULATOR_BINARIES, emulatorRootsFromRegistry };
