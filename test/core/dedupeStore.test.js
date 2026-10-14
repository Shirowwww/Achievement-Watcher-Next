'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { dedupeTree, MIN_BYTES } = require('../../app/util/dedupeStore.js');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-dedupe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const ino = (file) => fs.statSync(file, { bigint: true }).ino;
const blob = (seed) => Buffer.alloc(MIN_BYTES * 4, seed);

test('identical files in different restore points end up sharing one copy, bytes unchanged', async (t) => {
  const root = scratch(t);
  const first = write(path.join(root, 'Game - GBE backup - 1', 'steam_api64.dll'), blob('a'));
  const second = write(path.join(root, 'Game - GBE backup - 2', 'steam_api64.dll'), blob('a'));
  const third = write(path.join(root, 'Other - GBE backup - 1', 'nested', 'steam_api64.dll'), blob('a'));

  const result = await dedupeTree(root);

  assert.equal(result.linked, 2);
  assert.equal(result.savedBytes, MIN_BYTES * 4 * 2);
  assert.equal(ino(first), ino(second));
  assert.equal(ino(first), ino(third));
  for (const file of [first, second, third]) assert.ok(fs.readFileSync(file).equals(blob('a')));
  assert.deepEqual(fs.readdirSync(path.dirname(first)), ['steam_api64.dll'], 'no temporary file is left behind');
});

test('files of the same size with different bytes are left alone', async (t) => {
  const root = scratch(t);
  const a = write(path.join(root, 'a.dll'), blob('a'));
  const b = write(path.join(root, 'b.dll'), blob('b'));

  const result = await dedupeTree(root);

  assert.equal(result.linked, 0);
  assert.notEqual(ino(a), ino(b));
  assert.ok(fs.readFileSync(b).equals(blob('b')));
});

test('a second pass finds nothing left to do', async (t) => {
  const root = scratch(t);
  write(path.join(root, '1', 'x.dll'), blob('x'));
  write(path.join(root, '2', 'x.dll'), blob('x'));
  write(path.join(root, '3', 'x.dll'), blob('x'));

  assert.equal((await dedupeTree(root)).linked, 2);
  assert.deepEqual(await dedupeTree(root), { linked: 0, savedBytes: 0, failed: 0 });
});

test('every name of a copy moves, so the space really comes back', async (t) => {
  const root = scratch(t);
  // Three names on one file, one name on an identical second file: the three-name copy stays.
  const kept = write(path.join(root, 'kept.dll'), blob('k'));
  fs.linkSync(kept, path.join(root, 'kept-2.dll'));
  fs.linkSync(kept, path.join(root, 'kept-3.dll'));
  const moved = write(path.join(root, 'moved.dll'), blob('k'));

  const result = await dedupeTree(root);

  assert.equal(result.linked, 1);
  assert.equal(result.savedBytes, MIN_BYTES * 4);
  assert.equal(ino(moved), ino(kept));
});

test('a file kept out by accept, or too small to matter, is never touched', async (t) => {
  const root = scratch(t);
  const source = write(path.join(root, 'bg-wall.png'), blob('w'));
  const derived = write(path.join(root, 'bg-wall-blur-8.png'), blob('w'));
  const tinyA = write(path.join(root, 'a.txt'), 'same');
  const tinyB = write(path.join(root, 'b.txt'), 'same');

  const result = await dedupeTree(root, { accept: (file) => !/-blur-/.test(file) });

  assert.equal(result.linked, 0);
  assert.notEqual(ino(source), ino(derived));
  assert.notEqual(ino(tinyA), ino(tinyB));
});

test('a read-only duplicate is replaced like any other', async (t) => {
  const root = scratch(t);
  const a = write(path.join(root, 'a.dll'), blob('r'));
  const b = write(path.join(root, 'b.dll'), blob('r'));
  fs.chmodSync(b, 0o444);
  t.after(() => {
    for (const file of [a, b]) {
      try {
        fs.chmodSync(file, 0o666);
      } catch {
        /* already gone */
      }
    }
  });

  const result = await dedupeTree(root);

  assert.equal(result.linked, 1);
  assert.equal(ino(a), ino(b));
});

test('a missing store is an empty result, not an error', async () => {
  assert.deepEqual(await dedupeTree(path.join(os.tmpdir(), 'aw-dedupe-does-not-exist')), { linked: 0, savedBytes: 0, failed: 0 });
});
