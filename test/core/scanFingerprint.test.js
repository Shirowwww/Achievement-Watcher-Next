'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scanFingerprint = require('../../app/util/scanFingerprint.js');

function workspace(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aw-scan-fingerprint-${name}-`));
}

// The file mtimes this test compares are only worth anything if a rewrite moves them, and a fast
// machine can rewrite twice inside one filesystem tick. Stamping the time explicitly removes that.
function writeFile(file, content, mtimeSeconds) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  fs.utimesSync(file, mtimeSeconds, mtimeSeconds);
}

test('a library nothing has touched still matches its fingerprint', () => {
  const root = workspace('stable');
  const save = path.join(root, 'saves', '480');
  writeFile(path.join(save, 'achievements.json'), '{}', 1000);

  const fingerprint = scanFingerprint.capture({ dirs: [root], files: [save] });
  assert.ok(scanFingerprint.size(fingerprint) > 0);
  assert.equal(scanFingerprint.matches(fingerprint), true);
});

test('an unlock written into an existing save file is a change', () => {
  const root = workspace('unlock');
  const file = path.join(root, 'saves', '480', 'achievements.json');
  writeFile(file, '{}', 1000);

  const fingerprint = scanFingerprint.capture({ dirs: [root], files: [file] });
  writeFile(file, '{"FIRST":{"earned":true}}', 2000);

  assert.equal(scanFingerprint.matches(fingerprint), false);
});

test('the first unlock of a game that had no save file at all is a change', () => {
  const root = workspace('firstunlock');
  const file = path.join(root, 'saves', '480', 'achievements.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });

  // Recorded as missing, not skipped: a file that appears later has to read as a change.
  const fingerprint = scanFingerprint.capture({ dirs: [root], files: [file] });
  assert.deepEqual(
    fingerprint.files.map(([, mtime]) => mtime),
    [scanFingerprint.MISSING]
  );

  writeFile(file, '{}', 2000);
  assert.equal(scanFingerprint.matches(fingerprint), false);
});

test('a directory-shaped data path covers the save files inside it', () => {
  const root = workspace('directory');
  const save = path.join(root, 'saves', '480');
  writeFile(path.join(save, 'achievements.json'), '{}', 1000);

  const fingerprint = scanFingerprint.capture({ dirs: [root], files: [save] });
  writeFile(path.join(save, 'achievements.json'), '{"FIRST":1}', 2000);

  assert.equal(scanFingerprint.matches(fingerprint), false);
});

test('a game installed beside the others moves the folder that holds them', () => {
  const root = workspace('install');
  const library = path.join(root, 'library');
  fs.mkdirSync(library, { recursive: true });
  // Backdated first: a folder created and added to inside one filesystem tick keeps a single mtime,
  // and how fast the test run happens to be is not what is under test here.
  fs.utimesSync(library, 1000, 1000);

  const fingerprint = scanFingerprint.capture({ dirs: [library], files: [] });
  fs.mkdirSync(path.join(library, 'A New Game'), { recursive: true });

  assert.equal(scanFingerprint.matches(fingerprint), false);
});

test('a save file deleted while the app was closed is a change', () => {
  const root = workspace('deleted');
  const file = path.join(root, 'saves', '480', 'achievements.json');
  writeFile(file, '{}', 1000);

  const fingerprint = scanFingerprint.capture({ dirs: [root], files: [file] });
  fs.rmSync(file);

  assert.equal(scanFingerprint.matches(fingerprint), false);
});

test('a fingerprint that proves nothing never matches', () => {
  assert.equal(scanFingerprint.matches(null), false);
  assert.equal(scanFingerprint.matches({}), false);
  assert.equal(scanFingerprint.matches({ dirs: [], files: [] }), false);
  assert.equal(scanFingerprint.matches({ dirs: [['nowhere', 1]] }), false);
});

test('an unreadable directory is dropped rather than recorded as a difference', () => {
  const root = workspace('missingdir');
  const fingerprint = scanFingerprint.capture({ dirs: [root, path.join(root, 'never-existed')], files: [] });

  assert.equal(fingerprint.dirs.length, 1);
  assert.equal(scanFingerprint.matches(fingerprint), true);
});
