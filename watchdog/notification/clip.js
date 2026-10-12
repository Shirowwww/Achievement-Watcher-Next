'use strict';

// Video souvenir: a recorder runs only while a tracked game does, and each unlock shown on screen
// is saved with the unlock in the middle, in a folder of its own. Windows records with
// aw-next-clip.exe; Linux with gpu-screen-recorder, or with the app's software recorder when the
// user picked it (the app holds the screen capture, this process only asks).

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const { spawn } = require('child_process');
const debug = require('../util/log.js');
const { normalize, recorderArgs } = require('./clipProfile.js');
const { souvenirPath } = require('./souvenir.js');
const gsrClip = require('./gsrClip.js');

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

function sendToApp(message, send) {
  const deliver = send || (typeof process.send === 'function' && process.connected ? (msg) => process.send(msg) : null);
  if (!deliver) return false;
  try {
    deliver({ clipRecorder: message });
    return true;
  } catch (err) {
    debug.warn(`[clip] app recorder unreachable: ${err.message || err}`);
    return false;
  }
}

function launch(recorder) {
  const { run = spawn } = recorder.deps;
  if (!recorder.command) {
    debug.warn('[clip] recorder helper was not found');
    return;
  }
  const child = run(recorder.command, recorder.args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  recorder.child = child;
  try {
    // The recorder must never compete with the game for the CPU; its heavy work is on the GPU.
    os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {}
  if (recorder.engine === 'gpu-screen-recorder') {
    recorder.replay = gsrClip.createRecorder({ child, afterMs: recorder.afterMs, log: debug, kill: recorder.deps.kill });
  } else {
    readline.createInterface({ input: child.stdout }).on('line', (line) => handleLine(line, recorder));
  }
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

// gpu-screen-recorder writes its file when it gets SIGINT; an unlock still waiting for its clip is
// saved first.
function quitGsr(recorder, child) {
  const kill = recorder.deps.kill || ((pid, signal) => process.kill(pid, signal));
  const started = Date.now();
  const finish = () => {
    if (recorder.replay && recorder.replay.busy() && Date.now() - started < QUIT_TIMEOUT_MS) {
      const wait = setTimeout(finish, 250);
      if (typeof wait.unref === 'function') wait.unref();
      return;
    }
    try {
      kill(child.pid, 'SIGINT');
    } catch {}
  };
  finish();
}

// Pending clips are finished before the recorder leaves, so a game closed right after an unlock
// still gets its clip.
function stop() {
  const recorder = state.recorder;
  state.recorder = null;
  if (!recorder) return;
  recorder.stopping = true;
  clearTimeout(recorder.timer);
  if (recorder.engine === 'software') {
    sendToApp({ action: 'stop' }, recorder.deps.send);
    return;
  }
  const child = recorder.child;
  if (!child) return;
  if (recorder.engine === 'gpu-screen-recorder') {
    quitGsr(recorder, child);
    return;
  }
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

function windowsRecorder(souvenir, pid, deps) {
  const args = recorderArgs(souvenir, pid);
  return { engine: 'aw-next-clip', key: args.join(' '), command: deps.helper === undefined ? resolveHelper() : deps.helper, args, ext: '.mp4' };
}

// Null when the chosen engine cannot run here; the reason is logged once per settings change.
function linuxRecorder(souvenir, deps) {
  const clip = normalize(souvenir);
  const afterMs = Math.round((clip.clipSeconds * 1000) / 2);
  if (clip.clipEngine === 'software') {
    return { engine: 'software', key: `software ${JSON.stringify(clip)}`, clip, args: [], ext: '.webm', afterMs };
  }
  const found = (deps.locate || gsrClip.locate)();
  if (!found) return { engine: 'none', key: 'gpu-screen-recorder missing' };
  const env = deps.env || process.env;
  const wayland = env.XDG_SESSION_TYPE === 'wayland';
  const tokenFile = path.join(deps.profileDir || os.homedir(), '.aw-next-gsr-portal-token');
  const args = [...found.prefix, ...gsrClip.replayArgs(clip, { outDir: deps.replayDir || gsrClip.replayDir(), tokenFile, wayland })];
  return { engine: 'gpu-screen-recorder', key: [found.command, ...args].join(' '), command: found.command, args, ext: '.mp4', afterMs };
}

// Brings the recorder in line with the settings and the game being played: started, restarted
// with new settings, or stopped.
function sync(souvenir, game, deps = {}) {
  const platform = deps.platform || process.platform;
  const supported = platform === 'win32' || platform === 'linux';
  const enabled = supported && normalize(souvenir || {}).clip && game != null;
  if (!enabled) {
    stop();
    return null;
  }
  const pid = firstPid(game);
  const plan = platform === 'win32' ? windowsRecorder(souvenir, pid, deps) : linuxRecorder(souvenir || {}, deps);
  if (state.unsupportedKey === plan.key) return null;
  if (state.recorder && state.recorder.key === plan.key) return state.recorder;
  stop();
  state.unsupportedKey = null;
  if (plan.engine === 'none') {
    debug.warn('[clip] gpu-screen-recorder is not installed; pick the software recorder in Settings to record clips');
    state.unsupportedKey = plan.key;
    return null;
  }
  state.recorder = { ...plan, pid, deps, restarts: 0, child: null, stopping: false, timer: null };
  if (plan.engine === 'software') {
    sendToApp({ action: 'start', settings: plan.clip }, deps.send);
    debug.log(`[clip] software recorder asked of the app for pid ${pid}`);
  } else {
    launch(state.recorder);
  }
  return state.recorder;
}

// Called when an unlock is shown: the clip is centred on this moment.
function trigger({ game, achievement, dir } = {}) {
  const recorder = state.recorder;
  if (!recorder || (recorder.engine !== 'software' && !recorder.child)) return null;
  try {
    const folder = dir && String(dir).trim() ? String(dir).trim() : defaultDir();
    const file = souvenirPath({ game, achievement, dir: folder }, recorder.ext);
    if (recorder.engine === 'software') return sendToApp({ action: 'trigger', file }, recorder.deps.send) ? file : null;
    if (recorder.engine === 'gpu-screen-recorder') return recorder.replay.save(file);
    recorder.child.stdin.write(`clip 0 ${file}\n`);
    return file;
  } catch (err) {
    debug.warn(`[clip] ${err.message || err}`);
    return null;
  }
}

module.exports = { sync, stop, trigger, defaultDir, _state: state };
