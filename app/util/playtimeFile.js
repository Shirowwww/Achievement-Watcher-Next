'use strict';

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require(path.join(__dirname, 'replaceFile.js'));

/*
  Playtime counters where there is no Windows registry: `cfg/playtime.json` in the profile, one
  `{ total, last }` per appid (seconds, unix seconds), the same pair the registry key holds, plus
  `first`, when the first session ever recorded began. Both the app and the Watchdog write it, so
  every change re-reads the file and replaces it whole.
*/

// Relative to the user data folder, '/'-separated like the profile backup's rules.
const PLAYTIME_RELATIVE = 'cfg/playtime.json';

function playtimeFile(userData) {
  return path.join(userData, ...PLAYTIME_RELATIVE.split('/'));
}

// ENOENT is an empty store; any other failure is thrown so a locked file is never saved over.
function readAll(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
}

function counter(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 0xffffffff) : 0;
}

function read(file, appid) {
  const entry = readAll(file)[String(appid)] || {};
  return { total: counter(entry.total), last: counter(entry.last) };
}

// When the first recorded session began: 0 for a game never launched, or played before this was kept.
function readFirst(file, appid) {
  return counter((readAll(file)[String(appid)] || {}).first);
}

const withFirst = (first) => (counter(first) ? { first: counter(first) } : {});

// `first` is not a counter to set: what is stored stays, unless the caller gives one.
function write(file, appid, { total, last, first }) {
  const all = readAll(file);
  const kept = first === undefined ? (all[String(appid)] || {}).first : first;
  const next = { ...all, [String(appid)]: { total: counter(total), last: counter(last), ...withFirst(kept) } };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomicSync(file, JSON.stringify(next, null, 2));
}

function addSession(file, appid, seconds, now = Date.now()) {
  const current = read(file, appid);
  const played = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : 0;
  const at = Math.floor(now / 1000);
  // Only a game with nothing recorded yet is being launched for the first time.
  const first = current.total === 0 && current.last === 0 && !readFirst(file, appid) ? Math.max(0, at - played) : undefined;
  write(file, appid, { total: current.total + played, last: at, first });
}

function list(file) {
  return Object.keys(readAll(file)).map((appid) => ({ appid, ...read(file, appid), ...withFirst(readFirst(file, appid)) }));
}

// The first launch of two machines is the earlier one; 0 is "not recorded" on that side.
const earlierFirst = (a, b) => (counter(a) && counter(b) ? Math.min(counter(a), counter(b)) : counter(a) || counter(b));

// Larger value wins, so a restored backup can never turn a counter back.
function mergeMax(file, rows) {
  const next = { ...readAll(file) };
  for (const row of rows) {
    const current = next[String(row.appid)] || {};
    next[String(row.appid)] = {
      total: Math.max(counter(current.total), counter(row.total)),
      last: Math.max(counter(current.last), counter(row.last)),
      ...withFirst(earlierFirst(current.first, row.first)),
    };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomicSync(file, JSON.stringify(next, null, 2));
  return rows.length;
}

module.exports = { playtimeFile, PLAYTIME_RELATIVE, read, readFirst, write, addSession, list, mergeMax, earlierFirst };
