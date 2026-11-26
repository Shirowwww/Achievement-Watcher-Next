'use strict';

/*
  What "Switch to the supported emulator" changes in a game folder, and how its Undo puts the folder
  back the way the release shipped it. gameHealthRepair.js plans and runs the switch; this module
  keeps its record and is the one that writes and removes what the record names.
*/

const fs = require('fs');
const path = require('path');
const crackLoaderDetect = require('./crackLoaderDetect.js');
const { unlinkForce, removeTreeForce, writeFileAtomicSync } = require('./replaceFile.js');

const SWITCH_RECORD = '.aw-next-switch.json';
const BACKUPS = '.aw-backups';

function sameDir(a, b) {
  return !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function distinctDirs(dirs) {
  return (dirs || []).filter(Boolean).filter((dir, index, list) => list.findIndex((other) => sameDir(other, dir)) === index);
}

/*
  A dll AW Next itself put there, not the release's: its own build with no backup beside it, or over
  a backup that is its own build too. Earlier switches left such copies (D4: Dark Dreams Don't Die),
  and taking them for the release's runtime would make every later switch replace them again.
*/
function isAwLeftover(file, isAwBuild) {
  if (typeof isAwBuild !== 'function' || !fs.existsSync(file) || !isAwBuild(file)) return false;
  const backup = `${file}.bak`;
  return !fs.existsSync(backup) || isAwBuild(backup);
}

/*
  Files and folders (a folder ends with a separator) under steam_settings. Of .aw-backups only the
  folders are listed, one per backup: a switch that adds one takes it out again whole.
*/
function listTree(root, top = true) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (!entry.isDirectory()) return [full];
    if (top && entry.name === BACKUPS) return [`${full}${path.sep}`, ...listFolders(full)];
    return [`${full}${path.sep}`, ...listTree(full, false)];
  });
}

function listFolders(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `${path.join(dir, entry.name)}${path.sep}`);
  } catch {
    return [];
  }
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

const keyOf = (file) => path.resolve(file).toLowerCase() + (file.endsWith(path.sep) ? path.sep : '');
const recordPath = (base, file) => path.relative(base, file).split(path.sep).join('/') + (file.endsWith(path.sep) ? '/' : '');

// Every file in the switch's folders and in its steam_settings, by lowercased path.
function footprint(dirs, target) {
  const found = [...(dirs || []).flatMap(listFiles), ...(fs.existsSync(target) ? [`${target}${path.sep}`] : []), ...listTree(target)];
  return new Map(found.map((file) => [keyOf(file), file]));
}

function readRecord(target) {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(target, SWITCH_RECORD), 'utf8'));
    const created = Array.isArray(record.created) ? record.created.filter((entry) => typeof entry === 'string') : [];
    const saved = record.saved && typeof record.saved === 'object' ? record.saved : {};
    return { created, saved };
  } catch {
    return { created: [], saved: {} };
  }
}

/*
  Before the switch: what the folders hold, and a copy of each file directly in steam_settings, the
  ones a switch can rewrite (the schema, the DLC list, a steam_interfaces.txt). The icons are only
  ever added, so the list of them is enough.
*/
function begin(dirs, target, stamp = new Date().toISOString().replace(/[:.]/g, '-')) {
  const before = footprint(dirs, target);
  const files = listFiles(target).filter((file) => path.basename(file) !== SWITCH_RECORD);
  const copyDir = path.join(target, BACKUPS, `switch-${stamp}`);
  const saved = {};
  for (const file of files) {
    fs.mkdirSync(copyDir, { recursive: true });
    fs.copyFileSync(file, path.join(copyDir, path.basename(file)));
    saved[recordPath(path.dirname(target), file)] = recordPath(path.dirname(target), path.join(copyDir, path.basename(file)));
  }
  return { dirs, target, before, saved };
}

const sameBytes = (a, b) => {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
};

