'use strict';

/*
  "Has anything changed since the last scan?" Cheaper than rerunning full discovery: a directory's
  mtime moves on any add/remove/rename, exactly what installing a game does, so stat-ing the dirs
  the last walk visited answers the same question for a fraction of the work.

  Not a substitute for a real scan (caller still runs one on a slower cadence); blind to database/
  registry sources (Steam, GOG Galaxy, Ubisoft Connect) and to a change within the same ~1ms tick.

  An mtime also moves when nothing was added or removed (a file renamed over itself, a probe file
  come and gone: Steam does it in its library roots, AW to its caches after every scan), which made
  every check fail. So an entry keeps a key of the folder's names, and same names means unchanged;
  an entry without one (an older fingerprint) keeps the strict mtime test.
*/

const fs = require('fs');

// '/' cannot appear in a file name on either system, so it cannot fake a boundary between two names.
const NAME_SEPARATOR = 0x2f;

// Order-independent FNV-1a key of a folder's entry names, only ever compared with another such key.
function namesKey(names) {
  let hash = 0x811c9dc5;
  for (const name of Array.from(names).sort()) {
    for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 0x01000193);
    hash = Math.imul(hash ^ NAME_SEPARATOR, 0x01000193);
  }
  return `${names.length}:${(hash >>> 0).toString(16)}`;
}

function currentNamesKey(dir) {
  try {
    return namesKey(fs.readdirSync(dir));
  } catch {
    return null;
  }
}

/*
  [dir, mtimeMs, namesKey] for each readable folder. `namesOf(dir)` returns the key of the names a
  walk already read there, which is what the scan saw; a folder it does not know is listed now.
*/
function capture(dirs, namesOf = () => undefined) {
  const entries = [];
  for (const dir of dirs || []) {
    try {
      const mtimeMs = fs.statSync(dir).mtimeMs;
      const names = namesOf(String(dir)) || currentNamesKey(dir);
      entries.push(names ? [String(dir), mtimeMs, names] : [String(dir), mtimeMs]);
    } catch {
      // Gone already: nothing to compare it against next time.
    }
  }
  return entries;
}

function entryUnchanged([dir, mtimeMs, names]) {
  let current;
  try {
    current = fs.statSync(dir).mtimeMs;
  } catch {
    return false;
  }
  if (current === mtimeMs) return true;
  return typeof names === 'string' && currentNamesKey(dir) === names;
}

// False as soon as one directory changed or disappeared, so the sweep stops at the first difference.
function matches(fingerprint) {
  if (!Array.isArray(fingerprint) || fingerprint.length === 0) return false;
  return fingerprint.every(entryUnchanged);
}

async function entryUnchangedAsync([dir, mtimeMs, names]) {
  try {
    if ((await fs.promises.stat(dir)).mtimeMs === mtimeMs) return true;
    return typeof names === 'string' && namesKey(await fs.promises.readdir(dir)) === names;
  } catch {
    return false;
  }
}

// matches() off the calling thread, for a window or a tray that must not stall on thousands of stats.
async function matchesAsync(fingerprint, batchSize = 64) {
  if (!Array.isArray(fingerprint) || fingerprint.length === 0) return false;
  for (let start = 0; start < fingerprint.length; start += batchSize) {
    const batch = fingerprint.slice(start, start + batchSize);
    if ((await Promise.all(batch.map(entryUnchangedAsync))).includes(false)) return false;
  }
  return true;
}

// An independent copy that keeps every field of each entry.
const copy = (fingerprint) => fingerprint.map((entry) => entry.slice());

module.exports = { capture, matches, matchesAsync, entryUnchanged, copy, namesKey };
