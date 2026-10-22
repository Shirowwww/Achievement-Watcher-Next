'use strict';

/*
  The unlock records a PS4 port keeps besides its unlock logs: <user>/trophy/<NP id>/progress_user<N>.txt
  ("DCP-TROPHIES 1" snapshots), <user>/trophies/<title id>-user<N>.bin and <user>/trophies.dat (16
  bytes, one bit per trophy, no dates), <user>/trophies.json, and the dated session logs a launcher
  keeps. Every profile found is merged. Synchronous and dependency-free: the Watchdog loads this file
  through sharedAppModule.
*/

const fs = require('fs');
const path = require('path');
const formats = require(path.join(__dirname, 'ps4RecompTrophies.js'));

const SNAPSHOT_HEADER = 'DCP-TROPHIES 1';
const SNAPSHOT_FILE = /^progress_user\d{1,3}\.txt$/i;
const SNAPSHOT_ROW = /^unlocked (\d{1,4}) (\d{1,13})$/;
const FLAG_FILE = /^(CUSA\d{5})-user\d{1,3}\.bin$/i;
const FLAG_BYTES = 16;
const FLAGS_DAT = 'trophies.dat';
const TROPHIES_JSON = 'trophies.json';
const MAX_PROGRESS_BYTES = 256 * 1024;
const MAX_LISTED = 512;
const MAX_TROPHY_ID = 9999;
const MAX_UNIX_S = 4102444800;
const DEFAULT_SESSION_LOGS = 8;
const SESSION_LOG = /^(?:last_run|game|(?:launcher-)?run[-_].+|[\w.-]*\d{4}[-_]?\d{2}[-_]?\d{2}[-_][\w.-]+)\.log$/i;
const SESSION_FOLDER = /^\d{4}[-_]\d{2}[-_]\d{2}[-_][\w.-]+$/;
const SERVER_LOG = /^server[-_]/i;
const LOG_NAMES = /^(?:trophies\.log|last_run\.log|unlocked\.txt|trophy\d{2}\.txt|trophies\.dat|trophies\.json|.+\.log)$/i;

function listing(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .slice(0, MAX_LISTED)
      .filter((entry) => !entry.isSymbolicLink());
  } catch {
    return [];
  }
}

function unixSeconds(raw) {
  let value = Number(raw);
  if (value > MAX_UNIX_S * 10) value = Math.floor(value / 1000);
  return Number.isFinite(value) && value > 0 && value < MAX_UNIX_S ? Math.floor(value) : 0;
}

// { valid, unlocks }: a snapshot of another NP id, or with no header, is not one.
function parseSnapshot(text, npcommid) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const named = /^npcommid (NPWR\d{5}_\d{2})$/.exec(lines[1] || '');
  if (lines[0] !== SNAPSHOT_HEADER || !named || (npcommid && named[1] !== npcommid)) return { valid: false, unlocks: [] };
  const unlocks = [];
  for (const line of lines.slice(2)) {
    const row = SNAPSHOT_ROW.exec(line.trim());
    if (row) unlocks.push({ id: String(Number(row[1])), time: unixSeconds(row[2]) });
  }
  return { valid: true, unlocks };
}

// Trophy id N is bit N % 32 of the little-endian word N / 32; null for any other size.
function parseFlags(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== FLAG_BYTES) return null;
  const unlocks = [];
  for (let id = 0; id < FLAG_BYTES * 8; id++) {
    if (buffer.readUInt32LE(Math.floor(id / 32) * 4) & (1 << id % 32)) unlocks.push({ id: String(id), time: 0 });
  }
  return unlocks;
}

// {"version": 1, "unlocked": [{"id": 3, "unix": 1792512020}]}; null when it is not that.
function parseTrophiesJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.unlocked)) return null;
  return parsed.unlocked
    .filter((entry) => entry && Number.isInteger(entry.id) && entry.id >= 0 && entry.id <= MAX_TROPHY_ID)
    .map((entry) => ({ id: String(entry.id), time: unixSeconds(entry.unix) }));
}

// The flag files of the game's title; a port naming its file after one region only is still read.
function flagFiles(dir, titleId) {
  const files = listing(dir).filter((entry) => entry.isFile() && FLAG_FILE.test(entry.name));
  const own = files.filter((entry) => titleId && entry.name.toUpperCase().startsWith(`${titleId}-`));
  const titles = new Set(files.map((entry) => FLAG_FILE.exec(entry.name)[1].toUpperCase()));
  let chosen = [];
  if (own.length > 0) chosen = own;
  else if (!titleId || titles.size === 1) chosen = files;
  return chosen.map((entry) => path.join(dir, entry.name));
}

