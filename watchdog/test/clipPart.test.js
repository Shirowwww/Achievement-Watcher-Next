'use strict';

/*
  A clip written as <name>.mp4.part by a recorder that died before renaming it: finished (its moov box
  made it to disk) it is given its name, cut short it is deleted, and one a recorder may still be
  writing is left alone.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { isFinishedMp4, settlePart, settleLeftovers } = require('../notification/clipPart.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-clip-part-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function box(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

const FTYP = box('ftyp', Buffer.from('isom\0\0\0\0isomavc1', 'latin1'));
const MDAT = box('mdat', Buffer.alloc(4096, 7));
const MOOV = box('moov', Buffer.alloc(512, 1));
const FINISHED = Buffer.concat([FTYP, MDAT, MOOV]);
// What a recorder killed mid-write leaves: the pictures, never the index written after them.
const CUT = Buffer.concat([FTYP, MDAT.subarray(0, 2000)]);

let count = 0;
function part(bytes, { folder = temp, ageMs = 0 } = {}) {
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `clip ${++count}.mp4.part`);
  fs.writeFileSync(file, bytes);
  if (ageMs) {
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(file, when, when);
  }
  return file;
}

test('a file ends as a playable MP4 only with its index and nothing cut', async () => {
  assert.equal(await isFinishedMp4(part(FINISHED)), true);
  assert.equal(await isFinishedMp4(part(CUT)), false);
  assert.equal(await isFinishedMp4(part(FINISHED.subarray(0, FINISHED.length - 10))), false, 'an index cut short');
  assert.equal(await isFinishedMp4(part(Buffer.alloc(0))), false);
});

test('a 64-bit box size cut off at the end of the file is not read from the previous header', async () => {
  // The index's last bytes, read for its header, spell a size of 8 if they linger in the buffer.
  const index = box('moov', Buffer.from([0, 0, 0, 0, 0, 0, 0, 8]));
  const largeHeaderOnly = Buffer.from([0, 0, 0, 1, ...Buffer.from('mdat', 'latin1')]);
  assert.equal(await isFinishedMp4(part(Buffer.concat([FTYP, index, largeHeaderOnly]))), false);
});

test('a finished clip left under its temporary name gets its name', async () => {
  const file = part(FINISHED);
  assert.equal(await settlePart(file), 'renamed');
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(fs.readFileSync(file.slice(0, -5)), FINISHED);
});

test('a clip cut short while written is deleted, as nothing can play it', async () => {
  const file = part(CUT);
  assert.equal(await settlePart(file), 'removed');
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(file.slice(0, -5)), false);
});

test('a finished clip whose name is taken stays where it is', async () => {
  const file = part(FINISHED);
  fs.writeFileSync(file.slice(0, -5), 'another clip');
  assert.equal(await settlePart(file), 'kept');
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.readFileSync(file.slice(0, -5), 'utf8'), 'another clip');
});

test('a recorder killed before it wrote anything left nothing to settle', async () => {
  assert.equal(await settlePart(path.join(temp, 'gone.mp4.part')), 'absent');
});

test('a file that cannot be read is reported, never thrown', async () => {
  const folder = path.join(temp, 'not a file.mp4.part');
  fs.mkdirSync(folder);
  assert.equal(await settlePart(folder), 'failed');
  assert.equal(fs.existsSync(folder), true);
});

test('the leftovers in each game folder are settled, the ones still being written are not', async () => {
  const dir = path.join(temp, 'clips');
  const old = 10 * 60 * 1000;
  const finished = part(FINISHED, { folder: path.join(dir, 'Game A'), ageMs: old });
  const cut = part(CUT, { folder: path.join(dir, 'Game B'), ageMs: old });
  const fresh = part(CUT, { folder: path.join(dir, 'Game B') });
  const other = path.join(dir, 'Game B', 'notes.part');
  fs.writeFileSync(other, 'not a clip');

  const settled = await settleLeftovers(dir);
  assert.deepEqual(settled.map((entry) => [path.basename(entry.part), entry.outcome]).sort(), [
    [path.basename(finished), 'renamed'],
    [path.basename(cut), 'removed'],
  ].sort());
  assert.equal(fs.existsSync(fresh), true, 'a recorder may still be writing it');
  assert.equal(fs.existsSync(other), true);
});

test('a clip folder that does not exist yet has nothing to settle', async () => {
  assert.deepEqual(await settleLeftovers(path.join(temp, 'never-recorded')), []);
});
