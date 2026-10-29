'use strict';

/*
  Per-game achievement reset: backs up every touched file (emulator save, AW Next's baseline, manual
  overrides) under backups/achievements/<appid>/<timestamp>/ before clearing it, so restore() can put
  it back exactly. All three must clear together - a leftover baseline or override just re-marks the
  same achievements unlocked on the next render. Uses `game.dataPaths`, not the source label.
*/

const fs = require('fs');
const path = require('path');
const targets = require(path.join(__dirname, '..', 'util', 'achievementResetTargets.js'));
const manualUnlock = require(path.join(__dirname, 'manualUnlock.js'));
const shadps4 = require(path.join(__dirname, 'shadps4.js'));
const xenia = require(path.join(__dirname, 'xenia.js'));
const x360Recomp = require(path.join(__dirname, 'x360Recomp.js'));
const extras = require(path.join(__dirname, 'achievementSaveExtras.js'));
const relockText = require(path.join(__dirname, '..', 'util', 'achievementRelockText.js'));
const { writeFileAtomicSync } = require(path.join(__dirname, '..', 'util', 'replaceFile.js'));

// A save folder is a save folder, not a game install: a handful of levels and files is all it holds.
// The bounds stop a mis-resolved path (a whole library root) from walking a disk.
const MAX_DEPTH = 4;
const MAX_FILES = 500;

let userDataPath = null;

function setUserDataPath(p) {
  if (p) userDataPath = p;
}

const userDataDir = () => userDataPath || '';

function backupRoot() {
  return path.join(userDataPath || '', 'backups', 'achievements');
}

function gameBackupRoot(appid) {
  // Appids can be namespaced ("socialclub-<slug>"), so keep the folder name filesystem-safe.
  return path.join(backupRoot(), String(appid).replace(/[^A-Za-z0-9._-]+/g, '_'));
}

function baselineFile(appid) {
  return path.join(userDataPath || '', 'steam_cache', 'data', `${appid}.db`);
}

function statSafe(target) {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

// Every file below `root` that a reset would act on. `root` may be a file (Xenia records the .gpd
// itself) or a folder (every other source records the folder its save lives in).
function collectTargets(root, source, out, depth = 0, classify = targets.resetActionFor) {
  if (out.length >= MAX_FILES) return out;
  const stats = statSafe(root);
  if (!stats) return out;

  if (stats.isFile()) {
    const action = classify(path.basename(root), source);
    if (action) out.push({ path: root, action, source, size: stats.size });
    return out;
  }
  if (!stats.isDirectory() || depth >= MAX_DEPTH) return out;

  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) break;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) collectTargets(full, source, out, depth + 1, classify);
    else if (entry.isFile()) {
      const action = classify(entry.name, source);
      if (action) out.push({ path: full, action, source, size: statSafe(full)?.size || 0 });
    }
  }
  return out;
}

// How each file a reader finds on its own is reset (achievementSaveExtras.js).
const EXTRA_ACTIONS = {
  xlln: targets.ACTION.DELETE,
  ff7: targets.ACTION.DELETE,
  'rune-uplay': targets.ACTION.CLEAR_RUNE_CFG,
  madnesspatch: targets.ACTION.CLEAR_UNLOCK_FLAG,
  markerpatch: targets.ACTION.CLEAR_ACL,
};

// gbe_fork unlocks a progressive achievement again from its counter, so `stats/` goes with the save.
// Only beside the save at the record's own folder: a nested achievements.json is not gbe_fork's.
function gseStatFiles(target, root) {
  if (target.action !== targets.ACTION.DELETE || path.basename(target.path).toLowerCase() !== 'achievements.json') return [];
  if (path.resolve(path.dirname(target.path)) !== path.resolve(root)) return [];
  const dir = path.join(path.dirname(target.path), 'stats');
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile())
    .slice(0, MAX_FILES)
    .map((entry) => ({ path: path.join(dir, entry.name), action: targets.ACTION.DELETE, source: target.source, size: statSafe(path.join(dir, entry.name))?.size || 0 }));
}

// Registry unlocks are reset on this machine only; a Wine prefix's user.reg is not edited from here.
function registryPlan(game, { registry, platform = process.platform } = {}) {
  if (!registry && !extras.hasRegistrySource(game)) return { keys: [], blocked: [] };
  if (platform !== 'win32') return { keys: [], blocked: [{ source: String((game && game.source) || ''), path: '', reason: 'registry-prefix' }] };
  return { keys: extras.registryKeys(game, registry || extras.windowsRegistry()).map((entry) => entry.key), blocked: [] };
}

