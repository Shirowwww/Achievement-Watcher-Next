'use strict';

const fs = require('fs');

// libuv aborts the process when a watched Windows path is in 8.3 form (RUNNER~1) and an event
// arrives under the long name, so a watcher is handed the long form.
function longPath(target) {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return target;
  }
}

module.exports = { longPath };
