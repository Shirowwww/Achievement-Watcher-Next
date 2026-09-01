'use strict';

/*
  A repaired Uplay R1/R2 game is told to write its unlocks to GSE Saves\<steamAppid>. That folder
  belongs to the Steam-emulator walker, so discovery finds the game there and the record arrives with
  no Uplay marking at all - and every Uplay-specific step downstream is gated on that marking:

    - the objective-id remap that turns the emulator's numeric keys back into Steam api-names,
    - the self-heal that re-applies the fix after a repack update,
    - the uplayId the Watchdog needs to attribute a live unlock to a game.

  All three were silently skipped, so the save was read as a Steam save, every key missed the schema
  ("67 saved achievements not found in the game schema" on Assassin's Creed Origins) and the game sat
  at 0 unlocked forever with a healthy-looking setup on disk.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-redirect-'));
const userData = path.join(tmp, 'userData');
fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null, on() {}, send() {} } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => userData } };
  return originalLoad.apply(this, arguments);
};
const achievements = require('../../app/parser/achievements.js');
const uplayR2 = require('../../app/parser/uplayR2.js');
Module._load = originalLoad;

// The parser logs through the module-level debug logger, which only exists after initDebug().
achievements.initDebug({ isDev: false, userDataPath: userData });
uplayR2.setUserDataPath(userData);
const { promoteUplayRecord } = achievements._internal;

// A repaired install: the loader, its config with achievements on and the save redirected, and the
// schema the loader reads. This is exactly what uplayR2.repair() leaves behind.
function repairedInstall(name, { steamAppid, uplayId, log = '' } = {}) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'uplay_r1_loader64.dll'), 'MZ');
  fs.writeFileSync(
    path.join(dir, 'upc_r1.ini'),
    ['[Uplay]', 'Achievements = 1', 'AchKeyPrefix =', 'AchSaveType = 1', `AchSavePath =${path.join(tmp, 'GSE Saves', String(steamAppid))}`, ''].join('\n')
  );
  fs.writeFileSync(path.join(dir, 'achievements_schema.json'), JSON.stringify({ 1: { name: '001' }, 2: { name: '002' } }));
  if (log) fs.writeFileSync(path.join(dir, 'upc_r1.log'), log);
  return dir;
}

test('a game found only through its redirected GSE save is still recognised as a Uplay game', () => {
  const gameDir = repairedInstall('ac-origins', {
    steamAppid: 582160,
    uplayId: 3539,
    log: '[00:00:00.000][INFO]  UPLAY_Start => aUplayId (3539)\n',
  });
  // What the Goldberg walker produces for GSE Saves\582160: a plain 'file' record, no Uplay marking.
  const record = { appid: '582160', source: 'Goldberg', data: { type: 'file', path: path.join(tmp, 'GSE Saves', '582160') } };
  const game = { name: "Assassin's Creed Origins" };

  assert.equal(promoteUplayRecord(record, game, gameDir), true);
  assert.equal(record.data.uplayR2, true, 'the record must carry the marking every Uplay step is gated on');
  assert.equal(record.data.uplayId, '3539', 'the product id names the save folder the Watchdog watches');
  assert.equal(game.uplayR2, true);
  assert.equal(game.system, 'uplay');
});

test('the product id the install states is preferred over the shipped table', () => {
  // The shipped row can be stale or name a different regional SKU; the loader log is this copy's own
  // startup value, so it is the one the save folders are actually named after.
  const gameDir = repairedInstall('south-park', {
    steamAppid: 488790,
    uplayId: 3088,
    log: '[00:00:00.000][INFO]  UPLAY_Start => aUplayId (3088)\n',
  });
  const record = { appid: '488790', source: 'Goldberg', data: { type: 'file', path: path.join(tmp, 'GSE Saves', '488790') } };
  promoteUplayRecord(record, { name: 'South Park The Fractured But Whole' }, gameDir);
  assert.equal(record.data.uplayId, '3088');
});

test('a folder with no Uplay evidence at all is left alone', () => {
  const plain = path.join(tmp, 'plain-steam-game');
  fs.mkdirSync(plain, { recursive: true });
  fs.writeFileSync(path.join(plain, 'steam_api64.dll'), 'MZ');
  fs.writeFileSync(path.join(plain, 'game.exe'), 'MZ');
  const record = { appid: '730', source: 'Goldberg', data: { type: 'file', path: plain } };
  const game = { name: 'Counter-Strike 2' };
  assert.equal(promoteUplayRecord(record, game, plain), false);
  assert.equal(record.data.uplayR2, undefined);
  assert.equal(game.uplayR2, undefined, 'a Steam emulator game must never be re-routed through the Uplay reader');
});

test('an official Ubisoft Connect record is never re-marked as an emulated one', () => {
  // Those read their unlocks from the launcher's own store. Marking one would send Fix all at a
  // legitimate installation.
  const gameDir = repairedInstall('official', { steamAppid: 999999, uplayId: 1 });
  const record = { appid: 'uplay-6100', source: 'Ubisoft Connect', data: { type: 'ubisoftOfficial', uplayId: '6100' } };
  assert.equal(promoteUplayRecord(record, { name: "Assassin's Creed Mirage" }, gameDir), false);
});

test('a record that already carries the marking is not re-derived', () => {
  const gameDir = repairedInstall('already-marked', { steamAppid: 2840770, uplayId: 4740 });
  const record = { appid: '2840770', source: 'Goldberg Uplay', data: { type: 'uplayR2', uplayR2: true, uplayId: '4740' } };
  assert.equal(promoteUplayRecord(record, { name: 'Avatar: Frontiers of Pandora' }, gameDir), false);
  assert.equal(record.data.uplayId, '4740', 'the id discovery already resolved stands');
});

test('the read path merges the Uplay translation over the raw Steam read', () => {
  /*
    Structural: the same GSE folder can hold a Steam-emulator save AND a Uplay loader's redirect
    target (a dual-layer repack really has both). Keys the Uplay side can translate must win, because
    a bare objective id means nothing to the Steam reader, while keys that already are api-names pass
    through the translation untouched - so neither read can lose to the other.
  */
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');
  // Anchored on the merge itself rather than on the variable holding it: the per-source read moved
  // into readRecordUnlocks, and the name of its local changed with it while the rule did not.
  assert.match(
    source,
    /if \(appid\.data\.uplayR2\) \w+ = \{ \.\.\.\w+, \.\.\.readUplayR2Save\(appid, game\) \};/,
    "the 'file' branch must run the objective remap for a promoted Uplay record"
  );
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
