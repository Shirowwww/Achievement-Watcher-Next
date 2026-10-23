'use strict';

/*
  The "Add a game" verdicts with the library's real readers, on game folders built on disk: the
  dialog must say what the scan will actually find there.
*/

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');
const pcports = require('../helpers/pcports');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
const achievements = require('../../app/parser/achievements.js');
const { detectManualGame, defaultReaders } = require('../../app/util/manualGameDetect.js');
achievements.initDebug({ isDev: false, userDataPath: makeTempDir('aw-manual-detect-logs-') });
test.after(() => {
  Module._load = originalLoad;
});

const EVERY_SOURCE = { steamEmu: true, rpcs3: true, shadps4: true, kytyps5: true, xenia: true, xlln: true, markerpatch: true, madnesspatch: true, pcports: true, socialClub: true, ps4recomp: true };
const readers = defaultReaders({ folderGames: (dir) => achievements.previewWatchedFolder(dir, EVERY_SOURCE) });

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('a GBE Fork install gives its emulator, its AppID and its schema size', async () => {
  const game = path.join(makeTempDir('aw-manual-gbe-'), 'Worms W.M.D');
  write(path.join(game, 'WormsWMD.exe'), 'MZ');
  write(path.join(game, 'steam_api64.dll'), 'fake dll that reads steam_settings');
  write(path.join(game, 'steam_settings', 'steam_appid.txt'), '327030');
  write(path.join(game, 'steam_settings', 'configs.user.ini'), '[user::general]\naccount_name=Player\n');
  write(path.join(game, 'steam_settings', 'achievements.json'), JSON.stringify([{ name: 'A' }, { name: 'B' }]));

  const found = await detectManualGame(path.join(game, 'WormsWMD.exe'), readers);
  assert.deepEqual([found.kind, found.name, found.appid, found.achievements, found.count], ['steam-emulator', 'GBE Fork', '327030', 'tracked', 2]);
});

test('Valve s own dll and steam_appid.txt are not an emulator', async () => {
  const game = path.join(makeTempDir('aw-manual-valve-'), 'Plain Game');
  write(path.join(game, 'Game.exe'), 'MZ');
  write(path.join(game, 'steam_api64.dll'), 'valve runtime');
  write(path.join(game, 'steam_appid.txt'), '480');

  const found = await detectManualGame(path.join(game, 'Game.exe'), readers);
  assert.deepEqual([found.kind, found.achievements], ['none', 'none']);
});

test('a recompiled port is claimed by its own reader', async () => {
  const root = makeTempDir('aw-manual-port-');
  pcports.makeInstall(root);
  const exe = path.join(root, "Link's Awakening DX HD.exe");

  const found = await detectManualGame(exe, readers);
  assert.deepEqual([found.kind, found.name, found.achievements, found.count], ['recomp', 'PC Port', 'folder', 1]);
});

test('an OnlineFix release gives its real AppID, never the Spacewar one it runs under', async () => {
  const game = path.join(makeTempDir('aw-manual-onlinefix-'), 'Big Walk');
  write(path.join(game, 'Big Walk.exe'), 'MZ');
  write(path.join(game, 'OnlineFix.ini'), '[Main]\nRealAppId=1478500\nFakeAppId=480\n');

  const found = await detectManualGame(path.join(game, 'Big Walk.exe'), readers);
  assert.deepEqual([found.name, found.appid, found.achievements], ['OnlineFix', '1478500', 'tracked']);
});

const RUNE_INI = '###\n### RUNE Steam Emulator\n###\n[Settings]\nAppId=1245620\nUserName=Player\n';
const STEAMWORKS = ['Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv157', 'Win64'];

test('a RUNE release beside the exe is named RUNE and keeps its AppID', async () => {
  const game = path.join(makeTempDir('aw-manual-rune-root-'), 'Elden Ring');
  write(path.join(game, 'eldenring.exe'), 'MZ');
  write(path.join(game, 'steam_api64.dll'), 'rune runtime');
  write(path.join(game, 'steam_api64.rne'), 'valve original');
  write(path.join(game, 'steam_emu.ini'), RUNE_INI);

  const found = await detectManualGame(path.join(game, 'eldenring.exe'), readers);
  assert.deepEqual([found.kind, found.name, found.appid, found.achievements], ['steam-emulator', 'RUNE', '1245620', 'tracked']);
});

test('a packaged Unreal RUNE release keeps its AppID in the engine Steamworks folder', async () => {
  const game = path.join(makeTempDir('aw-manual-rune-ue-'), 'Little Nightmares');
  write(path.join(game, 'LittleNightmares.exe'), 'MZ');
  write(path.join(game, 'Atlas', 'Binaries', 'Win64', 'LittleNightmares-Win64-Shipping.exe'), 'MZ');
  write(path.join(game, ...STEAMWORKS, 'steam_api64.dll'), 'rune runtime');
  write(path.join(game, ...STEAMWORKS, 'steam_emu.ini'), RUNE_INI);

  for (const exe of [path.join(game, 'LittleNightmares.exe'), path.join(game, 'Atlas', 'Binaries', 'Win64', 'LittleNightmares-Win64-Shipping.exe')]) {
    const found = await detectManualGame(exe, readers);
    assert.deepEqual([found.name, found.appid, found.achievements], ['RUNE', '1245620', 'tracked'], exe);
  }
});

test('a RUNE release with only its .rne and a steam_appid.txt still gives the AppID', async () => {
  const game = path.join(makeTempDir('aw-manual-rune-rne-'), 'Dawnwalker');
  write(path.join(game, 'Dawnwalker.exe'), 'MZ');
  write(path.join(game, ...STEAMWORKS, 'steam_api64.dll'), 'rune runtime');
  write(path.join(game, ...STEAMWORKS, 'steam_api64.rne'), 'valve original');
  write(path.join(game, ...STEAMWORKS, 'steam_appid.txt'), '3061810');

  const found = await detectManualGame(path.join(game, 'Dawnwalker.exe'), readers);
  assert.deepEqual([found.name, found.appid], ['RUNE', '3061810']);
});

test('a RUNE steamclient build reads its AppID from the Steam folder', async () => {
  const game = path.join(makeTempDir('aw-manual-rune-client-'), 'Some Game');
  write(path.join(game, 'Game.exe'), 'MZ');
  write(path.join(game, 'steam_api64.dll'), 'valve runtime');
  write(path.join(game, 'Steam', 'steamclient64.dll'), 'rune client');
  write(path.join(game, 'Steam', 'steam_emu.ini'), RUNE_INI);

  const found = await detectManualGame(path.join(game, 'Game.exe'), readers);
  assert.deepEqual([found.name, found.appid, found.achievements], ['RUNE', '1245620', 'tracked']);
});

test('a scene release keeps the AppID its ini names', async () => {
  const game = path.join(makeTempDir('aw-manual-rune-'), 'Some Game');
  write(path.join(game, 'Game.exe'), 'MZ');
  write(path.join(game, 'steam_emu.ini'), '[Settings]\nAppId=1245620\n');

  const found = await detectManualGame(path.join(game, 'Game.exe'), readers);
  assert.equal(found.kind, 'steam-emulator');
  assert.equal(found.appid, '1245620');
  assert.equal(found.achievements, 'tracked');
});
