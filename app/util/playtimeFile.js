'use strict';

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('./replaceFile.js');

/*
  Playtime counters where there is no Windows registry: `cfg/playtime.json` in the profile, one
  `{ total, last }` per appid (seconds, unix seconds), the same pair the registry key holds. Both
  the app and the Watchdog write it, so every change re-reads the file and replaces it whole.
*/

function playtimeFile(userData) {
  return path.join(userData, 'cfg', 'playtime.json');
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

function write(file, appid, { total, last }) {
  const all = readAll(file);
  const next = { ...all, [String(appid)]: { total: counter(total), last: counter(last) } };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomicSync(file, JSON.stringify(next, null, 2));
}

function addSession(file, appid, seconds, now = Date.now()) {
  const current = read(file, appid);
  const played = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : 0;
  write(file, appid, { total: current.total + played, last: Math.floor(now / 1000) });
}

module.exports = { playtimeFile, read, write, addSession };
