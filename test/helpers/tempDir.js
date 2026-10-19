'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/*
  node --test runs each file in its own process, so removing at exit cleans up at the end of the
  file, whether the directory was made at load time or in a test, and whether that test passed.
*/

const created = new Set();

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.add(dir);
  return dir;
}

process.on('exit', () => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

module.exports = { makeTempDir };
