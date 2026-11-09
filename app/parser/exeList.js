'use strict';

const path = require('path');
const { pickBestClaim } = require('../util/claimCollision.js');
const { knownUserDataDir, userDataDir } = require('../util/userDataPath.js');
const { createIndexedGameLookup } = require('../util/indexedGameLookup.js');
const { writeFileAtomicSync } = require('../util/replaceFile.js');
const { exeHintsFor } = require('./exeHints.js');
const fs = require('fs');

let debug = { log() {}, error() {}, warn() {} };

// The launch executable per appid; read by the library, the Watchdog and the main process.
const EXE_LIST_FILE = 'cfg/exeList.db';

function exeListFile(userDataPath) {
  return path.join(userDataPath, EXE_LIST_FILE);
}

module.exports.exeListFile = exeListFile;

// Resolved on each use (knownUserDataDir caches): a require before AW_USER_DATA is set still works.
function listFile() {
  const userDataRoot = knownUserDataDir();
  if (!userDataRoot) throw new Error('exeList: the app data folder is unknown in this process');
  return exeListFile(userDataRoot);
}

module.exports.list = getCurrentList;

/*
  Synchronous reads for the Watchdog and the main process, which hold an appid and want the path the
  library resolved. One parse per change of the file (stamped), never a write, and an unknown data
  folder falls back to the default one instead of throwing: a read here must never break a toast.
*/
const lookups = new Map();

function lookupFor(file) {
  let lookup = lookups.get(file);
  if (!lookup) {
    lookup = createIndexedGameLookup({ getFiles: () => [file] });
    lookups.set(file, lookup);
  }
  return lookup;
}

function configuredExecutable(appid, { file = exeListFile(userDataDir()) } = {}) {
  const id = String(appid == null ? '' : appid).trim();
  if (!id) return '';
  const entry = lookupFor(file)(id);
  return entry && entry.exe ? String(entry.exe) : '';
}

// The main process knows a game under several ids (Steam, library); the first with a path that still
// exists on disk wins, since it points a notification at the install folder.
function firstExistingExecutable(appids, options) {
  for (const appid of appids) {
    const exe = configuredExecutable(appid, options);
    if (exe && fs.existsSync(exe)) return exe;
  }
  return '';
}

module.exports.configuredExecutable = configuredExecutable;
module.exports.firstExistingExecutable = firstExistingExecutable;

