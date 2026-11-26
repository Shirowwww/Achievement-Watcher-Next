'use strict';

/*
  Dead Rising Deluxe Remaster, a TENOKE release switched to GBE from Game Health (2026-11-26): the
  steam_api64.dll was swapped and tenoke.ini set aside, yet the game kept saving into TENOKE's
  <game>/SteamData/win64_save after the switch and GBE never wrote a byte. Something else in the
  release still serves Steam, so the swap is not what the game loads. The report only said "nothing
  recorded yet"; it has to say the switch did not take.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const crackLoaderDetect = require(path.join(__dirname, '..', '..', 'app', 'util', 'crackLoaderDetect.js'));
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const { deriveHealth, LEVEL } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));

const APPID = '2527390';
const SCHEMA = {
  achievement: {
    total: 1,
    list: [{ name: 'PHOTOJOURNALIST', displayName: 'Photojournalist', description: 'Take a photo', hidden: 0 }],
  },
};
const HOUR = 3600 * 1000;

// A TENOKE release after AW's switch: tenoke.ini.bak, the crack's dll kept as .bak, GBE in place.
function switchedTenokeGame(prefix) {
  const gameDir = fs.realpathSync(makeTempDir(prefix));
  fs.writeFileSync(path.join(gameDir, 'tenoke.ini'), `[TENOKE]\nid = ${APPID}\n`);
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'tenoke runtime');
  const saves = path.join(gameDir, 'SteamData', 'win64_save');
  fs.mkdirSync(saves, { recursive: true });
  fs.writeFileSync(path.join(saves, 'data000Slot.bin'), 'played under TENOKE');

  crackLoaderDetect.disableLoaderMarkers([gameDir]);
  fs.copyFileSync(path.join(gameDir, 'steam_api64.dll'), path.join(gameDir, 'steam_api64.dll.bak'));
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'gbe build reading steam_settings');
  const settings = path.join(gameDir, 'steam_settings');
  fs.mkdirSync(settings);
  fs.writeFileSync(path.join(settings, 'achievements.json'), JSON.stringify(SCHEMA.achievement.list.map((a) => ({ ...a, hidden: '0', icon: '', icongray: '' }))));
  return { gameDir, saveFile: path.join(saves, 'data000Slot.bin'), dll: path.join(gameDir, 'steam_api64.dll') };
}

function setTime(file, ms) {
  fs.utimesSync(file, ms / 1000, ms / 1000);
}

function emptySaves(prefix) {
  return [{ type: 'gbe', root: path.join(fs.realpathSync(makeTempDir(prefix)), 'GSE Saves') }];
}

test('a crack save written after the switch names the crack as still serving the game', () => {
  const game = switchedTenokeGame('aw-switch-still-');
  const switchedAt = Date.now() - 2 * HOUR;
  setTime(game.dll, switchedAt);
  setTime(game.saveFile, switchedAt + HOUR);

  const found = crackLoaderDetect.switchedLoaderStillSaving([game.gameDir], switchedAt);

  assert.equal(found.name, 'TENOKE');
  assert.equal(found.folder, path.join(game.gameDir, 'SteamData'));
  assert.equal(found.file, game.saveFile);
});

test('saves older than the switch say nothing: they are the crack playthrough before it', () => {
  const game = switchedTenokeGame('aw-switch-before-');
  const switchedAt = Date.now() - HOUR;
  setTime(game.dll, switchedAt);
  setTime(game.saveFile, switchedAt - HOUR);

  assert.equal(crackLoaderDetect.switchedLoaderStillSaving([game.gameDir], switchedAt), null);
});

test('an untouched crack folder is never reported as a failed switch', () => {
  const gameDir = fs.realpathSync(makeTempDir('aw-switch-none-'));
  fs.writeFileSync(path.join(gameDir, 'tenoke.ini'), `[TENOKE]\nid = ${APPID}\n`);
  fs.mkdirSync(path.join(gameDir, 'SteamData'));
  const stats = path.join(gameDir, 'SteamData', 'user_stats.ini');
  fs.writeFileSync(stats, '[ACHIEVEMENTS]\n');
  const since = Date.now() - 2 * HOUR;
  setTime(stats, since + HOUR);

  // Fresh crack saves, but nothing was switched: the crack is simply still the runtime.
  assert.equal(crackLoaderDetect.switchedLoaderStillSaving([gameDir], since), null);
});

test('the diagnosis reports the switch as not loaded, with the folder that proves it', () => {
  const game = switchedTenokeGame('aw-switch-diagnose-');
  const switchedAt = Date.now() - 2 * HOUR;
  setTime(game.dll, switchedAt);
  setTime(game.saveFile, switchedAt + HOUR);

  const report = goldberg.diagnose({ gameDir: game.gameDir, appid: APPID, schema: SCHEMA, savesRoots: emptySaves('aw-switch-diagnose-saves-') });
  const issue = report.issues.find((entry) => entry.code === 'SWITCHED_LOADER_STILL_SAVING');

  assert.ok(issue, JSON.stringify(report.issues.map((entry) => entry.code)));
  assert.equal(issue.level, 'error');
  assert.equal(issue.data.loader, 'TENOKE');
  assert.equal(issue.data.folder, path.join(game.gameDir, 'SteamData'));
});

test('a switch GBE really serves raises nothing', () => {
  const game = switchedTenokeGame('aw-switch-fine-');
  const switchedAt = Date.now() - HOUR;
  setTime(game.saveFile, switchedAt - HOUR);
  setTime(game.dll, switchedAt);

  const report = goldberg.diagnose({ gameDir: game.gameDir, appid: APPID, schema: SCHEMA, savesRoots: emptySaves('aw-switch-fine-saves-') });

  assert.ok(!report.issues.some((entry) => entry.code === 'SWITCHED_LOADER_STILL_SAVING'));
});

function switchedGame(issues) {
  return {
    appid: APPID,
    name: 'Dead Rising Deluxe Remaster',
    source: 'Goldberg',
    gameDir: 'E:/Games/DRDR',
    gameDirExists: true,
    installed: true,
    exe: 'E:/Games/DRDR/DRDR.exe',
    exeExists: true,
    achievements: { total: 50, unlocked: 0 },
    emulated: true,
    goldberg: {
      emulator: 'gbe',
      steamSettings: 'E:/Games/DRDR/steam_settings',
      dllCount: 1,
      achievements: { expected: 50, found: 50, missing: [], missingIcons: [] },
      save: { exists: false },
      issues,
      ok: false,
      setupAt: 1795668229554,
    },
    uplay: null,
    tracking: { indexed: true, binary: 'DRDR.exe' },
    notifications: { transport: 'auto', progressMuted: false },
    playtime: { total: 1485, lastPlayed: 1795668766 },
  };
}

test('Game Health says the switch did not take instead of "nothing recorded yet"', () => {
  const issue = {
    level: 'error',
    code: 'SWITCHED_LOADER_STILL_SAVING',
    message: 'still saving',
    data: { loader: 'TENOKE', folder: 'E:/Games/DRDR/SteamData', file: 'E:/Games/DRDR/SteamData/win64_save/data000Slot.bin' },
  };
  const report = deriveHealth(switchedGame([issue]));
  const emulator = report.checks.find((entry) => entry.id === 'emulator');

  assert.equal(emulator.level, LEVEL.FAIL);
  assert.equal(emulator.params.stillServedBy, 'TENOKE');
  assert.equal(emulator.params.stillSavingIn, 'E:/Games/DRDR/SteamData');
  assert.equal(report.reason, 'switch-not-loaded');
});
