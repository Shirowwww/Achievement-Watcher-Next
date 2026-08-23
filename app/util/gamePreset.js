'use strict';

/*
  Per-game notification overrides: a small JSON map next to options.ini (<userData>/cfg/gamePreset.json),
  storing only the fields that differ from the global settings. Parsed once and held in memory, since
  an unlock must not pay a disk read for a setting almost no game has. The first version stored
  appid -> preset-name strings; read() still accepts that shape and normalizes it to { preset }.
*/

const fs = require('fs');
const path = require('path');

const POSITIONS = [
  'center-bottom',
  'center-top',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'middle-left',
  'middle-right',
  'custom',
];
const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SOUND_NONE = '__none__';
const SOUND_RANDOM = '__random__';

let cfgDir = null;
let cache = null;

function setUserDataPath(p) {
  if (!p) return;
  cfgDir = path.join(p, 'cfg');
  cache = null;
}

function file() {
  return path.join(cfgDir || '', 'gamePreset.json');
}

function normalizeCustomPosition(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  // Multi-monitor coordinates may legitimately be negative. The broad bound rejects corrupted or
  // hostile values without imposing a desktop layout assumption.
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1000000 || Math.abs(y) > 1000000) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

function normalizeSettings(value) {
  const source = typeof value === 'string' ? { preset: value } : value && typeof value === 'object' ? value : {};
  const out = {};

  const preset = String(source.preset == null ? '' : source.preset).trim();
  if (preset) out.preset = preset;

  const position = String(source.position == null ? '' : source.position).trim();
  if (POSITIONS.includes(position)) out.position = position;
  if (out.position === 'custom') {
    const customPosition = normalizeCustomPosition(source.customPosition);
    if (customPosition) out.customPosition = customPosition;
  }

  const sound = String(source.sound == null ? '' : source.sound).trim();
  const safeSound =
    sound === SOUND_NONE ||
    sound === SOUND_RANDOM ||
    (/\.(?:wav|mp3|ogg|flac|m4a|aac)$/i.test(sound) && !/[\\/:*?"<>|]/.test(sound));
  if (safeSound) out.sound = sound;

  const scale = Number(source.scale);
  if (SCALES.includes(scale)) out.scale = scale;

  return out;
}

function isEmpty(settings) {
  return Object.keys(settings).length === 0;
}

function copySettings(settings) {
  const copy = { ...settings };
  if (settings && settings.customPosition) copy.customPosition = { ...settings.customPosition };
  return copy;
}

function read() {
  if (cache) return cache;
  const map = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [appid, value] of Object.entries(parsed)) {
        const settings = normalizeSettings(value);
        if (!isEmpty(settings)) map.set(String(appid), settings);
      }
    }
  } catch {
    // No file yet, or an unreadable one: every game uses the global notification settings.
  }
  cache = map;
  return cache;
}

function getSettings(appid) {
  if (appid == null || appid === '') return {};
  return copySettings(read().get(String(appid)) || {});
}

// Compatibility helper for code interested only in the preset field.
function get(appid) {
  return getSettings(appid).preset || '';
}

function all() {
  return Object.fromEntries([...read()].map(([appid, settings]) => [appid, copySettings(settings)]));
}

function persist(map) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  if (map.size) fs.writeFileSync(file(), `${JSON.stringify(Object.fromEntries(map), null, 2)}\n`, 'utf8');
  else if (fs.existsSync(file())) fs.rmSync(file());
}

// Replace every override for one game. Missing/blank fields inherit their global value.
function setSettings(appid, value) {
  if (appid == null || appid === '') return false;
  const map = read();
  const key = String(appid);
  const settings = normalizeSettings(value);
  if (isEmpty(settings)) map.delete(key);
  else map.set(key, settings);

  try {
    persist(map);
    return true;
  } catch {
    // A failed write leaves the previous file, so drop the in-memory copy that no longer matches.
    cache = null;
    return false;
  }
}

function set(appid, presetName) {
  const settings = getSettings(appid);
  const preset = String(presetName == null ? '' : presetName).trim();
  if (preset) settings.preset = preset;
  else delete settings.preset;
  return setSettings(appid, settings);
}

// Keep per-game choices attached when a user preset is renamed in the preset designer.
function renamePreset(fromName, toName) {
  const from = String(fromName == null ? '' : fromName).trim();
  const to = String(toName == null ? '' : toName).trim();
  if (!from || !to) return false;
  const map = read();
  let changed = false;
  for (const settings of map.values()) {
    if (settings.preset !== from) continue;
    settings.preset = to;
    changed = true;
  }
  if (!changed) return true;
  try {
    persist(map);
    return true;
  } catch {
    cache = null;
    return false;
  }
}

// Remove only the deleted preset field; position/sound/scale overrides remain useful.
function removePreset(name) {
  const presetName = String(name == null ? '' : name).trim();
  if (!presetName) return false;
  const map = read();
  let changed = false;
  for (const [appid, settings] of map) {
    if (settings.preset !== presetName) continue;
    delete settings.preset;
    if (isEmpty(settings)) map.delete(appid);
    changed = true;
  }
  if (!changed) return true;
  try {
    persist(map);
    return true;
  } catch {
    cache = null;
    return false;
  }
}

// Drop the in-memory copy so the next read picks up a change made by another process.
function invalidate() {
  cache = null;
}

module.exports = {
  POSITIONS,
  SCALES,
  SOUND_NONE,
  SOUND_RANDOM,
  setUserDataPath,
  normalizeCustomPosition,
  normalizeSettings,
  get,
  getSettings,
  all,
  set,
  setSettings,
  renamePreset,
  removePreset,
  invalidate,
};