async function getCurrentList() {
  try {
    return JSON.parse(fs.readFileSync(listFile(), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      await module.exports.save([]);
      return [];
    } else {
      throw err;
    }
  }
}

module.exports.get = async (appid) => {
  let defaultCfg = { appid, exe: '', args: '' };
  try {
    let currentList = await getCurrentList();
    let found = currentList.find((app) => String(app.appid) === String(appid));
    return found ? found : defaultCfg;
  } catch (err) {
    debug.log(err);
    return defaultCfg;
  }
};

// Atomic, so a reader (the Watchdog, a crash mid-write) never sees half a list.
function writeListSync(data) {
  writeFileAtomicSync(listFile(), JSON.stringify(data, null, 2));
}

module.exports.save = async (data) => {
  try {
    writeListSync(data);
  } catch (err) {
    debug.log(err);
  }
};

/*
  Read, change and write in one synchronous step: with an await in between, two changes started
  together each wrote back the list they had read and one of them was lost. An unreadable list
  throws before anything is written, so it is never replaced by a list missing its entries.
*/
function readListSync() {
  try {
    return JSON.parse(fs.readFileSync(listFile(), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function updateEntry(appid, change) {
  const list = readListSync();
  let entry = list.find((ap) => String(ap.appid) === String(appid));
  if (!entry) {
    entry = { appid, exe: '', args: '' };
    list.push(entry);
  }
  if (change(entry) === false) return entry;
  writeListSync(list);
  return entry;
}

module.exports.add = async (app) => {
  try {
    debug.log(`Adding ${app.appid} to exeList ...`);
    // No collision guard here on purpose - `add` also serves the manual file-picker, and the
    // user is allowed to choose any exe. Auto-detection avoids duplicates by passing `taken` to
    // exeDetect, and reconcile() repairs duplicates left over from corrupt/old data at scan time.
    updateEntry(app.appid, (entry) => {
      entry.exe = app.exe;
      entry.args = app.args;
    });
    debug.log('Done.');
  } catch (err) {
    debug.log(err);
  }
};

/*
  Records a detected exe in place of `previous` (what the caller read: '' or a path that vanished),
  unless something else was recorded meanwhile. Answers the exe now on file.
*/
module.exports.fillIfUnchanged = async (app, previous = '') => {
  try {
    const entry = updateEntry(app.appid, (current) => {
      if (current.exe && current.exe !== previous) return false;
      current.exe = app.exe;
      if (current.args == null) current.args = '';
    });
    return entry.exe;
  } catch (err) {
    debug.log(err);
    return '';
  }
};

// The ColdClient loader Play starts instead of the exe ('' to start the exe again). False when the game has no entry.
module.exports.setLoader = async (appid, loader) => {
  try {
    const list = readListSync();
    const entry = list.find((app) => String(app.appid) === String(appid));
    if (!entry) return false;
    if (loader) entry.loader = String(loader);
    else delete entry.loader;
    writeListSync(list);
    return true;
  } catch (err) {
    debug.log(err);
    return false;
  }
};

module.exports.remove = async (appid) => {
  try {
    const currentList = readListSync();
    const next = currentList.filter((entry) => String(entry.appid) !== String(appid));
    if (next.length === currentList.length) return false;
    writeListSync(next);
    return true;
  } catch (err) {
    debug.log(err);
    return false;
  }
};

/*
  Reconcile the stored launch list against the installed games: drop dead exe paths, resolve one-exe-
  shared-by-many collisions by name match, and re-detect empty entries from a known gameDir (respecting
  anti-collision). Returns the number of entries changed.
*/
module.exports.reconcile = async (games) => {
  const goldberg = require(path.join(__dirname, 'goldberg.js'));
  const exeDetect = require(path.join(__dirname, 'exeDetect.js'));
  let changed = 0;
  try {
    // Read here, with no await before the save below, for the same reason as updateEntry().
    const list = readListSync();

    const byAppid = new Map((games || []).map((g) => [String(g.appid), g]));

    // 0) Ensure every known install has a launch entry (the launch panel pre-fills these on every
    // scan). Only games with an install folder or an authoritative launcher exe participate, so the
    // db never grows with phantom/owned-only games.
    const known = new Set(list.map((e) => String(e.appid)));
    for (const g of games || []) {
      if (known.has(String(g.appid))) continue;
      if (!g.gameDir && !(g.exe && g.exeConfident)) continue;
      list.push({ appid: String(g.appid), exe: '', args: '' });
      known.add(String(g.appid));
      changed++;
    }

    // 1) Drop dead exe paths.
    for (const e of list) {
      if (e.exe && e.exe !== '' && !fs.existsSync(e.exe)) {
        e.exe = '';
        changed++;
      }
    }

    // 1b) Drop an exe that lives inside ANOTHER game's install folder. This clears stale wrong
    // auto-detects from older builds (e.g. "Forza Horizon 5" pointing at an exe inside the
    // "Forza Horizon 6" folder) that survive the dead-path and collision checks because the file
    // exists and is otherwise unique.
    const claimed = (games || [])
      .filter((g) => g.gameDir)
      .map((g) => ({ dir: path.resolve(g.gameDir).toLowerCase(), appid: String(g.appid) }));
    for (const e of list) {
      if (!e.exe) continue;
      const exeLower = path.resolve(e.exe).toLowerCase();
      const owner = claimed.find((c) => exeLower === c.dir || exeLower.startsWith(c.dir + path.sep));
      if (owner && owner.appid !== String(e.appid)) {
        e.exe = '';
        changed++;
      }
    }

    // 2) Resolve collisions - group by lowercased exe path.
    const groups = new Map();
    for (const e of list) {
      if (!e.exe) continue;
      const key = e.exe.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    for (const [, entries] of groups) {
      if (entries.length < 2) continue;
      const base = path.basename(entries[0].exe).replace(/\.exe$/i, '');
      // Same rule as gameIndex.reconcile, including the penalty that stops an unidentified
      // "local-..." placeholder from winning a tie against the game that now has a real AppID.
      const best = pickBestClaim(entries, base, (e) => (byAppid.get(String(e.appid)) || {}).name || '', exeDetect.nameSimilarity);
      for (const e of entries) {
        if (e !== best) {
          e.exe = '';
          changed++;
        }
      }
    }

    // 2b) Resolve folder collisions too: one install folder must not keep several auto-assigned
    // executables across different appids. Keep the entry whose game name best matches its exe.
    const folderGroups = new Map();
    for (const e of list) {
      if (!e.exe) continue;
      const g = byAppid.get(String(e.appid));
      if (!g || !g.gameDir) continue;
      const dirKey = path.resolve(g.gameDir).toLowerCase();
      const exeLower = path.resolve(e.exe).toLowerCase();
      if (exeLower !== dirKey && !exeLower.startsWith(dirKey + path.sep)) continue;
      if (!folderGroups.has(dirKey)) folderGroups.set(dirKey, []);
      folderGroups.get(dirKey).push(e);
    }
    for (const [, entries] of folderGroups) {
      if (entries.length < 2) continue;
      let best = entries[0];
      let bestScore = -1;
      for (const e of entries) {
        const g = byAppid.get(String(e.appid));
        const base = path.basename(e.exe).replace(/\.exe$/i, '');
        const score = g ? exeDetect.nameSimilarity(g.name, base) : 0;
        if (score > bestScore) {
          bestScore = score;
          best = e;
        }
      }
      for (const e of entries) {
        if (e !== best) {
          e.exe = '';
          changed++;
        }
      }
    }

    // 3) Fill empty entries: launcher-provided exe first (Epic/GOG/EA/Xbox manifests are the exact
    // command the launcher runs - zero guesswork), then conservative on-disk detection for every
    // game whose install folder we know. Ambiguous folders stay empty for a manual pick.
    // A recorded exe that vanished while the game was found elsewhere means the folder was moved or
    // renamed: drop it so the fill below redetects. A missing exe with no live gameDir is kept, the
    // drive may just be unplugged.
    for (const e of list) {
      if (!e.exe || fs.existsSync(e.exe)) continue;
      const g = byAppid.get(String(e.appid));
      if (!g || !g.gameDir || !fs.existsSync(g.gameDir)) continue;
      const dirKey = path.resolve(g.gameDir).toLowerCase();
      if (path.resolve(e.exe).toLowerCase().startsWith(dirKey + path.sep)) continue;
      e.exe = '';
      changed++;
    }

    const taken = new Set(list.filter((e) => e.exe).map((e) => e.exe.toLowerCase()));
    const takenGameDirs = new Set();
    for (const e of list) {
      if (!e.exe) continue;
      const g = byAppid.get(String(e.appid));
      if (!g || !g.gameDir) continue;
      const dirKey = path.resolve(g.gameDir).toLowerCase();
      const exeLower = path.resolve(e.exe).toLowerCase();
      if (exeLower === dirKey || exeLower.startsWith(dirKey + path.sep)) takenGameDirs.add(dirKey);
    }
    for (const e of list) {
      if (e.exe) continue;
      const g = byAppid.get(String(e.appid));
      if (!g) continue;
      if (
        g.exe &&
        g.exeConfident &&
        fs.existsSync(g.exe) &&
        !exeDetect.isKnownNonGameExe(path.basename(g.exe)) &&
        !taken.has(g.exe.toLowerCase())
      ) {
        e.exe = g.exe;
        taken.add(g.exe.toLowerCase());
        if (g.gameDir) takenGameDirs.add(path.resolve(g.gameDir).toLowerCase());
        changed++;
        continue;
      }
      if (!g.gameDir) continue;
      const gameDirKey = path.resolve(g.gameDir).toLowerCase();
      if (takenGameDirs.has(gameDirKey)) continue;
      const emu = goldberg.detectEmulator(g.gameDir);
      const res = exeDetect.detectConfident(g.gameDir, g.name, { dllPaths: emu.dll, taken, takenGameDirs, ...exeHintsFor(g) });
      if (res && !taken.has(res.full.toLowerCase())) {
        e.exe = res.full;
        taken.add(res.full.toLowerCase());
        takenGameDirs.add(gameDirKey);
        changed++;
      }
    }

    if (changed > 0) await this.save(list);
  } catch (err) {
    debug.log(err);
  }
  return changed;
};
