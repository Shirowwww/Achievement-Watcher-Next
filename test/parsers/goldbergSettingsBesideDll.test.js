'use strict';

/*
  Goldberg and GBE Fork read steam_settings from the folder their own dll was loaded from, and from
  nowhere else. An Unreal repack puts the dll under <Name>/Binaries/Win64 while guides tell people
  to drop steam_settings at the game root, and the result diagnosed as a perfect setup: schema
  complete, every icon present, and not one unlock ever written (reported for The Blood of
  Dawnwalker, 46/46 achievements found, no GSE save at all).

  These cover the three places that has to hold: resolution picks the folder the emulator reads,
  the diagnosis says so when it cannot, and the repair writes where the dll will look.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const { planAchievementDataRepair } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealthRepair.js'));

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const SCHEMA = { achievement: { total: 1, list: [{ name: 'FIRST', displayName: 'First', description: 'First one', hidden: 0 }] } };

// A complete GBE folder, so the only thing a test varies is where it sits.
function writeSettings(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'achievements.json'), JSON.stringify([{ name: 'FIRST', displayName: 'First', description: 'First one', hidden: '0', icon: '', icongray: '' }]));
  fs.writeFileSync(path.join(dir, 'steam_appid.txt'), '3751260');
  fs.writeFileSync(path.join(dir, 'configs.app.ini'), '[app::dlcs]\nunlock_all=1\n');
  fs.writeFileSync(path.join(dir, 'configs.main.ini'), '[main::general]\nnew_app_ticket=1\ngc_token=1\n');
  fs.writeFileSync(path.join(dir, 'configs.user.ini'), '[user::general]\naccount_name=Player\nlanguage=english\n');
  return dir;
}

function writeDll(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'emu');
  return dir;
}

test('a steam_settings beside the dll wins over an empty one at the game root', () => {
  const gameDir = path.join(tmpdir('aw-beside-'), 'Dawnwalker');
  const dllDir = writeDll(path.join(gameDir, 'Binaries', 'Win64'));
  writeSettings(path.join(dllDir, 'steam_settings'));
  fs.mkdirSync(path.join(gameDir, 'steam_settings'), { recursive: true });

  assert.equal(goldberg.findSteamSettings(gameDir), path.join(dllDir, 'steam_settings'));
});

test('the game root still short-circuits the walk when the dll is at the root too', () => {
  const gameDir = path.join(tmpdir('aw-root-'), 'Flat Game');
  writeDll(gameDir);
  writeSettings(path.join(gameDir, 'steam_settings'));
  // A decoy deeper in the tree must not win: this layout is the common one and has to stay cheap.
  writeSettings(path.join(gameDir, 'Extras', 'steam_settings'));

  assert.equal(goldberg.findSteamSettings(gameDir), path.join(gameDir, 'steam_settings'));
});

test('an empty folder beside the dll does not outrank a fully configured one at the root', () => {
  // Adjacency breaks ties; it does not hand the setup to a folder with nothing in it. The mismatch
  // is what the diagnosis is for (next test), and the repair is what moves the files.
  const gameDir = path.join(tmpdir('aw-empty-'), 'Dawnwalker');
  const dllDir = writeDll(path.join(gameDir, 'Binaries', 'Win64'));
  fs.mkdirSync(path.join(dllDir, 'steam_settings'), { recursive: true });
  writeSettings(path.join(gameDir, 'steam_settings'));

  assert.equal(goldberg.findSteamSettings(gameDir), path.join(gameDir, 'steam_settings'));
});

test('a complete steam_settings the emulator never reads is reported, not passed as healthy', () => {
  const gameDir = path.join(tmpdir('aw-unread-'), 'Dawnwalker');
  const dllDir = writeDll(path.join(gameDir, 'Binaries', 'Win64'));
  writeSettings(path.join(gameDir, 'steam_settings'));

  const report = goldberg.diagnose({ gameDir, appid: '3751260', schema: SCHEMA, savesRoots: [] });
  const issue = report.issues.find((entry) => entry.code === 'SETTINGS_NOT_BESIDE_DLL');

  assert.ok(issue, 'the mismatch must be raised');
  assert.equal(issue.level, 'warning');
  assert.equal(report.settingsBesideDll, false);
  assert.deepEqual(report.dllDirs, [dllDir]);
  assert.deepEqual(issue.data.dllDirs, [dllDir]);
  assert.equal(issue.data.settingsDir, gameDir);
  // Everything else about the setup is genuinely fine, which is exactly why this was invisible.
  assert.equal(report.achievements.found, 1);
  assert.deepEqual(report.achievements.missing, []);
  assert.ok(report.ok, 'a misplaced folder is a warning, not a broken schema');
});

test('a setup with the folder beside the dll raises nothing', () => {
  const gameDir = path.join(tmpdir('aw-ok-'), 'Dawnwalker');
  const dllDir = writeDll(path.join(gameDir, 'Binaries', 'Win64'));
  writeSettings(path.join(dllDir, 'steam_settings'));

  const report = goldberg.diagnose({ gameDir, appid: '3751260', schema: SCHEMA, savesRoots: [] });
  assert.equal(report.settingsBesideDll, true);
  assert.ok(!report.issues.some((entry) => entry.code === 'SETTINGS_NOT_BESIDE_DLL'));
});

test('with no emulator dll on disk there is no folder to be beside, so nothing is claimed', () => {
  const gameDir = path.join(tmpdir('aw-nodll-'), 'Dawnwalker');
  writeSettings(path.join(gameDir, 'steam_settings'));

  const report = goldberg.diagnose({ gameDir, appid: '3751260', schema: SCHEMA, savesRoots: [] });
  assert.equal(report.settingsBesideDll, null);
  assert.deepEqual(report.dllDirs, []);
  assert.ok(!report.issues.some((entry) => entry.code === 'SETTINGS_NOT_BESIDE_DLL'));
});

test('the repair writes beside the dll instead of rewriting a folder the game never opens', () => {
  const gameDir = path.resolve('D:', 'Games', 'Dawnwalker');
  const dllDir = path.join(gameDir, 'Binaries', 'Win64');
  const plan = planAchievementDataRepair({
    steamSettings: path.join(gameDir, 'steam_settings'),
    gameDir,
    dllDirs: [dllDir],
    exePath: path.join(dllDir, 'Dawnwalker.exe'),
  });

  assert.equal(plan.target, path.join(dllDir, 'steam_settings'));
  assert.equal(plan.relocatedFrom, path.join(gameDir, 'steam_settings'));
  assert.equal(plan.backup, path.join(dllDir, 'steam_settings', '.aw-backups'));
});

test('the dll beside the executable is the one that decides, when several are on disk', () => {
  const gameDir = path.resolve('D:', 'Games', 'Dawnwalker');
  const launcherDir = path.join(gameDir, 'Launcher');
  const dllDir = path.join(gameDir, 'Binaries', 'Win64');
  const plan = planAchievementDataRepair({
    steamSettings: path.join(gameDir, 'steam_settings'),
    gameDir,
    dllDirs: [launcherDir, dllDir],
    exePath: path.join(dllDir, 'Dawnwalker.exe'),
  });

  assert.equal(plan.target, path.join(dllDir, 'steam_settings'));
});

test('a folder already beside the dll is repaired where it stands', () => {
  const gameDir = path.resolve('D:', 'Games', 'Dawnwalker');
  const dllDir = path.join(gameDir, 'Binaries', 'Win64');
  const plan = planAchievementDataRepair({
    steamSettings: path.join(dllDir, 'steam_settings'),
    gameDir,
    dllDirs: [dllDir],
    exePath: path.join(dllDir, 'Dawnwalker.exe'),
  });

  assert.equal(plan.target, path.join(dllDir, 'steam_settings'));
  assert.equal(plan.relocatedFrom, '', 'nothing moved, so nothing to announce');
});

test('with no dll folder known the plan is exactly what it always was', () => {
  const gameDir = path.resolve('D:', 'Games', 'Flat Game');
  const plan = planAchievementDataRepair({ steamSettings: path.join(gameDir, 'steam_settings'), gameDir });

  assert.equal(plan.target, path.join(gameDir, 'steam_settings'));
  assert.equal(plan.relocatedFrom, '');

  const guessed = planAchievementDataRepair({ gameDir });
  assert.equal(guessed.target, path.join(gameDir, 'steam_settings'));
});