// After the switch: the record of what it added and of what it rewrote, kept across switches.
function finish({ dirs, target, before, saved }) {
  const base = path.dirname(target);
  const after = footprint(dirs, target);
  const created = [...after]
    .filter(([key, file]) => !before.has(key) && !/\.bak$/i.test(file) && path.basename(file) !== SWITCH_RECORD)
    .map(([, file]) => recordPath(base, file));
  const rewritten = Object.fromEntries(Object.entries(saved).filter(([file, copy]) => !sameBytes(path.resolve(base, file), path.resolve(base, copy))));
  const previous = readRecord(target);
  // An earlier switch not undone yet: its originals are the release's, so they win.
  const record = { created: [...new Set([...previous.created, ...created])], saved: { ...rewritten, ...previous.saved } };
  if (record.created.length === 0 && Object.keys(record.saved).length === 0) return record;
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, SWITCH_RECORD), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

const inBackups = (entry) => entry.split('/').includes(BACKUPS);

// Puts back what the record beside `dir` names: rewritten files first, then the added ones go.
function undoRecorded(dir) {
  const target = path.join(dir, 'steam_settings');
  const recordFile = path.join(target, SWITCH_RECORD);
  if (!fs.existsSync(recordFile)) return { restored: [], removed: [] };
  const { created, saved } = readRecord(target);
  const restored = [];
  for (const [file, copy] of Object.entries(saved)) {
    const from = path.resolve(dir, copy);
    if (!fs.existsSync(from)) continue;
    writeFileAtomicSync(path.resolve(dir, file), fs.readFileSync(from));
    restored.push(path.resolve(dir, file));
  }
  const entries = created.map((entry) => ({ entry, full: path.resolve(dir, entry) }));
  const removed = entries.filter(({ entry, full }) => !entry.endsWith('/') && !/\.bak$/i.test(entry) && fs.existsSync(full) && unlinkForce(full)).map(({ full }) => full);
  if (!unlinkForce(recordFile)) throw new Error(`could not remove ${recordFile}`);
  // Deepest first. A backup the switch made goes whole; any other folder only once empty.
  const folders = entries.filter((item) => item.entry.endsWith('/')).sort((a, b) => b.full.length - a.full.length);
  for (const { entry, full } of folders) {
    if (!fs.existsSync(full)) continue;
    if (inBackups(entry) && !entry.endsWith(`${BACKUPS}/`)) removeTreeForce(full);
    else if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    else continue;
    removed.push(full);
  }
  return { restored, removed };
}

// AW Next's own dlls an earlier switch seeded, in a game that still carries a crack's files.
function leftoverDlls({ dirs = [], isAwBuild = null } = {}) {
  const all = distinctDirs(dirs);
  if (!all.some((dir) => crackLoaderDetect.holdsLoaderFiles(dir))) return [];
  return all.flatMap((dir) => crackLoaderDetect.STEAM_API_DLLS.map((name) => path.join(dir, name))).filter((file) => isAwLeftover(file, isAwBuild));
}

/*
  Undo of the switch: the crack's files come back (restoreSwitchedLoader), what the switch rewrote
  and added comes back out (its record), and so do the dlls earlier switches seeded where the release
  had none, which no record names. `dirs` are every folder the game's runtime can sit in, not only
  the switched ones: D4's root kept two such dlls, and Game Health then read the RELOADED install as
  GBE Fork. A seeded copy goes only while a crack's files are there, so an install of the emulator
  into a folder that needed one is never undone by this.
*/
function undoRuntimeSwitch({ dirs = [], isAwBuild = null } = {}) {
  const all = distinctDirs(dirs);
  const restored = crackLoaderDetect.restoreSwitchedLoader(all);
  const removed = [];
  for (const dir of all) {
    const undone = undoRecorded(dir);
    restored.push(...undone.restored);
    removed.push(...undone.removed);
  }
  for (const live of leftoverDlls({ dirs: all, isAwBuild })) {
    for (const file of [live, `${live}.bak`].filter((candidate) => fs.existsSync(candidate))) {
      if (!unlinkForce(file)) throw new Error(`could not remove ${file}`);
      removed.push(file);
    }
  }
  return { restored, removed };
}

module.exports = { SWITCH_RECORD, isAwLeftover, footprint, begin, finish, readRecord, leftoverDlls, undoRuntimeSwitch };
