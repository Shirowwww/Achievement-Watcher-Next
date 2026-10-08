'use strict';

/*
  Restore half of the profile backup. stageRestore() validates a backup and unpacks it into
  <userData>/.profile-restore/staging, then leaves a marker. The files are only swapped in by
  applyPendingRestore() on the next start, before any code reads the data folder, so a running app
  never has its files replaced under it.

  The swap works on units: a whole folder for the 'replace' rules, a single file for cfg. Each unit
  is moved to previous/<id> first and the staged copy renamed into place after, so the journal is
  just "which units": undoing it is a rename back, and it can be run again after a crash.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const archive = require('./profileArchive.js');
const inventory = require('./profileInventory.js');
const rebase = require('./profileRebase.js');
const { replaceFileSync } = require('./replaceFile.js');

const RESTORE_DIR = '.profile-restore';
const MARKER = 'pending.json';
const RESULT = 'result.json';
const LOCK = 'apply.lock';
const MAX_REBASED_BYTES = 64 * 1024 * 1024;

const dirOf = (userDataDir) => path.join(userDataDir, RESTORE_DIR);
const stagingOf = (userDataDir) => path.join(dirOf(userDataDir), 'staging');
const previousOf = (userDataDir, id) => path.join(dirOf(userDataDir), 'previous', id);
const toPath = (root, rel) => path.join(root, ...rel.split('/'));

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  replaceFileSync(temporary, file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function removeTree(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
}

// A directory rename that survives an antivirus scan holding a file inside for a moment.
function renameRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      sleepSync(100);
    }
  }
}

function unitsFor(files) {
  const seen = new Map();
  for (const file of files) {
    const unit = inventory.unitFor(file.path);
    if (unit && !seen.has(unit.rel.toLowerCase())) seen.set(unit.rel.toLowerCase(), unit);
  }
  return [...seen.values()];
}

function rebaseStaged(stagingRoot, manifest, userDataDir, home) {
  const mappings = rebase.buildMappings([
    { from: manifest.source.userData, to: userDataDir },
    { from: manifest.source.home, to: home },
  ]);
  let changed = 0;
  if (!mappings.length) return changed;
  for (const file of manifest.files) {
    const verdict = inventory.classify(file.path);
    if (!verdict.rule || !verdict.rule.rebase || file.size > MAX_REBASED_BYTES) continue;
    const target = toPath(stagingRoot, file.path);
    const bytes = fs.readFileSync(target);
    const moved = rebase.rebaseFileBytes(file.path, bytes, mappings);
    if (moved !== bytes) {
      fs.writeFileSync(target, moved);
      changed += 1;
    }
  }
  return changed;
}

/*
  Validates `file` and unpacks it. Throws BackupError (code says why) and leaves nothing staged on
  failure. Returns what the confirmation dialog and the final message need.
*/
async function stageRestore(file, { userDataDir, home = '', onProgress = null }) {
  const opened = await archive.readManifest(file);
  const { manifest } = opened;
  const root = dirOf(userDataDir);
  removeTree(path.join(root, 'staging'));
  fs.rmSync(path.join(root, MARKER), { force: true });
  const staging = stagingOf(userDataDir);
  try {
    fs.mkdirSync(staging, { recursive: true });
    await archive.extractPayload(file, opened, staging, onProgress);
    const rebased = rebaseStaged(staging, manifest, userDataDir, home);
    const pending = {
      version: 1,
      id: crypto.randomUUID(),
      state: 'staged',
      stagedAt: new Date().toISOString(),
      units: unitsFor(manifest.files),
      fileCount: manifest.files.length,
      totalBytes: manifest.totalBytes,
      signedOut: manifest.signedOut,
      playtime: manifest.registry.playtime,
      appVersion: manifest.appVersion,
      createdAt: manifest.createdAt,
      rebased,
    };
    writeJsonAtomic(path.join(root, MARKER), pending);
    return { id: pending.id, fileCount: pending.fileCount, totalBytes: pending.totalBytes, signedOut: pending.signedOut, createdAt: pending.createdAt, appVersion: pending.appVersion, rebased };
  } catch (err) {
    removeTree(staging);
    fs.rmSync(path.join(root, MARKER), { force: true });
    throw err;
  }
}

function discardStaged(userDataDir) {
  removeTree(stagingOf(userDataDir));
  fs.rmSync(path.join(dirOf(userDataDir), MARKER), { force: true });
}

