'use strict';

/*
  PC ports and recompilations that keep their own achievements (Dusklight, Ghostship, DKR-R...):
  which game a folder holds, where it writes its unlocks, how to read them, and its achievement
  list. The games compile that list in, so it is bundled in assets/recomp-ports.json, taken from
  each port's source. Listed under the PC Port source next to pcports.js. Synchronous and
  dependency-free: the Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');
const { listHosts, hostPath, hostsFor } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));
const formats = require(path.join(__dirname, 'recompPortFormats.js'));
const art = require(path.join(__dirname, 'recompPortArt.js'));
const quiver = require(path.join(__dirname, 'quiver.js'));

const SOURCE = 'PC Port';
const TYPE = 'pcports';
const SCHEMAS = require(path.join(__dirname, '..', 'assets', 'recomp-ports.json'));
const MAX_SAVE_BYTES = 4 * 1024 * 1024;
const MAX_TIMES_BYTES = 256 * 1024;
const TIMES_FILE = 'recomp-ports-times.json';

// Searching a folder the user added: shallow and bounded, as pcports.js does.
const MAX_DEPTH = 3;
const MAX_DIRECTORIES = 400;
const SKIP_DIRECTORIES = /^(?:Data|Content|Mods|res|assets|node_modules|\.git|\$recycle\.bin|system volume information)$/i;

const PORTS = require(path.join(__dirname, 'recompPortTable.js'));

const appidOf = (port) => `${TYPE}-${port.id}`;
const portById = (id) => PORTS.find((port) => port.id === id) || null;

let _dataRoot = '';
let debug = { log() {}, warn() {}, error() {} };
let listDirectory = null;

function dataRoot() {
  if (!_dataRoot) _dataRoot = require(path.join(__dirname, '..', 'util', 'userDataPath.js')).userDataDir();
  return _dataRoot;
}

function setDataRoot(dir) {
  _dataRoot = dir ? path.resolve(String(dir)) : '';
}

function initDebug({ isDev, userDataPath, listDirectory: reader }) {
  if (!_dataRoot && userDataPath) setDataRoot(userDataPath);
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
  listDirectory = typeof reader === 'function' ? reader : null;
}

function statOf(target) {
  try {
    return fs.lstatSync(target);
  } catch {
    return null;
  }
}

// A real file or folder, never a link: a game folder is user-writable and a link could point anywhere.
const isPlainFile = (target) => {
  const stat = statOf(target);
  return !!stat && stat.isFile() && !stat.isSymbolicLink();
};
const isPlainDirectory = (target) => {
  const stat = statOf(target);
  return !!stat && stat.isDirectory() && !stat.isSymbolicLink();
};

function readDirectory(target) {
  if (listDirectory) return listDirectory(target) || [];
  try {
    return fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return [];
  }
}

// Strict UTF-8, bounded, no links; null for anything else.
function readText(file) {
  const stat = statOf(file);
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SAVE_BYTES) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file)).replace(/^﻿/, '');
  } catch {
    return null;
  }
}

// [{ port, root }] for every port whose executable `dir` holds (one launcher can run two games).
function detectAll(dir) {
  const root = dir ? path.resolve(String(dir)) : '';
  if (!root) return [];
  const names = readDirectory(root)
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  return PORTS.filter((port) => names.some((name) => port.exe.test(name))).map((port) => ({ port: port.id, root }));
}

// The first of them, or null.
const detect = (dir) => detectAll(dir)[0] || null;

// The installs in `dir` or below it, each port once.
function discover(dir) {
  const start = dir ? path.resolve(String(dir)) : '';
  if (!start || !isPlainDirectory(start)) return [];
  const found = new Map();
  const queue = [{ directory: start, depth: 0 }];
  for (let index = 0; index < queue.length && index < MAX_DIRECTORIES; index++) {
    const { directory, depth } = queue[index];
    const installs = detectAll(directory);
    if (installs.length > 0) {
      for (const install of installs) if (!found.has(install.port)) found.set(install.port, install);
      continue;
    }
    if (depth >= MAX_DEPTH) continue;
    for (const entry of readDirectory(directory)) {
      if (entry.isDirectory() && !SKIP_DIRECTORIES.test(entry.name)) queue.push({ directory: path.join(directory, entry.name), depth: depth + 1 });
    }
  }
  return [...found.values()];
}

/*
  Where a port keeps its unlocks: the first candidate that exists, else the first one (the file the
  game will write). An install points at its own host (its Wine prefix on Linux); a game found by
  its save alone has every host.
*/
function saveFilesFor(port, root = '') {
  const hosts = root ? hostsFor(root) : listHosts();
  const candidates = [];
  for (const host of hosts) {
    for (const file of port.saves({ root, host, hostPath })) if (file && !candidates.includes(file)) candidates.push(file);
  }
  return candidates;
}

