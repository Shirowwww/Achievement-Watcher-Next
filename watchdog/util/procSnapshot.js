'use strict';

/*
  Process listing on Linux, read from /proc: the counterpart of processSnapshot.js. A Windows game
  under Wine or Proton shows up with its own .exe as argv[0] (`Z:\...\Game.exe`) while /proc/<pid>/exe
  points at the Wine loader, so the name comes from argv[0] for those and from the executable link
  for native processes. Names are cached per pid and start time, so a poll only reads the new ones.

  /proc/<pid>/comm is the last resort: the kernel cuts it to 15 characters, so a native game called
  "SomeLongGameName.x86_64" would never match its own binary name through it.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sharedAppModulePath } = require('./sharedAppModule.js');
const { winToUnix } = require(sharedAppModulePath('util/winHosts.js'));

const PROC = '/proc';
const COMM_LENGTH = 15;
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

// The link reads "<path> (deleted)" once the file is replaced, e.g. a game updated while it runs.
// Only another user's processes refuse it.
function exeLink(pid) {
  try {
    return fs.readlinkSync(path.join(PROC, String(pid), 'exe')).replace(/ \(deleted\)$/, '');
  } catch {
    return '';
  }
}

// Without the executable link, argv[0] still has the full name; comm vouches that it names the
// program that was started rather than a title the process wrote over its own arguments.
function nameOf(pid) {
  const arg = argv0(pid);
  if (isWindowsImage(arg)) return arg.split(/[\\/]/).pop();
  const exe = exeLink(pid);
  if (exe) return path.basename(exe);
  const comm = (readProc(pid, 'comm') || '').trim();
  const argName = path.basename(arg);
  return comm.length === COMM_LENGTH && argName.startsWith(comm) ? argName : comm;
}

function isAvailable() {
  return fs.existsSync(path.join(PROC, 'self', 'stat'));
}

function pidsInProc() {
  return fs
    .readdirSync(PROC)
    .filter((entry) => /^\d+$/.test(entry))
    .map(Number);
}

function listSync() {
  const live = new Set();
  const rows = [];
  for (const pid of pidsInProc()) {
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
  return exeLink(pid);
}

// Steam sets SteamAppId and SteamGameId for everything it starts, Proton games included, and
// umu-launcher does the same from GAMEID=umu-<appid>. A non-Steam shortcut gets 0, or a shortcut id
// with the top bit set, which is no Steam appid.
const MAX_STEAM_APPID = 0x7fffffff;

function launchAppid(env) {
  for (const value of [env.SteamAppId, env.SteamGameId]) {
    const text = String(value || '').trim();
    if (/^\d+$/.test(text) && Number(text) > 0 && Number(text) <= MAX_STEAM_APPID) return String(Number(text));
  }
  return '';
}

// The Steam appid a process was launched for, '' when none.
function getLaunchAppid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return '';
  return launchAppid(environ(pid));
}

// Every live process started for this appid: Steam's reaper, the Proton and Wine helpers, the game
// and any launcher in between.
function pidsWithLaunchAppid(appid) {
  const wanted = String(appid || '');
  if (!wanted) return [];
  return pidsInProc().filter((pid) => getLaunchAppid(pid) === wanted);
}

module.exports = { isAvailable, listSync, getProcessPath, environ, prefixOf, launchAppid, getLaunchAppid, pidsWithLaunchAppid };
