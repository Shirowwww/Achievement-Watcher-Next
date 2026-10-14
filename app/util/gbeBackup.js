'use strict';

/*
  The restore point taken before AW Next writes into a game folder, manual fix or automatic scan
  alike, and the index the Settings restore list reads.

  goldberg.backupSetup() does the copying; this is the bookkeeping around it. Dependencies are
  arguments so the scan path (own user-data path and logger) and the tests can use it unchanged.
*/

const fs = require('fs');
const path = require('path');
const { dedupeTree } = require('./dedupeStore.js');

// Oldest entries fall off: this is a restore list, not an archive index.
const MAX_INDEX_ENTRIES = 80;
// A batch fix takes one restore point per game; a single pass after the last one covers them all.
const DEDUPE_DELAY_MS = 15000;

let dedupeTimer = null;

function normalizePathKey(value) {
  return path.resolve(String(value || '')).toLowerCase();
}

function isPathInsideDir(value, root) {
  if (!value || !root) return false;
  const childKey = normalizePathKey(value);
  const rootKey = normalizePathKey(root);
  return childKey === rootKey || childKey.startsWith(rootKey + path.sep);
}

function indexFile(userDataPath) {
  return path.join(userDataPath, 'cfg/gbe-backups.db');
}

function backupRoot(userDataPath) {
  return path.join(userDataPath, 'backups', 'gbe');
}

function readIndex(userDataPath) {
  try {
    const data = JSON.parse(fs.readFileSync(indexFile(userDataPath), 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeIndex(userDataPath, entries) {
  const file = indexFile(userDataPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf8');
}

function rememberBackup({ userDataPath, appid, gameDir, backupDir, manifest, log = null } = {}) {
  try {
    const resolvedBackup = path.resolve(backupDir);
    const entries = readIndex(userDataPath).filter(
      (entry) => entry && normalizePathKey(entry.backupDir) !== normalizePathKey(resolvedBackup)
    );
    entries.push({
      appid: String(appid || ''),
      gameDir: path.resolve(gameDir),
      backupDir: resolvedBackup,
      createdAt: (manifest && manifest.createdAt) || new Date().toISOString(),
    });
    writeIndex(userDataPath, entries.slice(-MAX_INDEX_ENTRIES));
  } catch (err) {
    if (log) log.log(`[gbe-backup] could not remember backup => ${(err && err.message) || err}`);
  }
}

// Each restore point copies the emulator DLLs again; once written they share one copy on disk.
function scheduleDedupe(userDataPath, log) {
  clearTimeout(dedupeTimer);
  dedupeTimer = setTimeout(() => {
    dedupeTimer = null;
    dedupeTree(backupRoot(userDataPath), { log })
      .then(({ linked, savedBytes }) => {
        if (log && linked > 0) log.log(`[gbe-backup] ${linked} identical file(s) now share one copy, ${Math.round(savedBytes / 1048576)} MB freed`);
      })
      .catch((err) => {
        if (log) log.log(`[gbe-backup] dedupe failed => ${(err && err.message) || err}`);
      });
  }, DEDUPE_DELAY_MS);
  if (typeof dedupeTimer.unref === 'function') dedupeTimer.unref();
}

/*
  Copy a game's current emulator setup aside and record it for the restore list. A folder with
  nothing to save is reported as skipped rather than as a failure; any other error is the caller's
  to handle, because writing into the game folder without a restore point is its decision to make.
*/
function createBackup({ goldberg, userDataPath, appid, gameDir, steamSettings, log = null } = {}) {
  if (!goldberg || !userDataPath || !gameDir) throw new Error('createBackup: goldberg, userDataPath and gameDir are required');
  try {
    const localSteamSettings = isPathInsideDir(steamSettings, gameDir) ? steamSettings : null;
    const result = goldberg.backupSetup({
      gameDir,
      steamSettings: localSteamSettings,
      destinationRoot: backupRoot(userDataPath),
    });
    rememberBackup({ userDataPath, appid, gameDir, backupDir: result.backupDir, manifest: result.manifest, log });
    scheduleDedupe(userDataPath, log);
    if (log) log.log(`[${appid || '?'}] GBE/Goldberg pre-fix backup created => ${result.backupDir}`);
    return { ...result, skipped: false };
  } catch (err) {
    const message = (err && err.message) || String(err);
    if (/no steam_settings or Steam API DLL was found/i.test(message)) {
      if (log) log.log(`[${appid || '?'}] GBE/Goldberg pre-fix backup skipped (${message})`);
      return { skipped: true, reason: message };
    }
    throw new Error(`backup before emulator fix failed: ${message}`, { cause: err });
  }
}

module.exports = { createBackup, rememberBackup, readIndex, indexFile, backupRoot, MAX_INDEX_ENTRIES };