function undoUnits(userDataDir, pending) {
  const staging = stagingOf(userDataDir);
  const previous = previousOf(userDataDir, pending.id);
  for (const unit of pending.units.toReversed()) {
    const target = toPath(userDataDir, unit.rel);
    const held = toPath(previous, unit.rel);
    const untouched = fs.existsSync(toPath(staging, unit.rel));
    if (fs.existsSync(held)) {
      removeTree(target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      renameRetry(held, target);
    } else if (!untouched) {
      removeTree(target);
    }
  }
}

function validPending(pending) {
  return (
    pending &&
    pending.version === 1 &&
    /^[a-f0-9-]{36}$/i.test(String(pending.id)) &&
    Array.isArray(pending.units) &&
    pending.units.every((u) => u && (u.kind === 'dir' || u.kind === 'file') && inventory.isSafeRelativePath(u.rel) && inventory.RULES.some((r) => r.include && (u.rel === r.path || u.rel.startsWith(`${r.path}/`))))
  );
}

function acquireLock(root) {
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, LOCK);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return lock;
    } catch (err) {
      if (err.code !== 'EEXIST') return null;
      const owner = Number(fs.readFileSync(lock, 'utf8')) || 0;
      let alive = false;
      try {
        if (owner > 0) {
          process.kill(owner, 0);
          alive = owner !== process.pid;
        }
      } catch (e) {
        alive = e.code === 'EPERM';
      }
      if (alive) return null;
      fs.rmSync(lock, { force: true });
    }
  }
  return null;
}

/*
  Runs at the very start of the main process. Returns the result it wrote (also left in
  result.json for the UI) or null when nothing was pending. Never throws.
*/
function applyPendingRestore(userDataDir, { registry = null, hooks = {} } = {}) {
  const root = dirOf(userDataDir);
  const markerFile = path.join(root, MARKER);
  if (!fs.existsSync(markerFile)) return null;
  const lock = acquireLock(root);
  if (!lock) return null;

  const finish = (result) => {
    try {
      writeJsonAtomic(path.join(root, RESULT), { at: new Date().toISOString(), ...result });
    } catch {
      /* the result is a courtesy to the UI; the data state above is what matters */
    }
    return result;
  };
  let pending = null;
  try {
    pending = readJson(markerFile);
    if (!validPending(pending)) {
      discardStaged(userDataDir);
      return finish({ ok: false, error: 'invalid-marker', rolledBack: false });
    }
    const interrupted = pending.state === 'applying';
    if (interrupted) {
      undoUnits(userDataDir, pending);
      discardStaged(userDataDir);
      return finish({ ok: false, error: 'interrupted', rolledBack: true });
    }

    writeJsonAtomic(markerFile, { ...pending, state: 'applying' });
    const staging = stagingOf(userDataDir);
    const previous = previousOf(userDataDir, pending.id);
    try {
      for (const unit of pending.units) {
        const target = toPath(userDataDir, unit.rel);
        if (fs.existsSync(target) || isDangling(target)) {
          fs.mkdirSync(path.dirname(toPath(previous, unit.rel)), { recursive: true });
          renameRetry(target, toPath(previous, unit.rel));
        }
      }
      pending.units.forEach((unit, index) => {
        if (hooks.beforePlace) hooks.beforePlace(unit, index);
        const target = toPath(userDataDir, unit.rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (unit.kind === 'dir') renameRetry(toPath(staging, unit.rel), target);
        else replaceFileSync(toPath(staging, unit.rel), target);
      });
    } catch (err) {
      undoUnits(userDataDir, pending);
      discardStaged(userDataDir);
      removeTree(previous);
      return finish({ ok: false, error: err && err.message ? err.message : String(err), rolledBack: true });
    }

    const warnings = [];
    if (pending.playtime && pending.playtime.length) {
      try {
        (registry || require('./profileBackup.js').defaultRegistry()).mergePlaytime(pending.playtime);
      } catch (err) {
        warnings.push(`playtime: ${err && err.message ? err.message : err}`);
      }
    }
    discardStaged(userDataDir);
    prunePrevious(root, pending.id);
    return finish({ ok: true, fileCount: pending.fileCount, signedOut: pending.signedOut, rebased: pending.rebased, warnings });
  } catch (err) {
    return finish({ ok: false, error: err && err.message ? err.message : String(err), rolledBack: false });
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

function isDangling(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

// Only the latest set of replaced files is kept; they are the way back from a restore that went wrong.
function prunePrevious(root, keepId) {
  const base = path.join(root, 'previous');
  try {
    for (const name of fs.readdirSync(base)) if (name !== keepId) removeTree(path.join(base, name));
  } catch {
    /* nothing to prune */
  }
}

// The last result, removed once read so a message is shown a single time.
function takeRestoreResult(userDataDir) {
  const file = path.join(dirOf(userDataDir), RESULT);
  const result = readJson(file);
  if (result) fs.rmSync(file, { force: true });
  return result;
}

module.exports = { RESTORE_DIR, stageRestore, applyPendingRestore, discardStaged, takeRestoreResult };
