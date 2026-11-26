'use strict';

/*
  The ISO 9660 reader finds a small file by its path without case or ';1', lists a folder, walks a
  directory spread over several sectors, and answers null (never throws) for a missing path, a
  folder read as a file, a file over the limit, a cut image or something that is not an image.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');
const { buildIso, SECTOR } = require('../helpers/iso9660.js');
const iso = require('../../app/util/iso9660.js');

function image(files) {
  const file = path.join(makeTempDir('aw-iso9660-'), 'disc.iso');
  fs.writeFileSync(file, buildIso(files));
  return file;
}

test('a file is read by its path, whatever the case, and a folder is listed', () => {
  const file = image({ 'PS3_GAME/PARAM.SFO': 'sfo', 'PS3_GAME/TROPDIR/NPWR01234_00/TROPHY.TRP': 'trp', 'PS3_DISC.SFB': 'sfb' });
  assert.equal(iso.readFile(file, 'PS3_GAME/PARAM.SFO', 1024).toString(), 'sfo');
  assert.equal(iso.readFile(file, 'ps3_game\\tropdir\\npwr01234_00\\trophy.trp', 1024).toString(), 'trp');
  assert.deepEqual(iso.listDirectory(file, 'PS3_GAME/TROPDIR'), [{ name: 'NPWR01234_00', isDirectory: true, bytes: SECTOR }]);
  assert.deepEqual(
    iso.listDirectory(file, '').map((entry) => entry.name),
    ['PS3_DISC.SFB', 'PS3_GAME'],
  );
});

test('a directory spread over several sectors is walked to its last entry', () => {
  const files = {};
  for (let index = 0; index < 120; index++) files[`MANY/FILE_NUMBER_${String(index).padStart(3, '0')}.BIN`] = String(index);
  const file = image(files);
  assert.equal(iso.listDirectory(file, 'MANY').length, 120);
  assert.equal(iso.readFile(file, 'MANY/FILE_NUMBER_119.BIN', 16).toString(), '119');
});

test('what cannot be read is null, never an error', () => {
  const file = image({ 'PS3_GAME/PARAM.SFO': 'sfo' });
  assert.equal(iso.readFile(file, 'PS3_GAME/MISSING.SFO', 1024), null);
  assert.equal(iso.readFile(file, 'PS3_GAME', 1024), null, 'a folder is not a file');
  assert.equal(iso.readFile(file, 'PS3_GAME/PARAM.SFO', 2), null, 'over the limit');
  assert.equal(iso.listDirectory(file, 'PS3_GAME/PARAM.SFO'), null, 'a file is not a folder');
  const cut = path.join(path.dirname(file), 'cut.iso');
  fs.writeFileSync(cut, fs.readFileSync(file).subarray(0, 17 * SECTOR));
  assert.equal(iso.readFile(cut, 'PS3_GAME/PARAM.SFO', 1024), null, 'records past the end of a cut image');
  const text = path.join(path.dirname(file), 'notes.iso');
  fs.writeFileSync(text, 'not a disc');
  assert.equal(iso.listDirectory(text, ''), null);
  assert.equal(iso.readFile(path.join(path.dirname(file), 'absent.iso'), 'A', 1), null);
});
