'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveUnpackedBinary } = require('../../app/util/unpacked.js');

// The packaged path points into app.asar with the platform's own separator: a backslash on Windows,
// where a slash also works, a slash on Linux, where a backslash is just a character of a file name.
const SEPARATORS = process.platform === 'win32' ? ['\\', '/'] : ['/'];

test('a binary inside app.asar resolves to app.asar.unpacked with the platform separators', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-unpacked-'));
  try {
    const real = path.join(root, 'app.asar.unpacked', 'node_modules', '7zip-bin', '7za');
    fs.mkdirSync(path.dirname(real), { recursive: true });
    fs.writeFileSync(real, '');
    for (const sep of SEPARATORS) {
      const packaged = [root, 'app.asar', 'node_modules', '7zip-bin', '7za'].join(sep);
      const expected = [root, 'app.asar.unpacked', 'node_modules', '7zip-bin', '7za'].join(sep);
      assert.equal(resolveUnpackedBinary(packaged), expected, `separator ${sep}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a path outside any archive is returned as it is', () => {
  assert.equal(resolveUnpackedBinary('/opt/tool/7za'), '/opt/tool/7za');
});
