'use strict';

/*
  The global unlock rate an achievement had when the user earned it (#208), kept in
  cfg/unlock-rarity.json as { "<appid>::<source>": { "<name>": { percent, at } } }. The Watchdog
  writes it on a live unlock, the game page reads it beside today's rate. Rates are not kept
  anywhere over time, so only unlocks seen from now on can have one.
*/

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('./replaceFile.js');

const FILE_NAME = 'unlock-rarity.json';
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function storeFile(root) {
  const dir = root || require('./userDataPath.js').knownUserDataDir();
  return dir ? path.join(dir, 'cfg', FILE_NAME) : null;
}

// null when the file is too big to read: a writer must then leave it alone rather than replace
// every rate it holds with one new row.
function readStore(file) {
  if (!file) return {};
  try {
    if (fs.statSync(file).size > MAX_FILE_BYTES) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function validPercent(value) {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Records the rate `name` of `appid` had at this unlock; a later unlock (after a relock) replaces it.
 * @returns {boolean} whether a record was written
 */
function recordUnlockRarity({ appid, source, name, percent, at, root } = {}) {
  const rate = validPercent(percent);
  if (rate === null || appid == null || String(appid) === '' || name == null || String(name) === '') return false;
  const file = storeFile(root);
  if (!file) return false;
  const store = readStore(file);
  if (store === null) return false;
  const key = `${String(appid)}::${String(source || '')}`;
  const unlockedAt = Number.isFinite(Number(at)) && Number(at) > 0 ? Math.floor(Number(at)) : Math.floor(Date.now() / 1000);
  const previous = store[key] && typeof store[key] === 'object' && !Array.isArray(store[key]) ? store[key] : undefined;
  const next = { ...store, [key]: { ...previous, [String(name)]: { percent: rate, at: unlockedAt } } };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomicSync(file, JSON.stringify(next));
  return true;
}

/**
 * The recorded rates of `appid` by achievement name, under any source: the library and the Watchdog
 * can name one game's source differently (a Uplay game read from GSE Saves).
 * @returns {Map<string, {percent: number, at: number}>}
 */
function readUnlockRarity(appid, { root } = {}) {
  const out = new Map();
  if (appid == null || String(appid) === '') return out;
  const prefix = `${String(appid)}::`;
  for (const [key, entries] of Object.entries(readStore(storeFile(root)) || {})) {
    if (!key.startsWith(prefix) || !entries || typeof entries !== 'object') continue;
    for (const [name, row] of Object.entries(entries)) {
      const rate = validPercent(row && row.percent);
      if (rate !== null) out.set(name, { percent: rate, at: Number(row.at) || 0 });
    }
  }
  return out;
}

module.exports = { recordUnlockRarity, readUnlockRarity, FILE_NAME };