function saveFileFor(port, root = '') {
  const candidates = saveFilesFor(port, root);
  return candidates.find(isPlainFile) || candidates[0] || '';
}

// A port with save slots (`slots`) keeps every slot's file: the library merges them.
function entryFor(port, root, saveFile) {
  return {
    appid: appidOf(port),
    source: SOURCE,
    data: {
      type: TYPE,
      port: port.id,
      path: root || path.dirname(saveFile),
      root: root || '',
      saveFile,
      ...(port.slots ? { saveFiles: saveFilesFor(port, root) } : {}),
    },
  };
}

/*
  The installs under `dir`. A game the install may not hold (`ifSaved`) is left out until it has
  saved an unlock, unless `waiting` asks for it: the Watchdog watches its file before it exists.
*/
function scan(dir, { waiting = false } = {}) {
  return discover(dir).flatMap((install) => {
    const port = portById(install.port);
    const saveFile = saveFileFor(port, install.root);
    if (port.ifSaved && !waiting && !isPlainFile(saveFile)) return [];
    debug.log(`[recompPorts] ${port.title} found in '${install.root}'`);
    return [entryFor(port, install.root, saveFile)];
  });
}

/*
  The ports found without a folder from the user: those Quiver installed (known by their
  repository even when the executable has another name), then those whose unlock file exists.
*/
function knownEntries() {
  const entries = new Map();
  for (const install of quiver.installedFolders()) {
    const repository = install.repository.toLowerCase();
    const port = PORTS.find((candidate) => candidate.repos.includes(repository)) || portById((detect(install.dir) || {}).port);
    if (port && !entries.has(port.id)) entries.set(port.id, entryFor(port, install.dir, saveFileFor(port, install.dir)));
  }
  for (const port of PORTS) {
    if (entries.has(port.id)) continue;
    const saveFile = saveFileFor(port);
    if (saveFile && isPlainFile(saveFile)) entries.set(port.id, entryFor(port, '', saveFile));
  }
  return [...entries.values()];
}

function schemaOf(portId) {
  const schema = SCHEMAS[portId];
  if (!schema || !Array.isArray(schema.achievements)) throw new Error(`PC Port: no achievement list for '${portId}'`);
  return schema;
}

/*
  The bundled list, in English: the ports either ship no other language or keep it in their pack.
  Its pictures are brought into the cache first; a failed download leaves the rows without one.
*/
async function getGameData(data) {
  const port = portById(data && data.port);
  if (!port) throw new Error(`PC Port: unknown port '${data && data.port}'`);
  const schema = schemaOf(port.id);
  try {
    await art.ensurePictures(port, data, schema, dataRoot());
  } catch (err) {
    debug.warn(`[recompPorts] ${port.id}: achievement pictures not fetched: ${err.message || err}`);
  }
  const list = schema.achievements.map((entry) => {
    const icon = art.pictureOf(port, entry, dataRoot());
    return {
      name: String(entry.name),
      displayName: entry.displayName,
      description: entry.description || '',
      hidden: entry.hidden ? 1 : 0,
      ...(entry.goal > 1 ? { max_progress: entry.goal } : {}),
      icon,
      icongray: icon,
    };
  });
  return { name: schema.title || port.title, appid: appidOf(port), img: { header: '', icon: '' }, achievement: { total: list.length, list } };
}

