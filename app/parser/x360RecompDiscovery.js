'use strict';

/*
  Where the unlock lists are: every recompiled game below a watched folder or in Documents, the
  ports known by their executable (x360Ports.js), and the default.xex that names a list's install.
  The result is one library record per title.
*/

const fs = require('fs');
const path = require('path');
const xex = require(path.join(__dirname, 'xex.js'));
const ports = require(path.join(__dirname, 'x360Ports.js'));
const launcher = require(path.join(__dirname, 'x360Launcher.js'));
const state = require(path.join(__dirname, 'x360RecompState.js'));
const formats = require(path.join(__dirname, 'x360RecompFormats.js'));

const { debug, readDirectory } = state;

const TOML_FILE_RE = /^([0-9A-F]{8})\.toml$/i;
const MAX_DEPTH = 4;
const MAX_DIRECTORIES = 3000;
const SKIP_DIRECTORIES = new Set(['$recycle.bin', 'system volume information', 'windows', 'node_modules', '.git', 'appdata', 'programdata']);
const LIST_FOLDERS = new Set(['achievements', 'savedata']);
const LIST_FORMATS = new Set(['toml', 'tsv', 'json']);
// Xenia's own program: a dump beside it is the emulator's game, not a recompiled install.
const EMULATOR_EXE_RE = /^xenia/i;
const MAX_CACHED_TITLE_IDS = 1000;

// The unlock lists inside one `achievements` folder.
function inspectAchievementsDir(dir) {
  const found = [];
  for (const entry of readDirectory(dir)) {
    const toml = entry.isFile() && TOML_FILE_RE.exec(entry.name);
    if (toml) {
      found.push({ format: 'toml', titleId: toml[1].toUpperCase(), file: path.join(dir, entry.name) });
    } else if (entry.isDirectory() && state.TITLE_ID_RE.test(entry.name)) {
      const tsvDir = path.join(dir, entry.name);
      if (readDirectory(tsvDir).some((file) => file.isFile() && /\.tsv$/i.test(file.name) && formats.isUnlockTsv(path.join(tsvDir, file.name)))) {
        found.push({ format: 'tsv', titleId: entry.name.toUpperCase(), dir: tsvDir });
      }
    }
  }
  return found;
}

const exesIn = (dir) => readDirectory(dir).filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name));

// The folder directly under the watched `root` that `dir` lies in; `dir` itself when it is the root or outside it.
function topFolderOf(dir, root) {
  const relative = path.relative(root, dir);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return dir;
  return path.join(root, relative.split(path.sep)[0]);
}

/*
  The recompiled executable sits in the game's root: the nearest folder holding one, from `dir` up
  to the folder under the watched `root` it lies in. The root's own program, a library's launcher,
  names no game; adoptRoot() gives the root its lists when it holds one game only.
*/
function gameRootOf(dir, root) {
  const top = topFolderOf(dir, root);
  for (let current = dir; ; current = path.dirname(current)) {
    if (exesIn(current).length) return current;
    if (path.relative(top, current) === '' || path.dirname(current) === current) return '';
  }
}

// The game's own executable, not a helper beside it: the largest one in its root.
function mainExe(gameDir) {
  let best = null;
  for (const entry of exesIn(gameDir)) {
    const full = path.join(gameDir, entry.name);
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      continue;
    }
    if (!best || size > best.size) best = { full, size };
  }
  return best ? best.full : '';
}