function collectAll(resettable, readerFiles) {
  const files = [];
  const seen = new Set();
  const add = (target) => {
    const key = target.path.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    files.push(target);
  };
  for (const entry of resettable) {
    for (const target of collectTargets(entry.path, entry.source, [])) {
      add(target);
      gseStatFiles(target, entry.path).forEach(add);
    }
  }
  for (const extra of readerFiles) add({ path: extra.path, action: EXTRA_ACTIONS[extra.kind], source: extra.source, size: statSafe(extra.path)?.size || 0 });
  return files;
}

/*
  What a reset of this game would do, without doing any of it. The renderer shows this before asking
  for confirmation, so the user approves the actual file list rather than a promise.
*/
function plan(game, options = {}) {
  const appid = game && game.appid != null ? String(game.appid) : '';
  const { resettable, blocked } = targets.classifySources(
    Array.isArray(game && game.dataPaths) && game.dataPaths.length
      ? game.dataPaths
      : game && game.dataPath
        ? [{ source: game.source, path: game.dataPath }]
        : []
  );
  // An account library (Xbox, RetroAchievements) has no save folder at all, so nothing above
  // could say its unlocks belong to the platform; "nothing to reset yet" was the wrong answer.
  if (resettable.length === 0 && blocked.length === 0 && targets.isOfficialPlatformSource(game && game.source)) {
    blocked.push({ source: String(game.source), path: '', reason: 'official-platform' });
  }

  const readerFiles = extras.extraSaveFiles(game || {});
  const files = collectAll(resettable, readerFiles);
  const registry = registryPlan(game, options);
  blocked.push(...registry.blocked);
  const consoleBaselines = extras.consoleBaselines(game || {}, userDataPath, readerFiles);
  const unlockJournals = extras.unlockJournals(game || {}, userDataPath);

  const baseline = statSafe(baselineFile(appid)) ? baselineFile(appid) : null;
  const manualEntries = (() => {
    const file = manualUnlock.sidecarFile();
    if (!file) return 0;
    const map = manualUnlock.readMap(file);
    const entries = map[manualUnlock.gameKey(appid, game && game.source)];
    return entries ? Object.keys(entries).length : 0;
  })();

  return {
    appid,
    name: (game && game.name) || '',
    source: (game && game.source) || '',
    files,
    blocked,
    baseline,
    consoleBaselines,
    unlockJournals,
    registry: registry.keys,
    manualEntries,
    // Nothing to act on is not a failure - it is a game that has never recorded an unlock here.
    supported: files.length > 0 || !!baseline || manualEntries > 0 || registry.keys.length > 0 || consoleBaselines.length > 0 || unlockJournals.length > 0,
  };
}

