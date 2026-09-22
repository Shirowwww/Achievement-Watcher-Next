'use strict';

/*
  node-watch probes for recursive support by watching a folder under os.tmpdir(), read once when it
  loads. With TEMP in 8.3 form (C:\Users\JEAN-P~1\...) libuv aborts the whole process on that
  probe's first event, so hand it the long form before it loads.
*/
const fs = require('fs');

if (process.platform === 'win32') {
  for (const key of ['TEMP', 'TMP']) {
    const value = process.env[key];
    if (!value || !value.includes('~')) continue;
    try {
      process.env[key] = fs.realpathSync.native(value);
    } catch {
      /* missing folder: leave it to node-watch */
    }
  }
}

module.exports = require('node-watch');