/*
  A known port's install (x360Ports.js), found by its executable before any unlock list exists.
  Hollow is told by its folder and GearGame layout, and named as discovery will name its JSON list.
*/
function portTargetsIn(dir, entries, depth, folder, root) {
  const exeNames = entries.filter((entry) => entry.isFile() && ports.isPortExe(entry.name) && ports.isProgram(path.join(dir, entry.name))).map((entry) => entry.name);
  if (exeNames.length) return [{ format: 'port', dir, gameDir: dir, exeNames, folder: path.basename(dir) }];
  // A Linux build only means something to the Linux app: Windows keeps its old behaviour.
  const nativeNames = state.onLinux() ? entries.filter((entry) => entry.isFile() && ports.isNativePortExe(entry.name) && ports.isNativeProgram(path.join(dir, entry.name))).map((entry) => entry.name) : [];
  if (nativeNames.length) return [{ format: 'port', native: true, dir, gameDir: dir, exeNames: nativeNames, folder: path.basename(dir) }];
  const hollowExe = ports.isHollowInstall(dir, readDirectory);
  if (!hollowExe) return [];
  const gearGame = ports.childPath(dir, 'GearGame', true, readDirectory);
  const listRoot = gameRootOf(gearGame, root);
  const listFolder = listRoot ? path.basename(listRoot) : depth === 0 ? path.basename(gearGame) : folder;
  return [{ format: 'port', hollow: true, dir, gameDir: dir, exe: hollowExe, gearGame, folder: listFolder, listRooted: Boolean(listRoot) }];
}

// profiles/<name>/achievements.json: one JSON list per profile, merged by scan().
function profileJsonTarget(dir, entry, root, folder) {
  if (!entry.isFile() || entry.name.toLowerCase() !== 'achievements.json' || path.basename(path.dirname(dir)).toLowerCase() !== 'profiles') return null;
  const file = path.join(dir, entry.name);
  if (!formats.isAchievementJson(file)) return null;
  const gameDir = gameRootOf(dir, root);
  return { format: 'json', file, gameDir, folder: gameDir ? path.basename(gameDir) : folder };
}

// The lists one folder entry stands for: a default.xex, a profile's JSON, an achievements or SaveData folder.
function entryTargets(dir, entry, root, folder) {
  if (entry.isFile()) {
    if (entry.name.toLowerCase() === 'default.xex') return [{ format: 'xex', file: path.join(dir, entry.name) }];
    const profileJson = profileJsonTarget(dir, entry, root, folder);
    return profileJson ? [profileJson] : [];
  }
  const lower = entry.name.toLowerCase();
  if (!entry.isDirectory() || !LIST_FOLDERS.has(lower)) return [];
  // A Documents folder holds no executable and keeps its own name.
  const gameDir = gameRootOf(dir, root);
  const place = { gameDir, folder: gameDir ? path.basename(gameDir) : folder };
  const child = path.join(dir, entry.name);
  if (lower === 'achievements') return inspectAchievementsDir(child).map((target) => ({ ...target, ...place }));
  const file = ports.childPath(child, 'achievements.json', false, readDirectory);
  return file && formats.isAchievementJson(file) ? [{ format: 'json', file, ...place }] : [];
}

const listPathOf = (target) => (target.hollow ? target.gearGame : target.file || target.dir);

/*
  A watched folder that is one game's own folder, as when the user points at an install: it holds a
  program, every list found lies in one folder under it and no other folder there holds a program.
  Its lists without an install then belong to it. A library's launcher never names its games.
*/
function adoptRoot(found, root) {
  const lists = found.filter((target) => LIST_FORMATS.has(target.format) || target.hollow);
  const orphans = new Set(lists.filter((target) => (target.hollow ? !target.listRooted : !target.gameDir)));
  if (!orphans.size || !exesIn(root).length) return found;
  const tops = new Set(lists.map((target) => topFolderOf(listPathOf(target), root)));
  if (tops.size !== 1) return found;
  const others = readDirectory(root).filter((entry) => entry.isDirectory() && !tops.has(path.join(root, entry.name)));
  if (others.some((entry) => exesIn(path.join(root, entry.name)).length)) return found;
  const folder = path.basename(root);
  return found.map((target) => {
    if (!orphans.has(target)) return target;
    return target.hollow ? { ...target, folder } : { ...target, gameDir: root, folder };
  });
}

