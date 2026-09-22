'use strict';

/*
  Dead Space 2 MarkerPatch: the schema is built straight from the mod's own txt/img resources, and
  unlock state is decoded from %LOCALAPPDATA%\EA Games\Dead Space 2\settings.txt, where two 32-bit
  values (Controls.AcL.X low, Controls.AcL.Y high) form one 64-bit bitflag.

  The two rules worth guarding are both refusals: a settings.txt with only one half of the flag is
  not read as half a bitfield, and a folder missing any of the four required pieces is not claimed
  as an install.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const markerpatch = require(path.join(__dirname, '..', '..', 'app', 'parser', 'markerpatch.js'));
const { makeInstall, settingsText, TOTAL } = require(path.join(__dirname, '..', 'helpers', 'markerpatch.js'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-markerpatch-'));
const realLocalAppData = process.env.LOCALAPPDATA;
process.env.LOCALAPPDATA = path.join(temp, 'LocalAppData');

function writeIni(name, content) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, content);
  return file;
}

(async () => {
  assert.strictEqual(markerpatch.parseSettingsFlag(settingsText(1, 0)), 1n, 'bit 0 comes from the low half');
  assert.strictEqual(markerpatch.parseSettingsFlag(settingsText(0, 1)), 1n << 32n, 'bit 32 comes from the high half');
  assert.strictEqual(markerpatch.parseSettingsFlag(settingsText('0x5', '0x0')), 5n, 'hex values are accepted');
  assert.strictEqual(markerpatch.parseSettingsFlag('Controls.AcL.X = 3\n'), null, 'the Y half missing refuses the whole flag');
  assert.strictEqual(markerpatch.parseSettingsFlag('Controls.AcL.Y = 3\n'), null, 'the X half missing refuses the whole flag');
  assert.strictEqual(markerpatch.parseSettingsFlag(''), null);

  // Only an explicit 0/false turns AchievementSupport off; anything else, including a missing key,
  // matches the mod's own default.
  assert.strictEqual(markerpatch.achievementSupportEnabled(writeIni('off.ini', 'AchievementSupport = 0\n')), false);
  assert.strictEqual(markerpatch.achievementSupportEnabled(writeIni('offword.ini', 'AchievementSupport = false\n')), false);
  assert.strictEqual(markerpatch.achievementSupportEnabled(writeIni('on.ini', 'AchievementSupport = 1\n')), true);
  assert.strictEqual(markerpatch.achievementSupportEnabled(writeIni('blank.ini', '')), true, 'a missing key defaults to on');
  assert.strictEqual(markerpatch.achievementSupportEnabled(path.join(temp, 'nope.ini')), true, 'a missing file defaults to on');

  const installDir = makeInstall(temp, 'Dead Space 2');
  assert.ok(markerpatch.detect(installDir).detected, 'a complete install is detected');
  assert.ok(!markerpatch.detect(path.join(installDir, 'achievements')).detected, 'a subfolder alone is not an install');
  assert.ok(!markerpatch.detect('').detected);

  const found = markerpatch.scan(installDir);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].appid, 'markerpatch-47780', 'namespaced so it cannot collide with a legitimate Steam copy');
  assert.strictEqual(found[0].source, 'MarkerPatch');
  assert.strictEqual(found[0].data.type, 'markerpatch');

  const disabled = makeInstall(temp, 'Disabled', { ini: 'AchievementSupport = 0\n' });
  assert.deepStrictEqual(markerpatch.scan(disabled), [], 'an install with AchievementSupport off is not published');

  // discover() walks a library root looking for the one install - the folder the user adds in
  // Settings -> Folders can be a whole games library, not just this game.
  const library = path.join(temp, 'Games');
  fs.mkdirSync(library, { recursive: true });
  const nested = makeInstall(library, 'Dead Space 2');
  const walked = markerpatch.discover(library);
  assert.ok(walked && walked.detected);
  assert.strictEqual(walked.root, path.resolve(nested));
  assert.strictEqual(markerpatch.discover(path.join(temp, 'Empty')), null);

  const schema = await markerpatch.getGameData({ root: installDir });
  assert.strictEqual(schema.achievement.total, TOTAL);
  assert.strictEqual(schema.achievement.list[0].name, 'MARKERPATCH_0');
  assert.strictEqual(schema.achievement.list[0].displayName, 'Achievement 0');
  assert.strictEqual(schema.achievement.list[0].description, 'Description 0');
  assert.ok(
    schema.achievement.list.every((entry) => entry.hidden === 0),
    'no achievement is guessed secret - there is no verified source for one'
  );
  assert.ok(
    schema.achievement.list.every((entry) => entry.icon.startsWith('file:///')),
    'every icon is copied out of the mod resources'
  );

  await assert.rejects(() => markerpatch.getGameData({ root: path.join(temp, 'nowhere') }), 'a folder with no resources is refused, not published as an empty game');

  // getAchievements(): the bitflag decoded from settings.txt, gated by AchievementSupport again -
  // the ini could have changed since the library scan claimed the folder.
  fs.mkdirSync(path.dirname(markerpatch.stateFilePath()), { recursive: true });
  fs.writeFileSync(markerpatch.stateFilePath(), settingsText(0b101, 0));
  const unlocked = markerpatch
    .getAchievements({ root: installDir, ini: path.join(installDir, 'MarkerPatch.ini') })
    .map((entry) => entry.id)
    .sort();
  assert.deepStrictEqual(unlocked, ['MARKERPATCH_0', 'MARKERPATCH_2']);

  assert.deepStrictEqual(
    markerpatch.getAchievements({ root: disabled, ini: path.join(disabled, 'MarkerPatch.ini') }),
    [],
    'a disabled install reports nothing, even with unlocks already on disk'
  );

  fs.writeFileSync(markerpatch.stateFilePath(), 'Controls.AcL.X = 1\n');
  assert.deepStrictEqual(markerpatch.getAchievements({ root: installDir, ini: path.join(installDir, 'MarkerPatch.ini') }), [], 'a half-written settings.txt is not read as a partial unlock');

  console.log('PASS: MarkerPatch resource schema and settings.txt bitflag decode correctly');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (realLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = realLocalAppData;
    try {
      fs.rmSync(temp, { recursive: true, force: true });
    } catch {
      /* the OS will reclaim it */
    }
  });
