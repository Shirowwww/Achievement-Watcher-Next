'use strict';

/*
  Alice: Madness Returns MadnessPatch: the schema is built straight from the mod's own txt/img
  resources, and unlock state is one "UnlockFlag = <decimal>" line per save profile, under
  Documents\My Games\Alice Madness Returns\AliceGame\CheckPoint\<profile>\Achievements.txt.

  checkpointRoot() itself is not exercised here - it resolves the real Documents shell folder
  through the registry, and a test has no business writing into a developer's actual Documents
  folder. listProfiles() takes an explicit root instead, which is what every other assertion here
  uses. Same reasoning ff7.test.js already follows for its own documentsRoot().
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const madnesspatch = require(path.join(__dirname, '..', '..', 'app', 'parser', 'madnesspatch.js'));
const { makeInstall, makeProfile, TOTAL } = require(path.join(__dirname, '..', 'helpers', 'madnesspatch.js'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-madnesspatch-'));

function writeIni(name, content) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, content);
  return file;
}

(async () => {
  assert.strictEqual(madnesspatch.parseUnlockFlag('UnlockFlag = 5\n'), 5n);
  assert.strictEqual(madnesspatch.parseUnlockFlag('UnlockFlag = 18446744073709551615\n'), 0xffffffffffffffffn, 'a full 64-bit flag is accepted');
  assert.strictEqual(madnesspatch.parseUnlockFlag('UnlockFlag = -1\n'), null, 'a negative value is refused');
  assert.strictEqual(madnesspatch.parseUnlockFlag('UnlockFlag = 0x5\n'), null, 'this file is decimal only, unlike MarkerPatch');
  assert.strictEqual(madnesspatch.parseUnlockFlag(''), null, 'a missing key is refused, not read as zero');
  // The runtime rewrites the whole line on every unlock; the last one read is the one that counts.
  assert.strictEqual(madnesspatch.parseUnlockFlag('UnlockFlag = 1\nUnlockFlag = 3\n'), 3n);

  assert.strictEqual(madnesspatch.achievementSupportEnabled(writeIni('off.ini', 'AchievementSupport = 0\n')), false);
  assert.strictEqual(madnesspatch.achievementSupportEnabled(writeIni('offword.ini', 'AchievementSupport = false\n')), false);
  assert.strictEqual(madnesspatch.achievementSupportEnabled(writeIni('on.ini', 'AchievementSupport = 1\n')), true);
  assert.strictEqual(madnesspatch.achievementSupportEnabled(writeIni('blank.ini', '')), true, 'a missing key defaults to on');
  assert.strictEqual(madnesspatch.achievementSupportEnabled(path.join(temp, 'nope.ini')), true, 'a missing file defaults to on');

  // detect() accepts either the game root or Binaries\Win32 directly.
  const gameRoot = path.join(temp, 'Alice Madness Returns');
  const installDir = makeInstall(temp, 'Alice Madness Returns');
  assert.ok(madnesspatch.detect(gameRoot).detected, 'the game root resolves through Binaries\\Win32');
  assert.ok(madnesspatch.detect(installDir).detected, 'Binaries\\Win32 itself is also accepted');
  assert.strictEqual(madnesspatch.detect(gameRoot).root, path.resolve(installDir));
  assert.ok(!madnesspatch.detect(path.join(installDir, 'Achievements')).detected, 'a subfolder alone is not an install');

  const found = madnesspatch.scan(gameRoot);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].appid, 'madnesspatch-19680', 'namespaced so it cannot collide with a legitimate Steam copy');
  assert.strictEqual(found[0].source, 'MadnessPatch');
  assert.strictEqual(found[0].data.type, 'madnesspatch');

  const disabledRoot = path.join(temp, 'Disabled');
  makeInstall(temp, 'Disabled', { ini: 'AchievementSupport = 0\n' });
  assert.deepStrictEqual(madnesspatch.scan(disabledRoot), [], 'an install with AchievementSupport off is not published');

  assert.strictEqual(madnesspatch.discover(path.join(temp, 'Empty')), null);

  const schema = await madnesspatch.getGameData({ root: installDir });
  assert.strictEqual(schema.achievement.total, TOTAL);
  assert.strictEqual(schema.achievement.list[0].name, 'MADNESSPATCH_0');
  assert.strictEqual(schema.achievement.list[0].displayName, 'Achievement 0');
  assert.ok(
    schema.achievement.list.every((entry) => entry.hidden === 0),
    'no achievement is guessed secret - there is no verified source for one'
  );
  assert.ok(
    schema.achievement.list.every((entry) => entry.icon.startsWith('file:///')),
    'every icon is copied out of the mod resources'
  );

  await assert.rejects(() => madnesspatch.getGameData({ root: path.join(temp, 'nowhere') }), 'a folder with no resources is refused, not published as an empty game');

  // listProfiles() / readProfileState(): each save profile is independent.
  const checkpointRoot = path.join(temp, 'CheckPoint');
  makeProfile(checkpointRoot, 'Profile1', 0b101n);
  makeProfile(checkpointRoot, 'Profile2', 0b010n);
  const profiles = madnesspatch.listProfiles(checkpointRoot);
  assert.strictEqual(profiles.length, 2);
  assert.strictEqual(madnesspatch.readProfileState(profiles.find((entry) => entry.profile === 'Profile1').file), 0b101n);
  assert.strictEqual(madnesspatch.readProfileState(profiles.find((entry) => entry.profile === 'Profile2').file), 0b010n);
  assert.strictEqual(madnesspatch.readProfileState(path.join(temp, 'missing.txt')), null);
  assert.deepStrictEqual(madnesspatch.listProfiles(path.join(temp, 'no-such-root')), [], 'a checkpoint root that does not exist yet answers with nothing');

  console.log('PASS: MadnessPatch resource schema and per-profile Achievements.txt bitflag decode correctly');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.rmSync(temp, { recursive: true, force: true });
    } catch {
      /* the OS will reclaim it */
    }
  });
