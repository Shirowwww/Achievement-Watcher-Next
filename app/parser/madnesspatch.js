'use strict';

// Alice: Madness Returns MadnessPatch (github.com/Wemino/MadnessPatch) adds achievement tracking
// to the PC port, installed as <root>\Binaries\Win32\dinput8.dll. The mod ships its own resources
// beside it - <root>\Binaries\Win32\Achievements\txt\<lang>.txt (one "Name|Description" line per
// achievement, 45 lines) and \Achievements\img\<n>.png (0..44) - so the schema is built entirely
// from the install the user points at, no network involved. Unlock state lives per save profile, in
// Documents\My Games\Alice Madness Returns\AliceGame\CheckPoint\<profile>\Achievements.txt, one
// "UnlockFlag = <decimal>" line holding a single 64-bit bitflag. Only unlock state, no progress and
// no per-achievement timestamp. Documents is resolved from the shell folder, never guessed from
// %USERPROFILE% alone - a redirected Documents folder is common enough to matter.

const fs = require('fs');
const path = require('path');

const APPID = 'madnesspatch-19680';
const EXECUTABLE = 'AliceMadnessReturns.exe';
const INI_FILE = 'MadnessPatch.ini';
const PROXY_DLL = 'dinput8.dll';
const ACHIEVEMENTS_DIR = 'Achievements';
const TOTAL = 45;
const CHECKPOINT_RELATIVE_PATH = path.join('My Games', 'Alice Madness Returns', 'AliceGame', 'CheckPoint');
const STATE_FILE = 'Achievements.txt';
const LANGUAGE_FILES = { english: 'en.txt', german: 'de.txt', spanish: 'es.txt', french: 'fr.txt', italian: 'it.txt' };

// Candidate install roots below whatever folder the user added - the game root itself, or the
// Binaries\Win32 folder directly.
const CANDIDATE_SUBPATHS = ['', 'Binaries/Win32', 'Alice2/Binaries/Win32', 'Game/Alice2/Binaries/Win32'];

let _iconRoot = '';

