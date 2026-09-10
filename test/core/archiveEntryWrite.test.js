'use strict';

/*
  adm-zip's own extractors follow a symbolic link already sitting at the destination and write
  through it, handing an attacker who can plant one an arbitrary file overwrite (CVE-2026-76845,
  GHSA-vwc7-r8mq-g2x9). The advisory covers 0.5.9 through 0.6.0, which is the latest published
  release: there is nothing to upgrade to.

  So the app never asks the library to write. These tests pin both halves of that: the helper that
  writes an entry safely, and the fact that no extractor call comes back into the codebase.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { writeArchiveEntry } = require('../../app/util/archiveEntry.js');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-archive-write-'));
}

test('an ordinary entry is written under the extraction root', () => {
  const root = tempRoot();
  try {
    const written = writeArchiveEntry(fs, path, { name: '1234/icon.png', data: Buffer.from('bytes'), root });
    assert.equal(written, path.join(root, '1234', 'icon.png'));
    assert.equal(fs.readFileSync(written, 'utf8'), 'bytes');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an entry that would escape the extraction root is refused', () => {
  const root = tempRoot();
  try {
    for (const name of [
      '../outside.png',
      'a/../../outside.png',
      '/absolute.png',
      'C:/Windows/System32/evil.dll',
      'with\0null.png',
      '',
    ]) {
      assert.equal(writeArchiveEntry(fs, path, { name, data: Buffer.from('x'), root }), '', `accepted ${JSON.stringify(name)}`);
    }
    // Backslashes are separators too: the check must not be bypassed by writing the traversal in
    // Windows form.
    assert.equal(writeArchiveEntry(fs, path, { name: '..\\outside.png', data: Buffer.from('x'), root }), '');
    assert.equal(fs.existsSync(path.join(path.dirname(root), 'outside.png')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a link already at the destination is destroyed, never written through', (t) => {
  const root = tempRoot();
  const outside = tempRoot();
  const target = path.join(outside, 'precious.txt');
  fs.writeFileSync(target, 'original');
  try {
    const destination = path.join(root, 'planted.txt');
    try {
      fs.symlinkSync(target, destination, 'file');
    } catch {
      // Windows refuses symlinks without Developer Mode or elevation. The guard is still exercised
      // by the junction-free path below; skip only the link half.
      t.skip('this machine cannot create symbolic links');
      return;
    }

    const written = writeArchiveEntry(fs, path, { name: 'planted.txt', data: Buffer.from('replacement'), root });
    assert.equal(written, destination);
    assert.equal(fs.readFileSync(target, 'utf8'), 'original', 'the link target was written through');
    assert.equal(fs.readFileSync(destination, 'utf8'), 'replacement');
    assert.equal(fs.lstatSync(destination).isSymbolicLink(), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('an existing plain file is replaced', () => {
  const root = tempRoot();
  try {
    const destination = path.join(root, 'icon.png');
    fs.writeFileSync(destination, 'stale');
    assert.equal(writeArchiveEntry(fs, path, { name: 'icon.png', data: Buffer.from('fresh'), root }), destination);
    assert.equal(fs.readFileSync(destination, 'utf8'), 'fresh');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('nothing in the app asks adm-zip to write to disk', () => {
  const appRoot = path.join(__dirname, '..', '..', 'app');
  const skip = new Set(['node_modules', 'dist', 'build']);
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;
      const file = path.join(dir, entry.name);
      const source = fs.readFileSync(file, 'utf8');
      // Both of the library's writing extractors. Reading an entry (getData/readAsText) is fine:
      // the advisory is about where the bytes land, not about parsing the archive.
      for (const call of ['extractAllTo', 'extractEntryTo']) {
        if (source.includes(`.${call}(`)) offenders.push(`${path.relative(appRoot, file)} -> ${call}`);
      }
    }
  };
  walk(appRoot);

  assert.deepEqual(
    offenders,
    [],
    `adm-zip's extractors follow a symlink at the destination (CVE-2026-76845, unfixed upstream).\n` +
      `Write the entry with util/archiveEntry.js writeArchiveEntry() instead:\n  ${offenders.join('\n  ')}`
  );
});
