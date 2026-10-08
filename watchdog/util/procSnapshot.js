'use strict';

/*
  Process listing on Linux, read from /proc: the counterpart of processSnapshot.js. A Windows game
  under Wine or Proton shows up with its own .exe as argv[0] (`Z:\...\Game.exe`) while /proc/<pid>/exe
  points at the Wine loader, so the name comes from argv[0] for those and from the executable link
  for native processes. Names are cached per pid and start time, so a poll only reads the new ones.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sharedAppModulePath } = require('./sharedAppModule.js');
const { winToUnix } = require(sharedAppModulePath('util/winHosts.js'));

const PROC = '/proc';
const known = new Map();

function readProc(pid, file) {
  try {
    return fs.readFileSync(path.join(PROC, String(pid), file), 'utf8');
  } catch {
    return null;
  }
}

// Field 22 of /proc/<pid>/stat; the command field before it can hold spaces and parentheses.
function startTime(pid) {
  const stat = readProc(pid, 'stat');
  if (!stat) return null;
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return fields[19] || null;
}

function argv0(pid) {
  const cmdline = readProc(pid, 'cmdline');
  return cmdline ? cmdline.split('\0')[0] : '';
}

function isWindowsImage(arg) {
  return /\.exe$/i.test(arg);
}

function nameOf(pid) {
  const arg = argv0(pid);
  if (isWindowsImage(arg)) return arg.split(/[\\/]/).pop();
  try {
    return path.basename(fs.readlinkSync(path.join(PROC, String(pid), 'exe')));
  } catch {
    return (readProc(pid, 'comm') || '').trim();
  }
}

function isAvailable() {
  return fs.existsSync(path.join(PROC, 'self', 'stat'));
}

function listSync() {
  const pids = fs.readdirSync(PROC).filter((entry) => /^\d+$/.test(entry));
  const live = new Set();
  const rows = [];
  for (const entry of pids) {
    const pid = Number(entry);
    const start = startTime(pid);
    if (!start) continue;
    live.add(pid);
    let cached = known.get(pid);
    if (!cached || cached.start !== start) {
      cached = { start, name: nameOf(pid) };
      known.set(pid, cached);
    }
    if (cached.name) rows.push({ process: cached.name, pid });
  }
  for (const pid of known.keys()) if (!live.has(pid)) known.delete(pid);
  return rows;
}

function environ(pid) {
  const raw = readProc(pid, 'environ');
  const env = {};
  if (!raw) return env;
  for (const pair of raw.split('\0')) {
    const eq = pair.indexOf('=');
    if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return env;
}

// The prefix a Wine process runs in: WINEPREFIX, Proton's compat data folder, or Wine's default.
function prefixOf(env) {
  if (env.WINEPREFIX) return env.WINEPREFIX;
  if (env.STEAM_COMPAT_DATA_PATH) return path.join(env.STEAM_COMPAT_DATA_PATH, 'pfx');
  return path.join(env.HOME || os.homedir(), '.wine');
}

// Unix path of the image a process runs, its .exe for a Wine process; '' when unreadable.
function getProcessPath(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return '';
  const arg = argv0(pid);
  if (isWindowsImage(arg)) {
    if (path.isAbsolute(arg)) return arg;
    return winToUnix(prefixOf(environ(pid)), arg) || '';
  }
  try {
    return fs.readlinkSync(path.join(PROC, String(pid), 'exe'));
  } catch {
    return '';
  }
}

module.exports = { isAvailable, listSync, getProcessPath, environ, prefixOf };