function iconRoot() {
  if (!_iconRoot) {
    const { userDataDir } = require(path.join(__dirname, '..', 'util', 'userDataPath.js'));
    _iconRoot = path.join(userDataDir(), 'icon_cache', 'madnesspatch');
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

function inspectCandidate(candidateRoot) {
  const paths = {
    root: path.resolve(candidateRoot),
    exe: path.join(candidateRoot, EXECUTABLE),
    ini: path.join(candidateRoot, INI_FILE),
    proxy: path.join(candidateRoot, PROXY_DLL),
    textDir: path.join(candidateRoot, ACHIEVEMENTS_DIR, 'txt'),
    imagesDir: path.join(candidateRoot, ACHIEVEMENTS_DIR, 'img'),
  };
  const detected = isFile(paths.exe) && isFile(paths.ini) && isFile(paths.proxy) && isDirectory(paths.textDir) && isDirectory(paths.imagesDir);
  return { detected, paths };
}

// A folder is a MadnessPatch install only when every piece is there: the executable, the ini, the
// proxy dll and both resource folders. `dir` may be the game root or already Binaries\Win32.
function detect(dir) {
  const root = dir ? path.resolve(String(dir)) : '';
  const empty = { detected: false, root };
  if (!root) return empty;

  for (const sub of CANDIDATE_SUBPATHS) {
    const candidateRoot = sub ? path.join(root, sub) : root;
    const found = inspectCandidate(candidateRoot);
    if (found.detected) return { detected: true, root: found.paths.root, paths: found.paths };
  }
  return empty;
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

// The mod writes one decimal, up to 64 bits - unlike Dead Space 2's split X/Y pair.
function parseUnlockFlag(text) {
  let raw = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^\s*UnlockFlag\s*=\s*([^;#\s]+)/i.exec(line);
    if (match) raw = match[1];
  }
  if (!/^\d+$/.test(raw)) return null;
  let flag;
  try {
    flag = BigInt(raw);
  } catch {
    return null;
  }
  return flag >= 0n && flag <= 0xffffffffffffffffn ? flag : null;
}

function readProfileState(stateFile) {
  const target = String(stateFile || '');
  if (!target || !isFile(target)) return null;
  try {
    return parseUnlockFlag(decodeTextBuffer(fs.readFileSync(target)));
  } catch {
    return null;
  }
}

function documentsRoot() {
  const { readRegistryStringAndExpand } = require(path.join(__dirname, '..', 'util', 'reg.js'));
  return readRegistryStringAndExpand('HKCU', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'Personal');
}

// Where the mod keeps every save profile's unlock state. Resolved from the shell folder first, the
// environment variable only as a last resort.
function checkpointRoot() {
  const docs = documentsRoot() || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Documents') : '');
  return docs ? path.join(docs, CHECKPOINT_RELATIVE_PATH) : '';
}

// Every profile that has a state file, newest first.
function listProfiles(root = checkpointRoot()) {
  if (!root || !isDirectory(root)) return [];
  const profiles = [];
  for (const entry of readDirectory(root)) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, STATE_FILE);
    if (!isFile(file)) continue;
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
      /* keep it at 0, still a valid profile */
    }
    profiles.push({ profile: entry.name, file, mtimeMs });
  }
  return profiles.sort((left, right) => right.mtimeMs - left.mtimeMs || left.profile.localeCompare(right.profile));
}

// Walk `dir` and the folders below it, breadth first, within the bounds below - the folder the user
// adds in Settings -> Folders can be the game itself or a whole games library. There is only one
// title here, so the first match wins.
const MAX_DEPTH = 4;
const MAX_DIRECTORIES = 3000;
const SKIP_DIRECTORIES = new Set(['$recycle.bin', 'system volume information', 'windows', 'node_modules', '.git', 'appdata', 'programdata']);

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
    debug.log(`[madnesspatch] AchievementSupport is off in '${found.paths.ini}' - skipped`);
    return [];
  }
  debug.log(`[madnesspatch] Alice: Madness Returns found in '${found.root}'`);
  return [
    {
      appid: APPID,
      source: 'MadnessPatch',
      data: { type: 'madnesspatch', root: found.root, exe: found.paths.exe, ini: found.paths.ini, path: found.root },
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
  return path.join(iconRoot(), '19680');
}

/*
  Schema built from the mod's own text and image resources, no Steam schema involved. Every entry
  is left visible: neither the mod nor MadnessPatch's source ships a verified "secret achievement"
  list, so guessing one would be worse than showing them all.
*/
async function getGameData(data, lang = 'english') {
  const info = data && typeof data === 'object' ? data : {};
  const found = detect(info.root);
  if (!found.detected) throw new Error(`MadnessPatch: '${info.root}' no longer carries the achievements resources`);

  const english = parseLanguageFile(path.join(found.paths.textDir, LANGUAGE_FILES.english));
  if (!english) throw new Error(`MadnessPatch: '${found.paths.textDir}' English achievement text is missing or malformed`);
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
      name: `MADNESSPATCH_${index}`,
      displayName: rows[index].displayName,
      description: rows[index].description,
      hidden: 0,
      icon,
      icongray: icon,
    });
  }

  return {
    name: 'Alice: Madness Returns',
    appid: APPID,
    img: { header: list.find((entry) => entry.icon)?.icon },
    achievement: { total: list.length, list },
  };
}

// Unlock state for the library view, merged across every profile: a game played under more than
// one profile is still one library entry. Live notifications diff per profile instead - see
// watchdog/console/madnesspatchWatch.js.
function getAchievements(data) {
  const info = data && typeof data === 'object' ? data : {};
  const iniPath = info.ini || (info.root ? path.join(info.root, INI_FILE) : '');
  if (iniPath && !achievementSupportEnabled(iniPath)) return [];

  let merged = 0n;
  for (const entry of listProfiles()) {
    const flag = readProfileState(entry.file);
    if (flag !== null) merged |= flag;
  }

  const list = [];
  for (let index = 0; index < TOTAL; index += 1) {
    if ((merged & (1n << BigInt(index))) !== 0n) list.push({ id: `MADNESSPATCH_${index}`, achieved: true, earned_time: 0 });
  }
  return list;
}

module.exports.APPID = APPID;
module.exports.TOTAL = TOTAL;
module.exports.EXECUTABLE = EXECUTABLE;
module.exports.INI_FILE = INI_FILE;
module.exports.STATE_FILE = STATE_FILE;
module.exports.detect = detect;
module.exports.discover = discover;
module.exports.scan = scan;
module.exports.getGameData = getGameData;
module.exports.getAchievements = getAchievements;
module.exports.parseUnlockFlag = parseUnlockFlag;
module.exports.achievementSupportEnabled = achievementSupportEnabled;
module.exports.checkpointRoot = checkpointRoot;
module.exports.listProfiles = listProfiles;
module.exports.readProfileState = readProfileState;
module.exports.iconDirFor = iconDirFor;
module.exports.decodeTextBuffer = decodeTextBuffer;
