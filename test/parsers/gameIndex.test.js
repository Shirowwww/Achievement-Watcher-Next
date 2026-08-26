'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gameindex-'));
const userData = path.join(tmp, 'userData');
fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@electron/remote') {
    return { app: { getPath: () => userData } };
  }
  return originalLoad.apply(this, arguments);
};

const gameIndex = require('../../app/parser/gameIndex.js');
Module._load = originalLoad;
const { clearSafeCaches } = require('../../app/util/clearableCaches.js');

function readRows() {
  const file = path.join(userData, 'cfg', 'gameIndex.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('a metadata-only seed keeps the executable the generic seed already detected', () => {
  gameIndex.upsert({
    appid: 'uplay-971',
    name: 'Far Cry 4',
    binary: 'FarCry4.exe',
    icon: 'hash',
    source: 'Ubisoft Connect',
  });
  gameIndex.upsert({
    appid: 'uplay-971',
    name: 'Far Cry 4',
    binary: '',
    icon: 'hash',
    source: 'Ubisoft Connect',
    steamappid: '220240',
    uplayId: '971',
  });

  const row = readRows().find((g) => g.appid === 'uplay-971');
  assert.equal(row.binary, 'FarCry4.exe');
  assert.equal(row.steamappid, '220240');
  assert.equal(row.uplayId, '971');
});

test('an unchanged upsert does not rewrite the index file', () => {
  const file = path.join(userData, 'cfg', 'gameIndex.json');
  const before = fs.statSync(file).mtimeNs;
  gameIndex.upsert({
    appid: 'uplay-971',
    name: 'Far Cry 4',
    binary: 'FarCry4.exe',
    icon: 'hash',
    source: 'Ubisoft Connect',
    steamappid: '220240',
    uplayId: '971',
  });
  assert.equal(fs.statSync(file).mtimeNs, before);
});

test('a real binary change still updates the entry', () => {
  gameIndex.upsert({ appid: 'uplay-971', name: 'Far Cry 4', binary: 'FarCry4New.exe' });
  const row = readRows().find((g) => g.appid === 'uplay-971');
  assert.equal(row.binary, 'FarCry4New.exe');
});

test('clearing disposable caches keeps the last-known game identity', async () => {
  gameIndex.upsert({ appid: '480', name: 'Spacewar', binary: 'spacewar.exe' });
  fs.mkdirSync(path.join(userData, 'steam_cache', 'schema', 'english'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'steam_cache', 'schema', 'english', '480.db'), JSON.stringify({ name: 'Spacewar' }));

  await clearSafeCaches(userData);

  assert.equal(fs.existsSync(path.join(userData, 'steam_cache')), false);
  assert.equal(gameIndex.getName('480'), 'Spacewar');
});

test('an offline restart reads the persisted identity without metadata caches', () => {
  gameIndex.upsert({ appid: '620', name: 'Portal 2', binary: 'portal2.exe' });
  assert.equal(fs.existsSync(path.join(userData, 'steam_cache')), false, 'metadata remains offline');

  const modulePath = require.resolve('../../app/parser/gameIndex.js');
  delete require.cache[modulePath];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@electron/remote') return { app: { getPath: () => userData } };
    return originalLoad.apply(this, arguments);
  };
  const restartedGameIndex = require(modulePath);
  Module._load = originalLoad;

  assert.equal(restartedGameIndex.getName('620'), 'Portal 2');
});

test('weak refresh names cannot replace a known title, but later metadata enrichment can', () => {
  gameIndex.upsert({ appid: '730', name: 'Counter-Strike 2', binary: 'cs2.exe' });
  const file = path.join(userData, 'cfg', 'gameIndex.json');
  const beforeWeakRefresh = fs.readFileSync(file, 'utf8');

  gameIndex.upsert({ appid: '730', name: '730', binary: 'cs2.exe' });
  gameIndex.upsert({ appid: '730', name: 'cs2', binary: 'cs2.exe' });
  gameIndex.upsert({ appid: '730', name: 'cs2.exe', binary: 'cs2.exe' });
  assert.equal(gameIndex.getName('730'), 'Counter-Strike 2');
  assert.equal(fs.readFileSync(file, 'utf8'), beforeWeakRefresh, 'weak identities do not rewrite the shared index');

  gameIndex.upsert({ appid: '730', name: 'Counter-Strike 2 - Anniversary Edition', binary: 'cs2.exe' });
  assert.equal(gameIndex.getName('730'), 'Counter-Strike 2 - Anniversary Edition');
});

