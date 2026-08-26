'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const monitor = require('../../watchdog/monitor.js');
const uplayR2 = require('../../watchdog/util/uplayR2.js');

/*
  A Goldberg Uplay R2 unlock has to survive two translations before the watchdog can notify on it:
  the folder name is a Ubisoft product id rather than a Steam AppID, and on a legacy loader the keys
  inside are bare objective ids rather than Steam api-names. Both were missing entirely, so these
  games never fired a live notification - they only appeared on the next manual library refresh.
*/

test('the Ubisoft product id resolves to the Steam AppID the app recorded', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wd-uplay-'));
  try {
    const file = path.join(tmp, 'gameIndex.json');
    fs.writeFileSync(
      file,
      JSON.stringify([
        { appid: '2652000', name: 'Some Steam Game', binary: 'game.exe' },
        { appid: '3751950', name: "Assassin's Creed Black Flag Resynced", binary: 'ACBlackFlag.exe', uplayId: '65043' },
      ])
    );

    assert.equal(uplayR2.steamAppIdForUplayId('65043', { files: [file] }), '3751950');

    // An id the app has not mapped yet must resolve to nothing. The caller skips the unlock rather
    // than passing a Ubisoft id on as if it were a Steam AppID.
    assert.equal(uplayR2.steamAppIdForUplayId('999999', { files: [file] }), '');
    assert.equal(uplayR2.steamAppIdForUplayId('', { files: [file] }), '');
    // A game with no uplayId must never be matched by an empty/missing id.
    assert.equal(uplayR2.steamAppIdForUplayId(undefined, { files: [file] }), '');
    // Missing and corrupt index files are tolerated, not fatal.
    assert.equal(uplayR2.steamAppIdForUplayId('65043', { files: [path.join(tmp, 'nope.json')] }), '');
    fs.writeFileSync(path.join(tmp, 'bad.json'), '{not json');
    assert.equal(uplayR2.steamAppIdForUplayId('65043', { files: [path.join(tmp, 'bad.json'), file] }), '3751950');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('objective ids are rewritten onto the schema api-names', () => {
  const schema = [{ name: 'ACObsidian_Ach_1' }, { name: 'ACObsidian_Ach_7' }, { name: 'ACObsidian_Ach_12' }];
  const parsed = [
    { name: '1', Achieved: true },
    { name: '7', Achieved: true },
    { name: 'ACObsidian_Ach_12', Achieved: true }, // already an api-name (newer loader) - untouched
    { name: '99', Achieved: true }, // belongs to no achievement here - left alone, never guessed
  ];

  assert.equal(uplayR2.remapObjectiveIds(parsed, schema), 2);
  assert.deepEqual(
    parsed.map((p) => p.name),
    ['ACObsidian_Ach_1', 'ACObsidian_Ach_7', 'ACObsidian_Ach_12', '99']
  );

  // Nothing to work with must be a no-op, never a throw.
  assert.equal(uplayR2.remapObjectiveIds([], schema), 0);
  assert.equal(uplayR2.remapObjectiveIds(parsed, []), 0);
  assert.equal(uplayR2.remapObjectiveIds(null, null), 0);
});

test('a repaired setup in GSE Saves is recognised as a Ubisoft product', () => {
  // GSE Saves is shared with the Steam emulators, so the flag on the watcher cannot say who wrote a
  // save. The app's index can: a row carrying a uplayId is a Ubisoft product.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wd-uplay-gse-'));
  try {
    const file = path.join(tmp, 'gameIndex.json');
    fs.writeFileSync(
      file,
      JSON.stringify([
        { appid: '582160', name: 'AC Origins', uplayId: '3539' },
        { appid: '400', name: 'Portal' },
      ])
    );
    assert.equal(uplayR2.isUplayR2SteamAppId('582160', { files: [file] }), true);
    assert.equal(uplayR2.isUplayR2SteamAppId('400', { files: [file] }), false, 'a plain Steam emulator save must stay untouched');
    assert.equal(uplayR2.isUplayR2SteamAppId('999999', { files: [file] }), false);
    assert.equal(uplayR2.isUplayR2SteamAppId('', { files: [file] }), false);
    assert.equal(uplayR2.isUplayR2SteamAppId('582160', { files: [path.join(tmp, 'nope.json')] }), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('an api-name carrying no objective id is notified through the table the app writes', () => {
  // Games keyed from Ubisoft's own achievement archive (The Crew 2, ZOMBI, Brawlhalla) have api-names
  // with no digits to derive from. Without the table their unlocks are dropped as not-in-schema.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wd-objectives-'));
  try {
    const file = path.join(tmp, 'uplay-objectives.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ format: 1, games: { 646910: { prefix: '', ids: { 7: 'Ruler_of_the_Streets', 12: 'Creative_Thinker' } } } })
    );
    const map = uplayR2.objectiveMapFor('646910', { file });
    assert.deepEqual(map, { 7: 'Ruler_of_the_Streets', 12: 'Creative_Thinker' });
    assert.deepEqual(uplayR2.objectiveMapFor('999999', { file }), {}, 'a game the app never repaired has no table');
    assert.deepEqual(uplayR2.objectiveMapFor('646910', { file: path.join(tmp, 'nope.json') }), {});

    const schema = [{ name: 'Ruler_of_the_Streets' }, { name: 'Creative_Thinker' }, { name: 'All_Clear' }];
    const parsed = [{ name: '7', Achieved: true }, { name: '12', Achieved: true }, { name: '99', Achieved: true }];
    assert.equal(uplayR2.remapObjectiveIds(parsed, schema), 0, 'nothing is derivable from these api-names alone');
    assert.equal(uplayR2.remapObjectiveIds(parsed, schema, { objectiveIds: map }), 2);
    assert.deepEqual(parsed.map((a) => a.name), ['Ruler_of_the_Streets', 'Creative_Thinker', '99']);

    // A table naming an achievement this game's schema does not have is ignored, never invented.
    const stale = { 7: 'Belongs_To_Another_Game' };
    const other = [{ name: '7', Achieved: true }];
    assert.equal(uplayR2.remapObjectiveIds(other, schema, { objectiveIds: stale }), 0);
    assert.equal(other[0].name, '7');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a zero-padded schema still recognises the ids the loader writes', () => {
  // Assassin's Creed Origins/Odyssey ship "001".."067"; the loader can only ever write "1".."67",
  // so a literal digit match found nothing and not one notification was raised for these games.
  const padded = [{ name: '001' }, { name: '007' }, { name: '067' }];
  const bare = [{ name: '1', Achieved: true }, { name: '7', Achieved: true }, { name: '067', Achieved: true }];
  assert.equal(uplayR2.remapObjectiveIds(bare, padded), 2, 'the two unpadded ids resolve, the exact one was already right');
  assert.deepEqual(bare.map((a) => a.name), ['001', '007', '067']);

  // Same with a prefix the loader prepends: schema "OEI_ACH_001", loader key "OEI_ACH_1".
  const prefixed = [{ name: 'OEI_ACH_001' }, { name: 'OEI_ACH_010' }];
  const written = [{ name: 'OEI_ACH_1' }, { name: 'OEI_ACH_10' }, { name: 'OEI_ACH_99' }];
  assert.equal(uplayR2.remapObjectiveIds(written, prefixed), 2);
  assert.deepEqual(written.map((a) => a.name), ['OEI_ACH_001', 'OEI_ACH_010', 'OEI_ACH_99']);

  // Two api-names sharing one objective id must stay literal, exactly as before this rule existed.
  const ambiguous = [{ name: 'ACH_FS_01' }, { name: 'ACH_FSDLC_1' }];
  const risky = [{ name: '1' }, { name: '01' }];
  assert.equal(uplayR2.remapObjectiveIds(risky, ambiguous), 2);
  assert.deepEqual(risky.map((a) => a.name), ['ACH_FSDLC_1', 'ACH_FS_01'], 'each id keeps its literal owner');
});

test('a Uplay R2 save file parses into notifiable unlocks end to end', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wd-uplay-save-'));
  try {
    // Exactly what the emulator writes on a legacy loader: bare ids, `earned` as a number.
    const file = path.join(tmp, 'achievements.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        1: { displayName: 'Last to Leave', earned: 1, earned_time: 1754200000 },
        7: { displayName: 'Fort Fight', earned: 1, earned_time: 1754200500 },
        12: { displayName: 'Silence', earned: 0 },
      })
    );

    const parsed = await monitor.parse(file);
    uplayR2.remapObjectiveIds(parsed, [{ name: 'ACObsidian_Ach_1' }, { name: 'ACObsidian_Ach_7' }, { name: 'ACObsidian_Ach_12' }]);

    const unlocked = parsed.filter((a) => a.Achieved).map((a) => a.name);
    assert.deepEqual(unlocked.sort(), ['ACObsidian_Ach_1', 'ACObsidian_Ach_7']);
    const first = parsed.find((a) => a.name === 'ACObsidian_Ach_1');
    assert.equal(Number(first.UnlockTime), 1754200000, 'the unlock timestamp must survive the remap');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the watchdog watches both Uplay save roots', async () => {
  const folders = await monitor.getFolders();
  // One root per emulator generation. A Ubisoft title from before the R2 API only ever writes to the
  // R1 one, so missing it means those games never notify live.
  for (const root of ['Goldberg UplayEmu Saves', 'R1 UplayEmu Saves']) {
    const entry = folders.find((f) => String(f.dir).includes(root));
    assert.ok(entry, `${root} must be watched or Ubisoft unlocks never notify live`);
    assert.equal(entry.options.uplayR2, true, 'the folder must be flagged so its ids get translated');
    assert.ok(entry.options.file.includes('achievements.json'));
  }
});

test('the watchdog watches the Goldberg SocialClub save root', async () => {
  const folders = await monitor.getFolders();
  const entry = folders.find((f) => String(f.dir).includes('Goldberg SocialClub Emu Saves'));
  assert.ok(entry, 'Goldberg SocialClub Emu Saves must be watched or SocialClub unlocks never notify live');
  assert.equal(entry.options.socialClub, true, 'the folder must be flagged so game names resolve through the game index');
  // Folders here are named after the GAME, not an AppID, so a numeric filter would match nothing.
  assert.equal(typeof entry.options.filter, 'function', 'game-name folders must pass the traversal filter');
  assert.ok(entry.options.file.includes('achievements.json'));
  // Rockstar's own save blobs are rewritten constantly during play and nothing can decode them -
  // watching them would wake the monitor for no possible result.
  assert.ok(!entry.options.file.includes('cfg.dat'));
});
