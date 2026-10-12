'use strict';

const fs = require('fs');

// A binary cannot be executed from inside app.asar, so electron-builder unpacks it beside the
// archive. The packaged path still points at the archive, hence this rewrite; in a dev run there is
// no archive and the path is already the real one.
function resolveUnpackedBinary(binPath) {
  const normalized = String(binPath || '');
  const unpacked = normalized.replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
  return fs.existsSync(unpacked) ? unpacked : normalized;
}

// Off Windows a file runs only with its exec bit, which `npm ci` and archive extraction can drop.
function ensureExecutable(file) {
  if (process.platform === 'win32') return;
  try {
    fs.accessSync(file, fs.constants.X_OK);
  } catch {
    fs.chmodSync(file, 0o755);
  }
}

// The bundled 7za, ready to run.
function sevenZipBin() {
  const bin = resolveUnpackedBinary(require('7zip-bin').path7za);
  if (!fs.existsSync(bin)) throw new Error(`7za not found at "${bin}"`);
  ensureExecutable(bin);
  return bin;
}

module.exports = { resolveUnpackedBinary, ensureExecutable, sevenZipBin };