// [{ file, kind }] for one record: info.progressDirs are the user folders it may write in.
function progressFiles(info) {
  const found = [];
  const npcommid = /^NPWR\d{5}_\d{2}$/.test(String(info.npcommid || '')) ? info.npcommid : '';
  for (const dir of Array.isArray(info.progressDirs) ? info.progressDirs : []) {
    if (!dir) continue;
    if (npcommid) {
      const snapshots = path.join(dir, 'trophy', npcommid);
      for (const entry of listing(snapshots)) if (entry.isFile() && SNAPSHOT_FILE.test(entry.name)) found.push({ file: path.join(snapshots, entry.name), kind: 'snapshot' });
    }
    for (const file of flagFiles(path.join(dir, 'trophies'), info.titleId)) found.push({ file, kind: 'flags' });
    found.push({ file: path.join(dir, FLAGS_DAT), kind: 'flags' }, { file: path.join(dir, TROPHIES_JSON), kind: 'json' });
  }
  return found;
}

function exists(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

// { unlocks, unstable, rejected }: a file caught mid-write is unstable, one of another game rejected.
function readSource(source, npcommid) {
  if (!exists(source.file)) return { unlocks: [], unstable: false, rejected: false };
  const body = formats.readBounded(source.file, MAX_PROGRESS_BYTES);
  if (!body) return { unlocks: [], unstable: false, rejected: true };
  if (source.kind === 'flags') {
    const unlocks = parseFlags(body);
    return { unlocks: unlocks || [], unstable: !unlocks, rejected: false };
  }
  if (source.kind === 'json') {
    const unlocks = parseTrophiesJson(body.toString('utf8'));
    return { unlocks: unlocks || [], unstable: !unlocks, rejected: false };
  }
  const read = parseSnapshot(body.toString('utf8'), npcommid);
  return { unlocks: read.unlocks, unstable: false, rejected: !read.valid };
}

// Several lists as one: earned anywhere, at the earliest known time (0 = unknown).
function mergeInto(unlocked, unlocks) {
  for (const { id, time } of unlocks) {
    const previous = unlocked.get(id);
    if (previous === undefined || (time > 0 && (previous === 0 || time < previous))) unlocked.set(id, time);
  }
  return unlocked;
}

function readProgress(info) {
  const record = info && typeof info === 'object' ? info : {};
  const unlocked = new Map();
  const rejected = [];
  let unstable = false;
  for (const source of progressFiles(record)) {
    const read = readSource(source, record.npcommid);
    if (read.unstable) unstable = true;
    if (read.rejected) rejected.push(source.file);
    mergeInto(unlocked, read.unlocks);
  }
  return { unlocked, unstable, rejected };
}

function modified(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/*
  The newest session logs in info.sessionDirs: dated logs, and game.log in dated folders. An entry
  { dir, anyLog } is a folder of logs only (PORTHEON's data/logs), whose names are not documented.
*/
function sessionLogs(info, limit = DEFAULT_SESSION_LOGS) {
  const found = [];
  for (const item of Array.isArray(info.sessionDirs) ? info.sessionDirs : []) {
    const dir = typeof item === 'string' ? item : item && typeof item.dir === 'string' ? item.dir : '';
    const named = item && item.anyLog ? /\.log$/i : SESSION_LOG;
    for (const entry of dir ? listing(dir) : []) {
      if (entry.isFile() && named.test(entry.name) && !SERVER_LOG.test(entry.name)) found.push(path.join(dir, entry.name));
      if (entry.isDirectory() && SESSION_FOLDER.test(entry.name)) found.push(path.join(dir, entry.name, 'game.log'));
    }
  }
  return found
    .map((file) => ({ file, time: modified(file) }))
    .filter((entry) => entry.time > 0)
    .sort((a, b) => b.time - a.time || a.file.localeCompare(b.file))
    .slice(0, limit)
    .map((entry) => entry.file);
}

function isProgressName(name) {
  const base = path.basename(String(name || ''));
  return LOG_NAMES.test(base) || SNAPSHOT_FILE.test(base) || FLAG_FILE.test(base);
}

module.exports = { parseSnapshot, parseFlags, parseTrophiesJson, readProgress, sessionLogs, isProgressName, mergeInto };
