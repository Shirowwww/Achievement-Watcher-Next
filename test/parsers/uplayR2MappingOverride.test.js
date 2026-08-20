'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const uplayR2 = require('../../app/parser/uplayR2.js');

test('a confirmed Steam mapping is durable and scoped to the exact Uplay R2 install', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-mapping-'));
  const userData = path.join(root, 'userData');
  const firstGame = path.join(root, 'First Game');
  const secondGame = path.join(root, 'Second Game');
  fs.mkdirSync(firstGame, { recursive: true });
  fs.mkdirSync(secondGame, { recursive: true });
  uplayR2.setUserDataPath(userData);
  t.after(() => {
    uplayR2.setUserDataPath('');
    fs.rmSync(root, { recursive: true, force: true });
  });

  const saved = uplayR2.saveSteamMappingOverride({
    gameDir: firstGame,
    uplayId: '999001',
    steamAppid: '1234567',
    steamName: 'A New Ubisoft Game',
  });
  assert.equal(saved.manual, true);
  assert.equal(saved.steam_appid, 1234567);
  assert.equal(fs.existsSync(path.join(userData, 'cfg', uplayR2.MAPPING_OVERRIDES_FILE)), true);
  assert.equal(uplayR2.resolveSteamMapping({ gameDir: firstGame }).steam_appid, 1234567);
  assert.equal(uplayR2.resolveSteamMapping({ appid: 'uplay-999001' }).steam_appid, 1234567);
  assert.equal(
    uplayR2.resolveSteamMapping({ gameDir: secondGame, name: 'Definitely Not In The Catalog Xyzzy' }),
    null,
    'a folder override must not leak to an unrelated install'
  );

  uplayR2.saveSteamMappingOverride({
    gameDir: secondGame,
    uplayId: '999001',
    steamAppid: '7654321',
    steamName: 'Conflicting Choice',
  });
  assert.equal(
    uplayR2.resolveSteamMapping({ appid: 'UPLAY999001' }),
    null,
    'conflicting manual choices for one native id fail closed when no install folder disambiguates them'
  );
  assert.equal(uplayR2.resolveSteamMapping({ gameDir: secondGame }).steam_appid, 7654321);
  assert.equal(uplayR2.clearSteamMappingOverride(secondGame), true);
  assert.equal(uplayR2.resolveSteamMapping({ appid: 'UPLAY999001' }).steam_appid, 1234567);
});

test('Steam appid markers are confirmation hints, never automatic mappings', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-hints-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'Binaries', 'Win64'), { recursive: true });
  fs.mkdirSync(path.join(root, 'steam_settings'), { recursive: true });
  fs.mkdirSync(path.join(root, uplayR2.BACKUP_DIR_NAME, 'old'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steam_appid.txt'), '480\n');
  fs.writeFileSync(path.join(root, 'steam_settings', 'steam_appid.txt'), '620');
  fs.writeFileSync(path.join(root, 'Binaries', 'Win64', 'steam_appid.txt'), '480');
  fs.writeFileSync(path.join(root, uplayR2.BACKUP_DIR_NAME, 'old', 'steam_appid.txt'), '999999');

  assert.deepEqual(
    uplayR2.findSteamAppidHints(root).map((entry) => entry.appid),
    ['480', '620'],
    'hints are deduplicated and transaction snapshots are ignored'
  );
  assert.equal(
    uplayR2.resolveSteamMapping({ gameDir: root, name: 'Definitely Not In The Catalog Xyzzy' }),
    null,
    'the marker is not trusted until the user confirms it'
  );
});
