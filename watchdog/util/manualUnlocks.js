'use strict';

/*
  The achievements the user marked unlocked by hand in the library: cfg/manual-unlocks.json, written
  by app/parser/manualUnlock.js, keyed "<appid>::<source>" then by achievement name. Read only.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');

const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;

function readMap() {
  const file = path.join(userDataDir(), 'cfg', 'manual-unlocks.json');
  try {
    if (fs.statSync(file).size > MAX_SIDECAR_BYTES) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Whether `name` of `appid` is marked unlocked under any source: the library and the Watchdog can
// name one game's source differently (a Uplay game read from GSE Saves).
function isManuallyUnlocked(appid, name) {
  if (appid == null || name == null || String(appid) === '') return false;
  const prefix = `${String(appid)}::`;
  const wanted = String(name);
  return Object.entries(readMap()).some(([key, entries]) => key.startsWith(prefix) && entries && typeof entries === 'object' && Object.hasOwn(entries, wanted));
}

module.exports = { isManuallyUnlocked };
