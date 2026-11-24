'use strict';

/*
  The game a console emulator is running, for play time: every game runs inside the same xenia,
  rpcs3 or shadps4 process, so the process name alone says nothing. Each emulator logs the booted
  game, and the log is rewritten at each launch; none logs the stop, so the process exit ends it.
  Formats from each emulator's source: Xenia (canary and upstream) logs the XEX header's "Title ID:"
  after "Loading module" / "Launching module" in xenia.log beside the exe; shadPS4 logs
  "Game id: CUSA... Title: ..." in log/shad_log.txt (or log/<serial>.log) of its user folder.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const rpcs3Current = require('./rpcs3Current.js');

const XENIA_PROCESS = /^xenia(_canary)?(_netplay)?(\.exe)?$/i;
const SHADPS4_PROCESS = /^shadps4(\.exe)?$/i;
const RPCS3_PROCESS = /^rpcs3(\.exe)?$/i;
// shortcut: the boot lines sit near the top of a log rewritten at each launch; a very long session
// could push them out of this tail, then that session is not counted. Raise it if that is reported.
const LOG_TAIL_BYTES = 16 * 1024 * 1024;

// A module path follows; "KernelState: Launching module..." after the header block is not a boot.
const XENIA_BOOT = /\b(?:Loading|Launching) module (?!\.\.\.)\S/g;
const XENIA_TITLE_ID = /^\s*Title ID: ([0-9A-F]{8})\s*$/im;
const XENIA_TITLE_NAME = /\bTitle name: ([^\r\n]+)/i;
const SHADPS4_BOOT = /\bGame id: (\S+) Title: ([^\r\n]*)/g;

function readTail(file, bytes = LOG_TAIL_BYTES) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

// The last module Xenia booted in this log: { titleId, name }, or null before any game boots.
function xeniaFromLog(text) {
  const source = String(text || '');
  let last = -1;
  for (const match of source.matchAll(XENIA_BOOT)) last = match.index;
  if (last === -1) return null;
  const after = source.slice(last);
  const id = after.match(XENIA_TITLE_ID);
  if (!id) return null;
  const name = after.match(XENIA_TITLE_NAME);
  return { titleId: id[1].toUpperCase(), name: name ? name[1].trim() : '' };
}

// The last game shadPS4 booted in this log: { serial, title }, or null.
function shadps4FromLog(text) {
  let found = null;
  for (const match of String(text || '').matchAll(SHADPS4_BOOT)) found = { serial: match[1].trim(), title: match[2].trim() };
  return found;
}

// The newest existing file among `files`: with two builds side by side, it is the one running.
function newestFile(files) {
  let best = null;
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      if (stat.isFile() && (!best || stat.mtimeMs > best.mtimeMs)) best = { file, mtimeMs: stat.mtimeMs };
    } catch {
      // Not there: the other candidates still count.
    }
  }
  return best ? best.file : '';
}

function logsIn(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => /^shad_log\.txt$|\.log$/i.test(name))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

// Where shadPS4 keeps its user folder: "user" beside the emulator (portable), else the data folder.
function shadps4LogDirs(exePath, { env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  const dirs = exePath ? [path.join(path.dirname(exePath), 'user', 'log')] : [];
  if (platform === 'win32') {
    if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'shadPS4', 'log'));
  } else {
    const data = String(env.XDG_DATA_HOME || '').trim() || path.join(home, '.local', 'share');
    dirs.push(path.join(data, 'shadPS4', 'log'));
  }
  return dirs;
}

const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// A booted Xbox 360 title, among the titles whose achievements AW Next reads.
function xeniaGame({ exePath, targets }) {
  const log = exePath ? path.join(path.dirname(exePath), 'xenia.log') : '';
  if (!log || !fs.existsSync(log)) return null;
  const booted = xeniaFromLog(readTail(log));
  if (!booted) return null;
  const target = targets().find((entry) => sameId(entry.titleId, booted.titleId));
  return target ? { appid: target.titleId, name: booted.name } : null;
}

function trophySetTitle(xmlDir) {
  try {
    const file = fs.readdirSync(xmlDir).find((name) => /^trop\.xml$/i.test(name)) || fs.readdirSync(xmlDir).find((name) => /^trop_\d{2}\.xml$/i.test(name));
    const xml = fs.readFileSync(path.join(xmlDir, file), 'utf8');
    return ((xml.match(/<title-name>([\s\S]*?)<\/title-name>/i) || [])[1] || '').trim();
  } catch {
    return '';
  }
}

// A booted PS4 game: its serial when the trophy set is filed under it, else the one set with its title.
function shadps4Game({ exePath, targets, env, home, platform, readTitle = trophySetTitle }) {
  const log = newestFile(shadps4LogDirs(exePath, { env, home, platform }).flatMap(logsIn));
  if (!log) return null;
  const booted = shadps4FromLog(readTail(log));
  if (!booted) return null;
  const sets = targets();
  const bySerial = sets.find((entry) => sameId(entry.appid, booted.serial));
  if (bySerial) return { appid: bySerial.appid, name: booted.title };
  const wanted = rpcs3Current.normalizeTitle(booted.title);
  const ids = new Set(sets.filter((entry) => wanted && rpcs3Current.normalizeTitle(readTitle(entry.xmlDir)) === wanted).map((entry) => entry.appid));
  return ids.size === 1 ? { appid: [...ids][0], name: booted.title } : null;
}

// A booted PS3 game, read the way the overlay shortcut reads it.
function rpcs3Game({ exePath, emulatorDirs, targets, env, home, platform }) {
  const dirs = [...new Set([exePath ? path.dirname(exePath) : '', ...emulatorDirs()].filter(Boolean))];
  const log = rpcs3Current.newestLog(rpcs3Current.logCandidates(dirs, { env, home, platform }));
  if (!log) return null;
  const title = rpcs3Current.titleFromLog(readTail(log));
  const appid = rpcs3Current.matchTrophySet(title, targets());
  return appid ? { appid, name: title } : null;
}

// One entry per emulator: the process that runs its games, and how to read the one running now.
const EMULATORS = [
  { id: 'xenia', source: 'Xenia Emulator', process: XENIA_PROCESS, current: xeniaGame },
  { id: 'rpcs3', source: 'RPCS3 Emulator', process: RPCS3_PROCESS, current: rpcs3Game },
  { id: 'shadps4', source: 'ShadPS4 Emulator', process: SHADPS4_PROCESS, current: shadps4Game },
];

function emulatorFor(processName) {
  return EMULATORS.find((emulator) => emulator.process.test(String(processName || ''))) || null;
}

module.exports = { EMULATORS, emulatorFor, xeniaFromLog, shadps4FromLog, shadps4LogDirs, xeniaGame, shadps4Game, rpcs3Game };
