'use strict';

// Video souvenir: aw-next-clip.exe runs only while a tracked game does, and each unlock shown on
// screen is saved as an MP4 with the unlock in the middle, in a folder of its own.

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { spawn } = require('child_process');
const debug = require('../util/log.js');
const { normalize, recorderArgs } = require('./clipProfile.js');
const { souvenirPath } = require('./souvenir.js');

const HELPER_NAME = 'aw-next-clip.exe';
const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 5000;
// Long enough for the after-unlock half of the longest clip to be recorded and written.
const QUIT_TIMEOUT_MS = 30000;

const state = {
  recorder: null,
  // Set when the GPU has no hardware encoder; cleared when the settings change.
  unsupportedKey: null,
};

// Kept in sync with clipDefaultDir() in app/ui/settings.js, which shows this folder.
function defaultDir() {
  return path.join(os.homedir(), 'Videos', 'Achievement Watcher Next');
}

function resolveHelper() {
  const helper = path.join(__dirname, '..', 'native', HELPER_NAME);
  return fs.existsSync(helper) ? helper : '';
}

function firstPid(game) {
  if (!game || !game.pids) return 0;
  const [pid] = [...game.pids];
  return Number(pid) || 0;
}

function handleLine(line, recorder) {
  const [kind] = line.split(' ', 1);
  if (kind === 'saved') debug.log(`[clip] saved ${line.slice(6)}`);
  else if (kind === 'merged') debug.log(`[clip] unlock joined the clip ${line.slice(7)}`);
  else if (kind === 'error') {
    debug.warn(`[clip] ${line.slice(6)}`);
    if (line.startsWith('error no-encoder') || line.startsWith('error no-media-foundation')) {
      state.unsupportedKey = recorder.key;
    }
  } else debug.log(`[clip] ${line.startsWith('log ') ? line.slice(4) : line}`);
}

function launch(recorder) {
  const { run = spawn, helper = resolveHelper() } = recorder.deps;
  if (!helper) {
    debug.warn('[clip] recorder helper was not found');
    return;
  }
  const child = run(helper, recorder.args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  recorder.child = child;
  try {
    // The recorder must never compete with the game for the CPU; its heavy work is on the GPU.
    os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {}
  readline.createInterface({ input: child.stdout }).on('line', (line) => handleLine(line, recorder));
  child.on('error', (err) => debug.warn(`[clip] recorder failed to start: ${err.message || err}`));
  child.on('exit', (code) => {
    if (recorder.child !== child) return;
    recorder.child = null;
    if (recorder.stopping || state.unsupportedKey === recorder.key) return;
    if (recorder.restarts >= MAX_RESTARTS) {
      debug.warn(`[clip] recorder exited (${code}) and was not restarted again for this game`);
      return;
    }
    recorder.restarts += 1;
    debug.warn(`[clip] recorder exited (${code}), restarting`);
    recorder.timer = setTimeout(() => {
      if (state.recorder === recorder && !recorder.stopping) launch(recorder);
    }, RESTART_DELAY_MS);
    if (typeof recorder.timer.unref === 'function') recorder.timer.unref();
  });
  debug.log(`[clip] recorder started for pid ${recorder.pid}: ${recorder.args.join(' ')}`);
}

// Pending clips are finished before the recorder leaves, so a game closed right after an unlock
// still gets its clip.
function stop() {
  const recorder = state.recorder;
  state.recorder = null;
  if (!recorder) return;
  recorder.stopping = true;
  clearTimeout(recorder.timer);
  const child = recorder.child;
  if (!child) return;
  try {
    child.stdin.end('quit\n');
  } catch {}
  const killer = setTimeout(() => {
    try {
      child.kill();
    } catch {}
  }, QUIT_TIMEOUT_MS);
  if (typeof killer.unref === 'function') killer.unref();
  child.once('exit', () => clearTimeout(killer));
}

// Brings the recorder in line with the settings and the game being played: started, restarted
// with new settings, or stopped.
function sync(souvenir, game, deps = {}) {
  const platform = deps.platform || process.platform;
  const enabled = platform === 'win32' && normalize(souvenir || {}).clip && game != null;
  if (!enabled) {
    stop();
    return null;
  }
  const pid = firstPid(game);
  const args = recorderArgs(souvenir, pid);
  const key = args.join(' ');
  if (state.unsupportedKey === key) return null;
  if (state.recorder && state.recorder.key === key) return state.recorder;
  stop();
  state.unsupportedKey = null;
  state.recorder = { key, args, pid, deps, restarts: 0, child: null, stopping: false, timer: null };
  launch(state.recorder);
  return state.recorder;
}

// Called when an unlock is shown: the clip is centred on this moment.
function trigger({ game, achievement, dir } = {}) {
  const recorder = state.recorder;
  if (!recorder || !recorder.child) return null;
  try {
    const folder = dir && String(dir).trim() ? String(dir).trim() : defaultDir();
    const file = souvenirPath({ game, achievement, dir: folder }, '.mp4');
    recorder.child.stdin.write(`clip 0 ${file}\n`);
    return file;
  } catch (err) {
    debug.warn(`[clip] ${err.message || err}`);
    return null;
  }
}

module.exports = { sync, stop, trigger, defaultDir, _state: state };
