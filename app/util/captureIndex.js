'use strict';

/*
  Which screenshot or clip belongs to which achievement. The Watchdog records each file as it asks
  for it, so the viewer never has to guess from a file name; captures older than this index are
  still found by their name (findCaptures). Loaded by the Watchdog, so it requires only fs and path.
*/

const fs = require('fs');
const path = require('path');

const INDEX_FILE = 'cfg/captureIndex.json';
const INDEX_VERSION = 1;
const KINDS = ['screenshot', 'clip'];
// The newest files of one achievement; an achievement reset and earned again adds more.
const MAX_PER_ACHIEVEMENT = 20;
const EXTENSIONS = { screenshot: ['.png'], clip: ['.mp4', '.webm'] };

// Names Windows refuses whatever the extension, so a game called "NUL" or "COM1" would lose its
// screenshots entirely.
const RESERVED_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

// Strips characters illegal in Windows names, keeps spaces, caps length. Trailing dots/spaces matter
// too: Windows silently drops them from the name it actually creates, so a title ending in one
// ("Mr. Do.", "Sam & Max ") would have the write land somewhere other than the path returned here.
function sanitizeName(s) {
  const cleaned = String(s || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\p{Cc}/gu, '') // control characters are illegal in a Windows name too
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .replace(/[. ]+$/, '');
  if (!cleaned) return 'Unknown';
  return RESERVED_NAME.test(cleaned) ? cleaned + '_' : cleaned;
}

// "<achievement> - 2026-06-23 23-10-05", with " (2)" when that second already had a file.
const SOUVENIR_NAME = /^(.+) - (\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})(?: \(\d+\))?$/;

const indexPath = (userData) => path.join(userData, ...INDEX_FILE.split('/'));
const emptyIndex = () => ({ version: INDEX_VERSION, games: {} });
// Windows folders ignore case; Linux ones do not.
const fileKey = (file, platform = process.platform) => (platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file));

function kindOf(file) {
  const ext = path.extname(String(file)).toLowerCase();
  return KINDS.find((kind) => EXTENSIONS[kind].includes(ext)) || null;
}

// A missing index is empty; one that cannot be read throws, so it is never saved back empty.
function readIndex(userData, { strict = false } = {}) {
  let text;
  try {
    text = fs.readFileSync(indexPath(userData), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || !strict) return emptyIndex();
    throw err;
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.games === 'object' && parsed.games !== null && !Array.isArray(parsed.games)) return parsed;
  } catch {}
  // A broken file holds nothing worth keeping; the name lookup still finds its files.
  return emptyIndex();
}

function writeIndex(userData, index) {
  const file = indexPath(userData);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(index), 'utf8');
  try {
    fs.renameSync(temporary, file);
  } catch (err) {
    // An antivirus holding the index makes the rename fail: no stray copy is left behind.
    fs.rmSync(temporary, { force: true });
    throw err;
  }
}

// Read just before writing, so nothing recorded since the last read is lost.
function update(userData, change) {
  const index = readIndex(userData, { strict: true });
  if (change(index) === false) return false;
  writeIndex(userData, index);
  return true;
}

function record(userData, { appid, name, kind, file, at = Date.now() } = {}) {
  if (appid == null || appid === '' || name == null || name === '' || !KINDS.includes(kind) || !file || !path.isAbsolute(String(file))) return false;
  return update(userData, (index) => {
    const game = (index.games[String(appid)] ||= {});
    const list = (game[String(name)] ||= []);
    const key = fileKey(file);
    if (list.some((entry) => fileKey(entry.file) === key)) return false;
    list.unshift({ kind, file: String(file), at: Number(at) || Date.now() });
    list.splice(MAX_PER_ACHIEVEMENT);
  });
}

// An unlock that lands while a clip is still recording joins that clip: its own file never exists.
function relink(userData, from, to) {
  if (!from || !to || from === to) return false;
  const fromKey = fileKey(from);
  return update(userData, (index) => {
    let changed = false;
    for (const game of Object.values(index.games)) {
      for (const list of Object.values(game)) {
        for (const entry of list) {
          if (fileKey(entry.file) !== fromKey) continue;
          entry.file = String(to);
          changed = true;
        }
      }
    }
    return changed;
  });
}

async function statFile(file) {
  try {
    const stat = await fs.promises.stat(file);
    return stat.isFile() && stat.size > 0 ? stat : null;
  } catch {
    return null;
  }
}

async function listFolder(folder) {
  try {
    return await fs.promises.readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
}

// A title shared by two achievements of the game cannot tell their files apart, so it is left out.
function ownersByTitle(titles) {
  const owners = new Map();
  for (const [name, title] of Object.entries(titles || {})) {
    if (typeof title !== 'string' || !title.trim()) continue;
    const label = sanitizeName(title);
    const key = label.toLowerCase();
    owners.set(key, owners.has(key) && owners.get(key) !== name ? null : name);
  }
  return owners;
}

/*
  Every screenshot and clip of a game, by achievement name, newest first. The index comes first;
  a file it does not hold is matched by the "<achievement> - <date>" name every capture has had,
  in the game's folder under each capture folder. Only files that are still there are returned.
*/
async function findCaptures({ index, appid, gameTitles = [], titles = {}, dirs = {}, platform = process.platform } = {}) {
  // No prototype: an achievement name is any string a source gave, "__proto__" included.
  const found = Object.create(null);
  const taken = new Set();
  const add = (name, kind, file, stat) => {
    (found[name] ||= []).push({ kind, file, at: stat.mtimeMs });
    taken.add(fileKey(file, platform));
  };

  // One clip can hold several unlocks, so a file may belong to more than one achievement here.
  const indexed = (index && index.games && index.games[String(appid)]) || {};
  const candidates = [];
  for (const [name, list] of Object.entries(indexed)) {
    const own = new Set();
    for (const entry of Array.isArray(list) ? list : []) {
      const kind = entry && kindOf(entry.file);
      const key = kind && fileKey(entry.file, platform);
      if (!kind || own.has(key)) continue;
      own.add(key);
      candidates.push({ name, kind, file: entry.file });
    }
  }
  const stats = await Promise.all(candidates.map((candidate) => statFile(candidate.file)));
  candidates.forEach((candidate, i) => stats[i] && add(candidate.name, candidate.kind, candidate.file, stats[i]));

  const owners = ownersByTitle(titles);
  const folders = new Set();
  for (const kind of KINDS) {
    for (const dir of dirs[kind] || []) {
      if (!dir) continue;
      for (const title of gameTitles) if (typeof title === 'string' && title.trim()) folders.add(path.join(dir, sanitizeName(title)));
    }
  }
  const named = [];
  const listings = await Promise.all([...folders].map((folder) => listFolder(folder).then((entries) => ({ folder, entries }))));
  for (const { folder, entries } of listings) {
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = path.join(folder, entry.name);
      const kind = kindOf(file);
      const match = kind && SOUVENIR_NAME.exec(path.basename(entry.name, path.extname(entry.name)));
      const name = match && owners.get(match[1].toLowerCase());
      if (name && !taken.has(fileKey(file, platform))) named.push({ name, kind, file });
    }
  }
  const namedStats = await Promise.all(named.map((candidate) => statFile(candidate.file)));
  named.forEach((candidate, i) => namedStats[i] && add(candidate.name, candidate.kind, candidate.file, namedStats[i]));

  for (const list of Object.values(found)) list.sort((a, b) => b.at - a.at);
  return found;
}

module.exports = { INDEX_FILE, KINDS, sanitizeName, readIndex, record, relink, findCaptures, kindOf };
