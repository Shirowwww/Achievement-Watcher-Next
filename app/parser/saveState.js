'use strict';

/*
  What a save says about each of its achievements, read through these functions by both the library
  (steam.js, achievements.js) and the Watchdog (monitor.js): the stats kept beside the save and the
  progress they give, what counts as unlocked, and the unlock date in epoch seconds. A rule that
  changes any of these goes here, never into one of the two readers, so a toast and the library can
  never disagree about the same save (#225). The Watchdog loads it at startup: no scan code, no
  network (test/parsers/watchdogSharedModules.test.js).
*/

const path = require('path');
const { normalizeSaveEntry, readSiblingStats } = require('./emuSave.js');
const { applyLocalStatProgress } = require('./statProgress.js');
const { addSavedStats } = require('./gbeStatFiles.js');
const { parseUnlockTimeSeconds } = require('../util/unlockTime.js');

// The stat each progress achievement of the schema reads, upper-cased.
function progressStatNames(schema) {
  return (Array.isArray(schema) ? schema : [])
    .map((a) => a && a.progress && a.progress.value && a.progress.value.operand1)
    .filter(Boolean)
    .map((name) => String(name).toUpperCase());
}

// Marks entries added to a save as raw stats: they feed the progress, then leave before matching.
function tagRawStats(root, names) {
  if (names.length === 0) return;
  const known = Array.isArray(root.__rawStatKeys) ? root.__rawStatKeys : [];
  known.push(...names);
  if (!Array.isArray(root.__rawStatKeys)) Object.defineProperty(root, '__rawStatKeys', { value: known, enumerable: false, configurable: true });
}

/*
  CODEX, RUNE and OnlineFix keep their stats in a Stats.ini beside achievements.ini: added to the
  save as raw stats, never shadowing a real achievement entry (stat names come lower-cased, the
  achievement keys keep their casing). Returns how many were added.
*/
function addSiblingStats(root, saveFile) {
  if (!root || typeof root !== 'object' || !/achievements\.ini$/i.test(String(saveFile || ''))) return 0;
  const present = new Set(Object.keys(root).map((key) => String(key).toUpperCase()));
  const added = [];
  for (const [name, value] of Object.entries(readSiblingStats(path.dirname(saveFile)))) {
    if (present.has(String(name).toUpperCase())) continue;
    root[name] = value;
    added.push(name);
  }
  tagRawStats(root, added);
  return added.length;
}

/*
  Every stat a save's progress achievements read: Stats.ini beside the save file, then GBE's stats/
  files in each of the game's save folders. `schema` names the stats (statProgress.findProgressSchema).
*/
function addSaveStats(root, { saveFile = null, folders = [], steamSettings = null, schema = [] } = {}) {
  let added = addSiblingStats(root, saveFile);
  const dirs = (Array.isArray(folders) ? folders : []).filter((dir) => typeof dir === 'string' && dir);
  if (dirs.length > 0) added += addSavedStats(root, { folders: dirs, steamSettings, schema });
  return added;
}

/*
  One entry of a save: the name it carries, its crc when it has one, the raw date it was written with,
  and its state { Achieved, CurProgress, MaxProgress?, UnlockTime } with the date in epoch seconds.
  MaxProgress stays unset when the save has none, so the schema's own maximum still applies. A raw
  stat entry (GBE stats.json) carries its count as `value`.
*/
function entryState(key, entry, source) {
  const fields = entry != null && typeof entry === 'object' ? entry : {};
  const parsed = normalizeSaveEntry(entry, source);
  const numericTime = Number(parsed.UnlockTime); // "1700000000.5" too, which the ISO reader would refuse
  const state = {
    Achieved: parsed.Achieved,
    CurProgress: parsed.CurProgress || fields.value || fields.Value || 0,
    ...(parsed.MaxProgress !== undefined ? { MaxProgress: parsed.MaxProgress } : {}),
    UnlockTime: parseUnlockTimeSeconds(Number.isFinite(numericTime) ? numericTime : parsed.UnlockTime),
  };
  return {
    name: fields.id || fields.apiname || fields.name || fields.AchievementId || key,
    ...(fields.crc ? { crc: fields.crc } : {}),
    rawUnlockTime: parsed.UnlockTime,
    state,
  };
}

/*
  The whole save, its stats folded in: one item per achievement entry, { key, entry, name, crc?,
  rawUnlockTime, state }. A stat at its goal unlocks its achievement (statProgress.applyStat), and the
  raw stats leave the list once read, so a stat hash is never matched or announced as an achievement.
  `root` is changed in place.
*/
function saveState(root, { source, schema = [] } = {}) {
  if (!root || typeof root !== 'object') return [];
  const rawStats = new Set((Array.isArray(root.__rawStatKeys) ? root.__rawStatKeys : []).map((name) => String(name).toUpperCase()));
  if (Array.isArray(schema) && schema.length > 0) {
    applyLocalStatProgress(root, schema);
    const achievementNames = new Set(schema.filter((a) => a && a.name).map((a) => String(a.name).toUpperCase()));
    for (const stat of progressStatNames(schema)) if (!achievementNames.has(stat)) rawStats.add(stat);
  }
  const items = [];
  for (const [key, entry] of Object.entries(root)) {
    if (entry == null || rawStats.has(String(key).toUpperCase())) continue;
    items.push({ key, entry, ...entryState(key, entry, source) });
  }
  return items;
}

module.exports = { addSiblingStats, addSaveStats, entryState, saveState };
