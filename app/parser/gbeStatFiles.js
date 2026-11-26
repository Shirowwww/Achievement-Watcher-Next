'use strict';

/*
  GBE keeps each stat in <save folder>/stats/<lower-cased name>, as 4 raw bytes. achievements.json
  gets a counter's progress only when that stat moves below its goal, so a stat written before the
  counter was tied to it, or a file the player deleted, leaves the counter empty while the stat file
  holds its value (#168). These files are the current value; this reads them for the library.
*/

const fs = require('fs');
const path = require('path');

const STAT_FILE_BYTES = 4;
const AVGRATE_FILE_BYTES = 16;
// An int32 above this is no counter a game keeps: it is a float's bits, read as an integer.
const PLAUSIBLE_INT_LIMIT = 1e7;
// Below this a float reading is the bits of a large int (12000000 reads as about 1.7e-38), no value.
const SMALLEST_PLAIN_FLOAT = 1e-6;

// { <lower-cased stat name>: 'int' | 'float' | 'avgrate' } from steam_settings/stats.json.
function declaredStatTypes(steamSettings) {
  const types = new Map();
  if (!steamSettings) return types;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(steamSettings, 'stats.json'), 'utf8'));
    for (const stat of Array.isArray(parsed) ? parsed : []) {
      if (stat && stat.name && stat.type) types.set(String(stat.name).toLowerCase(), String(stat.type).toLowerCase());
    }
  } catch {
    /* no stats.json, or an unreadable one: the bytes decide */
  }
  return types;
}

/*
  One stat file's value, or null. A stat stats.json does not declare (allow_unknown_stats) is stored
  as the type the game set it with, which the file does not say: an int unless the integer reading
  is implausible and the float reading is a plain number.
*/
function decodeStat(buffer, type) {
  // An avgrate stat is its average (float), then the count and session length it comes from.
  if (Buffer.isBuffer(buffer) && buffer.length === AVGRATE_FILE_BYTES && type !== 'int') {
    const average = buffer.readFloatLE(0);
    return Number.isFinite(average) ? average : null;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length !== STAT_FILE_BYTES) return null;
  const asInt = buffer.readInt32LE(0);
  const asFloat = buffer.readFloatLE(0);
  if (type === 'int') return asInt;
  if (type === 'float' || type === 'avgrate') return Number.isFinite(asFloat) ? asFloat : null;
  if (Math.abs(asInt) <= PLAUSIBLE_INT_LIMIT) return asInt;
  const plainFloat = Number.isFinite(asFloat) && Math.abs(asFloat) >= SMALLEST_PLAIN_FLOAT && Math.abs(asFloat) <= PLAUSIBLE_INT_LIMIT;
  return plainFloat ? asFloat : asInt;
}

/*
  The values of `names` across every save folder of one game (its own and its Steam shortcuts'):
  each folder holds what the game wrote while started that way, so the highest value wins.
  Returns { <lower-cased name>: number }.
*/
function readStatValues(folders, names, types = new Map()) {
  const values = {};
  const wanted = [...new Set((names || []).filter(Boolean).map((name) => String(name).toLowerCase()))];
  for (const folder of folders || []) {
    if (typeof folder !== 'string' || !folder) continue;
    for (const name of wanted) {
      let buffer;
      try {
        buffer = fs.readFileSync(path.join(folder, 'stats', name));
      } catch {
        continue; // not written from this folder
      }
      const value = decodeStat(buffer, types.get(name));
      if (value == null) continue;
      if (!Object.hasOwn(values, name) || value > values[name]) values[name] = value;
    }
  }
  return values;
}

/*
  Adds to a parsed save the stats its progress schema reads, as raw stat entries applyLocalStatProgress
  maps and the caller then removes (`__rawStatKeys`). An entry the save already has is left alone.
  Returns how many were added.
*/
function addSavedStats(root, { folders, steamSettings, schema } = {}) {
  if (!root || typeof root !== 'object' || !Array.isArray(schema) || schema.length === 0) return 0;
  const names = schema.map((a) => a && a.progress && a.progress.value && a.progress.value.operand1).filter(Boolean);
  if (names.length === 0) return 0;
  const values = readStatValues(folders, names, declaredStatTypes(steamSettings));
  const present = new Set(Object.keys(root).map((key) => key.toLowerCase()));
  const rawKeys = Array.isArray(root.__rawStatKeys) ? root.__rawStatKeys : [];
  let added = 0;
  for (const [name, value] of Object.entries(values)) {
    if (present.has(name)) continue;
    root[name] = value;
    rawKeys.push(name);
    added++;
  }
  if (added > 0 && !Array.isArray(root.__rawStatKeys)) {
    Object.defineProperty(root, '__rawStatKeys', { value: rawKeys, enumerable: false, configurable: true });
  }
  return added;
}

// Whether GBE stored any stat in one of these save folders: then a progress table is worth looking for.
function hasStatFiles(folders) {
  return (folders || []).some((folder) => {
    if (typeof folder !== 'string' || !folder) return false;
    try {
      return fs.readdirSync(path.join(folder, 'stats'), { withFileTypes: true }).some((entry) => entry.isFile());
    } catch {
      return false;
    }
  });
}

/*
  Whether a read save has stats a progress table must map before the Watchdog can turn one into an
  unlock: GBE under a known steam_settings, CODEX/RUNE/OnlineFix stats folded into the save, or GBE
  stat files alone, as in a GSE Saves folder whose game folder AW never located (#232).
*/
function needsProgressMapping(root, { steamSettings = null, saveFolders = [] } = {}) {
  if (!root || typeof root !== 'object') return false;
  return Boolean(steamSettings) || Array.isArray(root.__rawStatKeys) || hasStatFiles(saveFolders);
}

module.exports = { declaredStatTypes, decodeStat, readStatValues, addSavedStats, hasStatFiles, needsProgressMapping };
