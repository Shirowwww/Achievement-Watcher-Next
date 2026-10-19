'use strict';

/*
  The ZArchive reader against a real archive: fixtures/kytyps5-game.zar was written by Exzap's own
  zarchive.exe 0.1.2 from a synthetic PS5 game. It holds a 70 KiB random file, so one block is
  stored as it is and the next compressed, and a 154-byte name, past the one-byte length form.
*/
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { withArchive } = require('../../app/util/zarchive.js');
const { samplePackage } = require('../helpers/kytyps5.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'kytyps5-game.zar');
const NOISE_SHA256 = 'a1c5defb662d953a5d2ea4eeb40041b18e77b4d90b1521d00265502aada04583';
const LONG_NAME = `${'n'.repeat(150)}.txt`;

test('a real archive lists its folders and reads its files back byte for byte', () => {
  const read = withArchive(FIXTURE, (archive) => ({
    root: archive.entries('').map((entry) => [entry.name, entry.isFile]),
    eboot: archive.isFile('eboot.bin'),
    param: JSON.parse(archive.read('sce_sys/param.json', 1024 * 1024).toString('utf8')).titleId,
    noise: crypto.createHash('sha256').update(archive.read('sce_sys/noise.bin', 1024 * 1024)).digest('hex'),
    packageMatches: archive.read('sce_sys/trophy2/trophy00.ucp', 1024 * 1024).equals(samplePackage()),
    longName: archive.read(`sce_sys/${LONG_NAME}`, 64).toString('utf8'),
  }));
  assert.deepEqual(read.root, [['eboot.bin', true], ['sce_sys', false]]);
  assert.equal(read.eboot, true);
  assert.equal(read.param, 'PPSA00407');
  assert.equal(read.noise, NOISE_SHA256, 'a stored block and a compressed one, read across their boundary');
  assert.equal(read.packageMatches, true);
  assert.equal(read.longName, 'long name');
});

test('lookups ignore case and either slash, and refuse what is not a readable file', () => {
  withArchive(FIXTURE, (archive) => {
    assert.equal(archive.isFile('SCE_SYS\\PARAM.JSON'), true);
    assert.equal(archive.isFile('sce_sys'), false, 'a folder is not a file');
    assert.equal(archive.read('sce_sys', 1024), null);
    assert.equal(archive.read('missing.bin', 1024), null);
    assert.equal(archive.read('sce_sys/noise.bin', 1024), null, 'a file past the size cap is not read');
    assert.deepEqual(archive.entries('eboot.bin'), [], 'a file has no entries');
  });
});

test('anything but an intact archive is no archive', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-zarchive-'));
  try {
    const truncated = path.join(temp, 'truncated.zar');
    fs.writeFileSync(truncated, fs.readFileSync(FIXTURE).subarray(0, 4096));
    const damaged = path.join(temp, 'damaged.zar');
    const bytes = fs.readFileSync(FIXTURE);
    bytes.writeUInt32BE(0, bytes.length - 4);
    fs.writeFileSync(damaged, bytes);

    for (const file of [truncated, damaged, __filename, path.join(temp, 'missing.zar')]) {
      assert.equal(withArchive(file, () => 'opened'), null, file);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('an archive that changes while it is read gives no answer', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-zar-change-'));
  try {
    const copy = path.join(dir, 'changing.zar');
    fs.copyFileSync(FIXTURE, copy);
    assert.equal(withArchive(copy, () => 'read'), 'read');
    const torn = withArchive(copy, () => {
      fs.appendFileSync(copy, 'x');
      return 'read';
    });
    assert.equal(torn, null, 'the result of a torn read is dropped, to be read again later');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
