'use strict';

const path = require('path');
const { forkNode, unpackedPath } = require('./nodeProcess.js');

const WORKER_FILE = unpackedPath(path.join(__dirname, '..', 'parser', 'scanWorker.js'));
// A host that keeps dying is not worth restarting forever: after this many deaths in a row the
// scans stay in this process for the rest of the session, as they did before the host existed.
const MAX_CONSECUTIVE_DEATHS = 3;
const LOGGER_LINE = /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\]/;

function hostGone(reason) {
  return Object.assign(new Error(`scan host unavailable: ${reason}`), { code: 'SCAN_HOST_GONE' });
}

function toError(fields) {
  return Object.assign(new Error((fields && fields.message) || 'scan failed'), fields && fields.code ? { code: fields.code } : {});
}

function errorFields(err) {
  return { message: String((err && err.message) || err), code: err && err.code };
}

/*
  The caller's side of parser/scanWorker.js: the same scan functions parser/achievements.js
  exposes, run in that process instead. Every call falls back to achievements.js loaded in this
  process when the host cannot be started or dies under it, so a broken host costs fluidity, never
  the library.

  options:
    local         parser/achievements.js as loaded here, or a function returning it (the main
                  process loads the parser only when it has to) - the fallback, and the handlers
                  the host's events are answered with
    userDataPath  the app data folder (AW_USER_DATA for the host)
    secret()      the installation key for the host's AW_SECRET, read only when it starts
    invoke(channel, ...args) / send(channel, ...args)
                  how a relayed IPC call reaches the main process; null where nothing can (the
                  main process itself), which the host's parsers already treat as "no answer"
    idleMs        stop the host after this long without a call, once its background work is done;
                  0 keeps it for as long as this process lives
*/
function createScanHost({ local, userDataPath, isDev = false, secret = () => '', invoke = null, send = null, log = () => {}, idleMs = 0, workerFile = WORKER_FILE }) {
  const localModule = () => (typeof local === 'function' ? local() : local);
  let child = null;
  let deaths = 0;
  let nextId = 0;
  let idleTimer = null;
  const calls = new Map();
  // Handed to every new host (and to the local fallback), so a restart does not cost the
  // background poll its cheap check.
  let fingerprint = null;

  function reply(proc, id, work) {
    Promise.resolve()
      .then(work)
      .then(
        (value) => proc.connected && proc.send({ type: 'reply', id, ok: true, value }),
        (err) => proc.connected && proc.send({ type: 'reply', id, ok: false, error: errorFields(err) })
      )
      .catch((err) => log(`[scan-host] reply ${id} failed => ${err}`));
  }

  function answerEvent(name, args) {
    const handlers = localModule().hostEventHandlers || {};
    if (typeof handlers[name] !== 'function') return undefined;
    return handlers[name](...(name === 'packageBlocked' ? [toError(args[0])] : args));
  }

  function onMessage(proc, message) {
    if (!message || typeof message !== 'object') return;
    const call = calls.get(message.id);
    switch (message.type) {
      case 'result':
        if (!call) return;
        calls.delete(message.id);
        if (message.ok) call.resolve(message.value);
        else call.reject(toError(message.error));
        return;
      case 'game':
        if (call && call.onGame) call.onGame(message.game);
        return;
      case 'progress':
        if (call && call.onProgress) call.onProgress(message.percent, message.total);
        return;
      case 'ipc':
        reply(proc, message.id, () => {
          if (typeof invoke !== 'function') throw new Error(`IPC channel ${message.channel} is unreachable from the scan host`);
          return invoke(message.channel, ...(message.args || []));
        });
        return;
      case 'ipc-send':
        if (typeof send === 'function') send(message.channel, ...(message.args || []));
        return;
      case 'event':
        reply(proc, message.id, () => answerEvent(message.name, message.args || []));
        return;
      default:
    }
  }

  function rejectAll(reason) {
    for (const call of calls.values()) call.reject(hostGone(reason));
    calls.clear();
  }

  function onExit(proc, reason) {
    if (child !== proc) return;
    child = null;
    clearTimeout(idleTimer);
    deaths += 1;
    log(`[scan-host] stopped (${reason})${deaths >= MAX_CONSECUTIVE_DEATHS ? ' - scanning in this process from now on' : ''}`);
    rejectAll(reason);
  }

  function stop() {
    const proc = child;
    child = null;
    clearTimeout(idleTimer);
    rejectAll('stopped');
    if (proc && proc.exitCode === null) proc.kill();
  }

  // Asks the host itself, because an emulator setup a scan started keeps writing after the call
  // that started it has returned.
  function scheduleIdleStop() {
    clearTimeout(idleTimer);
    if (!(idleMs > 0) || !child || calls.size > 0) return;
    idleTimer = setTimeout(() => {
      remote('backgroundWorkPending', [], {}, false)
        .then((busy) => {
          if (busy) scheduleIdleStop();
          else if (calls.size === 0) stop();
        })
        .catch(() => {});
    }, idleMs);
    if (typeof idleTimer.unref === 'function') idleTimer.unref();
  }

  function start() {
    if (child) return child;
    if (deaths >= MAX_CONSECUTIVE_DEATHS) throw hostGone('disabled after repeated failures');
    let proc;
    try {
      proc = forkNode(workerFile, {
        // More libuv threads than the default 4: the read-ahead lists thousands of folders at once.
        env: { AW_USER_DATA: userDataPath || '', AW_SECRET: secret() || '', AW_SCAN_DEV: isDev ? '1' : '', UV_THREADPOOL_SIZE: '16' },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
    } catch (err) {
      deaths += 1;
      throw hostGone(err && err.message);
    }
    child = proc;
    proc.on('message', (message) => onMessage(proc, message));
    proc.on('error', (err) => onExit(proc, String((err && err.message) || err)));
    proc.on('exit', (code, signal) => onExit(proc, signal ? `signal ${signal}` : `exit ${code}`));
    if (proc.stderr) {
      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (text) => {
        // A timestamped line is the parser's own logger echoing to the console in a dev run: it is
        // in parser.log already. What is left is a crash, which nothing else would record.
        for (const line of String(text).split(/\r?\n/)) if (line.trim() && !LOGGER_LINE.test(line)) log(`[scan-host] ${line}`);
      });
    }
    if (fingerprint) proc.send({ type: 'call', id: ++nextId, method: 'restoreScanFingerprint', args: [fingerprint] });
    return proc;
  }

  function remote(method, args, streams = {}, keepsAlive = true) {
    let proc;
    try {
      proc = start();
    } catch (err) {
      return Promise.reject(err);
    }
    if (keepsAlive) clearTimeout(idleTimer);
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      calls.set(id, { resolve, reject, ...streams });
      try {
        proc.send({ type: 'call', id, method, args });
      } catch (err) {
        calls.delete(id);
        reject(hostGone(err && err.message));
      }
    }).then(
      (value) => {
        deaths = 0;
        if (keepsAlive) scheduleIdleStop();
        return value;
      },
      (err) => {
        if (keepsAlive) scheduleIdleStop();
        throw err;
      }
    );
  }

  // The host's answer, or the same call made here when the host is not there to give one.
  async function withFallback(method, args, runLocally) {
    try {
      return await remote(method, args);
    } catch (err) {
      if (!err || err.code !== 'SCAN_HOST_GONE') throw err;
      log(`[scan-host] ${method} runs in this process: ${err.message}`);
      return runLocally(localModule());
    }
  }

  /*
    Resolves to { list, fingerprint, discoveredAppids }. The list is rebuilt from the games as they
    were streamed, in the order the host pushed them, so it is the same array makeList returns.
  */
  async function makeList(option, onProgress = () => {}, onGame = () => {}) {
    const list = [];
    try {
      const result = await remote('makeList', [option], {
        onProgress,
        onGame: (game) => {
          list.push(game);
          onGame(game);
        },
      });
      if (result.count !== list.length) log(`[scan-host] makeList reported ${result.count} game(s) but streamed ${list.length}`);
      fingerprint = result.fingerprint || null;
      return { list, fingerprint: result.fingerprint, discoveredAppids: result.discoveredAppids };
    } catch (err) {
      if (!err || err.code !== 'SCAN_HOST_GONE') throw err;
      log(`[scan-host] makeList runs in this process: ${err.message}`);
      const parser = localModule();
      const localList = await parser.makeList(option, onProgress, onGame);
      fingerprint = parser.getScanFingerprint();
      return { list: localList, fingerprint, discoveredAppids: parser.getDiscoveredAppids() };
    }
  }

  // The games a reused library left undescribed, loaded again; resolves to them as they streamed.
  async function reloadGames(option, records, onGame = () => {}) {
    const games = [];
    const collect = (game) => {
      games.push(game);
      onGame(game);
    };
    try {
      await remote('reloadGames', [option, records], { onGame: collect });
      return games;
    } catch (err) {
      if (!err || err.code !== 'SCAN_HOST_GONE') throw err;
      log(`[scan-host] reloadGames runs in this process: ${err.message}`);
      games.length = 0;
      await localModule().reloadGames(option, records, collect);
      return games;
    }
  }

  return {
    makeList,
    reloadGames,
    detectInstalledAppids: (option) => withFallback('detectInstalledAppids', [option], (parser) => parser.detectInstalledAppids(option)),
    discoveryInputsUnchanged: () =>
      withFallback('discoveryInputsUnchanged', [], (parser) => {
        if (fingerprint) parser.restoreScanFingerprint(fingerprint);
        return parser.discoveryInputsUnchanged();
      }),
    scanInputsUnchanged: (stored) => withFallback('scanInputsUnchanged', [stored], (parser) => parser.scanInputsUnchanged(stored)),
    // Only the fields exeList.reconcile reads cross over, not every game's achievement list.
    reconcileExeList(games) {
      const slim = (games || []).map((game) => ({
        appid: game && game.appid,
        name: game && game.name,
        gameDir: game && game.gameDir,
        exe: game && game.exe,
        exeConfident: game && game.exeConfident,
      }));
      return withFallback('reconcileExeList', [slim], () => require('../parser/exeList.js').reconcile(slim));
    },
    // A host started later (or the local fallback) begins from it too.
    restoreScanFingerprint(stored) {
      if (!stored || !Array.isArray(stored.dirs) || stored.dirs.length === 0) return false;
      fingerprint = stored;
      if (child) remote('restoreScanFingerprint', [stored]).catch(() => {});
      return true;
    },
    // Null when the host cannot answer: the caller then walks the folder itself.
    probeGameFolder(gameDir, launchArgs = '') {
      return remote('probeGameFolder', [{ gameDir, launchArgs }]).catch(() => null);
    },
    // The folders a stored library was built from, so the rebuild can list them in parallel first.
    hintScanFolders(stored) {
      if (!stored || !Array.isArray(stored.dirs) || stored.dirs.length === 0) return;
      remote('hintScanFolders', [stored]).catch(() => localModule().hintScanFolders(stored));
    },
    forgetScanCaches() {
      fingerprint = null;
      if (child) remote('forgetScanCaches', []).catch((err) => log(`[scan-host] forgetScanCaches failed => ${err.message}`));
    },
    // Starts the host ahead of the first call, so its module loading overlaps the caller's own.
    warm() {
      try {
        start();
        scheduleIdleStop();
      } catch (err) {
        log(`[scan-host] could not start => ${err.message}`);
      }
    },
    dispose: stop,
  };
}

module.exports = { createScanHost, WORKER_FILE, MAX_CONSECUTIVE_DEATHS };
