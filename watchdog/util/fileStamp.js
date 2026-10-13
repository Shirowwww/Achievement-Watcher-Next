'use strict';

const fs = require('fs');

/*
  What a write changes: modification time and size. A watch event also fires when only the access
  time moves, and NTFS flushes that about an hour after each read, so comparing stamps tells a
  settings save from the monitor's own read of the file coming back to it.
*/
function fileStamp(file) {
  try {
    const stat = fs.statSync(file);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

function sameStamp(a, b) {
  return !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size;
}

module.exports = { fileStamp, sameStamp };
