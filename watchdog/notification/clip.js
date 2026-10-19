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
const clipPart = require('./clipPart.js');

const HELPER_NAME = 'aw-next-clip.exe';
const MAX_RESTARTS = 5;
// Each restart waits twice as long as the one before, up to a minute.
const RESTART_DELAY_MS = 5000;
const RESTART_DELAY_MAX_MS = 60000;
// Long enough for the after-unlock half of the longest clip to be recorded and written.
const QUIT_TIMEOUT_MS = 30000;
// A clip being written is not cut short by a kill, unless its writing has hung this long.
const WRITE_GRACE_MS = 60000;
const KILL_RETRY_MS = 1000;
// The recorder prints a stats line every few seconds while its capture loop turns. The first one
// may come late: a fresh executable is scanned by the antivirus before it runs.
const STALL_MS = 15000;
const STARTUP_GRACE_MS = 30000;
const WATCH_INTERVAL_MS = 5000;
// A recorder that stayed up this long gets its restarts back.
const STABLE_MS = 120000;
const STATS_LOG_MS = 60000;
// Exit codes of aw-next-clip.exe that a restart cannot fix: bad arguments, no Media Foundation,
// no usable encoder.
const UNSUPPORTED_EXITS = [2, 3, 4];

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

function clockOf(recorder) {
  return (recorder.deps && recorder.deps.now) || Date.now;
}

// Killing the recorder now would leave the clip it is writing unreadable, unless that write hung.
function writingClip(recorder) {
  return !!recorder.writing && clockOf(recorder)() - recorder.writing.since < WRITE_GRACE_MS;
}

function clipParts(recorder) {
  return (recorder.deps && recorder.deps.clipPart) || clipPart;
}

function clipFolder(dir) {
  const folder = dir ? String(dir).trim() : '';
  return folder || defaultDir();
}

// Only the capture loop prints `ready` and `stats` (a log line can come from any thread), so only
// they prove it is turning.
function handleLine(line, recorder) {
  const [kind] = line.split(' ', 1);
  const now = clockOf(recorder)();
  if (kind === 'stats' || kind === 'ready') {
    recorder.lastSign = now;
    recorder.signs += 1;
  }
  // Each write ends with exactly one of saved, saved-partial or error write-failed.
  if (kind === 'saved' || kind === 'saved-partial' || line.startsWith('error write-failed')) recorder.writing = null;
  if (kind === 'stats') {
    recorder.lastStats = line;
    if (now - recorder.statsLoggedAt >= STATS_LOG_MS) {
      recorder.statsLoggedAt = now;
      debug.log(`[clip] ${line}`);
    }
  } else if (kind === 'writing') recorder.writing = { file: line.slice('writing '.length), since: now };
  else if (kind === 'saved') debug.log(`[clip] saved ${line.slice(6)}`);
  else if (kind === 'saved-partial') debug.warn(`[clip] clip cut short, kept what plays: ${line.slice(14)}`);
  else if (kind === 'merged') debug.log(`[clip] unlock joined the clip ${line.slice(7)}`);
  else if (kind === 'fallback') debug.warn(`[clip] ${line}`);
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
  // A command written to a recorder that just died fails with EPIPE; its exit handler deals with it.
  if (child.stdin && typeof child.stdin.on === 'function') child.stdin.on('error', () => {});
  child.on('error', (err) => debug.warn(`[clip] recorder failed to start: ${err.message || err}`));
  child.on('exit', (code) => onExit(recorder, child, code));
  if (recorder.engine === 'aw-next-clip') superviseRecorder(recorder, child);
  debug.log(`[clip] recorder started for pid ${recorder.pid}: ${recorder.args.join(' ')}`);
}

function restartDelay(restarts) {
  return Math.min(RESTART_DELAY_MS * 2 ** restarts, RESTART_DELAY_MAX_MS);
}

