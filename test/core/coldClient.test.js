'use strict';

/*
  A ColdClient loader (gbe_fork's steamclient_experimental) served every check as "nothing to repair
  here": a loader starting a missing exe, announcing another game or built for the other
  architecture went unseen. Its own ini is now checked, and Play can be pointed at the loader. Run
  for real on 2026-11-09: the loader starts the exe as its child, under the exe's own name, passes
  its arguments on, and exits with the game, so the play time still follows the game's process.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const coldClient = require('../../app/util/coldClient.js');
const { deriveHealth, LEVEL, ACTION } = require('../../app/util/gameHealth.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-coldclient-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

// Just enough of a PE header for pe.exeArch(): MZ, e_lfanew, PE\0\0 and the machine type.
function peStub(arch) {
  const bytes = Buffer.alloc(0x60);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(0x40, 0x3c);
  bytes.writeUInt32LE(0x00004550, 0x40);
  bytes.writeUInt16LE(arch === 'x64' ? 0x8664 : 0x014c, 0x44);
  return bytes;
}

function install(name, { arch = 'x64', loaders = ['x64', 'x86'], ini = {}, appIdTxt = '' } = {}) {
  const gameDir = path.join(root, name);
  const loaderDir = path.join(gameDir, '_ColdClient');
  fs.mkdirSync(path.join(loaderDir, 'steam_settings'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'Game.exe'), peStub(arch));
  for (const loaderArch of loaders) fs.writeFileSync(path.join(loaderDir, `steamclient_loader_${loaderArch}.exe`), peStub(loaderArch));
  fs.writeFileSync(path.join(loaderDir, 'steamclient64.dll'), 'gbe');
  fs.writeFileSync(path.join(loaderDir, 'steamclient.dll'), 'gbe');
  if (appIdTxt) fs.writeFileSync(path.join(loaderDir, 'steam_settings', 'steam_appid.txt'), appIdTxt);
  const values = { Exe: '..\\Game.exe', ExeCommandLine: '', AppId: '400', SteamClientDll: 'steamclient.dll', SteamClient64Dll: 'steamclient64.dll', ...ini };
  const lines = ['[SteamClient]', ...Object.entries(values).map(([key, value]) => `${key}=${value}`), '[Persistence]', `Mode=${ini.Mode || 0}`];
  fs.writeFileSync(path.join(loaderDir, 'ColdClientLoader.ini'), `${lines.join('\r\n')}\r\n`);
  return { gameDir, loaderDir, exe: path.join(gameDir, 'Game.exe') };
}

test('a complete loader setup has no problem and can start the configured exe', () => {
  const { gameDir, loaderDir, exe } = install('Clean');
  const report = coldClient.diagnose({ loaderDir, gameDir, appid: '400' });
  assert.equal(report.problem, '');
  assert.equal(report.exe, exe, 'Exe= is relative to the loader');
  assert.equal(report.exeArch, 'x64');
  assert.equal(path.basename(report.loader), 'steamclient_loader_x64.exe', 'the loader of the exe’s architecture');
  assert.equal(coldClient.startsExe(report, exe), true);
  assert.equal(coldClient.startsExe(report, path.join(gameDir, 'Other.exe')), false, 'another exe is not what the loader starts');
  assert.deepEqual(coldClient.launchCommand({ loader: report.loader, exe }), { file: report.loader, cwd: loaderDir });
});

test('each fault is named, the first cause first', () => {
  const missing = install('Missing', { ini: { Exe: '..\\Gone.exe' } });
  assert.equal(coldClient.diagnose({ loaderDir: missing.loaderDir, gameDir: missing.gameDir }).problem, 'exe-missing');

  const outside = install('Outside', { ini: { Exe: process.execPath } });
  assert.equal(coldClient.diagnose({ loaderDir: outside.loaderDir, gameDir: outside.gameDir }).problem, 'exe-outside');

  const arch = install('Arch', { arch: 'x86', loaders: ['x64'] });
  assert.equal(coldClient.diagnose({ loaderDir: arch.loaderDir, gameDir: arch.gameDir }).problem, 'arch-mismatch', 'a 64-bit loader cannot inject a 32-bit game');

  const other = install('Other Game', { ini: { AppId: '401' } });
  assert.equal(coldClient.diagnose({ loaderDir: other.loaderDir, gameDir: other.gameDir, appid: '400' }).problem, 'appid-mismatch');
});

test('an empty AppId= falls back to steam_appid.txt, as the loader does', () => {
  const { loaderDir, gameDir } = install('From Txt', { ini: { AppId: '' }, appIdTxt: '401\n' });
  const report = coldClient.diagnose({ loaderDir, gameDir, appid: '400' });
  assert.equal(report.appId, '401');
  assert.equal(report.problem, 'appid-mismatch');
});

test('a loader that keeps running after the game is never offered as the way to play', () => {
  const { loaderDir, gameDir, exe } = install('Persistent', { ini: { Mode: 1 } });
  const report = coldClient.diagnose({ loaderDir, gameDir, appid: '400' });
  assert.equal(report.problem, '');
  assert.equal(report.launchable, false, 'Mode=1 holds the loader open until its dialog is closed: that would count as play');
  assert.equal(coldClient.launchCommand({ loader: path.join(loaderDir, 'steamclient_loader_x64.exe'), exe }), null);
});

test('a launch set up earlier falls back to the exe once the loader no longer starts it', () => {
  const { loaderDir, exe } = install('Stale');
  const loader = path.join(loaderDir, 'steamclient_loader_x64.exe');
  fs.writeFileSync(path.join(loaderDir, 'ColdClientLoader.ini'), '[SteamClient]\r\nExe=..\\Renamed.exe\r\n');
  assert.equal(coldClient.launchCommand({ loader, exe }), null);
  assert.equal(coldClient.launchCommand({ loader: path.join(loaderDir, 'gone.exe'), exe }), null);
  assert.equal(coldClient.diagnose({ loaderDir: path.join(root, 'nowhere') }), null);
});

test('Linux: names in the ini are matched whatever their case, as Wine does', { skip: process.platform !== 'linux' && 'Linux-only' }, () => {
  const { loaderDir, gameDir, exe } = install('Case', { ini: { Exe: '..\\GAME.EXE', SteamClient64Dll: 'SteamClient64.DLL' } });
  const report = coldClient.diagnose({ loaderDir, gameDir, appid: '400' });
  assert.equal(report.problem, '');
  assert.equal(report.exe, exe);
});

const base = {
  appid: '400',
  source: 'Goldberg',
  gameDir: 'C:/Games/Cold',
  gameDirExists: true,
  installed: true,
  exe: 'C:/Games/Cold/Game.exe',
  exeExists: true,
  achievements: { total: 10, unlocked: 0 },
  tracking: { indexed: true, binary: 'Game.exe' },
  notifications: { transport: 'auto' },
};
const served = (coldClientSignal, extra = {}) => ({ ...base, ...extra, crackLoader: { name: 'ColdClient', replaceable: false, coldClient: coldClientSignal } });
const emulatorRow = (health) => health.checks.find((entry) => entry.id === 'emulator');

test('Game Health: a loader fault is the headline, and nothing is offered to rewrite its ini', () => {
  const health = deriveHealth(served({ problem: 'appid-mismatch', launchable: false, viaLoader: false }));
  const row = emulatorRow(health);
  assert.equal(row.level, LEVEL.WARN);
  assert.equal(row.params.coldClient, 'appid-mismatch');
  assert.deepEqual(row.actions, []);
  assert.equal(health.reason, 'coldclient-setup');
});

test('Game Health: playing through the loader is offered, then can be taken back', () => {
  const offered = emulatorRow(deriveHealth(served({ problem: '', launchable: true, viaLoader: false })));
  assert.equal(offered.level, LEVEL.INFO, 'a working loader is not a fault');
  assert.deepEqual(offered.actions, [ACTION.LAUNCH_VIA_LOADER]);
  const taken = emulatorRow(deriveHealth(served({ problem: '', launchable: true, viaLoader: true })));
  assert.deepEqual(taken.actions, [ACTION.LAUNCH_DIRECT]);
  assert.equal(taken.params.viaLoader, true);
  const stale = emulatorRow(deriveHealth(served({ problem: '', launchable: false, viaLoader: true })));
  assert.equal(stale.params.viaLoader, undefined, 'Play falls back to the exe, so the row does not claim the loader');
  assert.deepEqual(stale.actions, [ACTION.LAUNCH_DIRECT], 'the setting can still be taken back');
});

test('Game Health: the loader’s steam_settings gets the repair a GBE folder gets', () => {
  const goldberg = {
    loader: 'ColdClient',
    steamSettings: 'C:/Games/Cold/_ColdClient/steam_settings',
    achievements: { found: 2, missing: ['A', 'B'], missingIcons: [] },
    issues: [
      { level: 'info', code: 'SERVED_BY_LOADER', message: '' },
      { level: 'error', code: 'MISSING_ACHIEVEMENTS', message: '' },
      { level: 'warning', code: 'EMULATOR_OFFLINE', message: '' },
    ],
  };
  const health = deriveHealth(served({ problem: '', launchable: false, viaLoader: false }, { goldberg }));
  const row = emulatorRow(health);
  assert.equal(row.level, LEVEL.WARN);
  assert.deepEqual(row.params.topics, ['schema'], 'offline mode has its own fix and is not repeated');
  assert.ok(row.actions.includes(ACTION.REPAIR_DATA));
  assert.ok(health.checks.find((entry) => entry.id === 'achievement-data').actions.includes(ACTION.REPAIR_DATA));
});

test('Game Health: another loader never gets the ColdClient offers', () => {
  const row = emulatorRow(deriveHealth({ ...base, crackLoader: { name: 'ALI213', replaceable: true, coldClient: { launchable: true } } }));
  assert.deepEqual(row.actions, []);
});
