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

test('what a library may be reused for is stored beside it, and survives the round trip', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-snapshot-reuse-'));
  const config = { achievement: { lang: 'english' }, achievement_source: { steamEmu: true } };
  const fingerprint = { dirs: [['C:/games', 12]], files: [['C:/games/480/achievements.json', 34]] };

  snapshot.write(userData, config, [game(10)], { appVersion: '3.10.3', fingerprint, discoveredAppids: [10, '20'] });

  const entry = snapshot.readEntry(userData, config);
  assert.deepEqual(entry.games, [game(10)]);
  assert.deepEqual(entry.fingerprint, fingerprint);
  assert.equal(entry.appVersion, '3.10.3');
  assert.deepEqual(entry.discoveredAppids, ['10', '20']);
  assert.ok(entry.savedAt > 0);
});

test('a library saved without reuse metadata still paints but carries nothing to reuse', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-snapshot-bare-'));
  const config = { achievement: { lang: 'english' }, achievement_source: {} };

  snapshot.write(userData, config, [game(10)]);

  const entry = snapshot.readEntry(userData, config);
  assert.deepEqual(entry.games, [game(10)]);
  assert.equal(entry.fingerprint, null);
  assert.equal(entry.appVersion, '');
});

test('a library written by an older format is ignored entirely', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-snapshot-format-'));
  const config = { achievement: { lang: 'english' }, achievement_source: {} };
  const file = snapshot.snapshotFile(userData);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ format: 1, configKey: snapshot.configKey(config), savedAt: Date.now(), games: [game(10)] }),
    'utf8'
  );

  assert.equal(snapshot.readEntry(userData, config), null);
  assert.deepEqual(snapshot.read(userData, config), []);
});
