'use strict';

/*
  Steps a player writes under an achievement and ticks off by hand (Knight's Honor: 30 unique
  weapons). The game never says which step is done, so nothing here unlocks anything: the steps
  only fill the achievement's bar. Kept in cfg/achievement-steps.json, by appid then achievement
  name: { "<appid>": { "<name>": [{ id, text, done }] } }. The main process (in-game overlay) and the
  window both read and write it, so every edit is a read, a change and an atomic write.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync, quarantineCorruptFile } = require('../util/replaceFile.js');

const FILE_FORMAT = 'aw-next-achievement-steps';
const FILE_VERSION = 1;
const MAX_TEXT_LENGTH = 200;
const MAX_STEPS = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

let userDataPath = null;

function setUserDataPath(p) {
  userDataPath = p;
}

function sidecarFile() {
  const root = userDataPath || require('../util/userDataPath.js').knownUserDataDir();
  return root ? path.join(root, 'cfg/achievement-steps.json') : null;
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function readMap(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return isObject(parsed) ? parsed : {};
  } catch (err) {
    if (err instanceof SyntaxError) quarantineCorruptFile(filePath);
    return {};
  }
}

function writeMap(filePath, map) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileAtomicSync(filePath, JSON.stringify(map, null, 2));
}

// One line of plain text: no control characters, line breaks folded, bounded.
function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

const sameText = (a, b) => cleanText(a).toLowerCase() === cleanText(b).toLowerCase();
const newId = () => crypto.randomBytes(6).toString('hex');

function stepsOf(map, appid, name) {
  const game = map && map[String(appid)];
  const list = isObject(game) ? game[String(name)] : null;
  if (!Array.isArray(list)) return [];
  return list
    .filter((step) => isObject(step) && typeof step.id === 'string' && cleanText(step.text))
    .map((step) => ({ id: step.id, text: cleanText(step.text), done: step.done === true }));
}

function withSteps(map, appid, name, list) {
  const key = String(appid);
  const game = isObject(map[key]) ? { ...map[key] } : {};
  if (list.length > 0) game[String(name)] = list;
  else delete game[String(name)];
  const next = { ...map };
  if (Object.keys(game).length > 0) next[key] = game;
  else delete next[key];
  return next;
}

function editedList(list, edit) {
  const text = cleanText(edit.text);
  switch (edit.op) {
    case 'add':
      return text && list.length < MAX_STEPS ? [...list, { id: newId(), text, done: false }] : null;
    case 'rename':
      return text && list.some((step) => step.id === edit.id) ? list.map((step) => (step.id === edit.id ? { ...step, text } : step)) : null;
    case 'toggle':
      return list.some((step) => step.id === edit.id) ? list.map((step) => (step.id === edit.id ? { ...step, done: edit.done === true } : step)) : null;
    case 'remove':
      return list.some((step) => step.id === edit.id) ? list.filter((step) => step.id !== edit.id) : null;
    default:
      return null;
  }
}

// { map, changed, steps }: the map is a new object, the one passed in is left as it was.
function applyEdit(map, appid, name, edit) {
  const base = isObject(map) ? map : {};
  const current = stepsOf(base, appid, name);
  if (!appid || !name || !isObject(edit)) return { map: base, changed: false, steps: current };
  const next = editedList(current, edit);
  if (!next) return { map: base, changed: false, steps: current };
  return { map: withSteps(base, appid, name, next), changed: true, steps: next };
}

// What the bar shows. An achievement the game has unlocked has every step done.
function progressOf(list, achieved) {
  const total = Array.isArray(list) ? list.length : 0;
  const done = achieved ? total : (list || []).filter((step) => step && step.done).length;
  return { done, total };
}

function achievementsOf(game) {
  return game && game.achievement && Array.isArray(game.achievement.list) ? game.achievement.list.filter((a) => a && a.name != null) : [];
}

// The steps of one game as a list to share: texts only, the ticks are the player's own.
function exportGame(map, game) {
  const achievements = achievementsOf(game)
    .map((achievement) => ({
      name: String(achievement.name),
      displayName: cleanText(achievement.displayName) || String(achievement.name),
      steps: stepsOf(map, game.appid, achievement.name).map((step) => step.text),
    }))
    .filter((entry) => entry.steps.length > 0);
  if (achievements.length === 0) return null;
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    game: { name: cleanText(game.name), appid: String(game.appid) },
    achievements,
  };
}

const refused = (message, code) => Object.assign(new Error(message), { code });

// A steps file read from disk: checked before anything in it is trusted.
function parseImportText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) throw refused('not a steps file', 'NOT_STEPS_FILE');
  let payload;
  try {
    payload = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw refused('not a steps file', 'NOT_STEPS_FILE');
  }
  if (!isObject(payload) || payload.format !== FILE_FORMAT || payload.version !== FILE_VERSION || !Array.isArray(payload.achievements))
    throw refused('not a steps file', 'NOT_STEPS_FILE');
  const achievements = payload.achievements.filter(isObject).map((entry) => ({
    name: typeof entry.name === 'string' ? entry.name : '',
    displayName: cleanText(entry.displayName),
    steps: (Array.isArray(entry.steps) ? entry.steps : []).map(cleanText).filter(Boolean),
  }));
  return { format: FILE_FORMAT, version: FILE_VERSION, achievements };
}

/*
  Adds a file's steps to a game. An entry is matched by the achievement's id, then by its name,
  since the same game has other ids under another source. A step already there (same text) keeps
  its tick; the others come unticked. { map, achievements, added }; NO_MATCH when nothing matched.
*/
function importGame(map, game, payload) {
  const list = achievementsOf(game);
  const byName = new Map(list.map((a) => [String(a.name), a]));
  const byTitle = new Map(list.map((a) => [cleanText(a.displayName).toLowerCase(), a]));
  let next = isObject(map) ? map : {};
  let achievements = 0;
  let added = 0;
  for (const entry of payload.achievements) {
    const texts = (Array.isArray(entry.steps) ? entry.steps : []).map(cleanText).filter(Boolean);
    const target = byName.get(String(entry.name)) || byTitle.get(cleanText(entry.displayName).toLowerCase());
    if (!target || texts.length === 0) continue;
    achievements += 1;
    const current = stepsOf(next, game.appid, target.name);
    const merged = [...current];
    for (const text of texts) {
      if (merged.length >= MAX_STEPS) break;
      if (merged.some((step) => sameText(step.text, text))) continue;
      merged.push({ id: newId(), text, done: false });
      added += 1;
    }
    next = withSteps(next, game.appid, target.name, merged);
  }
  if (achievements === 0) throw refused('no achievement of this game in the file', 'NO_MATCH');
  return { map: next, achievements, added };
}

// For the window and the main process: read, change, write. Returns what applyEdit returned.
function saveEdit(appid, name, edit) {
  const file = sidecarFile();
  if (!file) return { map: {}, changed: false, steps: [] };
  const result = applyEdit(readMap(file), appid, name, edit);
  if (result.changed) writeMap(file, result.map);
  return result;
}

// Every achievement's steps of one game, by achievement name.
function stepsForGame(appid) {
  const file = sidecarFile();
  const map = file ? readMap(file) : {};
  const game = map[String(appid)];
  if (!isObject(game)) return {};
  return Object.fromEntries(Object.keys(game).map((name) => [name, stepsOf(map, appid, name)]));
}

module.exports = {
  FILE_FORMAT,
  MAX_TEXT_LENGTH,
  MAX_STEPS,
  MAX_FILE_BYTES,
  setUserDataPath,
  sidecarFile,
  readMap,
  writeMap,
  stepsOf,
  applyEdit,
  progressOf,
  exportGame,
  parseImportText,
  importGame,
  saveEdit,
  stepsForGame,
};
