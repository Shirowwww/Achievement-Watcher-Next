'use strict';

/*
  The library scan, in a process of its own. Discovery and the per-game loads read thousands of
  folders and files synchronously; run in the window they froze it for seconds on every scan (20 s
  on a cold disk). Started by util/scanHost.js through nodeProcess.forkNode, and kept alive for as
  long as the process that started it, so its caches (discovery, folder walks, schemas) survive
  between the startup scan and the background new-install checks.

  Protocol, over the fork IPC channel (structured clone):
    in   { type: 'call', id, method, args }           -> out { type: 'result', id, ok, value | error }
    out  { type: 'game' | 'progress', id, ... }        streamed during makeList
    out  { type: 'ipc', id, channel, args }            -> in  { type: 'reply', id, ok, value | error }
    out  { type: 'ipc-send', channel, args }
    out  { type: 'event', id, name, args }             -> in  { type: 'reply', id, ok, value | error }
*/

const path = require('path');

// This file ships unpacked from the asar; everything it loads is only inside it (the reverse of
// nodeProcess.unpackedPath, inlined so that nothing else has to be unpacked).
const appRoot = path.join(__dirname, '..', path.sep).replace(`${path.sep}app.asar.unpacked${path.sep}`, `${path.sep}app.asar${path.sep}`);
const load = (rel) => require(path.join(appRoot, rel));

let nextId = 0;
const pending = new Map();

function post(message) {
  if (process.connected) process.send(message);
}

function request(type, fields) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    post({ type, id, ...fields });
  });
}

function errorOf(err) {
  return { message: String((err && err.message) || err), code: err && err.code };
}

function toError(fields) {
  return Object.assign(new Error((fields && fields.message) || 'scan host request failed'), fields && fields.code ? { code: fields.code } : {});
}

load('util/ipcInvoke.js').setRelay({
  invoke: (channel, ...args) => request('ipc', { channel, args }),
  send: (channel, ...args) => post({ type: 'ipc-send', channel, args }),
});

let achievements = null;

function parser() {
  if (achievements) return achievements;
  achievements = load('parser/achievements.js');
  achievements.initDebug({ isDev: process.env.AW_SCAN_DEV === '1', userDataPath: process.env.AW_USER_DATA });
  const notify = (name, ...args) => request('event', { name, args });
  achievements.setEmulatorFixedHandler((game) => notify('emulatorFixed', game).catch(() => {}));
  achievements.onEmulatorPackageBlocked((err) => notify('packageBlocked', errorOf(err)).catch(() => {}));
  achievements.onAutomaticEmulatorFixStarting(() => notify('automaticFixStarting'));
  return achievements;
}

const methods = {
  // The games go out one by one as they load; the reply only says how the scan ended, so the list
  // is not cloned a second time.
  async makeList(id, option) {
    const list = await parser().makeList(
      option,
      (percent, total) => post({ type: 'progress', id, percent, total }),
      (game) => post({ type: 'game', id, game })
    );
    return {
      count: Array.isArray(list) ? list.length : 0,
      fingerprint: parser().getScanFingerprint(),
      discoveredAppids: parser().getDiscoveredAppids(),
    };
  },
  detectInstalledAppids: (id, option) => parser().detectInstalledAppids(option),
  discoveryInputsUnchanged: () => parser().discoveryInputsUnchanged(),
  scanInputsUnchanged: (id, fingerprint) => parser().scanInputsUnchanged(fingerprint),
  restoreScanFingerprint: (id, fingerprint) => parser().restoreScanFingerprint(fingerprint),
  hintScanFolders: (id, fingerprint) => parser().hintScanFolders(fingerprint),
  backgroundWorkPending: () => Boolean(achievements && achievements.backgroundWorkPending()),
  // The folder walks behind a game's health dot, the slowest part of that report. Read-only; each
  // answer carries its own error so the window can redo just that one.
  probeGameFolder(id, { gameDir, launchArgs }) {
    parser();
    // A scan here may be waiting inside its folder memo (dirCache) right now: these walks would be
    // served its listings and, worse, add a game's subfolders to the folders the scan says it read.
    // Answer "busy" instead, and the window walks the folder itself, where no memo is open.
    if (load('util/dirCache.js').isActive()) {
      const busy = { error: 'a scan is running in the scan host' };
      return { crackLoader: busy, emulator: busy, nemirtingasEpic: busy };
    }
    const attempt = (read) => {
      try {
        return { value: read() };
      } catch (err) {
        return { error: String((err && err.message) || err) };
      }
    };
    return {
      crackLoader: attempt(() => load('util/crackLoaderDetect.js').detectWorkingCrackLoader(gameDir)),
      emulator: attempt(() => load('parser/goldberg.js').detectEmulator(gameDir)),
      nemirtingasEpic: attempt(() => load('util/nemirtingasEpic.js').diagnose({ gameDir, launchArgs })),
    };
  },
  // Re-detects launch executables in the install folders: as much disk work as the scan itself.
  reconcileExeList: (id, games) => load('parser/exeList.js').reconcile(games),
  // The same caches a manual refresh clears in the window, held here now.
  forgetScanCaches() {
    parser().forgetInstallScanCache();
    const steam = load('parser/steam.js');
    steam.forgetUnresolved();
    steam.forgetAppSearches();
    steam.forgetLocalSchemaLocations();
  },
};

process.on('message', async (message) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'reply') {
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.ok) waiting.resolve(message.value);
    else waiting.reject(toError(message.error));
    return;
  }
  if (message.type !== 'call') return;
  const method = Object.prototype.hasOwnProperty.call(methods, message.method) ? methods[message.method] : null;
  try {
    if (!method) throw new Error(`unknown scan host method ${message.method}`);
    const value = await method(message.id, ...(Array.isArray(message.args) ? message.args : []));
    post({ type: 'result', id: message.id, ok: true, value });
  } catch (err) {
    post({ type: 'result', id: message.id, ok: false, error: errorOf(err) });
  }
});

// The window (or the main process) that started this is gone: nothing is left to scan for.
process.on('disconnect', () => process.exit(0));
