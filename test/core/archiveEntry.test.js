'use strict';

/*
  Three installers extract archives that came from somewhere else: a GitHub release, a community
  catalogue behind a third-party mirror, and a file the user picked. Two of them used to unpack the
  whole archive with no check at all, and the third had a weaker check than the fourth. They now
  share this one, so a fix lands everywhere at once.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { safeArchiveEntry, firstUnsafeEntry } = require('../../app/util/archiveEntry.js');

test('an entry that would be written outside the extraction root is refused', () => {
  for (const file of [
    '../evil.dll',
    '..\\evil.dll',
    'a/../../evil.dll',
    'a\\..\\..\\evil.dll',
    '/absolute/evil.dll',
    'C:/Windows/System32/evil.dll',
    'C:\\Windows\\System32\\evil.dll',
    'name\0.dll',
    '',
  ]) {
    assert.equal(safeArchiveEntry({ file }), false, `${JSON.stringify(file)} must be refused`);
  }
});

test('a link is refused whatever it points at', () => {
  assert.equal(safeArchiveEntry({ file: 'steam_api64.dll', attributes: 'A_____L' }), false);
  assert.equal(safeArchiveEntry({ file: 'steam_api64.dll', attributes: 'l' }), false);
});

test('an ordinary entry is accepted, nested folders included', () => {
  for (const file of ['steam_api64.dll', 'release/steam_api64.dll', 'a\\b\\c.txt', 'game..name/file.dll', '..hidden/file.dll']) {
    assert.equal(safeArchiveEntry({ file }), true, `${JSON.stringify(file)} must be accepted`);
  }
});

test('firstUnsafeEntry names the offender, and answers null for a clean listing', () => {
  assert.equal(firstUnsafeEntry([{ file: 'a.dll' }, { file: '../b.dll' }, { file: 'c.dll' }]), '../b.dll');
  assert.equal(firstUnsafeEntry([{ file: 'a.dll' }, { file: 'b/c.dll' }]), null);
  assert.equal(firstUnsafeEntry([]), null);
  assert.equal(firstUnsafeEntry(null), null);
  assert.equal(firstUnsafeEntry([{}]), '(unnamed)');
});

// Nothing may go back to extracting an archive without listing it first.
test('every 7-Zip extraction in the parsers is preceded by an entry check', () => {
  const parsers = path.join(__dirname, '..', '..', 'app', 'parser');
  for (const name of fs.readdirSync(parsers)) {
    if (!name.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(parsers, name), 'utf8');
    if (!source.includes('Seven.extractFull')) continue;
    assert.match(
      source,
      /safeArchiveEntry|firstUnsafeEntry|\$cherryPick/,
      `${name} extracts an archive without checking its entries first`
    );
  }
});
