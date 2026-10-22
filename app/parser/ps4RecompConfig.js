'use strict';

/*
  What a PS4 port's own files say, read as data only: launcher settings in JSON or INI, the layout
  that marks a native port without run.py (a linked boot image, or runtime folders beside a launcher
  setting naming the game), and the log files a launcher source declares. Synchronous and
  dependency-free: the Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const formats = require(path.join(__dirname, 'ps4RecompTrophies.js'));

const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_LISTED = 64;
// Keys a launcher names the game folder with; a value counts only when it is a dump. DriveClub
// Recomp's launcher.ini has base= and update=: the base game holds the trophy list.
const GAME_KEYS = ['game_dir', 'game_path', 'game', 'app0', 'prepared_dir', 'base_dir', 'base', 'update'];
const SECTION_KEYS = /^(?:launcher|paths|folders)$/i;
const LOCAL_CONFIGS = ['settings.json', 'launcher.json', 'launcher.ini', 'launcher/settings.json', 'user/launcher.ini', 'user/launcher.json', 'data/launcher.json', 'data/settings.json', 'user/launcher_settings.json'];
const RUNTIME_FOLDERS = ['bin', 'data', 'logs'];
const IMAGE = /^(?:boot|content|boot-linked)\.bin$/i;
const LOG_NAME = /^(?:[A-Z][A-Z0-9]*_)*(?:LAST_RUN_LOG|LAST_LOG|LOGS?(?:_(?:DIR|FILE|PATH|FOLDER))?)$/;
const PATH_BASES = ['PORT', 'PORT_DIR', 'ROOT', 'BASE'];

function isFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isDirectory(dir) {
  try {
    const stat = fs.lstatSync(dir);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function listing(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).slice(0, MAX_LISTED);
  } catch {
    return [];
  }
}

function readText(file, max = formats.MAX_SMALL_BYTES) {
  const body = formats.readBounded(file, max);
  return body ? body.toString('utf8').replace(/^\uFEFF/, '') : '';
}

const isDump = (dir) => !!dir && isFile(path.join(dir, 'sce_sys', 'param.sfo'));

function safeKey(key) {
  return typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key);
}

// "key=value" lines, sections flattened, the first value of a key kept.
function parseIni(text) {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^[ \t]*([\w.-]+)[ \t]*=[ \t]*(.*?)[ \t]*$/.exec(line);
    if (match && safeKey(match[1]) && !Object.hasOwn(values, match[1])) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return values;
}

// A launcher's JSON or INI settings as one flat object, {} when unreadable.
function readConfig(file) {
  const text = isFile(file) ? readText(file) : '';
  if (!text) return {};
  if (!/\.json$/i.test(file)) return parseIni(text);
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const values = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && SECTION_KEYS.test(key)) {
        for (const [inner, item] of Object.entries(value)) if (safeKey(inner)) values[inner] = item;
      } else if (safeKey(key) && !Object.hasOwn(values, key)) values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

// The game folder a launcher setting names: the first game key whose value is a dump.
function gameDirFrom(values, resolve) {
  for (const key of GAME_KEYS) {
    const value = values && typeof values[key] === 'string' ? values[key].trim() : '';
    const dir = value ? resolve(value) : '';
    if (isDump(dir)) return dir;
  }
  return '';
}

const localConfigFiles = (root) => LOCAL_CONFIGS.map((name) => path.join(root, name)).filter(isFile);

// A linked boot image: out/boot-linked.bin, or game/image/[<build>/]*.bin.
function hasBootImage(root) {
  if (isFile(path.join(root, 'out', 'boot-linked.bin'))) return true;
  const image = path.join(root, 'game', 'image');
  return listing(image).some((entry) => (entry.isFile() && IMAGE.test(entry.name)) || (entry.isDirectory() && listing(path.join(image, entry.name)).some((inner) => inner.isFile() && IMAGE.test(inner.name))));
}

// The local launcher setting naming a dump, for a folder with runtime folders beside it.
function configuredGame(root, resolve) {
  if (!RUNTIME_FOLDERS.some((name) => isDirectory(path.join(root, name)))) return '';
  for (const file of localConfigFiles(root)) {
    const dir = gameDirFrom(readConfig(file), resolve);
    if (dir) return dir;
  }
  return '';
}

// The dumps a native launcher prepared in game/prepared/<build>, newest first.
function preparedDumps(root) {
  const prepared = path.join(root, 'game', 'prepared');
  return listing(prepared)
    .filter((entry) => entry.isDirectory() && isDump(path.join(prepared, entry.name)))
    .map((entry) => {
      const dir = path.join(prepared, entry.name);
      return { dir, time: fs.statSync(path.join(dir, 'sce_sys', 'param.sfo')).mtimeMs };
    })
    .sort((a, b) => b.time - a.time)
    .map((entry) => entry.dir);
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

// NAME = BASE[.parent...] / 'part' / ...: the literal path, '' for anything computed.
function literalPath(expression, bound) {
  const match = /^([A-Za-z_]\w*)((?:\.parent)*)((?:\s*\/\s*(?:'[^'\r\n]*'|"[^"\r\n]*"))*)\s*(?:#.*)?$/.exec(expression.trim());
  if (!match || !bound.has(match[1])) return '';
  let result = bound.get(match[1]);
  for (let parents = match[2].split('.parent').length - 1; parents > 0; parents -= 1) result = path.dirname(result);
  for (const part of match[3].matchAll(/['"]([^'"]*)['"]/g)) result = path.resolve(result, part[1]);
  return result;
}

/*
  The logs launcher sources name with literal paths (LOG_FILE = PORT_DIR / 'data' / 'game.log',
  LOG_DIR = OUT_DIR / 'logs'): { files, dirs }, inside the port only.
*/
function declaredLogs(root, texts) {
  const files = new Set();
  const dirs = new Set();
  for (const text of texts) {
    const bound = new Map(PATH_BASES.map((name) => [name, root]));
    for (const line of String(text || '').split(/\r?\n/)) {
      const assignment = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(line);
      const value = assignment ? literalPath(assignment[2], bound) : '';
      if (!value) continue;
      bound.set(assignment[1], value);
      if (!LOG_NAME.test(assignment[1]) || !inside(root, value)) continue;
      if (/\.log$/i.test(value)) files.add(value);
      else dirs.add(value);
    }
  }
  return { files: [...files], dirs: [...dirs] };
}

// The Python launcher sources of a port: launcher/*.py[w], and *launcher*.py beside it.
function launcherSources(root) {
  const texts = [];
  for (const folder of [path.join(root, 'launcher'), root]) {
    const names = listing(folder)
      .filter((entry) => entry.isFile() && /\.pyw?$/i.test(entry.name) && (folder !== root || /launcher|_run\.py$/i.test(entry.name)))
      .map((entry) => entry.name)
      .sort();
    for (const name of names) texts.push(readText(path.join(folder, name), MAX_SOURCE_BYTES));
  }
  return texts.filter(Boolean);
}

module.exports = { readConfig, gameDirFrom, localConfigFiles, hasBootImage, configuredGame, preparedDumps, declaredLogs, launcherSources };