// A recorder that stops printing is stuck (a driver call that never returns, a device that went
// away): it is killed, and the exit handler restarts it like any other death.
function superviseRecorder(recorder, child) {
  const now = clockOf(recorder);
  recorder.launchedAt = now();
  recorder.lastSign = recorder.launchedAt;
  recorder.signs = 0;
  clearInterval(recorder.watcher);
  recorder.watcher = setInterval(() => {
    if (recorder.child !== child || recorder.stopping) return;
    const silent = now() - recorder.lastSign;
    if (silent > (recorder.signs === 0 ? STARTUP_GRACE_MS : STALL_MS) && !writingClip(recorder)) {
      debug.warn(`[clip] recorder silent for ${Math.round(silent / 1000)} s, killing it`);
      recorder.hung = true;
      try {
        child.kill();
      } catch {
        /* already exited */
      }
    } else if (recorder.restarts > 0 && now() - recorder.launchedAt >= STABLE_MS) {
      recorder.restarts = 0;
    }
  }, WATCH_INTERVAL_MS);
  if (typeof recorder.watcher.unref === 'function') recorder.watcher.unref();
}

function onExit(recorder, child, code) {
  if (recorder.child !== child) return;
  recorder.child = null;
  clearInterval(recorder.watcher);
  // Gone in the middle of a write: nothing will finish that file, so it is settled now.
  if (recorder.writing) {
    void clipParts(recorder).settlePart(`${recorder.writing.file}${clipPart.PART}`);
    recorder.writing = null;
  }
  const hung = recorder.hung;
  recorder.hung = false;
  if (recorder.lastStats) debug.log(`[clip] last report: ${recorder.lastStats}`);
  if (recorder.stopping || state.unsupportedKey === recorder.key) return;
  if (!hung && UNSUPPORTED_EXITS.includes(code) && recorder.engine === 'aw-next-clip') {
    debug.warn(`[clip] recorder cannot run here (exit ${code}); not restarted until the settings change`);
    state.unsupportedKey = recorder.key;
    return;
  }
  const what = hung ? 'was stuck' : `exited (${code})`;
  if (recorder.restarts >= MAX_RESTARTS) {
    debug.warn(`[clip] recorder ${what} and was not restarted again for this game`);
    return;
  }
  const delay = restartDelay(recorder.restarts);
  recorder.restarts += 1;
  debug.warn(`[clip] recorder ${what}, restarting in ${delay / 1000} s`);
  recorder.timer = setTimeout(() => {
    if (state.recorder === recorder && !recorder.stopping) launch(recorder);
  }, delay);
  if (typeof recorder.timer.unref === 'function') recorder.timer.unref();
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
  // Finishing the pending clips can take a while without a report; only the quit timeout applies.
  clearInterval(recorder.watcher);
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
  let killer;
  const killUnlessWriting = (delay) => {
    killer = setTimeout(() => {
      if (writingClip(recorder)) return killUnlessWriting(KILL_RETRY_MS);
      try {
        child.kill();
      } catch {}
    }, delay);
    if (typeof killer.unref === 'function') killer.unref();
  };
  killUnlessWriting(QUIT_TIMEOUT_MS);
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
  state.recorder = { ...plan, pid, deps, restarts: 0, child: null, stopping: false, timer: null, watcher: null, hung: false, signs: 0, lastSign: 0, lastStats: '', statsLoggedAt: -Infinity };
  if (plan.engine === 'software') {
    sendToApp({ action: 'start', settings: plan.clip }, deps.send);
    debug.log(`[clip] software recorder asked of the app for pid ${pid}`);
  } else {
    launch(state.recorder);
  }
  // A recorder killed with the PC or the Watchdog could not settle its last clip itself.
  if (plan.engine === 'aw-next-clip') void clipParts(state.recorder).settleLeftovers(clipFolder(souvenir.clipDir));
  return state.recorder;
}

// Called when an unlock is shown: the clip is centred on this moment.
function trigger({ game, achievement, dir } = {}) {
  const recorder = state.recorder;
  if (!recorder || (recorder.engine !== 'software' && !recorder.child)) return null;
  try {
    const file = souvenirPath({ game, achievement, dir: clipFolder(dir) }, recorder.ext);
    if (recorder.engine === 'software') return sendToApp({ action: 'trigger', file }, recorder.deps.send) ? file : null;
    if (recorder.engine === 'gpu-screen-recorder') return recorder.replay.save(file);
    recorder.child.stdin.write(`clip 0 ${file}\n`);
    return file;
  } catch (err) {
    debug.warn(`[clip] ${err.message || err}`);
    return null;
  }
}

module.exports = { sync, stop, trigger, defaultDir, restartDelay, _state: state };
