'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const snapshot = require('../../app/util/librarySnapshot.js');

function game(appid, name = `Game ${appid}`) {
  return {
    appid: String(appid),
    name,
    img: { header: `file:///covers/${appid}.jpg`, portrait: '' },
    achievement: { total: 1, unlocked: 0, list: [{ name: 'FIRST', Achieved: 0, UnlockTime: 0 }] },
  };
}

test('the last complete library is available before discovery and preserves achievement state', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-snapshot-'));
  const config = {
    achievement: { lang: 'english', showHidden: false, mergeDuplicate: true, hideZero: false },
    achievement_source: { steamEmu: true },
  };

  assert.equal(snapshot.write(userData, config, [game(10), game(20)]), 2);
  assert.deepEqual(snapshot.read(userData, config), [game(10), game(20)]);
});

test('a snapshot from a different library configuration is not painted', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-snapshot-config-'));
  const first = { achievement: { lang: 'english', hideZero: false }, achievement_source: { steamEmu: true } };
  const changed = { achievement: { lang: 'french', hideZero: false }, achievement_source: { steamEmu: true } };

  snapshot.write(userData, first, [game(10)]);
  assert.deepEqual(snapshot.read(userData, changed), []);
});

test('partial and corrupt snapshots fail closed', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-snapshot-corrupt-'));
  const config = { achievement: { lang: 'english' }, achievement_source: {} };
  const file = snapshot.snapshotFile(userData);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{broken', 'utf8');
  assert.deepEqual(snapshot.read(userData, config), []);

  fs.writeFileSync(
    file,
    JSON.stringify({ format: 1, configKey: snapshot.configKey(config), games: [{ appid: '1', name: 'No data' }] }),
    'utf8'
  );
  assert.deepEqual(snapshot.read(userData, config), []);
});

test('a failed fresh enrichment keeps complete known achievement state and artwork', () => {
  const known = game(10, 'Known title');
  const provisional = {
    ...game(10, '10'),
    nameUnresolved: true,
    provisional: true,
    installed: true,
    img: { header: '', portrait: 'file:///covers/new-portrait.jpg' },
    achievement: { total: 0, unlocked: 0, list: [] },
  };

  const merged = snapshot.mergeKnownGame(provisional, known);
  assert.equal(merged.name, 'Known title');
  assert.equal(merged.achievement.total, 1);
  assert.equal(merged.img.header, 'file:///covers/10.jpg');
  assert.equal(merged.img.portrait, 'file:///covers/new-portrait.jpg');
  assert.equal(merged.installed, true);
  assert.equal(merged.provisional, true);
});
