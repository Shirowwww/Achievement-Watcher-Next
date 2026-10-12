'use strict';

/*
  A save root created by the game's own first write (a fresh Wine prefix, a first GBE game on
  Windows) is only noticed by the next poll, after that write. The files already in it are read once
  so the unlock they hold is still notified.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { catchUpFiles, unlockedSince } = require('../util/rootCatchUp.js');

const GSE_SAVES = { recursive: true, filter: /([0-9]+)/, file: ['achievements.ini', 'achievements.json', 'stats.json'] };

function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-catchup-'));
}

function write(file, content = '{}', mtimeMs = Date.now()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
  return file;
}

test('the save files written since the root went missing are read, nothing else', () => {
  const dir = root();
  try {
    const since = Date.now() - 30000;
    const fresh = write(path.join(dir, '400', 'achievements.json'));
    write(path.join(dir, '400', 'stats', 'kills.dat'));
    write(path.join(dir, '620', 'achievements.json'), '{}', since - 60000);

    assert.deepEqual(catchUpFiles(dir, GSE_SAVES, since), [fresh]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the root filter is applied to the whole path, as the watcher applies it', () => {
  const dir = root();
  try {
    const kept = write(path.join(dir, 'remote', '400', 'achievements.json'));
    write(path.join(dir, 'local', '400', 'achievements.json'));
    assert.deepEqual(catchUpFiles(dir, { recursive: true, filter: /remote[\\/]([0-9]+)/, file: ['achievements.json'] }, 0), [kept]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a non-recursive root only offers its own files, in any casing the root lists', () => {
  const dir = root();
  try {
    const own = write(path.join(dir, 'Achievements.INI'));
    write(path.join(dir, 'sub', 'achievements.ini'));
    assert.deepEqual(catchUpFiles(dir, { recursive: false, file: ['achievements.ini'] }, 0), [own]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a root that vanished again offers nothing instead of throwing', () => {
  assert.deepEqual(catchUpFiles(path.join(os.tmpdir(), 'aw-catchup-missing-root'), GSE_SAVES, 0), []);
});

test('an unlock counts as caught up only when it is not older than the missing root', () => {
  const since = Date.UTC(2026, 9, 14, 15, 56, 0);
  assert.equal(unlockedSince(since / 1000 + 18, since), true, 'unlocked 18 s after the root was found missing');
  assert.equal(unlockedSince(since / 1000 - 3600, since), false, 'an older unlock is a copied save, not this session');
  assert.equal(unlockedSince(since / 1000 + 18, 0), false, 'a root watched from the start never catches up');
});

test('the watchdog replays a late root through the same change handler, from an empty snapshot', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'watchdog.js'), 'utf8');
  assert.match(source, /self\.watch\(self\.nextWatchIndex, folder\.dir, folder\.options, \{ catchUpSince: missingSince \}\)/);
  assert.match(source, /if \(!catchUpSince\) \{\s+try \{\s+for \(const entry of fs\.readdirSync\(dir/);
  assert.match(source, /for \(const file of written\) await onChange\('update', file, true\);/);
});
