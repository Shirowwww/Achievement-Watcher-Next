'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dirCache = require('../../app/util/dirCache.js');

function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-dircache-'));
  fs.writeFileSync(path.join(root, 'first.txt'), 'x');
  return root;
}

test('a directory is read once per scope and re-read after it closes', () => {
  const root = makeTree();
  try {
    dirCache.beginScope();
    assert.deepEqual(
      dirCache.readdir(root).map((entry) => entry.name),
      ['first.txt']
    );
    fs.writeFileSync(path.join(root, 'second.txt'), 'y');
    assert.deepEqual(
      dirCache.readdir(root).map((entry) => entry.name),
      ['first.txt'],
      'the scope must serve the listing it already read'
    );
    dirCache.endScope();

    assert.deepEqual(
      dirCache.readdir(root).map((entry) => entry.name).sort(),
      ['first.txt', 'second.txt'],
      'outside a scope every call hits the filesystem'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('nested scopes share one cache and only the outermost clears it', () => {
  const root = makeTree();
  try {
    dirCache.beginScope();
    dirCache.readdir(root);
    dirCache.beginScope();
    fs.writeFileSync(path.join(root, 'second.txt'), 'y');
    assert.equal(dirCache.readdir(root).length, 1);
    dirCache.endScope();
    assert.equal(dirCache.isActive(), true);
    assert.equal(dirCache.readdir(root).length, 1);
    dirCache.endScope();
    assert.equal(dirCache.isActive(), false);
    assert.equal(dirCache.readdir(root).length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an unreadable directory reads as null, not as an empty folder', () => {
  const missing = path.join(os.tmpdir(), 'aw-dircache-missing-directory');
  assert.equal(dirCache.readdir(missing), null);
  assert.equal(dirCache.readdirNames(missing), null);
  dirCache.beginScope();
  assert.equal(dirCache.readdir(missing), null);
  dirCache.endScope();
});

test('withScope closes the scope even when the work throws', async () => {
  await assert.rejects(
    dirCache.withScope(async () => {
      assert.equal(dirCache.isActive(), true);
      throw new Error('boom');
    }),
    /boom/
  );
  assert.equal(dirCache.isActive(), false);
});
