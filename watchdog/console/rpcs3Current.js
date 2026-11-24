'use strict';

/*
  The game RPCS3 runs, for the overlay shortcut: every game runs inside rpcs3.exe, but RPCS3.log
  names the booted one ("SYS: Title: ..."), matched to a single trophy set's TROPCONF title.
  Read when the shortcut is pressed, never polled.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { decodeXmlEntities } = require(sharedAppModulePath('util/xmlText.js'));

const PROCESS_NAME = /^rpcs3(\.exe)?$/i;
// shortcut: a session that booted many games may hold its current title further back than this;
// read the file in chunks from the end if that is ever reported.
const LOG_TAIL_BYTES = 16 * 1024 * 1024;
// Both written by Emulator in rpcs3/Emu/System.cpp: sys_log.notice("Title: %s") at boot and
// sys_log.notice("Stopping emulator...") when the game is stopped.
const BOOT_OR_STOP = /\bSYS: (?:Title: ([^\r\n]*)|Stopping emulator)/g;

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// The title of the game running at the end of this log, or '' when none is (never booted, stopped).
function titleFromLog(text) {
  let current = '';
  for (const match of String(text || '').matchAll(BOOT_OR_STOP)) current = match[1] === undefined ? '' : match[1].trim();
  return current;
}

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

/*
  Where RPCS3 writes RPCS3.log (fs::get_log_dir, Utilities/File.cpp). Windows: <config>/log/, config
  being <exe>/portable/, else RPCS3_CONFIG_DIR, else the exe folder (older builds: the config root).
  Elsewhere: rpcs3/ under XDG_CACHE_HOME, else XDG_CONFIG_HOME, else ~/.cache.
*/
function logCandidates(emulatorDirs, { env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  const files = [];
  if (platform === 'win32') {
    const configured = String(env.RPCS3_CONFIG_DIR || '').trim();
    for (const dir of emulatorDirs) {
      if (!dir) continue;
      for (const root of [path.join(dir, 'portable'), configured, dir].filter(Boolean)) {
        files.push(path.join(root, 'log', 'RPCS3.log'), path.join(root, 'RPCS3.log'));
      }
    }
  } else {
    const cache = String(env.XDG_CACHE_HOME || '').trim() || String(env.XDG_CONFIG_HOME || '').trim() || path.join(home, '.cache');
    files.push(path.join(cache, 'rpcs3', 'RPCS3.log'));
  }
  return [...new Set(files)];
}

// The log written last: with two RPCS3 builds side by side, it is the one running.
function newestLog(files) {
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

function trophySetTitle(trophyDir) {
  try {
    const xml = fs.readFileSync(path.join(trophyDir, 'TROPCONF.SFM'), 'utf8');
    return decodeXmlEntities((xml.match(/<title-name>([\s\S]*?)<\/title-name>/i) || [])[1] || '').trim();
  } catch {
    return '';
  }
}

// The appid (trophy folder name) whose title is the booted one, when exactly one set has it.
function matchTrophySet(title, targets, readTitle = trophySetTitle) {
  const wanted = normalizeTitle(title);
  if (!wanted) return '';
  const ids = new Set(targets.filter((target) => normalizeTitle(readTitle(target.trophyDir)) === wanted).map((target) => String(target.appid)));
  return ids.size === 1 ? [...ids][0] : '';
}

/**
 * @param {{ processes: () => Array<{ process: string }>, emulatorDirs: () => string[], targets: () => Array<{ appid: string, trophyDir: string }>, env?: object, home?: string, platform?: string, readTitle?: Function }} deps
 * @returns {string} the running RPCS3 game's appid, or '' when RPCS3 is not running or the game is not known
 */
function currentGame({ processes, emulatorDirs, targets, env, home, platform, readTitle } = {}) {
  try {
    if (!processes().some((entry) => entry && PROCESS_NAME.test(String(entry.process || '')))) return '';
    const log = newestLog(logCandidates(emulatorDirs(), { env, home, platform }));
    if (!log) return '';
    return matchTrophySet(titleFromLog(readTail(log)), targets(), readTitle);
  } catch {
    return '';
  }
}

module.exports = { currentGame, titleFromLog, matchTrophySet, logCandidates, newestLog, normalizeTitle, readTail, PROCESS_NAME };
