'use strict';

/*
  A Ubisoft game sold on Steam ships both layers, so a Uplay loader lying in the folder does not mean
  the Uplay layer is the one serving its achievements. When a crack loader is already doing that, the
  Uplay setup is not broken, it is unused.

  Reporting it as an error offered "Apply emulator fix (Uplay R1/R2)" on a game that already works,
  which would replace a working setup with a different one. Seen on ZOMBI, served by ALI213, whose
  leftover R1 loader is too old to redirect anything and said so in the same report.
*/

const assert = require('node:assert/strict');
const test = require('node:test');

const gameHealth = require('../../app/util/gameHealth.js');

const uplayReport = {
  mapping: { steam_appid: 339230, steam_name: 'ZOMBI' },
  issues: [
    { level: 'error', code: 'NO_SCHEMA_JSON', message: 'achievements_schema.json is missing' },
    { level: 'warning', code: 'NO_INI', message: 'No upc_r1.ini found beside the loader dll' },
  ],
};

const signalsFor = (crackLoader) => ({
  appid: 339230,
  name: 'ZOMBI',
  gameDir: 'C:\\Jeux\\ZOMBI',
  gameDirExists: true,
  installed: true,
  exe: 'C:\\Jeux\\ZOMBI\\ZOMBI.exe',
  exeExists: true,
  uplay: uplayReport,
  crackLoader,
});

const uplayRow = (signals) => gameHealth.deriveHealth(signals).checks.find((c) => c.id === 'uplay');

test('a game another emulator already serves is not offered a Uplay repair', () => {
  const served = uplayRow(signalsFor({ name: 'ALI213' }));
  assert.ok(served, 'the row must still be shown, so the user can see what is going on');
  assert.deepEqual(served.actions, [], 'offering the fix here replaces a working setup with another');
  assert.equal(served.level, gameHealth.LEVEL.INFO, 'an unused layer is not a fault');
  assert.equal(served.params.servedBy, 'ALI213', 'and the row has to name what is serving the game');
  assert.equal(served.blocking, false);
});

test('with no other emulator in the folder the repair is still offered', () => {
  const alone = uplayRow(signalsFor(null));
  assert.ok(alone, 'the row exists either way');
  assert.ok(alone.actions.includes(gameHealth.ACTION.REPAIR_UPLAY), 'a genuinely broken Uplay setup must stay repairable');
  assert.equal(alone.level, gameHealth.LEVEL.FAIL);
  assert.equal(alone.params.servedBy, undefined);
});
