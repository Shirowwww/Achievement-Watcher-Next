'use strict';

// Process listing for the playtime monitor and the "is the game running?" notification guard. The
// native ToolHelp snapshot (util/processSnapshot.js) is the fast path: ~6 ms against ~440 ms for a
// `tasklist.exe` round trip. `win-tasklist` is the fallback for machines where koffi can't load
// kernel32 - reached only after the native path throws once.

const snapshot = require('./processSnapshot.js');

let modulePromise;
let nativeBroken = false;

function loadWinTasklist() {
  modulePromise ||= import('win-tasklist');
  return modulePromise;
}

async function list() {
  if (!nativeBroken) {
    try {
      return snapshot.listSync();
    } catch {
      nativeBroken = true;
    }
  }
  const { default: tasklist } = await loadWinTasklist();
  return tasklist();
}

// Name-or-pid membership test, answered from the same snapshot instead of spawning `tasklist.exe`
// (runs on every achievement unlock). Deliberately membership, not liveness: win-tasklist's own
// isProcessRunning() filters on `STATUS eq RUNNING`, but tasklist.exe reports "Unknown" for ordinary
// console-session processes on some Windows builds - a false negative there would silently drop the
// unlock notification. Existence is also the right answer for a "Not Responding" game.
async function isProcessRunning(target, ...rest) {
  if (!nativeBroken && rest.length === 0) {
    try {
      const processes = snapshot.listSync();
      if (typeof target === 'number' || (typeof target === 'string' && target !== '' && !isNaN(target))) {
        const pid = Number(target);
        return processes.some((entry) => entry.pid === pid);
      }
      const name = String(target || '').toLowerCase();
      return name !== '' && processes.some((entry) => entry.process.toLowerCase() === name);
    } catch {
      nativeBroken = true;
    }
  }
  // hasProcess(), not isProcessRunning(): see above.
  const { hasProcess } = await loadWinTasklist();
  return hasProcess(target, ...rest);
}

// Whether the fast path is still the one being used. A silent fall back to win-tasklist restores
// ~440 ms of work every 3 s with no other symptom, so the playtime monitor logs this on startup.
function usingNativeSnapshot() {
  return !nativeBroken && snapshot.isAvailable();
}

module.exports = { list, isProcessRunning, getProcessPath: snapshot.getProcessPath, usingNativeSnapshot };
