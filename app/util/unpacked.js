'use strict';

const fs = require('fs');

// A binary cannot be executed from inside app.asar, so electron-builder unpacks it beside the
// archive. The packaged path still points at the archive, hence this rewrite; in a dev run there is
// no archive and the path is already the real one.
function resolveUnpackedBinary(binPath) {
  const normalized = String(binPath || '');
  const unpacked = normalized.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  return fs.existsSync(unpacked) ? unpacked : normalized;
}

module.exports = { resolveUnpackedBinary };
