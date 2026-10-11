'use strict';

/*
  Drive letters come from GetLogicalDrives and GetDriveTypeW now, not from a PowerShell start per
  scan. The native calls only exist on Windows, so the mask logic is tested directly and the query is
  swapped for a scripted one.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const listDrive = require(path.join(root, 'app', 'util', 'listDrive.js'));

// Bit 0 is A:, bit 2 is C:, bit 25 is Z:.
const maskOf = (...letters) => letters.reduce((bits, letter) => bits | (1 << (letter.charCodeAt(0) - 65)), 0);

test('the fixed drives are the letters whose type is DRIVE_FIXED, in letter order', () => {
  // 2 is a removable stick, 5 an optical drive: neither is a fixed disk.
  const types = { C: 3, D: 5, E: 2, Z: 3 };
  assert.deepEqual(listDrive.fixedDrivesFromMask(maskOf('C', 'D', 'E', 'Z'), (letter) => types[letter]), ['C:', 'Z:']);
});

test('a zero mask is a failed call, not an answer of no drives', () => {
  assert.throws(() => listDrive.fixedDrivesFromMask(0, () => 3), /GetLogicalDrives failed/);
});

test('the native answer is listed as "X:" and cached for a short while', async () => {
  let reads = 0;
  listDrive._setNativeReader(() => {
    reads += 1;
    return ['C:', 'D:'];
  });
  try {
    assert.deepEqual(await listDrive(), ['C:', 'D:']);
    assert.deepEqual(await listDrive(), ['C:', 'D:']);
    assert.equal(reads, 1, 'a scan asks several times in a row, the native query runs once');
  } finally {
    listDrive._setNativeReader(null);
  }
});

test('ignoreSystemDrive drops the system drive from the list', async () => {
  const previous = process.env.SystemDrive;
  process.env.SystemDrive = 'C:';
  listDrive._setNativeReader(() => ['C:', 'D:', 'E:']);
  try {
    assert.deepEqual(await listDrive({ ignoreSystemDrive: true }), ['D:', 'E:']);
  } finally {
    listDrive._setNativeReader(null);
    if (previous === undefined) delete process.env.SystemDrive;
    else process.env.SystemDrive = previous;
  }
});

test('a failing native query falls back to the letter probe and never throws', async () => {
  listDrive._setNativeReader(() => {
    throw new Error('GetLogicalDrives failed');
  });
  try {
    const drives = await listDrive();
    assert.ok(Array.isArray(drives));
    for (const drive of drives) assert.match(drive, /^[A-Z]:$/);
  } finally {
    listDrive._setNativeReader(null);
  }
});

test('the drive query starts no process', () => {
  const source = fs.readFileSync(path.join(root, 'app', 'util', 'listDrive.js'), 'utf8');
  assert.doesNotMatch(source, /require\('child_process'\)|execFile|spawn\(|powershell\.exe/i);
  assert.match(source, /GetDriveTypeW/);
});
