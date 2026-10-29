'use strict';

/*
  PC ports that keep unlocks in a file of their own; today Link's Awakening DX HD (LADXHD). Texts and
  icons come from the install, unlocks from "achievement<N> true|false" lines with no dates, so the
  moment the Watchdog first sees one is its date. Synchronous and dependency-free: the Watchdog
  loads this file through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');
const { hostPath, hostsFor, firstExisting } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));

const SOURCE = 'PC Port';
const TYPE = 'pcports';
const GAME_ID = 'ladxhd';
// Namespaced: a bare word cannot clash with a Steam appid in the shared caches.
const APPID = `${TYPE}-${GAME_ID}`;
const TITLE = "The Legend of Zelda: Link's Awakening DX HD";
// The count the game itself compiles in; extra keys in a language file do not add achievements.
const ACHIEVEMENT_COUNT = 110;
const EXECUTABLE = /^(?:Link['’]?s Awakening DX HD|LADXHD)\.exe$/i;
const LANGUAGE_FILE = /^(?:(?:achieve|dialog)_)?([a-z]{3})\.lng$/i;
const TEXT_LINE = /^achieve(Name|Desc)(\d+) (.*)$/;
const UNLOCK_LINE = /^achievement(\d+) (true|false)$/i;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TIMES_BYTES = 256 * 1024;
const TIMES_FILE = 'pcports-times.json';

// The game's language codes, and the names this app gives the same languages.
const LANGUAGES = {
  eng: 'english', chn: 'schinese', deu: 'german', esp: 'spanish', fre: 'french', ind: 'indonesian',
  ita: 'italian', por: 'brazilian', pte: 'portuguese', rus: 'russian', swe: 'swedish',
};

// Searching a folder the user added: shallow, bounded, and never into the game's own data.
const MAX_DEPTH = 3;
const MAX_DIRECTORIES = 400;
const SKIP_DIRECTORIES = /^(?:Data|Content|Mods|node_modules|\.git|\.svn|SaveFiles|\$recycle\.bin|system volume information)$/i;

let _dataRoot = '';

// userData, or what the Watchdog says it is: it locates the folder its own way.
function dataRoot() {
  if (!_dataRoot) _dataRoot = require(path.join(__dirname, '..', 'util', 'userDataPath.js')).userDataDir();
  return _dataRoot;
}

module.exports.setDataRoot = (dir) => {
  _dataRoot = dir ? path.resolve(String(dir)) : '';
};

const iconDirFor = () => path.join(dataRoot(), 'icon_cache', TYPE, GAME_ID);
const timesFile = () => path.join(dataRoot(), 'cfg', TIMES_FILE);

let debug = { log() {}, warn() {}, error() {} };
// The app hands its scan-wide listing memo here (util/dirCache.js); the Watchdog, which loads this
// file on its own, keeps reading the folders directly.
let listDirectory = null;

module.exports.initDebug = ({ isDev, userDataPath, listDirectory: reader }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
  listDirectory = typeof reader === 'function' ? reader : null;
};

function statOf(target) {
  try {
    return fs.lstatSync(target);
  } catch {
    return null;
  }
}

// A real file, never a link: a game folder is user-writable and a link could point anywhere.
function isPlainFile(target) {
  const stat = statOf(target);
  return !!stat && stat.isFile() && !stat.isSymbolicLink();
}

function isPlainDirectory(target) {
  const stat = statOf(target);
  return !!stat && stat.isDirectory() && !stat.isSymbolicLink();
}

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
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TEXT_BYTES) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file)).replace(/^\uFEFF/, '');
  } catch {
    return null;
  }
}

// The folder holding the exe is the install; null when this is not one.
function detect(dir) {
  const root = dir ? path.resolve(String(dir)) : '';
  const executable = readDirectory(root).find((entry) => entry.isFile() && EXECUTABLE.test(entry.name));
  if (!executable) return null;
  const data = path.join(root, 'Data');
  const checks = [isPlainDirectory(data), isPlainFile(path.join(data, 'Languages', 'achieve_eng.lng')), isPlainFile(path.join(data, 'Achievements', 'achievement0.png'))];
  if (!checks.every(Boolean)) return null;
  return { root, executable: executable.name, portable: isPlainFile(path.join(root, 'portable.txt')) };
}

/*
  The unlock file: beside the game when portable.txt is there, otherwise in Zelda_LA under the
  local app data of the host the game runs in (its own prefix on Linux), the one already holding it.
*/
function progressFileFor(found) {
  if (found.portable) return path.join(found.root, 'achievements');
  const candidates = hostsFor(found.root)
    .map((host) => hostPath(host, 'LOCALAPPDATA', 'Zelda_LA', 'achievements'))
    .filter(Boolean);
  return firstExisting(candidates);
}

// The first install found in `dir` or below it, or null.
function discover(dir) {
  const start = dir ? path.resolve(String(dir)) : '';
  if (!start || !isPlainDirectory(start)) return null;
  const queue = [{ directory: start, depth: 0 }];
  for (let index = 0; index < queue.length && index < MAX_DIRECTORIES; index++) {
    const { directory, depth } = queue[index];
    const found = detect(directory);
    if (found) return { ...found, progressFile: progressFileFor(found) };
    if (depth >= MAX_DEPTH) continue;
    for (const entry of readDirectory(directory)) {
      if (entry.isDirectory() && !SKIP_DIRECTORIES.test(entry.name)) queue.push({ directory: path.join(directory, entry.name), depth: depth + 1 });
    }
  }
  return null;
}

function scan(dir) {
  const found = discover(dir);
  if (!found) return [];
  debug.log(`[pcports] ${TITLE} found in '${found.root}'`);
  return [{ appid: APPID, source: 'PC Port', data: { type: TYPE, path: found.root, ...found } }];
}