function backupIdFor(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

// Two runs within one second (a relock right after another) must not share a folder.
function freshBackupDir(appid, now = new Date()) {
  const base = backupIdFor(now);
  let backupId = base;
  for (let n = 2; fs.existsSync(path.join(gameBackupRoot(appid), backupId)); n += 1) backupId = `${base}-${n}`;
  return { backupId, dir: path.join(gameBackupRoot(appid), backupId) };
}

// Backup names stay readable and collision-free: 0001_achievements.json, 0002_achievements.json.
function backupNameFor(index, original) {
  return `${String(index + 1).padStart(4, '0')}_${path.basename(original)}`;
}

const TEXT_CLEARS = {
  [targets.ACTION.CLEAR_RUNE_CFG]: (text) => relockText.relockKeyValues(text, null),
  [targets.ACTION.CLEAR_UNLOCK_FLAG]: (text) => relockText.relockUnlockFlag(text, null),
  [targets.ACTION.CLEAR_ACL]: (text) => relockText.relockAcl(text, null),
  // Emptied rather than deleted: a missing baseline reads as a first sight, which never notifies.
  [targets.ACTION.CLEAR_CONSOLE_BASELINE]: () => ({ text: JSON.stringify({ unlocked: [] }), changed: true }),
};

function applyClear(target) {
  if (TEXT_CLEARS[target.action]) {
    const { buffer, changed } = relockText.editTextBuffer(fs.readFileSync(target.path), TEXT_CLEARS[target.action]);
    // Atomic: MarkerPatch's settings.txt holds the game's settings too, and a torn write loses them.
    if (changed) writeFileAtomicSync(target.path, buffer);
    return changed ? 1 : 0;
  }
  if (target.action === targets.ACTION.CLEAR_SHADPS4_XML) {
    const { text, cleared } = shadps4.clearTrophyXml(fs.readFileSync(target.path, 'utf8'));
    fs.writeFileSync(target.path, text, 'utf8');
    return cleared;
  }
  if (target.action === targets.ACTION.CLEAR_X360_JSON) {
    const { buffer, cleared } = x360Recomp.clearJsonBuffer(fs.readFileSync(target.path));
    fs.writeFileSync(target.path, buffer);
    return cleared;
  }
  if (target.action === targets.ACTION.CLEAR_XENIA_GPD) {
    const { buffer, cleared } = xenia.clearGpdBuffer(fs.readFileSync(target.path));
    fs.writeFileSync(target.path, buffer);
    return cleared;
  }
  fs.unlinkSync(target.path);
  return 0;
}

// Rewritten after every change, so a crash midway still leaves a manifest restore() can use.
function writeManifest(dir, manifest) {
  writeFileAtomicSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// Copies one file into the backup and lists it before it is cleared: a cleared file is always restorable.
function clearOne(target, index, dir, manifest, errors) {
  const stored = backupNameFor(index, target.path);
  try {
    fs.copyFileSync(target.path, path.join(dir, 'files', stored));
    manifest.files.push({ original: target.path, stored, action: target.action, source: target.source || '' });
    writeManifest(dir, manifest);
  } catch (err) {
    errors.push({ path: target.path, stage: 'backup', message: err.message || String(err) });
    return null;
  }
  try {
    return applyClear(target);
  } catch (err) {
    errors.push({ path: target.path, stage: 'reset', message: err.message || String(err) });
    return null;
  }
}

/*
  Manual overrides share one sidecar, so only this game's entries are removed. They go in the manifest,
  since restoring a whole-file backup would also undo other games' later overrides.
*/
function clearManualEntries(resetPlan, dir, manifest, errors) {
  const sidecar = manualUnlock.sidecarFile();
  if (!sidecar || !(resetPlan.manualEntries > 0)) return true;
  try {
    const { map: updated, removed } = manualUnlock.clearGame(manualUnlock.readMap(sidecar), resetPlan.appid, resetPlan.source);
    if (!removed) return true;
    manifest.manualUnlocks = { source: resetPlan.source || '', entries: removed };
    writeManifest(dir, manifest);
    manualUnlock.writeMap(sidecar, updated);
    return true;
  } catch (err) {
    errors.push({ path: sidecar, stage: 'manual-unlocks', message: err.message || String(err) });
    return false;
  }
}

// A run that failed midway puts back what it had changed; the backup stays on disk, marked rolled back.
function rollBack(appid, backupId, dir, manifest, errors, registry) {
  const restored = restore(appid, backupId, { registry });
  writeManifest(dir, { ...manifest, rolledBack: true });
  const rollbackErrors = restored.errors.map((entry) => ({ ...entry, stage: 'rollback' }));
  return { ok: false, rolledBack: true, backupId, backupDir: dir, files: 0, cleared: 0, registry: 0, errors: [...errors, ...rollbackErrors] };
}

/*
  Runs a plan all or nothing: saves and registry first, AW Next's own records only once those are
  cleared. A failure rolls back, so the app never reports a reset the saves do not hold.
*/
function run(resetPlan, { now = new Date(), registry } = {}) {
  const { backupId, dir } = freshBackupDir(resetPlan.appid, now);
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  const manifest = { appid: resetPlan.appid, name: resetPlan.name, source: resetPlan.source, at: now.toISOString(), files: [], manualUnlocks: null, registry: [] };
  writeManifest(dir, manifest);
  const errors = [];
  // AW Next's own baselines go through the same backup/restore path as a game save, with no source label.
  const own = resetPlan.baseline ? [{ path: resetPlan.baseline, action: targets.ACTION.DELETE, kind: 'baseline' }] : [];
  for (const file of resetPlan.consoleBaselines || []) own.push({ path: file, action: targets.ACTION.CLEAR_CONSOLE_BASELINE, kind: 'baseline' });
  for (const file of resetPlan.unlockJournals || []) own.push({ path: file, action: targets.ACTION.DELETE, kind: 'journal' });
  const access = resetPlan.registry && resetPlan.registry.length ? registry || extras.windowsRegistry() : null;
  let cleared = 0;
  let index = 0;
  const clearAll = (list) =>
    list.every((target) => {
      const count = clearOne(target, index++, dir, manifest, errors);
      cleared += count || 0;
      return count != null;
    });
  const done = clearAll(resetPlan.files) && (!access || zeroRegistry(resetPlan.registry, access, dir, manifest, errors)) && clearAll(own) && clearManualEntries(resetPlan, dir, manifest, errors);
  if (!done) return rollBack(resetPlan.appid, backupId, dir, manifest, errors, access);
  return { ok: true, backupId, backupDir: dir, files: manifest.files.length, cleared, errors };
}

// One value to 0 in the type it was read in (GreenLuma may keep REG_SZ), listed in the manifest first.
function zeroRegistryValue(registry, key, name, dir, manifest) {
  const raw = registry.read(key, name);
  if (!(Number(raw) > 0)) return;
  const type = typeof raw === 'string' ? 'REG_SZ' : 'REG_DWORD';
  manifest.registry.push({ hive: 'HKCU', key, name, data: raw, type });
  writeManifest(dir, manifest);
  registry.write(key, name, type === 'REG_SZ' ? '0' : 0, type);
}

// Every non-zero value under the keys goes to 0, its old value kept in the manifest for restore().
function zeroRegistry(keys, registry, dir, manifest, errors) {
  for (const key of keys) {
    for (const name of registry.names(key)) {
      try {
        zeroRegistryValue(registry, key, name, dir, manifest);
      } catch (err) {
        errors.push({ path: `HKCU/${key}/${name}`, stage: 'registry', message: err.message || String(err) });
        return false;
      }
    }
  }
  return true;
}

// Newest first: the restore a user wants is almost always the reset they just did.
function listBackups(appid) {
  const root = gameBackupRoot(appid);
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, entry.name, 'manifest.json'), 'utf8'));
      // A rolled-back run changed nothing: restoring it could only take newer progress away.
      if (manifest.rolledBack) continue;
      backups.push({
        id: entry.name,
        at: manifest.at || '',
        name: manifest.name || '',
        files: Array.isArray(manifest.files) ? manifest.files.length : 0,
        manualUnlocks: manifest.manualUnlocks ? Object.keys(manifest.manualUnlocks.entries || {}).length : 0,
        path: path.join(root, entry.name),
      });
    } catch {
      /* a directory without a readable manifest is not a restorable backup */
    }
  }
  return backups.sort((left, right) => String(right.id).localeCompare(String(left.id)));
}