test('reconcile clears the losing duplicate binary but keeps its identity row', () => {
  gameIndex.upsert({ appid: '1551360', name: 'Forza Horizon 5', binary: 'forzahorizon6.exe' });
  gameIndex.upsert({ appid: '2440510', name: 'Forza Horizon 6', binary: 'forzahorizon6.exe' });

  const cleared = gameIndex.reconcile([
    { appid: '1551360', name: 'Forza Horizon 5' },
    { appid: '2440510', name: 'Forza Horizon 6' },
  ]);
  assert.equal(cleared, 1);

  const winner = readRows().find((g) => g.appid === '2440510');
  const loser = readRows().find((g) => g.appid === '1551360');
  assert.equal(winner.binary, 'forzahorizon6.exe');
  assert.equal(loser.binary, '', 'the losing claim is cleared, not the entry');
  assert.equal(gameIndex.getName('1551360'), 'Forza Horizon 5', 'identity survives for offline rebuilds');
  assert.equal(gameIndex.reconcile([]), 0, 'a second pass has nothing left to clear');
});

test('a losing binary claim is refused at seed time instead of churning through reconcile', () => {
  assert.equal(gameIndex.binaryClaimedByBetterMatch('1551360', 'Forza Horizon 5', 'forzahorizon6.exe'), true);
  assert.equal(gameIndex.binaryClaimedByBetterMatch('2440510', 'Forza Horizon 6', 'forzahorizon6.exe'), false, 'the current claimant keeps its own binary');
  assert.equal(gameIndex.binaryClaimedByBetterMatch('999', 'Some Game', 'unclaimed.exe'), false);
});

test('a scan batch persists many changed rows with one whole-index write', () => {
  const originalWrite = fs.writeFileSync;
  let indexWrites = 0;
  fs.writeFileSync = function countedWrite(file) {
    if (path.basename(String(file)) === 'gameIndex.json') indexWrites += 1;
    return originalWrite.apply(this, arguments);
  };
  try {
    gameIndex.beginBatch();
    for (let i = 0; i < 100; i++) {
      gameIndex.upsert({ appid: `batch-${i}`, name: `Batch Game ${i}`, binary: `batch-${i}.exe` });
    }
    assert.equal(indexWrites, 0, 'the index stays in memory while the scan is active');
    gameIndex.endBatch();
  } finally {
    fs.writeFileSync = originalWrite;
    gameIndex.endBatch();
  }
  assert.equal(indexWrites, 1);
  assert.equal(gameIndex.getName('batch-99'), 'Batch Game 99');
});

/*
  A "local-…" row is the placeholder an earlier scan wrote for an install it could not identify. Once
  the same folder resolves to a real Steam AppID the two carry the same title, so name similarity is
  a tie - and a tie used to leave the binary with the placeholder, which is how an identified game
  ended up with no binary at all and therefore no playtime and no live process match.
*/
test('an identified game takes its binary back from an unidentified placeholder', () => {
  gameIndex.upsert({ appid: 'local-53306f63', name: 'ZOMBI', binary: 'ZOMBI.exe', source: 'Unconfigured' });
  gameIndex.upsert({ appid: '339230', name: 'ZOMBI', binary: '', source: 'GBE Fork' });

  assert.equal(
    gameIndex.binaryClaimedByBetterMatch('339230', 'ZOMBI', 'ZOMBI.exe'),
    false,
    'the real AppID may claim the binary despite the identical name score'
  );

  gameIndex.upsert({ appid: '339230', name: 'ZOMBI', binary: 'ZOMBI.exe', source: 'GBE Fork' });
  const cleared = gameIndex.reconcile([
    { appid: '339230', name: 'ZOMBI' },
    { appid: 'local-53306f63', name: 'ZOMBI' },
  ]);
  assert.equal(cleared, 1);
  const rows = readRows();
  assert.equal(rows.find((r) => r.appid === '339230').binary, 'ZOMBI.exe');
  assert.equal(rows.find((r) => r.appid === 'local-53306f63').binary, '', 'the placeholder keeps its row, not the binary');
});
