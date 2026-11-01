'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const { deriveHealth, LEVEL } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));

const APPID = '2668510';
const DAY = 24 * 3600 * 1000;

/*
  #160: Red Dead Redemption runs Valve's own steam_api64.dll and a mod writes its unlocks into
  GSE Saves. Nothing there is a Steam emulator to set up, yet it was reported as "Goldberg is likely
  not set up". The dll date is what tells it apart from a game update that wiped a real setup: there
  the old save predates the dll the update brought back.
*/
function fixture({ dllAge, saveAge }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-mod-save-'));
  const gameDir = path.join(root, 'Red Dead Redemption');
  fs.mkdirSync(gameDir);
  const dll = path.join(gameDir, 'steam_api64.dll');
  fs.writeFileSync(dll, 'valve');
  const saveDir = path.join(root, 'GSE Saves', APPID);
  fs.mkdirSync(saveDir, { recursive: true });
  const save = path.join(saveDir, 'achievements.json');
  fs.writeFileSync(save, JSON.stringify({ ACH_1: { earned: true, earned_time: 1790000000 } }));
  const now = Date.now();
  fs.utimesSync(dll, new Date(now - dllAge), new Date(now - dllAge));
  fs.utimesSync(save, new Date(now - saveAge), new Date(now - saveAge));
  return { gameDir, savesRoots: [{ type: 'gbe', root: path.join(root, 'GSE Saves') }] };
}

const codes = (report) => report.issues.map((issue) => issue.code);

test('a save kept up to date with no emulator in the folder needs no Goldberg setup', () => {
  const { gameDir, savesRoots } = fixture({ dllAge: 300 * DAY, saveAge: DAY });

  const report = goldberg.diagnose({ gameDir, appid: APPID, savesRoots });

  assert.ok(codes(report).includes('SAVE_WITHOUT_EMULATOR'), JSON.stringify(report.issues));
  assert.ok(!codes(report).includes('NO_STEAM_SETTINGS'));
  assert.equal(report.ok, true);
});

test('a save older than the dll is a setup an update wiped, and stays an error', () => {
  const { gameDir, savesRoots } = fixture({ dllAge: DAY, saveAge: 30 * DAY });

  const report = goldberg.diagnose({ gameDir, appid: APPID, savesRoots });

  assert.ok(codes(report).includes('NO_STEAM_SETTINGS'));
});

test('a folder with no steam_api dll at all proves nothing, and stays an error', () => {
  const { gameDir, savesRoots } = fixture({ dllAge: 300 * DAY, saveAge: DAY });
  fs.rmSync(path.join(gameDir, 'steam_api64.dll'));

  const report = goldberg.diagnose({ gameDir, appid: APPID, savesRoots });

  assert.ok(codes(report).includes('NO_STEAM_SETTINGS'), JSON.stringify(report.issues));
});

test('Game Health shows such a game as set up rather than broken', () => {
  const health = deriveHealth({
    appid: APPID,
    name: 'Red Dead Redemption',
    source: 'Goldberg',
    gameDir: 'C:/Jeux/RDR',
    gameDirExists: true,
    installed: true,
    achievements: { total: 51, unlocked: 1 },
    emulated: true,
    goldberg: {
      emulator: 'none',
      steamSettings: null,
      dllCount: 0,
      save: { exists: true, type: 'gbe', earned: 1, total: 51 },
      issues: [{ level: 'info', code: 'SAVE_WITHOUT_EMULATOR', message: '' }],
      ok: true,
    },
    uplay: null,
    tracking: { indexed: true, binary: 'RDR.exe' },
    notifications: { transport: 'toast', progressMuted: false },
  });

  const emulator = health.checks.find((c) => c.id === 'emulator');
  assert.ok(!emulator || emulator.level === LEVEL.OK, JSON.stringify(emulator));
});
