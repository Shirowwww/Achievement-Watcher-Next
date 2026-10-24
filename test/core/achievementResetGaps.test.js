'use strict';

/*
  The full reset reaches every place an unlock is kept: the saves its readers find on their own, the
  GSE counters, the registry and the Watchdog's console baselines. Each case is restored afterwards,
  because a reset that cannot be undone is a data-loss bug with a button on it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const appDir = path.join(__dirname, '..', '..', 'app');
const targets = require(path.join(appDir, 'util', 'achievementResetTargets.js'));
const manualUnlock = require(path.join(appDir, 'parser', 'manualUnlock.js'));
const achievementReset = require(path.join(appDir, 'parser', 'achievementReset.js'));
const extras = require(path.join(appDir, 'parser', 'achievementSaveExtras.js'));
const xlln = require(path.join(appDir, 'parser', 'xlln.js'));
const runeUplay = require(path.join(appDir, 'parser', 'runeUplay.js'));
const madnesspatch = require(path.join(appDir, 'parser', 'madnesspatch.js'));
const markerpatch = require(path.join(appDir, 'parser', 'markerpatch.js'));
const { createBaselineCache } = require(path.join(__dirname, '..', '..', 'watchdog', 'util', 'baselineCache.js'));

function tempProfile() {
  const dir = makeTempDir('aw-reset-gaps-');
  achievementReset.setUserDataPath(dir);
  manualUnlock.setUserDataPath(dir);
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

// Swaps a reader's own lookup for the length of one test.
function stub(t, module, name, value) {
  const original = module[name];
  module[name] = value;
  t.after(() => {
    module[name] = original;
  });
}

function resetAndRestore(game, files, options = {}) {
  const originals = files.map((file) => [file, fs.readFileSync(file)]);
  const plan = achievementReset.plan(game, options);
  assert.equal(plan.supported, true);
  const result = achievementReset.run(plan, options);
  assert.deepEqual(result.errors, []);
  const after = new Map(files.map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));
  const restored = achievementReset.restore(game.appid, result.backupId, options);
  assert.deepEqual(restored.errors, []);
  for (const [file, bytes] of originals) assert.deepEqual(fs.readFileSync(file), bytes, `${path.basename(file)} is restored`);
  return { plan, after };
}

test('RAZOR1911 and CreamAPI saves are reset like the other emulator saves', () => {
  assert.equal(targets.resetActionFor('achievement', 'Razor1911'), targets.ACTION.DELETE);
  assert.equal(targets.resetActionFor('CreamAPI.Achievements.cfg'), targets.ACTION.DELETE);
});

test('the GSE stat counters go with achievements.json, or gbe_fork unlocks the achievement again', () => {
  const profile = tempProfile();
  const dir = path.join(profile, 'GSE Saves', '999999911');
  const save = write(path.join(dir, 'achievements.json'), '{"ACH_X":{"earned":true,"earned_time":1}}');
  const stat = write(path.join(dir, 'stats', 'kills'), Buffer.from([10, 0, 0, 0]));
  const { after } = resetAndRestore({ appid: '999999911', source: 'Goldberg', dataPaths: [{ source: 'Goldberg', path: dir }] }, [save, stat]);
  assert.equal(after.get(stat), null);
});

test('XLiveLessNess, RUNE Uplay, MadnessPatch and MarkerPatch saves found by their readers are reset', (t) => {
  const profile = tempProfile();
  const xllnFile = write(path.join(profile, 'xlln', 'achievements.dat'), Buffer.alloc(16, 1));
  const runeFile = write(path.join(profile, 'rune', 'achievements.cfg'), '"achievements"\n{\n\t"1"\n\t{\n\t\t"earned"\t"1"\n\t\t"time"\t"1700000000"\n\t}\n}\n');
  const madnessFile = write(path.join(profile, 'madness', 'Profile1', 'Achievements.txt'), 'Version = 2\nUnlockFlag = 6\n');
  const markerFile = write(path.join(profile, 'marker', 'settings.txt'), 'Controls.AcL.X = 0x0000000F\nControls.AcL.Y = 3\nVideo.Width = 1920\n');
  stub(t, xlln, 'stateFiles', () => [{ file: xllnFile, profile: 'p', mtimeMs: 0, size: 16 }]);
  stub(t, runeUplay, 'discoverFiles', () => [{ uplayId: '4321', userId: 'user', file: runeFile, mtimeMs: 0 }]);
  stub(t, madnesspatch, 'listProfiles', () => [{ profile: 'Profile1', file: madnessFile, mtimeMs: 0 }]);
  stub(t, markerpatch, 'stateFilePaths', () => [markerFile]);

  const game = (source, appid) => ({ appid, source, dataPaths: [{ source, path: path.join(profile, 'game') }] });
  assert.equal(resetAndRestore(game('XLiveLessNess', 'xlln-4D5307E6'), [xllnFile]).after.get(xllnFile), null);
  assert.equal(String(resetAndRestore(game('RUNE Uplay', 'uplay-4321'), [runeFile]).after.get(runeFile)), '"achievements"\n{\n\t"1"\n\t{\n\t\t"earned"\t"0"\n\t\t"time"\t"0"\n\t}\n}\n');
  assert.equal(String(resetAndRestore(game('MadnessPatch', madnesspatch.APPID), [madnessFile]).after.get(madnessFile)), 'Version = 2\nUnlockFlag = 0\n', 'the settings beside the flag stay');
  assert.equal(String(resetAndRestore(game('MarkerPatch', markerpatch.APPID), [markerFile]).after.get(markerFile)), 'Controls.AcL.X = 0x00000000\nControls.AcL.Y = 0\nVideo.Width = 1920\n');
});

test('FF7 achievement.dat is reset where the game folder is recognised', () => {
  const profile = tempProfile();
  const dir = path.join(profile, 'FINAL FANTASY VII');
  for (const name of ['ff7input.cfg', 'ff7sound.cfg', 'ff7video.cfg']) write(path.join(dir, name), '');
  const state = write(path.join(dir, 'achievement.dat'), Buffer.alloc(8, 0xff));
  const { after } = resetAndRestore({ appid: '39140', source: 'FF7 (2013)', dataPaths: [{ source: 'FF7 (2013)', path: dir }] }, [state]);
  assert.equal(after.get(state), null);
});

test('GreenLuma registry values are zeroed and restored; outside Windows they are left and said so', () => {
  tempProfile();
  const key = 'SOFTWARE/GLR/AppID/999999912/Achievements';
  const values = { [key]: { ACH_X: 1, ACH_X_Time: 1700000000, ACH_Y: 0 } };
  const registry = {
    names: (name) => Object.keys(values[name] || {}),
    subkeys: () => [],
    read: (name, value) => values[name][value],
    write: (name, value, data) => {
      values[name][value] = data;
    },
  };
  const game = { appid: '999999912', source: 'GreenLuma Reborn' };
  const plan = achievementReset.plan(game, { registry, platform: 'win32' });
  assert.deepEqual(plan.registry, [key]);
  const result = achievementReset.run(plan, { registry });
  assert.deepEqual(values[key], { ACH_X: 0, ACH_X_Time: 0, ACH_Y: 0 });
  achievementReset.restore(game.appid, result.backupId, { registry });
  assert.deepEqual(values[key], { ACH_X: 1, ACH_X_Time: 1700000000, ACH_Y: 0 });

  const elsewhere = achievementReset.plan(game, { platform: 'linux' });
  assert.deepEqual(elsewhere.blocked.map((entry) => entry.reason), ['registry-prefix']);
});

test('the console baseline is emptied, not deleted, so the next unlock is not taken for a first sight', () => {
  const profile = tempProfile();
  const dir = path.join(profile, 'trophy', 'NPWR00003_00');
  write(path.join(dir, 'TROPUSR.DAT'), Buffer.alloc(64));
  const baseline = write(path.join(profile, 'steam_cache', 'console', 'rpcs3-NPWR00003_00.json'), JSON.stringify({ unlocked: [1, 2] }));
  const { after } = resetAndRestore({ appid: 'NPWR00003_00', source: 'RPCS3 Emulator', dataPaths: [{ source: 'RPCS3 Emulator', path: dir }] }, [baseline]);
  assert.deepEqual(JSON.parse(String(after.get(baseline))), { unlocked: [] });
});

test('the app names console baselines exactly as the Watchdog does', () => {
  const dir = makeTempDir('aw-baseline-names-');
  for (const [prefix, key] of [
    ['rpcs3', 'NPWR00001_00'],
    ['', 'CUSA 00001'],
    ['xenia', '4D5307E6'],
    ['rune-uplay', 'user/x_4321'],
    ['madnesspatch', 'Profile 1'],
  ]) {
    assert.equal(extras.consoleBaselineFile(dir, prefix, key), createBaselineCache({ prefix, dir: path.join(dir, 'steam_cache', 'console') }).file(key));
  }
});
