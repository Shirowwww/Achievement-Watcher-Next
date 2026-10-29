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

test('folders differing only by case are one listing on Windows and two on Linux', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-dircache-'));
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  t.after(() => {
    Object.defineProperty(process, 'platform', realPlatform);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const upper = path.join(root, 'Game');
  const lower = path.join(root, 'game');
  fs.mkdirSync(upper);
  fs.mkdirSync(lower, { recursive: true });
  fs.writeFileSync(path.join(upper, 'a.txt'), 'x');
  Object.defineProperty(process, 'platform', { value: 'linux' });
  dirCache.beginScope();
  try {
    dirCache.readdir(upper);
    fs.writeFileSync(path.join(lower, 'b.txt'), 'y');
    assert.ok(dirCache.readdir(lower).some((entry) => entry.name === 'b.txt'), 'game is not served the listing of Game');
  } finally {
    dirCache.endScope();
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

/*
  An untracked reader (the executable search, the sources that walk game folders) can be the first
  to list a folder that the discovery walk then asks for. The walk must still record it: the
  stored library is only proven current by the folders it recorded, so a missing one goes unwatched.
*/
test('a folder listed untracked first is still recorded when a tracked walk asks for it', () => {
  const root = makeTree();
  try {
    dirCache.beginScope();
    dirCache.readdir(root, { track: false });
    assert.deepEqual(dirCache.lastVisitedDirs(), []);
    dirCache.readdir(root);
    dirCache.readdir(root);
    assert.deepEqual(dirCache.lastVisitedDirs(), [root], 'recorded once, by the tracked read');
    dirCache.endScope();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/*
  The scan lists the previous scan's folders in parallel before it walks them. A listing read that
  way must still count as visited when the walk asks for it - the fingerprint the stored library is
  checked against is built from the visited folders - and must not count before.
*/
test('a folder read ahead is served to the walk and recorded as visited only when the walk reads it', async (t) => {
  const root = makeTree();
  const other = makeTree();
  const missing = path.join(root, 'gone');
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  });
  assert.equal(await dirCache.prefetch([root]), 0, 'no read-ahead outside a scope');

  dirCache.beginScope();
  try {
    assert.equal(await dirCache.prefetch([root, other, root, missing]), 3);
    fs.writeFileSync(path.join(root, 'second.txt'), 'y');
    assert.deepEqual(dirCache.lastVisitedDirs(), [], 'reading ahead visits nothing');

    assert.deepEqual(
      dirCache.readdir(root).map((entry) => entry.name),
      ['first.txt'],
      'the walk is served the listing read ahead'
    );
    assert.equal(dirCache.readdir(missing), null, 'a folder that could not be read stays unreadable');
    assert.deepEqual(dirCache.lastVisitedDirs(), [root]);
    assert.equal(await dirCache.prefetch([root]), 0, 'a folder already read is not read again');
  } finally {
    dirCache.endScope();
  }
  assert.deepEqual(dirCache.lastVisitedDirs(), [root], 'a folder read ahead but never walked is not part of the scan');
});
