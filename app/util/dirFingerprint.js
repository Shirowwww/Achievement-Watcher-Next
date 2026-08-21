'use strict';

/*
  "Has anything changed in the folders the last scan looked at?"

  The background new-install poll used to answer that by running the whole discovery again: a few
  hundred milliseconds of synchronous directory walking on the renderer's thread, every few minutes,
  for a library that had not changed. A directory's timestamp moves whenever an entry is added,
  removed or renamed inside it - which is exactly what installing a game does - so stat-ing the
  directories the walk already visited answers the same question for a fraction of the work.

  It is deliberately not a substitute for a real scan, and the caller still runs a full pass on a
  slower cadence. Two things are invisible here: sources that live in a database or the registry
  (Steam, GOG Galaxy, Ubisoft Connect), and a change made inside the same ~1ms timestamp tick as the
  capture, which lands on the identical mtime.
*/

const fs = require('fs');

function capture(dirs) {
  const entries = [];
  for (const dir of dirs || []) {
    try {
      entries.push([String(dir), fs.statSync(dir).mtimeMs]);
    } catch {
      // Gone already: nothing to compare it against next time.
    }
  }
  return entries;
}

// False as soon as one directory changed or disappeared, so the sweep stops at the first difference.
function matches(fingerprint) {
  if (!Array.isArray(fingerprint) || fingerprint.length === 0) return false;
  for (const [dir, mtimeMs] of fingerprint) {
    let current;
    try {
      current = fs.statSync(dir).mtimeMs;
    } catch {
      return false;
    }
    if (current !== mtimeMs) return false;
  }
  return true;
}

module.exports = { capture, matches };