/*
  Every recompiled game below a folder the user pointed at, which can be a whole library, hence the
  bounds. `folder` names the game: the only title the JSON shape has, and a fallback for the others.
*/
function discover(root) {
  const found = [];
  const queue = [{ dir: root, depth: 0, folder: path.basename(root) }];
  let visited = 0;
  while (queue.length && visited < MAX_DIRECTORIES) {
    const { dir, depth, folder } = queue.shift();
    visited += 1;
    const entries = readDirectory(dir);
    found.push(...portTargetsIn(dir, entries, depth, folder, root));
    for (const entry of entries) {
      found.push(...entryTargets(dir, entry, root, folder));
      const lower = entry.name.toLowerCase();
      if (entry.isDirectory() && !LIST_FOLDERS.has(lower) && depth < MAX_DEPTH && !SKIP_DIRECTORIES.has(lower)) {
        queue.push({ dir: path.join(dir, entry.name), depth: depth + 1, folder: depth === 0 ? entry.name : folder });
      }
    }
  }
  if (queue.length) debug.warn(`[x360recomp] '${root}' holds more than ${MAX_DIRECTORIES} folders: the rest of it is not searched`);
  return adoptRoot(found, root);
}

function toRecord(target) {
  return { appid: state.appidOf(target), source: state.SOURCE, data: { type: state.TYPE, ...target, path: target.file || target.dir } };
}

