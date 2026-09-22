'use strict';

// Dead Space 2 MarkerPatch (github.com/Wemino/MarkerPatch) adds achievement tracking to the PC
// port. The mod ships its own resources beside the game - <root>\achievements\txt\<lang>.txt (one
// "Name|Description" line per achievement, 51 lines) and <root>\achievements\img\<n>.png (0..50) -
// so the schema is built entirely from the install the user points at, no network involved. Unlock
// state lives outside the install, in %LOCALAPPDATA%\EA Games\Dead Space 2\settings.txt, as two
// 32-bit values (Controls.AcL.X low, Controls.AcL.Y high) that together form one 64-bit bitflag.
// Only unlock state, no progress and no per-achievement timestamp.

const fs = require('fs');
const path = require('path');

const APPID = 'markerpatch-47780';
const EXECUTABLE = 'deadspace2.exe';
const INI_FILE = 'MarkerPatch.ini';
const ACHIEVEMENTS_DIR = 'achievements';
const TOTAL = 51;
const STATE_RELATIVE_PATH = path.join('EA Games', 'Dead Space 2', 'settings.txt');
const LANGUAGE_FILES = { english: 'en.txt', german: 'de.txt', spanish: 'es.txt', french: 'fr.txt', italian: 'it.txt' };

// Discovery walks a folder the user pointed at, which can be a whole games library - same bounds as
// xlln.discover.
const MAX_DEPTH = 4;
const MAX_DIRECTORIES = 3000;
const SKIP_DIRECTORIES = new Set(['$recycle.bin', 'system volume information', 'windows', 'node_modules', '.git', 'appdata', 'programdata']);

let _iconRoot = '';

function iconRoot() {
  if (!_iconRoot) {
    const { userDataDir } = require(path.join(__dirname, '..', 'util', 'userDataPath.js'));
    _iconRoot = path.join(userDataDir(), 'icon_cache', 'markerpatch');
  }
  return _iconRoot;
}

module.exports.setIconRoot = (dir) => {
  _iconRoot = dir ? path.resolve(String(dir)) : '';
};

let debug = { log() {}, warn() {}, error() {} };

module.exports.initDebug = ({ isDev, userDataPath }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function readDirectory(target) {
  try {
    return fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return [];
  }
}

// Text files can be plain UTF-8, UTF-8 with a BOM, or UTF-16 - same decoding xlln.js uses for its
// own XML config.
function decodeTextBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return String(buffer || '');
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    if (swapped.length % 2 !== 0) return '';
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  return buffer.toString('utf8').replace(/^﻿/, '');
}

// A folder is a MarkerPatch install only when every piece is there: the executable, the ini and
// both resource folders. Anything less is left alone (same discipline as ff7.detect).
function detect(dir) {
  const root = dir ? path.resolve(String(dir)) : '';
  const empty = { detected: false, root };
  if (!root) return empty;

  const paths = {
    root,
    exe: path.join(root, EXECUTABLE),
    ini: path.join(root, INI_FILE),
    textDir: path.join(root, ACHIEVEMENTS_DIR, 'txt'),
    imagesDir: path.join(root, ACHIEVEMENTS_DIR, 'img'),
  };
  if (!isFile(paths.exe) || !isFile(paths.ini) || !isDirectory(paths.textDir) || !isDirectory(paths.imagesDir)) return empty;
  return { detected: true, root, paths };
}

