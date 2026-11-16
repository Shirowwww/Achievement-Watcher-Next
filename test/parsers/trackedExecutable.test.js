'use strict';

/*
  Which executable the playtime monitor watches (#193). The one the user set for a game is also what
  Play starts, so a rescan must keep it; an anti-cheat bootstrapper Steam declares
  (start_protected_game.exe) only starts the game, so detection must not prefer it over the game.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..', 'app');
const { isAntiCheatBootstrapper, isLaunchBootstrapper, pickTrackedExe } = require(path.join(root, 'util', 'launchBootstrappers.js'));
const exeDetect = require(path.join(root, 'parser', 'exeDetect.js'));
const { writePe } = require(path.join(__dirname, '..', 'helpers', 'fakePe.js'));

const GOW = 'D:\\Games\\Gears of War E-Day';
const GAME = `${GOW}\\FairlightConcept\\Binaries\\Win64\\GoWEDay-Steam.exe`;
const EAC = `${GOW}\\start_protected_game.exe`;

test('anti-cheat bootstrappers are recognised by name, real games are not', () => {
  for (const name of ['start_protected_game.exe', 'START_PROTECTED_GAME.EXE', 'EasyAntiCheat_EOS_Launcher.exe', 'DayZ_BE.exe', 'BELauncher.exe', EAC]) {
    assert.equal(isAntiCheatBootstrapper(name), true, name);
  }
  for (const name of ['GoWEDay-Steam.exe', 'Bebop.exe', 'ConSim.exe', 'TPM.exe', '']) assert.equal(isAntiCheatBootstrapper(name), false, name);
  assert.equal(isLaunchBootstrapper('GameLauncher.exe'), true, 'a launcher hands over too');
  assert.equal(isLaunchBootstrapper('GoWEDay-Steam.exe'), false);
});

/*
  Checked on 1341 real executable names (Steam's appinfo.vdf and AW's caches on the maintainer's PC,
  plus the .exe names of 894 PCGamingWiki pages about launchers and anti-cheat, 2026-11-16): every
  name the launcher rule takes is a launcher, and none of the game names below is taken.
*/
test('real launchers are recognised and real games are not', () => {
  const launchers = [
    'destiny2launcher.exe', 'skyrimselauncher.exe', 'falloutnvlauncher.exe', 'marvelrivals_launcher.exe', 'hirezlauncherui.exe',
    'launcheregs.exe', 'launchersystem.exe', 'rockstar-games-launcher.exe', 'redprelauncher.exe', 'eaanticheat.gameservicelauncher.exe',
    'easyanticheat.exe', 'eaclauncher.exe', 'tslgame_be.exe', 'shootergame_be.exe', 'unturned_be.exe', 'armareforger_be.exe',
  ];
  for (const name of launchers) assert.equal(isLaunchBootstrapper(name), true, name);
  const games = [
    'sniperelite5.exe', 'nsuns3.exe', 'warhammer3.exe', 'hellisothers.exe', 'bioshock.exe', 'f1_25.exe', 'tslgame.exe', 'shootergame.exe',
    'skyrimse.exe', 'launchpad.exe', 'launch_theculling.exe', 'dangan3win.exe', 'bebop.exe', 'tobe.exe',
  ];
  for (const name of games) assert.equal(isLaunchBootstrapper(name), false, name);
  assert.equal(isAntiCheatBootstrapper('EAAntiCheat.GameServiceLauncher.exe'), true, "EA's anti-cheat starter is one too");
});

test('a BattlEye launcher hands over only to the game it is named after', () => {
  const dir = 'D:\\Games\\PUBG\\TslGame\\Binaries\\Win64';
  assert.equal(pickTrackedExe(`${dir}\\TslGame_BE.exe`, `${dir}\\TslGame.exe`), `${dir}\\TslGame.exe`);
  assert.equal(pickTrackedExe('D:\\DayZ\\DayZ_BE.exe', 'D:\\DayZ\\DayZ_x64.exe'), 'D:\\DayZ\\DayZ_x64.exe');
  assert.equal(pickTrackedExe('D:\\Tribe\\Tribe_BE.exe', 'D:\\Tribe\\Editor.exe'), 'D:\\Tribe\\Tribe_BE.exe', 'a game named "..._BE" keeps the choice');
});

test('a game whose name ends in _BE is not ranked as a launcher without its game beside it', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-be-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  writePe(path.join(dir, 'Tribe_BE.exe'), 4096);
  writePe(path.join(dir, 'Tools', 'Editor.exe'), 2048);
  assert.equal(exeDetect.detect(dir, 'Tribe BE').name, 'Tribe_BE.exe');

  const pubg = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-be-'));
  t.after(() => fs.rmSync(pubg, { recursive: true, force: true }));
  writePe(path.join(pubg, 'TslGame_BE.exe'), 4096);
  writePe(path.join(pubg, 'TslGame.exe'), 2048);
  assert.equal(exeDetect.detect(pubg, 'PUBG: BATTLEGROUNDS', { hints: ['TslGame_BE.exe'] }).name, 'TslGame.exe');
});

test('the executable the user set wins over the detected one (#193)', () => {
  assert.equal(pickTrackedExe(GAME, EAC), GAME, 'the chosen game binary, not the bootstrapper detection found');
  assert.equal(pickTrackedExe(GAME, `${GOW}\\Other.exe`), GAME, 'a choice wins over any other detection');
  assert.equal(pickTrackedExe(GAME, ''), GAME);
  assert.equal(pickTrackedExe('', EAC), EAC, 'nothing chosen: detection stands');
  assert.equal(pickTrackedExe('', ''), '');
});

test('a launcher set for Play leaves the watch on the game detection found', () => {
  assert.equal(pickTrackedExe(EAC, GAME), GAME, 'start_protected_game.exe only starts the game');
  assert.equal(pickTrackedExe(`${GOW}\\GameLauncher.exe`, GAME), GAME);
  assert.equal(pickTrackedExe(EAC, `${GOW}\\Launcher.exe`), EAC, 'two launchers: the choice stays');
  assert.equal(pickTrackedExe(EAC, ''), EAC, 'nothing else found: the choice stays');
});

test('detection prefers the game binary over a declared anti-cheat bootstrapper', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-bootstrapper-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // The bootstrapper sits at the root and is what Steam declares; the game is three levels down.
  writePe(path.join(dir, 'start_protected_game.exe'), 4096);
  writePe(path.join(dir, 'FairlightConcept', 'Binaries', 'Win64', 'GoWEDay-Steam.exe'), 2048);
  const found = exeDetect.detect(dir, 'Gears of War: E-Day', { hints: ['start_protected_game.exe'] });
  assert.equal(found && found.name, 'GoWEDay-Steam.exe');
});

test('the library scan seeds the playtime index through that choice', () => {
  const source = fs.readFileSync(path.join(root, 'parser', 'achievements.js'), 'utf8');
  assert.match(source, /const tracked = pickTrackedExe\(configured, exeInfo \? exeInfo\.full \|\| exeInfo\.name : known\)/, 'the on-disk seed weighs the configured exe, against what the index holds when nothing is found');
  assert.match(source, /if \(!seeded && configured && pickTrackedExe\(configured, known\) === configured\)/, 'a configured launcher never takes the watch back from an indexed game');
  assert.match(source, /if \(_seededGameDirs\.has\(gameDirKey\) && !configured\)/, 'a shared folder never skips a configured exe');
});
