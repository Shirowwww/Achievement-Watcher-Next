'use strict';

/*
  The save folders saved in Settings (cfg/userdir.db), read one way by the library (userDir.js) and
  the Watchdog (monitor.js, console/watcherKit.js). Kept apart from userDir.js so the Watchdog does
  not load the folder discovery with it.

  `notify` is not a choice: Settings shows no switch for it and writes true on every save, so a row
  without it (a bare string, a hand-edited row) is watched like any other. `enabled: false` is the
  only way a saved folder is left out.
*/

const fs = require('fs');
const path = require('path');

const USER_DIR_FILE = 'cfg/userdir.db';

function userDirFile(userDataPath) {
  return path.join(userDataPath, USER_DIR_FILE);
}

// One row per folder: { path (resolved), notify: true, origin, enabled, ... }; rows with no path are dropped.
function parseUserDirEntries(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => (typeof entry === 'string' ? { path: entry } : entry))
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.path === 'string' && entry.path)
    .map((entry) => ({
      ...entry,
      // A path written with the wrong slash style (a fixed fast-glob bug, or a hand-typed entry)
      // never matches the native-separator paths the rest of the scan compares against.
      path: path.resolve(entry.path),
      notify: true,
      origin: entry.origin === 'auto' ? 'auto' : 'manual',
      enabled: entry.enabled !== false,
    }));
}

// The rows of one file, or [] when it is missing or unreadable (the Watchdog never repairs it).
function readUserDirEntries(file) {
  try {
    return parseUserDirEntries(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return [];
  }
}

module.exports = { USER_DIR_FILE, userDirFile, parseUserDirEntries, readUserDirEntries };
