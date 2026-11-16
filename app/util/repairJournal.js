'use strict';

/*
  One undo for every repair AW Next writes into a game's files: Game Health's buttons, the
  right-click repair, the emulator fix, and the automatic and bulk repairs. record() notes the files
  under the folders a repair is about to touch, keeping a copy of each, runs the repair, then keeps
  only what it changed. undo() puts those back and removes what the repair created, but leaves any
  file that changed again since (the game, the user or another tool wrote it) and lists it.
  Entries live under <userData>/repair-undo/<appid>/, newest last, a few per game.
*/

const fs = require('fs');
const path = require('path');
const { replaceFileSync, unlinkForce, removeTreeForce } = require('./replaceFile.js');

const ROOT = 'repair-undo';
const JOURNAL = 'journal.json';
const MAX_PER_GAME = 10;
// A repair only touches small files (schemas, icons, INIs, steam_api dlls). A bigger one is noted
// but not copied: should a repair change one, undo says it could not put it back.
const COPY_LIMIT = 32 * 1024 * 1024;
// All copies of one repair together, so a game folder full of data files never fills the disk.
const COPY_TOTAL = 256 * 1024 * 1024;
// Copies, not live files: AW Next's own backup folders are never part of what a repair changed.
const SKIPPED_DIRS = new Set(['.aw-backups']);

const safeName = (value) => String(value || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
const gameRoot = (userDataPath, appid) => path.join(userDataPath, ROOT, safeName(appid));

function statOrNull(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

// A backup folder is not walked; the dated folders a repair adds inside it are noted, so undo can
// take them back out with the files they were copies of.
function noteBackups(dir, state) {
  state.dirs.add(dir);
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) state.backups.add(path.join(dir, entry.name));
  } catch {
    /* unreadable: nothing to note */
  }
}

