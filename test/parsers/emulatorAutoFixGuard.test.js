'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const achievements = require('../../app/parser/achievements.js');

test('automatic repair paths stay gated on a real game executable', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');
  assert.match(src, /realGameExePresent\(\)/, 'runtime config writes must be gated on a real game executable');
  assert.match(src, /requireGameExecutable: true/, 'background auto-fix must pass the executable requirement');
});

// The automatic pass writes into a game folder with no dialog in front of it, so these two are the
// invariants that keep it from being the dangerous path: a restore point exists before the first
// byte, and what gets written is decided by the diagnosis rather than assumed.
test('the automatic pass takes a restore point before it writes, on either branch', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');
  assert.match(src, /gbeBackup\.createBackup\(/, 'the automatic pass must take a backup of its own');
  assert.equal((src.match(/backupBeforeWrite\(\);/g) || []).length, 1, 'the data repair backs up first');
  assert.match(src, /beforeWrite: backupBeforeWrite,/, 'the full setup backs up once its own checks let it write');
});

// MW4 got a full copy of its setup on every scan: the backup came before the check that then found
// the folder already set up and wrote nothing.
test('a folder the automatic fix turns away gets no restore point', async () => {
  const userData = makeTempDir('aw-guard-user-');
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-guard-game-'));
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(gameDir, 'steam_settings'));
  achievements.initDebug({ isDev: false, userDataPath: userData });
  let backups = 0;
  try {
    const option = { emulator: { autoApplyNewGames: true }, achievement: {}, general: {} };
    const common = { gameName: 'Test Game', appid: '12345', option, requireGameExecutable: true, beforeWrite: () => backups++ };
    const existing = await achievements.autoApplyEmulatorFix({ ...common, gameDir, steamSettings: path.join(gameDir, 'steam_settings'), onlyIfUnconfigured: true });
    assert.equal(existing.reason, 'existing-fix');

    fs.rmSync(path.join(gameDir, 'steam_settings'), { recursive: true });
    const noExe = await achievements.autoApplyEmulatorFix({ ...common, gameDir, steamSettings: path.join(gameDir, 'steam_settings') });
    assert.equal(noExe.reason, 'no-game-executable');

    assert.equal(backups, 0);
  } finally {
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
});

test('what the automatic pass writes comes from the health diagnosis', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');
  assert.match(src, /autoFixPlan\.plan\(/, 'the scan must consult the plan rather than its own two flags');
  assert.match(src, /repairableCodes: autoFixPlan\.repairableCodesFor\(option\)/, 'the repairable set must follow the settings');
  // configs.user.ini is only completed when a user-config finding is what is being repaired, so a
  // scan never stamps an identity into a game nobody asked it to touch.
  assert.match(src, /fillUserDefaults: codes\.some\(/, 'fillUserDefaults must stay conditional on the findings');
});

test('automatic emulator fix skips a folder that has no game executable', async () => {
  const userData = makeTempDir('aw-guard-user-');
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-guard-game-'));
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true });
  achievements.initDebug({ isDev: false, userDataPath: userData });
  try {
    const result = await achievements.autoApplyEmulatorFix({
      gameDir,
      gameName: 'Test Game',
      appid: '12345',
      steamSettings: path.join(gameDir, 'steam_settings'),
      option: { emulator: { autoApplyNewGames: true }, achievement: {}, general: {} },
      requireGameExecutable: true,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'no-game-executable');
    assert.deepEqual(fs.readdirSync(gameDir), []);
  } finally {
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
});