// { id -> { achieved, time, progress } } from a port's unlock file, or null when it cannot be read whole.
function readUnlocks(portId, file) {
  const port = portById(portId);
  const text = port ? readText(file) : null;
  if (text === null) return null;
  try {
    return formats[port.format](text, schemaOf(port.id));
  } catch (err) {
    debug.warn(`[recompPorts] ${portId}: '${file}' not read: ${err.message || err}`);
    return null;
  }
}

/*
  Every file of an entry read and merged: unlocked in one slot is unlocked, the highest progress
  wins. Null when none can be read, or when one that exists cannot be read whole.
*/
function readEntry(info) {
  const files = Array.isArray(info.saveFiles) && info.saveFiles.length > 0 ? info.saveFiles : [String(info.saveFile || '')];
  const present = files.filter(isPlainFile);
  if (present.length === 0) return null;
  const merged = new Map();
  for (const file of present) {
    const unlocks = readUnlocks(info.port, file);
    if (!unlocks) return null;
    for (const [id, state] of unlocks) {
      const known = merged.get(id);
      if (!known) merged.set(id, { ...state });
      else
        merged.set(id, {
          achieved: known.achieved || state.achieved,
          time: [known.time, state.time].filter((time) => time > 0).sort((a, b) => a - b)[0] || 0,
          progress: Math.max(known.progress, state.progress),
        });
    }
  }
  return merged;
}

function earnedIdsFor(info) {
  const unlocks = readEntry(info && typeof info === 'object' ? info : {});
  return unlocks ? [...unlocks].filter(([, state]) => state.achieved).map(([id]) => id) : null;
}

const earnedIds = (portId, file) => earnedIdsFor({ port: portId, saveFile: file });

const timesFile = () => path.join(dataRoot(), 'cfg', TIMES_FILE);

// { portId -> { id -> unix seconds } }: when the Watchdog first saw an unlock the file gives no date for.
function observedTimes() {
  try {
    if (fs.statSync(timesFile()).size > MAX_TIMES_BYTES) return {};
    const parsed = JSON.parse(fs.readFileSync(timesFile(), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Writes down the moment ids were seen, once: a date already kept is never moved.
function recordObservedTimes(portId, ids, now = Math.floor(Date.now() / 1000)) {
  const times = observedTimes();
  const seen = times[portId] && typeof times[portId] === 'object' ? { ...times[portId] } : {};
  const added = ids.filter((id) => !(Number(seen[id]) > 0));
  if (added.length === 0) return;
  for (const id of added) seen[id] = now;
  const file = timesFile();
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({ ...times, [portId]: seen }), 'utf8');
    fs.renameSync(temporary, file);
  } catch (err) {
    fs.rmSync(temporary, { force: true });
    debug.warn(`[recompPorts] could not keep the unlock dates: ${err}`);
  }
}

// Unlock state for the library: the file's own date, else the moment the Watchdog saw it, else none.
function getAchievements(data) {
  const info = data && typeof data === 'object' ? data : {};
  const unlocks = readEntry(info);
  if (!unlocks) return [];
  const seen = observedTimes()[info.port] || {};
  return [...unlocks].map(([id, state]) => ({
    id,
    achieved: state.achieved,
    earned_time: !state.achieved ? 0 : state.time > 0 ? state.time : Number(seen[id]) > 0 ? Number(seen[id]) : 0,
    ...(state.progress > 0 ? { progress: state.progress } : {}),
  }));
}

module.exports = {
  SOURCE,
  TYPE,
  PORTS,
  appidOf,
  portById,
  setDataRoot,
  initDebug,
  detect,
  discover,
  saveFileFor,
  scan,
  knownEntries,
  getGameData,
  readUnlocks,
  earnedIds,
  earnedIdsFor,
  recordObservedTimes,
  getAchievements,
};