/*
  Every file and folder under the roots: { files: Map<path, {size, mtimeMs, onlyCreated}>, dirs }.
  A root is { path, deep, onlyCreated }: a file, a folder listed one level (deep false) or walked
  whole. onlyCreated is for save folders: the repair may create a placeholder there, but a save the
  game rewrote meanwhile must never be put back to an older state.
*/
function snapshot(roots) {
  const state = { files: new Map(), dirs: new Set(), backups: new Set() };
  const visit = (target, deep, onlyCreated) => {
    const stat = statOrNull(target);
    if (!stat) return;
    if (stat.isFile()) {
      state.files.set(target, { size: stat.size, mtimeMs: stat.mtimeMs, onlyCreated });
      return;
    }
    if (!stat.isDirectory()) return;
    state.dirs.add(target);
    let entries = [];
    try {
      entries = fs.readdirSync(target, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(target, entry.name);
      if (entry.isFile()) visit(child, false, onlyCreated);
      else if (entry.isDirectory() && deep && SKIPPED_DIRS.has(entry.name.toLowerCase())) noteBackups(child, state);
      else if (entry.isDirectory() && deep) visit(child, true, onlyCreated);
    }
  };
  for (const root of roots) if (root && root.path) visit(path.resolve(root.path), root.deep === true, root.onlyCreated === true);
  return state;
}

/*
  The roots of a GBE repair: each steam_settings walked whole, each folder an emulator dll sits in
  listed one level (the dlls, their .bak, a crack's files set aside), single files, and the save
  folders a placeholder save may be created in.
*/
function gbeRoots({ settingsDirs = [], runtimeDirs = [], files = [], saveFolders = [] } = {}) {
  const unique = (list) => [...new Set(list.filter(Boolean).map((entry) => path.resolve(entry)))];
  return [
    ...unique(settingsDirs).map((dir) => ({ path: dir, deep: true })),
    ...unique(runtimeDirs).map((dir) => ({ path: dir, deep: false })),
    ...unique(files).map((file) => ({ path: file })),
    ...unique(saveFolders).flatMap((dir) => [
      { path: dir, deep: false, onlyCreated: true },
      { path: path.join(dir, 'stats'), deep: false, onlyCreated: true },
    ]),
  ];
}

// Names sort in creation order, which is what undo relies on: the millisecond, then a counter for
// the repairs that fall in the same one (a random suffix alone sorted those by chance).
let stampSequence = 0;
function stamp() {
  stampSequence += 1;
  const time = new Date().toISOString().replace(/[:.]/g, '-');
  return `${time}-${String(stampSequence).padStart(6, '0')}-${process.pid}-${Math.random().toString(36).slice(2, 6)}`;
}

/*
  `roots` may be a function, so that working the folders out (which reads the game) fails inside
  the caller's try like the rest of the journal, and never stops the repair. Smallest files are
  copied first, up to COPY_TOTAL: dlls and INIs always get a copy, a folder of big data files does not.
*/
function begin({ userDataPath, appid, label, roots: rootsOrFn }) {
  const roots = typeof rootsOrFn === 'function' ? rootsOrFn() : rootsOrFn;
  const before = snapshot(roots);
  const dir = path.join(gameRoot(userDataPath, appid), stamp());
  const copies = path.join(dir, 'files');
  fs.mkdirSync(copies, { recursive: true });
  const kept = new Map();
  let total = 0;
  const candidates = [...before.files].filter(([, meta]) => meta.size <= COPY_LIMIT && !meta.onlyCreated).sort((a, b) => a[1].size - b[1].size);
  for (const [file, meta] of candidates) {
    if (total + meta.size > COPY_TOTAL) break;
    const name = String(kept.size);
    try {
      fs.copyFileSync(file, path.join(copies, name));
      kept.set(file, name);
      total += meta.size;
    } catch {
      /* a file locked right now is noted without a copy; undo then reports it */
    }
  }
  return { userDataPath, appid: String(appid), label: String(label || ''), roots, dir, before, kept, noted: new Map(), startedAt: Date.now() };
}

/*
  Files a step wrote outside the roots, told after the fact: a community crack unpacks into any
  folder of the game and keeps its own copy of each file it overwrote. `original` is that copy, or
  null for a file the step created.
*/
function note(handle, written) {
  if (!handle) return;
  for (const { file, original } of written || []) {
    const target = path.resolve(file);
    if (handle.before.files.has(target) || handle.noted.has(target)) continue;
    let copy = null;
    try {
      if (original && fs.existsSync(original)) {
        copy = `n${handle.noted.size}`;
        fs.copyFileSync(original, path.join(handle.dir, 'files', copy));
      }
    } catch {
      copy = null;
    }
    handle.noted.set(target, { copy });
  }
}

// The noted files that are not already in the diff, as changes.
function notedChanges(handle, changes) {
  const known = new Set(changes.map((change) => change.file));
  const out = [];
  for (const [file, { copy }] of handle.noted) {
    const stat = known.has(file) ? null : statOrNull(file);
    if (!stat || !stat.isFile()) continue;
    const after = { size: stat.size, mtimeMs: stat.mtimeMs };
    out.push(copy ? { file, kind: 'changed', after, copy } : { file, kind: 'created', after });
  }
  return out;
}

/*
  A file too big to copy that the repair replaced, with a copy of its original created beside it
  (Steamless keeps <exe>.steamstub.bak): undo puts the original back from that copy, so removing the
  copy afterwards never loses the only original.
*/
function linkOriginals(changes, before) {
  const created = changes.filter((change) => change.kind === 'created');
  for (const change of changes) {
    if (change.kind !== 'changed' || change.copy) continue;
    const was = before.files.get(change.file);
    const prefix = path.basename(change.file).toLowerCase();
    const original = created.find(
      (entry) => path.dirname(entry.file) === path.dirname(change.file) && path.basename(entry.file).toLowerCase().startsWith(prefix) && was && entry.after.size === was.size
    );
    if (original) change.originalAt = original.file;
  }
  return changes;
}

// What the repair did to each file, by comparing the two snapshots.
function diff(handle, after) {
  const changes = [];
  const metaOf = ({ size, mtimeMs }) => ({ size, mtimeMs });
  for (const [file, meta] of after.files) {
    const was = handle.before.files.get(file);
    if (!was) changes.push({ file, kind: 'created', after: metaOf(meta) });
    else if (!was.onlyCreated && (was.size !== meta.size || was.mtimeMs !== meta.mtimeMs)) {
      changes.push({ file, kind: 'changed', before: metaOf(was), after: metaOf(meta), copy: handle.kept.get(file) || null });
    }
  }
  for (const [file, was] of handle.before.files) {
    if (!was.onlyCreated && !after.files.has(file)) changes.push({ file, kind: 'deleted', before: metaOf(was), copy: handle.kept.get(file) || null });
  }
  return changes;
}

function commit(handle) {
  const after = snapshot(handle.roots);
  const diffed = diff(handle, after);
  const changes = linkOriginals([...diffed, ...notedChanges(handle, diffed)], handle.before);
  const createdDirs = [...after.dirs].filter((dir) => !handle.before.dirs.has(dir));
  const createdBackups = [...after.backups].filter((dir) => !handle.before.backups.has(dir));
  if (changes.length === 0 && createdDirs.filter((dir) => !SKIPPED_DIRS.has(path.basename(dir).toLowerCase())).length === 0) {
    removeTreeForce(handle.dir);
    return null;
  }
  const needed = new Set(changes.map((change) => change.copy).filter(Boolean));
  for (const name of handle.kept.values()) if (!needed.has(name)) unlinkForce(path.join(handle.dir, 'files', name));
  const entry = { appid: handle.appid, label: handle.label, createdAt: new Date(handle.startedAt).toISOString(), changes, createdDirs, createdBackups };
  fs.writeFileSync(path.join(handle.dir, JOURNAL), JSON.stringify(entry, null, 2));
  prune(handle.userDataPath, handle.appid);
  return entry;
}

/*
  Runs `work` between the two snapshots and returns its result. The journal never stops a repair:
  if it cannot be written, the repair runs without one. A repair that throws half way is rolled
  back before its error reaches the caller, which finds what was put back on `err.rollback`.
*/
async function record({ userDataPath, appid, label, roots, log = null }, work) {
  let handle = null;
  try {
    if (userDataPath && appid != null) handle = begin({ userDataPath, appid, label, roots });
  } catch (err) {
    if (log) log(`[undo] ${appid}: no undo record for ${label} => ${err}`);
  }
  let result;
  try {
    result = await work();
  } catch (err) {
    rollbackAfterFailure(handle, err, log);
    throw err;
  }
  if (handle) {
    try {
      commit(handle);
    } catch (err) {
      if (log) log(`[undo] ${appid}: could not keep the undo record for ${label} => ${err}`);
    }
  }
  return result;
}

// Rolls a failed repair back and hangs the outcome on its error; never throws over that error.
function rollbackAfterFailure(handle, err, log = null) {
  if (!handle) return null;
  let outcome = null;
  try {
    outcome = rollback(handle);
    if (log) log(`[undo] ${handle.appid}: ${handle.label} failed, ${describeRollback(outcome)}`);
  } catch (rollbackErr) {
    if (log) log(`[undo] ${handle.appid}: ${handle.label} failed and could not be rolled back => ${rollbackErr}`);
  }
  if (err && typeof err === 'object') {
    try {
      err.rollback = outcome;
    } catch {
      /* a frozen error: the log line above still says what happened */
    }
  }
  return outcome;
}

function entryDirs(userDataPath, appid) {
  const root = gameRoot(userDataPath, appid);
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  return names
    .sort()
    .map((name) => path.join(root, name))
    .filter((dir) => fs.existsSync(path.join(dir, JOURNAL)));
}

// Oldest first beyond the cap; a folder never committed (a crash mid-repair) goes too.
function prune(userDataPath, appid) {
  const root = gameRoot(userDataPath, appid);
  const committed = entryDirs(userDataPath, appid);
  for (const dir of committed.slice(0, Math.max(0, committed.length - MAX_PER_GAME))) removeTreeForce(dir);
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const name of names) {
    const dir = path.join(root, name);
    if (!fs.existsSync(path.join(dir, JOURNAL)) && Date.now() - (statOrNull(dir)?.mtimeMs || 0) > 60 * 60 * 1000) removeTreeForce(dir);
  }
}

