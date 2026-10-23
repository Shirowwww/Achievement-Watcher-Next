'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { detectManualGame, describeDetection, consoleEmulatorFor } = require('../../app/util/manualGameDetect.js');

const GAME = path.join('C:', 'Jeux', 'Worms W.M.D');
const exeIn = (dir, name) => path.join(dir, name);

test('a GBE Fork setup with an AppID says its achievements will be tracked', async () => {
  const found = await detectManualGame(exeIn(GAME, 'WormsWMD.exe'), {
    goldberg: () => ({ appid: '327030', emulator: 'gbe', schemaCount: 29 }),
  });
  assert.equal(found.kind, 'steam-emulator');
  assert.equal(found.name, 'GBE Fork');
  assert.equal(found.appid, '327030');
  assert.equal(found.achievements, 'tracked');
  assert.equal(found.count, 29);
  assert.equal(found.gameDir, GAME);
});

test('a crack loader is named after the loader, and with no AppID the title is looked up', async () => {
  const found = await detectManualGame(exeIn(GAME, 'Game.exe'), { crackLoader: () => ({ name: 'OnlineFix' }) });
  assert.equal(found.name, 'OnlineFix');
  assert.equal(found.appid, '');
  assert.equal(found.achievements, 'by-title');
});

test('a scene release read from its ini takes the AppID and the family the save reader found', async () => {
  const found = await detectManualGame(exeIn(GAME, 'Game.exe'), {
    folderGames: () => [{ appid: '1245620', source: 'Rune', data: { type: 'file' } }],
  });
  assert.deepEqual([found.kind, found.name, found.appid, found.achievements], ['steam-emulator', 'Rune', '1245620', 'tracked']);
});

test('a console emulator is recognised by its executable, and counts the games its folder holds', async () => {
  const dir = path.join('D:', 'Emus', 'RPCS3');
  const found = await detectManualGame(exeIn(dir, 'rpcs3.exe'), {
    folderGames: (asked) => (asked === dir ? [{ appid: 'BLES00001', source: 'RPCS3 Emulator', data: { type: 'rpcs3' } }, { appid: 'BLES00002', source: 'RPCS3 Emulator', data: { type: 'rpcs3' } }] : []),
  });
  assert.deepEqual([found.kind, found.name, found.platform, found.achievements, found.count], ['console-emulator', 'RPCS3', 'PlayStation', 'folder', 2]);
  assert.equal(found.folder, dir);
});

test('emulators that report to RetroAchievements, and those no source reads, say so', async () => {
  const retro = await detectManualGame(exeIn('D:', 'pcsx2-qt.exe'));
  assert.deepEqual([retro.name, retro.platform, retro.achievements], ['PCSX2', 'PlayStation', 'retro']);
  const ryujinx = await detectManualGame(exeIn('D:', 'Ryujinx.exe'));
  assert.deepEqual([ryujinx.kind, ryujinx.platform, ryujinx.achievements], ['console-emulator', 'Nintendo Switch', 'none']);
  assert.equal(consoleEmulatorFor('C:\\Games\\MyGame.exe'), null);
});

test('a recompiled game is claimed by its own reader, before any Steam emulator in the same folder', async () => {
  const found = await detectManualGame(exeIn(GAME, 'Game.exe'), {
    folderGames: () => [{ appid: '4D5307E6', source: 'Xbox 360 Recomp', data: { type: 'x360recomp' } }],
    goldberg: () => ({ appid: '400', emulator: 'gbe' }),
  });
  assert.deepEqual([found.kind, found.name, found.appid, found.achievements, found.count], ['recomp', 'Xbox 360 Recomp', '4D5307E6', 'folder', 1]);
});

test('a folder Steam installed is a store game, and a folder nothing knows is playtime only', async () => {
  const steam = await detectManualGame(exeIn(GAME, 'Game.exe'), { steamAppid: () => '620' });
  assert.deepEqual([steam.kind, steam.name, steam.appid, steam.achievements], ['store', 'Steam', '620', 'store']);
  const gog = await detectManualGame(exeIn(GAME, 'Game.exe'), { launcherInstall: () => true });
  assert.deepEqual([gog.kind, gog.achievements], ['store', 'store']);
  const plain = await detectManualGame(exeIn(GAME, 'Game.exe'), {});
  assert.deepEqual([plain.kind, plain.achievements, plain.appid], ['none', 'none', '']);
});

test('an emulator wins over the Steam manifest: a game cracked in place still runs on the emulator', async () => {
  const found = await detectManualGame(exeIn(GAME, 'Game.exe'), { steamAppid: () => '620', goldberg: () => ({ appid: '620', emulator: 'goldberg' }) });
  assert.deepEqual([found.kind, found.name], ['steam-emulator', 'Goldberg']);
});

test('an exe with no game folder of its own is never read as the whole collection around it', async () => {
  const probed = [];
  const probe = (dir) => probed.push(dir) && null;
  const found = await detectManualGame(exeIn(path.join('C:', 'Jeux'), 'Loose.exe'), { gameDirFor: () => '', folderGames: probe, goldberg: probe, crackLoader: probe });
  assert.deepEqual([found.kind, found.gameDir, probed], ['none', '', []]);
});

test('a reader that throws costs only its own answer', async () => {
  const found = await detectManualGame(exeIn(GAME, 'Game.exe'), {
    folderGames: () => {
      throw new Error('unreadable');
    },
    goldberg: async () => ({ appid: '327030', emulator: 'gbe' }),
  });
  assert.equal(found.gameDir, GAME);
  assert.equal(found.appid, '327030');
});

test('a tracked emulator reads as four cards and an achievements chip, added as a manual entry', () => {
  const view = describeDetection({ kind: 'steam-emulator', name: 'GBE Fork', appid: '327030', achievements: 'tracked', count: 29 });
  assert.equal(view.route, 'manual');
  assert.equal(view.verdict.tone, 'tracked');
  assert.deepEqual(view.checks.map((check) => [check.state, check.value]), [
    ['ok', 'GBE Fork'],
    ['ok', '327030'],
    ['ok', '29 will be tracked'],
    ['ok', 'Tracked when it runs'],
  ]);
});

test('a folder a reader claims is followed instead of added, and cannot be followed twice', () => {
  const found = { kind: 'recomp', name: 'Xbox 360 Recomp', appid: '', achievements: 'folder', count: 1, folder: 'D:\\Ports\\Game' };
  const fresh = describeDetection(found);
  assert.deepEqual([fresh.route, fresh.canAdd, fresh.checks[1].value], ['folder', true, 'Not needed']);
  assert.match(fresh.note, /Add follows it/);
  const watched = describeDetection(found, { watched: true });
  assert.equal(watched.canAdd, false);
  assert.match(watched.note, /already followed/);
});

test('nothing recognised reads as playtime only, and a known game says it is in the library', () => {
  const view = describeDetection({ kind: 'none', name: '', appid: '', achievements: 'none', count: 0 }, { inLibrary: true });
  assert.deepEqual([view.verdict.tone, view.checks[0].state, view.checks[2].value], ['neutral', 'off', 'Not tracked']);
  assert.match(view.note, /already in your library/);
});

test('the game folder comes from the exe, climbing out of engine folders', async () => {
  const exe = path.join(GAME, 'Binaries', 'Win64', 'Game.exe');
  const seen = [];
  await detectManualGame(exe, { gameDirFor: () => GAME, goldberg: (dir) => seen.push(dir) && null });
  assert.deepEqual(seen, [GAME]);
});