/*
  Put a backup back. Files return to the exact paths they were taken from - including AW Next's
  baseline, so restoring does not turn the restored unlocks into a burst of new notifications.
*/
function restore(appid, backupId, { registry } = {}) {
  const dir = path.join(gameBackupRoot(appid), String(backupId));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const errors = [];
  let restored = 0;

  for (const entry of Array.isArray(manifest.files) ? manifest.files : []) {
    try {
      fs.mkdirSync(path.dirname(entry.original), { recursive: true });
      fs.copyFileSync(path.join(dir, 'files', entry.stored), entry.original);
      restored += 1;
    } catch (err) {
      errors.push({ path: entry.original, message: err.message || String(err) });
    }
  }

  if (manifest.manualUnlocks && manifest.manualUnlocks.entries) {
    const sidecar = manualUnlock.sidecarFile();
    if (sidecar) {
      try {
        const map = manualUnlock.readMap(sidecar);
        map[manualUnlock.gameKey(appid, manifest.manualUnlocks.source)] = manifest.manualUnlocks.entries;
        manualUnlock.writeMap(sidecar, map);
      } catch (err) {
        errors.push({ path: sidecar, message: err.message || String(err) });
      }
    }
  }

  const values = Array.isArray(manifest.registry) ? manifest.registry : [];
  const access = values.length ? registry || extras.windowsRegistry() : null;
  for (const entry of values) {
    try {
      // A manifest from before types were kept only ever held DWORDs.
      access.write(entry.key, entry.name, entry.data, entry.type || 'REG_DWORD');
      restored += 1;
    } catch (err) {
      errors.push({ path: `HKCU/${entry.key}/${entry.name}`, message: err.message || String(err) });
    }
  }

  return { restored, errors, manifest };
}

module.exports = {
  setUserDataPath,
  plan,
  run,
  listBackups,
  restore,
  backupRoot,
  gameBackupRoot,
  baselineFile,
  userDataDir,
  freshBackupDir,
  backupNameFor,
  writeManifest,
  rollBack,
  zeroRegistryValue,
  _internal: { collectTargets, backupIdFor, backupNameFor },
};
