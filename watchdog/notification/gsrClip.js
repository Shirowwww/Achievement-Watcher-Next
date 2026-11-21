'use strict';

const { sharedAppModulePath } = require('../util/sharedAppModule.js');
// Linux clips through gpu-screen-recorder, when the user has it: it keeps the last seconds in a
// replay buffer and saves them on SIGUSR1, printing the saved file's path on stdout. AW bundles
// nothing; the tool is found on PATH or as its Flathub package.

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { execFileSync } = require('child_process');
const { fixedFps } = require(sharedAppModulePath('util/clipProfile.js'));

const BINARY = 'gpu-screen-recorder';
const FLATPAK_ID = 'com.dec05eba.gpu_screen_recorder';
const QUALITY = { low: 'medium', medium: 'high', high: 'very_high' };

function onPath(name, env = process.env) {
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {}
  }
  return '';
}

function hasFlatpak(run = execFileSync) {
  try {
    run('flatpak', ['info', FLATPAK_ID], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// The command that starts the recorder, or null when it is not installed.
function locate({ env = process.env, flatpak = hasFlatpak } = {}) {
  const binary = onPath(BINARY, env);
  if (binary) return { command: binary, prefix: [], via: 'path' };
  if (onPath('flatpak', env) && flatpak()) return { command: 'flatpak', prefix: ['run', `--command=${BINARY}`, FLATPAK_ID], via: 'flatpak' };
  return null;
}

// A Wayland session only lets the portal share the screen; the token file keeps the user's
// first answer, so the share dialog is not shown at every game.
function replayArgs(clip, { outDir, tokenFile, wayland }) {
  const args = [
    '-w', wayland ? 'portal' : 'screen',
    '-c', 'mp4',
    '-k', clip.clipCodec,
    '-f', String(fixedFps(clip)),
    '-q', QUALITY[clip.clipQuality],
    '-r', String(clip.clipSeconds),
    '-a', 'default_output',
    '-o', outDir,
  ];
  if (wayland) args.push('-restore-portal-session', 'yes', '-portal-session-token-filepath', tokenFile);
  return args;
}

function moveFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(from, to);
    fs.rmSync(from, { force: true });
  }
}

// A copy of a saved clip under another unlock's name, in that unlock's folder.
function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

/*
  One recorder per game. save() asks for the buffer `afterMs` later, so the unlock sits in the
  middle of the saved seconds; an unlock arriving before that save joins it, like on Windows. With
  `separate`, that unlock still gets a file of its own: a copy of the same replay, as two replays
  asked for close together could not both be saved.
*/
function createRecorder({ child, afterMs, log, separate = false, kill = (pid, signal) => process.kill(pid, signal) }) {
  const waiting = [];
  let pending = null;

  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const saved = line.trim();
    const group = waiting.shift();
    if (!saved || !group) return;
    try {
      moveFile(saved, group.target);
      log.log(`[clip] saved ${group.target}`);
    } catch (err) {
      log.warn(`[clip] could not move ${saved} to ${group.target}: ${err.message || err}`);
      return;
    }
    for (const copy of group.copies) {
      try {
        copyFile(group.target, copy);
        log.log(`[clip] saved ${copy}`);
      } catch (err) {
        log.warn(`[clip] could not copy the clip to ${copy}: ${err.message || err}`);
      }
    }
  });

  function save(target) {
    if (pending && separate) {
      pending.copies.push(target);
      return target;
    }
    if (pending) {
      log.log(`[clip] unlock joined the clip ${pending.target}`);
      return pending.target;
    }
    const group = { target, copies: [] };
    pending = group;
    const timer = setTimeout(() => {
      pending = null;
      waiting.push(group);
      try {
        kill(child.pid, 'SIGUSR1');
      } catch (err) {
        waiting.pop();
        log.warn(`[clip] could not ask for the replay: ${err.message || err}`);
      }
    }, afterMs);
    if (typeof timer.unref === 'function') timer.unref();
    return target;
  }

  // True while an unlock still waits for its clip: the recorder must not be stopped before then.
  const busy = () => pending !== null || waiting.length > 0;

  return { save, busy };
}

function replayDir() {
  const dir = path.join(os.tmpdir(), 'aw-next-replay');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { locate, replayArgs, createRecorder, replayDir, FLATPAK_ID };