function readXexIndex() {
  try {
    const parsed = JSON.parse(fs.readFileSync(state.xexIndexFile(), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/*
  Where each title's default.xex was last seen, `index` with `found` added. A game whose list lives
  under Documents says nothing about its install, so the executable found in a watched folder is
  remembered by title id.
*/
function rememberXex(found, index) {
  const updated = { ...index };
  for (const [titleId, file] of found) updated[titleId] = file;
  if ([...found].every(([titleId, file]) => index[titleId] === file)) return index;
  try {
    state.writeAtomic(state.xexIndexFile(), JSON.stringify(updated));
  } catch (err) {
    debug.warn(`[x360recomp] could not record the default.xex locations: ${err}`);
  }
  return updated;
}

const programsIn = (dir) => readDirectory(dir).filter((entry) => entry.isFile() && (/\.exe$/i.test(entry.name) || (state.onLinux() && ports.isNativePortExe(entry.name))));

/*
  The folder of the program nearest a default.xex, up to two folders above it: '' while there is
  none yet, null when that program is an emulator's (a dump in Xenia's games folder is no install).
*/
function xexHome(file) {
  let dir = path.dirname(file);
  for (let level = 0; level <= 2; level += 1, dir = path.dirname(dir)) {
    const programs = programsIn(dir);
    if (programs.length) return programs.some((entry) => EMULATOR_EXE_RE.test(entry.name)) ? null : dir;
  }
  return '';
}

// A default.xex's title id, read again only when the file changes.
function cachedTitleId(file) {
  let key;
  try {
    const stat = fs.statSync(file);
    key = `${file}|${stat.size}|${stat.mtimeMs}`;
  } catch {
    return '';
  }
  if (!state.titleIdCache.has(key)) {
    if (state.titleIdCache.size >= MAX_CACHED_TITLE_IDS) state.titleIdCache.clear();
    state.titleIdCache.set(key, xex.readTitleId(file));
  }
  return state.titleIdCache.get(key);
}

// The title of each default.xex a walk found, by title id; an emulator's dumps are left out.
function xexTitles(targets) {
  const byTitle = new Map();
  for (const target of targets) {
    if (target.format !== 'xex' || xexHome(target.file) === null) continue;
    const titleId = cachedTitleId(target.file);
    if (titleId && !byTitle.has(titleId)) byTitle.set(titleId, target.file);
  }
  return byTitle;
}

// The target with its default.xex and, when it has none yet, the install that executable sits in.
function placeTarget(target, xexByTitle, index) {
  const placed = { ...target };
  const xexFile = target.xex || (target.titleId && xexByTitle.get(target.titleId)) || '';
  if (xexFile) placed.xex = xexFile;
  else delete placed.xex;
  // A list under Documents learns its install from the default.xex seen in a watched folder.
  const knownXex = xexFile || (target.titleId && index[target.titleId]) || '';
  if (!placed.gameDir && knownXex && fs.existsSync(knownXex)) placed.gameDir = xexHome(knownXex) || '';
  if (placed.gameDir && !placed.exe) placed.exe = mainExe(placed.gameDir);
  else if (!placed.gameDir) delete placed.gameDir;
  return placed;
}

// A variable as a Windows program reads it: by any case.
function envLookup(env) {
  return (name) => {
    const key = Object.keys(env).find((known) => known.toUpperCase() === String(name).toUpperCase());
    return (key && env[key]) || '';
  };
}

function hostOf(install, native) {
  const hosts = require(path.join(__dirname, '..', 'util', 'winHosts.js')).hostsFor(install, require(path.join(__dirname, '..', 'util', 'appHosts.js')).appHosts());
  return (native && hosts.find((host) => host.kind === 'linux')) || hosts[0];
}

function customContext(custom) {
  return {
    documentsFor: custom.documentsFor,
    appDataFor: custom.appDataFor,
    localAppDataFor: custom.localAppDataFor || (() => ''),
    regValue: custom.regValue || (() => null),
    env: custom.env || {},
    toLocal: (p) => p,
  };
}

// This machine's own variables reach a program run here; a Wine prefix only has its known folders.
function hostContext(host) {
  return {
    documentsFor: (dir) => require(path.join(__dirname, '..', 'util', 'appHosts.js')).documentsFor(dir),
    appDataFor: () => (host && host.env.APPDATA) || '',
    localAppDataFor: () => (host && host.env.LOCALAPPDATA) || '',
    regValue: (hive, key, name) => (host ? host.regValue(hive, key, name) : null),
    env: (host && host.env) || {},
    variables: host && host.kind === 'native' ? process.env : (host && host.env) || {},
    toLocal: (p) => (host ? host.localPath(p) : p),
  };
}

function portContext(install, native) {
  const custom = state.getPortFolders();
  const base = custom ? customContext(custom) : hostContext(hostOf(install, native));
  return {
    ...base,
    native: Boolean(native),
    xdg: native ? state.linuxFolders() : null,
    readTitleId: cachedTitleId,
    readDirectory,
    envVar: envLookup(base.variables || base.env),
    declaredUserRoot: (dir, exes) => launcher.declaredUserRoot(dir, exes, { env: base.env, toLocal: base.toLocal }),
    log: (message) => debug.log(`[x360recomp] ${message}`),
  };
}

// One port install's target, or null; a port that fails to resolve costs only itself.
function portTarget(target) {
  let resolved;
  try {
    resolved = target.hollow ? ports.hollowTarget(target.dir, target.gearGame, readDirectory) : ports.resolvePort(target.dir, target.exeNames, portContext(target.dir, target.native));
  } catch (err) {
    debug.warn(`[x360recomp] '${target.dir}' could not be read as a port: ${err}`);
    return null;
  }
  if (!resolved) return null;
  if (resolved.skip) {
    debug.warn(`[x360recomp] '${target.dir}' is not listed: ${resolved.skip}`);
    return null;
  }
  return { ...resolved, gameDir: target.dir, exe: resolved.exe || target.exe, folder: target.folder };
}

function logPort(record) {
  const data = record.data;
  if (!data.pending) debug.log(`[x360recomp] ${data.port} (${record.appid}) installed at '${data.gameDir}', unlock list at '${data.path}'`);
  else if (data.path) debug.log(`[x360recomp] ${data.port} (${record.appid}) installed at '${data.gameDir}': unlock source pending, expected at '${data.path}'`);
  else debug.log(`[x360recomp] ${data.port} (${record.appid}) installed at '${data.gameDir}': unlock source pending until its path setup has run`);
}

const listFilesOf = (data) => (Array.isArray(data.profileFiles) && data.profileFiles.length ? data.profileFiles : data.file ? [data.file] : []);

// `main` also reading the lists of `other` when both have the same shape; `main` alone otherwise.
function mergeLists(main, other) {
  const files = listFilesOf(main.data);
  const extra = listFilesOf(other.data);
  if (main.data.format !== other.data.format || !files.length || !extra.length) {
    debug.log(`[x360recomp] ${main.appid}: the ${other.data.format} list at '${other.data.path}' is not merged into the ${main.data.format} one at '${main.data.path}'`);
    return main;
  }
  return { ...main, data: { ...main.data, profileFiles: [...new Set([...files, ...extra])] } };
}

/*
  `record` added to `games`, or merged into the record of its title. A known port's own list
  outranks a generic find of the same title; while that list does not exist yet, a list found
  elsewhere stands and the port only fills the gap.
*/
function addRecord(games, seen, record, isPort) {
  const at = seen.get(record.appid);
  if (isPort && at !== undefined && record.data.pending) return;
  if (isPort) logPort(record);
  else if (at === undefined) debug.log(`[x360recomp] ${record.data.format} unlock list for ${record.appid} at '${record.data.path}'`);
  if (at === undefined) {
    seen.set(record.appid, games.length);
    games.push(record);
    return;
  }
  const kept = games[at];
  const portFirst = isPort && (!kept.data.port || kept.data.pending);
  games[at] = portFirst ? mergeLists(record, kept) : mergeLists(kept, record);
}

// One record per title: the same game found twice (a copy, another profile) reads both lists.
function scan(dir) {
  const targets = discover(dir);
  const xexByTitle = xexTitles(targets);
  const index = rememberXex(xexByTitle, readXexIndex());
  const games = [];
  const seen = new Map();
  for (const target of targets) {
    if (target.format !== 'xex' && target.format !== 'port') addRecord(games, seen, toRecord(placeTarget(target, xexByTitle, index)), false);
  }
  for (const target of targets.filter((t) => t.format === 'port')) {
    const resolved = portTarget(target);
    if (resolved) addRecord(games, seen, toRecord(placeTarget(resolved, xexByTitle, index)), true);
  }
  return games;
}

/*
  `found` merged into `records` by source and appid: new titles are added, and a port entry still
  waiting for its list gives way to that title's list found elsewhere, keeping what it knew about
  the install. { records, changed } with `changed` the number of entries added or replaced.
*/
function mergeRecords(records, found) {
  const merged = [...records];
  const index = new Map(merged.map((record, i) => [`${record.source}:${record.appid}`, i]));
  let changed = 0;
  for (const record of found) {
    const key = `${record.source}:${record.appid}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, merged.length);
      merged.push(record);
      changed += 1;
      continue;
    }
    const waiting = merged[at].data || {};
    if (!record.data || record.data.pending) continue;
    if (!waiting.pending) {
      // The same title with a list in both places: both are read, as within one folder.
      const both = mergeLists(merged[at], record);
      if (listFilesOf(both.data).length > listFilesOf(waiting).length) {
        merged[at] = both;
        changed += 1;
      }
      continue;
    }
    const data = { ...record.data };
    for (const field of ['gameDir', 'exe', 'xex']) if (!data[field] && waiting[field]) data[field] = waiting[field];
    merged[at] = { ...record, data };
    changed += 1;
  }
  return { records: merged, changed };
}

// The shell folder and the profile one of every host (see util/appHosts.js), then XDG data on Linux.
function documentsRoots() {
  const { documentsFolders } = require(path.join(__dirname, '..', 'util', 'appHosts.js'));
  const roots = documentsFolders();
  return state.onLinux() ? [...roots, state.linuxFolders().data] : roots;
}

// Linux builds whose saves sit outside any game folder (x360Ports.js linuxSaveTargets).
function scanNativeSaves() {
  if (!state.onLinux()) return [];
  const index = readXexIndex();
  return ports.linuxSaveTargets(state.linuxFolders()).map((target) => toRecord(placeTarget(target, new Map(), index)));
}

// ReXGlue's default: Documents\<game>\achievements. Only folders holding one are walked.
function scanDocuments(roots) {
  const games = roots ? [] : scanNativeSaves();
  const seen = new Set(games.map((record) => record.appid));
  for (const root of roots || documentsRoots()) {
    for (const entry of readDirectory(root)) {
      const gameDir = path.join(root, entry.name);
      if (!entry.isDirectory() || !ports.isDirectory(path.join(gameDir, 'achievements'))) continue;
      for (const record of scan(gameDir)) {
        if (seen.has(record.appid)) continue;
        seen.add(record.appid);
        games.push(record);
      }
    }
  }
  return games;
}

module.exports = {
  discover,
  scan,
  mergeRecords,
  documentsRoots,
  scanNativeSaves,
  scanDocuments,
  readXexIndex,
};
