'use strict';

/*
  FINAL FANTASY VII (2013 re-release), appid 39140.

  This build predates Steamworks achievements: it keeps its own unlock state in a fixed 8-byte
  bitfield named achievement.dat, written beside the saves in <Documents>\FINAL FANTASY VII. No
  timestamps, no names, no schema - just 64 bits, of which 28..63 are used, most significant bit
  first inside each byte. app/assets/ff7-achievements.json pairs each bit with the Steam api-name of
  the achievement it stands for, so the ordinary Steam schema for 39140 supplies every name, icon and
  description and nothing has to be shipped twice.

  The folder is identified before any of it is read: an 8-byte file called achievement.dat is far too
  generic to interpret on sight, and reading someone else's save as this bitfield would invent 36
  unlocks out of nothing.
*/

const fs = require('fs');
const path = require('path');

const APPID = '39140';
const STATE_FILE = 'achievement.dat';
const STATE_BYTES = 8;
// The three settings files the 2013 launcher writes on first run. All three, because a lone .cfg is
// not evidence of anything.
const CONFIG_FILES = ['ff7input.cfg', 'ff7sound.cfg', 'ff7video.cfg'];
const SAVE_FILE_RE = /^save\d*\.ff7$/i;
const FOLDER_NAME_RE = /^final\s*fantasy\s*(vii|7)$/i;

const BIT_MAP = require(path.join(__dirname, '..', 'assets', 'ff7-achievements.json'));

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

function readAppidFile(dir) {
  try {
    const value = fs.readFileSync(path.join(dir, 'steam_appid.txt'), 'utf8').replace(/^\uFEFF/, '').trim();
    return /^\d+$/.test(value) ? value : '';
  } catch {
    return '';
  }
}

function hasSaveFile(dir) {
  try {
    return fs.readdirSync(dir).some((name) => SAVE_FILE_RE.test(name));
  } catch {
    return false;
  }
}

/*
  What makes a folder this game: the launcher's own three config files, plus one thing that names the
  title - the appid the user (or a repack) wrote down, the folder name itself, or a FF7 save beside
  them. Anything less is left alone.
*/
function detect(dir) {
  const root = dir ? path.resolve(String(dir)) : '';
  const empty = { detected: false, root, stateFile: '', appid: APPID };
  if (!root) return empty;

  const hasConfigs = CONFIG_FILES.every((name) => isFile(path.join(root, name)));
  if (!hasConfigs) return empty;

  const declaredAppid = readAppidFile(root);
  if (declaredAppid && declaredAppid !== APPID) return empty; // a folder that says it is another game
  const named = declaredAppid === APPID || FOLDER_NAME_RE.test(path.basename(root)) || hasSaveFile(root);
  if (!named) return empty;

  return { detected: true, root, stateFile: path.join(root, STATE_FILE), appid: APPID };
}

/*
  Decode the bitfield. A file of the wrong length is not this format: returning null lets the caller
  report "no achievement data" instead of publishing 36 locked achievements it did not read.
*/
function parseState(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== STATE_BYTES) return null;
  const result = {};
  for (const [rawBit, name] of Object.entries(BIT_MAP)) {
    const bit = Number(rawBit);
    const earned = (buffer[bit >> 3] & (1 << (7 - (bit % 8)))) !== 0;
    // The format carries no unlock time. 0 is what every other timestamp-less source reports.
    result[name] = { Achieved: earned ? '1' : '0', UnlockTime: 0 };
  }
  return result;
}

// Unlock state for a detected folder, in the shape steam.getAchievementsFromFile returns.
function getAchievementsFromFile(dir) {
  const found = detect(dir);
  if (!found.detected) return null;
  let buffer;
  try {
    buffer = fs.readFileSync(found.stateFile);
  } catch {
    return null; // the game writes the file on its first unlock, so absent means 0%
  }
  const parsed = parseState(buffer);
  if (!parsed) debug.log(`[ff7] '${found.stateFile}' is ${buffer.length} bytes, not ${STATE_BYTES} - left unread`);
  return parsed;
}

function documentsRoot() {
  const { readRegistryStringAndExpand } = require(path.join(__dirname, '..', 'util', 'reg.js'));
  return readRegistryStringAndExpand('HKCU', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'Personal');
}

// Where the 2013 launcher puts the folder when nobody moved it.
function defaultRoots() {
  const roots = [];
  const docs = documentsRoot();
  if (docs) roots.push(path.join(docs, 'FINAL FANTASY VII'));
  const userProfile = process.env.USERPROFILE;
  if (userProfile) roots.push(path.join(userProfile, 'Documents', 'FINAL FANTASY VII'));
  return roots;
}

/*
  Scan one folder: the folder itself, then one level down, so a watched library root that merely
  CONTAINS the game folder resolves too. One game at most - there is only one appid here.
*/
function scan(dir) {
  const games = [];
  const seen = new Set();
  const consider = (candidate) => {
    const found = detect(candidate);
    if (!found.detected) return;
    const key = found.root.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    debug.log(`[ff7] FINAL FANTASY VII (2013) found in '${found.root}'`);
    games.push({
      appid: APPID,
      source: 'FF7 (2013)',
      data: { type: 'file', path: found.root, ff7: true },
    });
  };

  consider(dir);
  if (games.length > 0) return games;

  let entries = [];
  try {
    entries = fs.readdirSync(String(dir || ''), { withFileTypes: true });
  } catch {
    return games;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    consider(path.join(dir, entry.name));
    if (games.length > 0) break;
  }
  return games;
}

module.exports.APPID = APPID;
module.exports.STATE_FILE = STATE_FILE;
module.exports.detect = detect;
module.exports.parseState = parseState;
module.exports.getAchievementsFromFile = getAchievementsFromFile;
module.exports.defaultRoots = defaultRoots;
module.exports.scan = scan;
