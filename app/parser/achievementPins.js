'use strict';

/*
  Locked achievements a player keeps at the top of the list, in the window and in the overlay. Kept
  in cfg/achievement-pins.json, by appid: { "<appid>": ["<name>", ...] }, in the order they were
  pinned. A pin goes away when the player removes it or once the achievement is seen unlocked, never
  because a list was read incomplete. The main process (overlay) and the window both write it, so
  every change is a read, a change and an atomic write.
*/

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync, quarantineCorruptFile } = require('../util/replaceFile.js');

const MAX_PER_GAME = 200;
const MAX_NAME_LENGTH = 512;

let userDataPath = null;

function setUserDataPath(p) {
  userDataPath = p;
}

function pinsFile() {
  const root = userDataPath || require('../util/userDataPath.js').knownUserDataDir();
  return root ? path.join(root, 'cfg', 'achievement-pins.json') : null;
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const validName = (name) => typeof name === 'string' && name.length > 0 && name.length <= MAX_NAME_LENGTH;

function readMap(file) {
  if (!file) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isObject(parsed) ? parsed : {};
  } catch (err) {
    // A broken file is set aside rather than overwritten, so the pins in it can still be recovered.
    if (err instanceof SyntaxError) quarantineCorruptFile(file);
    return {};
  }
}

function pinsOf(map, appid) {
  const list = map[String(appid)];
  return Array.isArray(list) ? [...new Set(list.filter(validName))] : [];
}

function save(appid, pins) {
  const file = pinsFile();
  if (!file) return;
  const map = readMap(file);
  if (pins.length > 0) map[String(appid)] = pins.slice(-MAX_PER_GAME);
  else delete map[String(appid)];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomicSync(file, JSON.stringify(map, null, 2) + '\n');
}

function pinsForGame(appid) {
  return pinsOf(readMap(pinsFile()), appid);
}

function setPinned(appid, name, pinned) {
  if (!String(appid || '') || !validName(name)) return { changed: false, pins: pinsForGame(appid) };
  const pins = pinsForGame(appid);
  const has = pins.includes(name);
  if (has === Boolean(pinned)) return { changed: false, pins };
  const next = pinned ? [...pins, name] : pins.filter((entry) => entry !== name);
  save(appid, next);
  return { changed: true, pins: next };
}

// Drops the pins of achievements now unlocked. `unlockedNames` comes from a whole list that was read.
function dropUnlocked(appid, unlockedNames) {
  const pins = pinsForGame(appid);
  const unlocked = new Set(unlockedNames || []);
  const next = pins.filter((name) => !unlocked.has(name));
  if (next.length === pins.length) return { changed: false, pins };
  save(appid, next);
  return { changed: true, pins: next };
}

module.exports = { setUserDataPath, pinsForGame, setPinned, dropUnlocked, MAX_PER_GAME };