function languageFiles(root) {
  const files = [];
  for (const folder of ['Data', 'Mods']) {
    const directory = path.join(root, folder, 'Languages');
    if (!isPlainDirectory(directory)) continue;
    for (const entry of readDirectory(directory).sort((a, b) => a.name.localeCompare(b.name))) {
      const match = entry.isFile() && entry.name.match(LANGUAGE_FILE);
      if (match && LANGUAGES[match[1].toLowerCase()]) files.push({ file: path.join(directory, entry.name), language: LANGUAGES[match[1].toLowerCase()] });
    }
  }
  return files;
}

// { language -> Map('Name3' -> text) } from every language file, a Mods file overriding Data.
function readTexts(root) {
  const languages = new Map();
  for (const { file, language } of languageFiles(root)) {
    const text = readText(file);
    if (text === null) continue;
    const strings = languages.get(language) || new Map();
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(TEXT_LINE);
      if (match && Number(match[2]) < ACHIEVEMENT_COUNT) strings.set(`${match[1]}${Number(match[2])}`, match[3]);
    }
    languages.set(language, strings);
  }
  return languages;
}

function iconFor(root, id) {
  const source = path.join(root, 'Data', 'Achievements', `achievement${id}.png`);
  const stat = statOf(source);
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_IMAGE_BYTES) return '';
  try {
    const bytes = fs.readFileSync(source);
    if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return '';
    const target = path.join(iconDirFor(), `achievement${id}.png`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!isPlainFile(target) || !fs.readFileSync(target).equals(bytes)) fs.writeFileSync(target, bytes);
    return 'file:///' + target.replace(/\\/g, '/');
  } catch (err) {
    debug.warn(`[pcports] icon ${id} not kept: ${err}`);
    return '';
  }
}

// The 110 achievements, in the chosen language with English where it has no line.
async function getGameData(data, lang = 'english') {
  const info = data && typeof data === 'object' ? data : {};
  const found = detect(info.root);
  if (!found) throw new Error(`PC Port: '${info.root}' is no longer a Link's Awakening DX HD install`);
  const languages = readTexts(found.root);
  const english = languages.get('english');
  if (!english || !english.has('Name0')) throw new Error(`PC Port: '${found.root}' has no English achievement texts`);
  const chosen = languages.get(String(lang || '').toLowerCase()) || english;

  const list = [];
  for (let id = 0; id < ACHIEVEMENT_COUNT; id++) {
    const name = chosen.get(`Name${id}`) || english.get(`Name${id}`);
    if (!name) throw new Error(`PC Port: achievement ${id} has no name`);
    const icon = iconFor(found.root, id);
    list.push({
      name: `achievement${id}`,
      displayName: name,
      description: chosen.get(`Desc${id}`) || english.get(`Desc${id}`) || '',
      hidden: 0,
      icon,
      icongray: icon,
    });
  }
  const header = list[0].icon;
  return { name: TITLE, appid: APPID, img: { header, icon: header }, achievement: { total: list.length, list } };
}

/*
  { 'achievement7' -> true|false } from the unlock file, or null when it is missing or not whole.
  A line that does not parse makes the file unreadable as a whole: a write caught half way must not
  look like trophies being taken back.
*/
function readUnlocks(file) {
  const text = readText(file);
  if (text === null) return null;
  const unlocks = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(UNLOCK_LINE);
    if (!match || unlocks.has(`achievement${Number(match[1])}`)) return null;
    if (Number(match[1]) < ACHIEVEMENT_COUNT) unlocks.set(`achievement${Number(match[1])}`, match[2].toLowerCase() === 'true');
  }
  return unlocks.size > 0 ? unlocks : null;
}

function earnedIds(file) {
  const unlocks = readUnlocks(file);
  return unlocks ? [...unlocks].filter(([, earned]) => earned).map(([id]) => id) : null;
}

// { id -> unix seconds }: when each unlock was first seen.
function observedTimes() {
  const file = timesFile();
  try {
    if (fs.statSync(file).size > MAX_TIMES_BYTES) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Writes down the moment ids were seen, once: a date already kept is never moved.
function recordObservedTimes(ids, now = Math.floor(Date.now() / 1000)) {
  const times = observedTimes();
  const added = ids.filter((id) => !(Number(times[id]) > 0));
  if (added.length === 0) return;
  for (const id of added) times[id] = now;
  const file = timesFile();
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(times), 'utf8');
    fs.renameSync(temporary, file);
  } catch (err) {
    debug.warn(`[pcports] could not keep the unlock dates: ${err}`);
  }
}

// Unlock state for the library. A date is only what the Watchdog saw; an unlock it never saw has none.
function getAchievements(data) {
  const info = data && typeof data === 'object' ? data : {};
  const ids = earnedIds(String(info.progressFile || ''));
  if (!ids) return [];
  const times = observedTimes();
  return ids.map((id) => ({ id, achieved: true, earned_time: Number(times[id]) > 0 ? Number(times[id]) : 0 }));
}

module.exports.SOURCE = SOURCE;
module.exports.TYPE = TYPE;
module.exports.APPID = APPID;
module.exports.TITLE = TITLE;
module.exports.ACHIEVEMENT_COUNT = ACHIEVEMENT_COUNT;
module.exports.detect = detect;
module.exports.discover = discover;
module.exports.scan = scan;
module.exports.getGameData = getGameData;
module.exports.getAchievements = getAchievements;
module.exports.readUnlocks = readUnlocks;
module.exports.earnedIds = earnedIds;
module.exports.recordObservedTimes = recordObservedTimes;
module.exports.iconDirFor = iconDirFor;