function latest({ userDataPath, appid }) {
  if (!userDataPath || appid == null) return null;
  const dirs = entryDirs(userDataPath, appid);
  const dir = dirs[dirs.length - 1];
  if (!dir) return null;
  try {
    return { dir, entry: JSON.parse(fs.readFileSync(path.join(dir, JOURNAL), 'utf8')) };
  } catch {
    return null;
  }
}

// To the millisecond: a time put back by putBack reads back a few hundred nanoseconds off on Linux.
function unchangedSince(file, meta) {
  const now = statOrNull(file);
  return !!now && now.isFile() && now.size === meta.size && Math.abs(now.mtimeMs - meta.mtimeMs) < 1;
}

/*
  The file gets back the time it had before the repair. Windows' copy keeps it on its own, Linux's
  does not: without it, undoing the repair before this one took the restored file for one changed
  since, and left it alone.
*/
function putBack(copy, file, before) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.aw-undo-${process.pid}`;
  fs.copyFileSync(copy, temporary);
  replaceFileSync(temporary, file);
  if (before && Number.isFinite(before.mtimeMs)) fs.utimesSync(file, before.mtimeMs / 1000, before.mtimeMs / 1000);
}

// Where the content to put back comes from: the journal's own copy, or the original the repair
// left beside a big file (linkOriginals). Null when neither is there any more.
function sourceOf(change, dir) {
  const copy = change.copy ? path.join(dir, 'files', change.copy) : null;
  if (copy && fs.existsSync(copy)) return copy;
  return change.originalAt && fs.existsSync(change.originalAt) ? change.originalAt : null;
}

// What undoing one change would do: 'restore', 'remove', 'gone' (nothing left to do) or a reason to skip.
function planChange(change, dir) {
  const exists = fs.existsSync(change.file);
  if (change.kind === 'created') {
    if (!exists) return 'gone';
    return unchangedSince(change.file, change.after) ? 'remove' : 'changed';
  }
  if (change.kind === 'changed' && !unchangedSince(change.file, change.after)) return 'changed';
  if (change.kind === 'deleted' && exists) return 'changed';
  return sourceOf(change, dir) ? 'restore' : 'no-copy';
}

// Restores before removals, so an original kept beside a big file is read before it goes.
const undoOrder = (changes) => [...changes.filter((change) => change.kind !== 'created'), ...changes.filter((change) => change.kind === 'created')];

/*
  Undoes the newest entry for this game. `dryRun` answers "what would this do?" for the
  confirmation. Folders the repair created go too, once nothing is left in them.
*/
function undo({ userDataPath, appid, dryRun = false }) {
  const found = latest({ userDataPath, appid });
  if (!found) return null;
  if (dryRun) return undoEntry(found.dir, found.entry, true);
  /*
    All or nothing, like the repairs: the files the undo is about to touch are noted first, and a
    file it cannot write (held open by the running game) puts the others back as they were. The
    record then stays, so Undo works once the file is free. A file changed since the repair is a
    choice, not a failure: it is left alone and listed, as before.
  */
  let guard = null;
  try {
    guard = begin({ userDataPath, appid, label: `undo ${found.entry.label}`, roots: found.entry.changes.map((change) => ({ path: change.file })) });
  } catch {
    /* no guard copy: the undo still runs, as it always did */
  }
  const result = undoEntry(found.dir, found.entry, false, { keepOnFailure: !!guard });
  if (!guard) return result;
  if (result.failed.length > 0) {
    const back = rollback(guard);
    return { ...result, rolledBack: true, restored: [], removed: [], rollbackSkipped: back ? back.skipped : [] };
  }
  fs.rmSync(guard.dir, { recursive: true, force: true });
  return result;
}

/*
  A repair that failed is taken back at once, from its own entry: a half-done fix (an exe already
  unpacked, a crack's files set aside, then a download blocked) must not stay on disk. Returns what
  undo returns, or an empty result when the repair had written nothing.
*/
function rollback(handle) {
  if (!handle) return null;
  const entry = commit(handle);
  if (!entry) return { label: handle.label, createdAt: new Date(handle.startedAt).toISOString(), restored: [], removed: [], skipped: [] };
  return undoEntry(handle.dir, entry, false);
}

// One line for the log and the error dialog: what the rollback did, and what it could not put back.
function describeRollback(result) {
  if (!result) return '';
  const done = result.restored.length + result.removed.length;
  const left = result.skipped.map((skip) => `${skip.file} (${skip.reason})`);
  return left.length > 0 ? `rolled back ${done} file(s); could not put back: ${left.join(', ')}` : `rolled back ${done} file(s)`;
}

// `failed` lists the files that could not be written (a subset of `skipped`). With keepOnFailure,
// such an undo stops before it deletes anything of its record, so the caller can take it back.
function undoEntry(dir, entry, dryRun, { keepOnFailure = false } = {}) {
  const result = { label: entry.label, createdAt: entry.createdAt, restored: [], removed: [], skipped: [], failed: [] };
  for (const change of undoOrder(entry.changes)) {
    const plan = planChange(change, dir);
    if (plan === 'gone') continue;
    if (plan !== 'restore' && plan !== 'remove') {
      result.skipped.push({ file: change.file, reason: plan });
      continue;
    }
    if (dryRun) {
      (plan === 'restore' ? result.restored : result.removed).push(change.file);
      continue;
    }
    try {
      if (plan === 'restore') putBack(sourceOf(change, dir), change.file, change.before);
      else if (!unlinkForce(change.file)) throw new Error('locked');
      (plan === 'restore' ? result.restored : result.removed).push(change.file);
    } catch (err) {
      const failure = { file: change.file, reason: (err && err.code) || (err && err.message) || 'error' };
      result.skipped.push(failure);
      result.failed.push(failure);
    }
  }
  if (dryRun || (keepOnFailure && result.failed.length > 0)) return result;
  // The repair's own dated backups hold copies of what was just put back. When a file was left
  // alone they may hold its only original, so they stay.
  if (result.skipped.length === 0) for (const backup of entry.createdBackups || []) removeTreeForce(backup);
  for (const created of [...entry.createdDirs].sort((a, b) => b.length - a.length)) {
    try {
      fs.rmdirSync(created);
    } catch {
      /* not empty: something else lives there now */
    }
  }
  removeTreeForce(dir);
  return result;
}

module.exports = { record, begin, note, commit, latest, undo, rollback, rollbackAfterFailure, describeRollback, snapshot, gbeRoots, MAX_PER_GAME, COPY_LIMIT };
