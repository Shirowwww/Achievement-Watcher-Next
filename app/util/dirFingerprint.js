'use strict';

/*
  "Has anything changed since the last scan?" Cheaper than rerunning full discovery: a directory's
  mtime moves on any add/remove/rename, exactly what installing a game does, so stat-ing the dirs
  the last walk visited answers the same question for a fraction of the work.

  Not a substitute for a real scan (caller still runs one on a slower cadence); blind to database/
  registry sources (Steam, GOG Galaxy, Ubisoft Connect) and to a change within the same ~1ms tick.
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
