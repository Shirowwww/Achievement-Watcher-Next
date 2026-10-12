'use strict';

const fs = require('fs');
const path = require('path');

/*
  A save root that did not exist when watching started is created by the game itself, usually by the
  very write that holds its first unlock. By the time the root is noticed and watched, that write is
  over and no event will ever report it, so the files already in the root are read once, as changes
  made since the root was found missing.
*/

function matchesRoot(file, { file: names, filter } = {}) {
  if (Array.isArray(names) && !names.some((name) => name.toLowerCase() === path.basename(file).toLowerCase())) return false;
  if (filter instanceof RegExp) return filter.test(file);
  if (typeof filter === 'function') return Boolean(filter(file));
  return true;
}

// The save files under `dir` this root's watcher would have reported, written at or after `since` (ms).
function catchUpFiles(dir, options = {}, since = 0) {
  const found = [];
  const walk = (folder) => {
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (options.recursive) walk(full);
        continue;
      }
      if (!entry.isFile() || !matchesRoot(full, options)) continue;
      try {
        if (fs.statSync(full).mtimeMs >= since) found.push(full);
      } catch {
        /* removed meanwhile */
      }
    }
  };
  walk(dir);
  return found.sort();
}

// An unlock recorded since the root was found missing, which the normal "just now" window would drop.
function unlockedSince(unlockTimeSeconds, since) {
  return Boolean(since) && Number(unlockTimeSeconds) * 1000 >= since;
}

module.exports = { catchUpFiles, unlockedSince };
