'use strict';

/*
  Bully: Scholarship Edition has no Steam achievements. xowny's Achievements mod (Nexus 346) writes the
  unlocks to GSE Saves/12200/achievements.json and its whole list, names and icons included, to
  _derpy_script_loader/scripts/AchievementsMod/Runtime/state.ini in the game folder (a DM of 17/11/2026).
*/
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');

const steam = require('../../app/parser/steam.js');

const STATE = [
  '[summary]',
  'version=asi-bridge-1',
  'total=3',
  '',
  '[item0]',
  'id=BA_AfterHours',
  'title=After Hours',
  'description=Spend 5 hours out after curfew; then sleep.',
  'icon=ach_icon_0',
  'unlocked=1',
  'secret=0',
  'hidden=0',
  'mode=single',
  '',
  '[item1]',
  "id=BA_KickinTheBalls",
  "title=Kickin' the Balls",
  'description=#1 kicker',
  'icon=ach_icon_3',
  'secret=1',
  'hidden=1',
  '',
  '[item3]',
  'id=RA_WellThatWasFun',
  'title=Well, That Was Fun... I Guess',
  'icon=Well, That Was Fun... I Guess',
  '',
  '[item4]',
  'id=RA_Escape',
  'title=Escape',
  'icon=..\\..\\Runtime\\save',
  '',
  '[item2]',
  'title=No id, skipped',
  '',
].join('\r\n');

function bullyInstall() {
  const game = path.join(makeTempDir('aw-bully-mod-'), 'Bully Scholarship Edition');
  const mod = path.join(game, '_derpy_script_loader', 'scripts', 'AchievementsMod');
  fs.mkdirSync(path.join(mod, 'Runtime'), { recursive: true });
  fs.mkdirSync(path.join(mod, 'Graphics', 'Achievements'), { recursive: true });
  fs.writeFileSync(path.join(mod, 'Runtime', 'state.ini'), STATE);
  fs.writeFileSync(path.join(mod, 'Graphics', 'Achievements', 'ach_icon_0.png'), 'png');
  fs.writeFileSync(path.join(mod, 'Graphics', 'Achievements', 'Well, That Was Fun... I Guess.png'), 'png');
  fs.writeFileSync(path.join(mod, 'Runtime', 'save.png'), 'png');
  return { game, mod };
}

test("the Bully Achievements mod's state.ini is the game's achievement list when Steam has none", () => {
  const { game, mod } = bullyInstall();
  steam.forgetLocalSchemaLocations(game);
  const schema = steam.getLocalAchievementSchema(game, '12200', 'english');
  const iconOf = (name) => path.join(mod, 'Graphics', 'Achievements', `${name}.png`).replace(/\\/g, '/');
  const icon = iconOf('ach_icon_0');
  const fun = iconOf('Well, That Was Fun... I Guess');
  assert.deepEqual(schema, [
    { name: 'BA_AfterHours', default_value: 0, displayName: 'After Hours', hidden: 0, description: 'Spend 5 hours out after curfew; then sleep.', icon, icongray: icon },
    { name: 'BA_KickinTheBalls', default_value: 0, displayName: "Kickin' the Balls", hidden: 1, description: '#1 kicker', icon: '', icongray: '' },
    { name: 'RA_WellThatWasFun', default_value: 0, displayName: 'Well, That Was Fun... I Guess', hidden: 0, description: '', icon: fun, icongray: fun },
    { name: 'RA_Escape', default_value: 0, displayName: 'Escape', hidden: 0, description: '', icon: '', icongray: '' },
  ], 'a comma in an icon name is fine, a path out of the icon folder is not');
});

test('a game folder without the mod gets no list from it', () => {
  const game = makeTempDir('aw-bully-none-');
  assert.deepEqual(steam.getLocalAchievementSchema(game, '12200', 'english'), []);
});