// Only an explicit 0/false turns the feature off; a missing key or any other value matches the
// mod's own default (achievements on).
function achievementSupportEnabled(iniPath) {
  let text;
  try {
    text = decodeTextBuffer(fs.readFileSync(iniPath));
  } catch {
    return true;
  }
  const match = /^\s*AchievementSupport\s*=\s*([^;#\r\n]+)/im.exec(text);
  if (!match) return true;
  const value = match[1].trim().toLowerCase();
  return value !== '0' && value !== 'false';
}

function parseUint32(raw) {
  const value = String(raw || '').trim();
  if (!value || !/^(0x[0-9a-f]+|\d+)$/i.test(value)) return null;
  let parsed;
  try {
    parsed = BigInt(value);
  } catch {
    return null;
  }
  return parsed >= 0n && parsed <= 0xffffffffn ? parsed : null;
}

// Both halves have to read as a valid 32-bit value, or the flag is refused outright rather than
// read as half of itself.
function parseSettingsFlag(text) {
  let low = null;
  let high = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^\s*Controls\.AcL\.([XY])\s*=\s*([^;#\s]+)/i.exec(line);
    if (!match) continue;
    const value = parseUint32(match[2]);
    if (match[1].toUpperCase() === 'X') low = value;
    else high = value;
  }
  if (low === null || high === null) return null;
  return low | (high << 32n);
}

function stateFilePath() {
  if (!process.env.LOCALAPPDATA) return '';
  return path.join(process.env.LOCALAPPDATA, STATE_RELATIVE_PATH);
}

function readState(stateFile) {
  const target = String(stateFile || '');
  if (!target || !isFile(target)) return null;
  try {
    return parseSettingsFlag(decodeTextBuffer(fs.readFileSync(target)));
  } catch {
    return null;
  }
}

// Walk `dir` and the folders below it, breadth first, within the bounds above. There is only one
// title here, so the first match wins.
function discover(dir) {
  const root = dir ? path.resolve(String(dir)) : '';
  if (!root || !isDirectory(root)) return null;

  const queue = [{ directory: root, depth: 0 }];
  const visited = new Set();
  for (let index = 0; index < queue.length && visited.size < MAX_DIRECTORIES; index += 1) {
    const current = queue[index];
    const key = current.directory.toLowerCase();
    if (visited.has(key)) continue;
    visited.add(key);

    const found = detect(current.directory);
    if (found.detected) return found;

    if (current.depth >= MAX_DEPTH) continue;
    for (const entry of readDirectory(current.directory)) {
      if (!entry.isDirectory()) continue;
      const name = entry.name.toLowerCase();
      if (name.startsWith('.') || SKIP_DIRECTORIES.has(name)) continue;
      queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
    }
  }
  return null;
}

function scan(dir) {
  const found = discover(dir);
  if (!found) return [];
  if (!achievementSupportEnabled(found.paths.ini)) {
    debug.log(`[markerpatch] AchievementSupport is off in '${found.paths.ini}' - skipped`);
    return [];
  }
  debug.log(`[markerpatch] Dead Space 2 found in '${found.root}'`);
  return [
    {
      appid: APPID,
      source: 'MarkerPatch',
      data: { type: 'markerpatch', root: found.root, exe: found.paths.exe, ini: found.paths.ini, path: found.root },
    },
  ];
}

function parseLanguageFile(filePath) {
  let text;
  try {
    text = decodeTextBuffer(fs.readFileSync(filePath));
  } catch {
    return null;
  }
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('|');
      if (separator <= 0) return null;
      return { displayName: line.slice(0, separator).trim(), description: line.slice(separator + 1).trim() };
    });
  return rows.length === TOTAL && rows.every(Boolean) ? rows : null;
}

function iconDirFor() {
  return path.join(iconRoot(), '47780');
}

/*
  Schema built from the mod's own text and image resources, no Steam schema involved. Every entry
  is left visible: neither the mod nor MarkerPatch's source ships a verified "secret achievement"
  list, so guessing one would be worse than showing them all.
*/
async function getGameData(data, lang = 'english') {
  const info = data && typeof data === 'object' ? data : {};
  const found = detect(info.root);
  if (!found.detected) throw new Error(`MarkerPatch: '${info.root}' no longer carries the achievements resources`);

  const english = parseLanguageFile(path.join(found.paths.textDir, LANGUAGE_FILES.english));
  if (!english) throw new Error(`MarkerPatch: '${found.paths.textDir}' English achievement text is missing or malformed`);
  const wanted = LANGUAGE_FILES[lang] ? path.join(found.paths.textDir, LANGUAGE_FILES[lang]) : null;
  const rows = (wanted && parseLanguageFile(wanted)) || english;

  const dir = iconDirFor();
  let iconsWritten = false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    iconsWritten = true;
  } catch {
    /* the achievements still list, just without their art */
  }

  const list = [];
  for (let index = 0; index < TOTAL; index += 1) {
    let icon = '';
    const source = path.join(found.paths.imagesDir, `${index}.png`);
    if (iconsWritten && isFile(source)) {
      const destination = path.join(dir, `${index}.png`);
      try {
        if (!fs.existsSync(destination)) fs.copyFileSync(source, destination);
        icon = 'file:///' + destination.replace(/\\/g, '/');
      } catch {
        /* leave it empty rather than fail the whole game */
      }
    }
    list.push({
      name: `MARKERPATCH_${index}`,
      displayName: rows[index].displayName,
      description: rows[index].description,
      hidden: 0,
      icon,
      icongray: icon,
    });
  }

  return {
    name: 'Dead Space 2',
    appid: APPID,
    img: { header: list.find((entry) => entry.icon)?.icon },
    achievement: { total: list.length, list },
  };
}

// Unlock state only, decoded from the one 64-bit flag. Locked entries are simply absent.
function getAchievements(data) {
  const info = data && typeof data === 'object' ? data : {};
  const iniPath = info.ini || (info.root ? path.join(info.root, INI_FILE) : '');
  if (iniPath && !achievementSupportEnabled(iniPath)) return [];

  const flag = readState(stateFilePath());
  if (flag === null) return [];

  const list = [];
  for (let index = 0; index < TOTAL; index += 1) {
    if ((flag & (1n << BigInt(index))) !== 0n) list.push({ id: `MARKERPATCH_${index}`, achieved: true, earned_time: 0 });
  }
  return list;
}

module.exports.APPID = APPID;
module.exports.TOTAL = TOTAL;
module.exports.EXECUTABLE = EXECUTABLE;
module.exports.INI_FILE = INI_FILE;
module.exports.detect = detect;
module.exports.discover = discover;
module.exports.scan = scan;
module.exports.getGameData = getGameData;
module.exports.getAchievements = getAchievements;
module.exports.parseSettingsFlag = parseSettingsFlag;
module.exports.achievementSupportEnabled = achievementSupportEnabled;
module.exports.stateFilePath = stateFilePath;
module.exports.readState = readState;
module.exports.iconDirFor = iconDirFor;
module.exports.decodeTextBuffer = decodeTextBuffer;
