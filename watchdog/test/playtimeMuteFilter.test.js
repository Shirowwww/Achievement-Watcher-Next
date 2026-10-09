'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isMutedByPath, shouldMuteProcessPath } = require('../playtime/monitor.js');

test('path mute filter matches a child of a muted root (case-insensitive)', () => {
  const dirs = ['C:\\Program Files', 'D:\\Games'];
  assert.equal(isMutedByPath('c:\\PROGRAM FILES\\Steam\\steam.exe', dirs), true);
  assert.equal(isMutedByPath('d:/games/My Game/game.exe', dirs), true);
  assert.equal(isMutedByPath('C:\\Program Files (x86)\\Steam\\steam.exe', dirs), false);
});

test('path mute filter ignores undefined entries (missing env vars)', () => {
  const dirs = ['C:\\Windows', undefined, null, ''];
  assert.equal(isMutedByPath('C:\\Windows\\System32\\svchost.exe', dirs), true);
  assert.equal(isMutedByPath('C:\\Games\\game.exe', dirs), false);
});

test('path mute filter tolerates empty or missing lists and empty paths', () => {
  assert.equal(isMutedByPath('C:\\Games\\game.exe', []), false);
  assert.equal(isMutedByPath('C:\\Games\\game.exe', undefined), false);
  assert.equal(isMutedByPath('', ['C:\\']), false);
  assert.equal(isMutedByPath(null, ['C:\\']), false);
});

test('an explicitly indexed manual game overrides the broad user-profile path mute', () => {
  const desktopGame = 'C:\\Users\\Player\\Desktop\\Games\\Ryujinx\\Ryujinx.exe';
  const mutedRoots = ['C:\\Users\\Player'];
  assert.equal(shouldMuteProcessPath(desktopGame, mutedRoots, []), true);
  assert.equal(shouldMuteProcessPath(desktopGame, mutedRoots, [{ appid: 'manual-1', source: 'Manual' }]), false);
  assert.equal(shouldMuteProcessPath(desktopGame, mutedRoots, [{ appid: '123', source: 'Steam' }]), true);
});

/*
  #110. Program Files is a muted root, and it is where Steam's default library and most launchers
  install games. Both directions matter: a game there must be followed (no false negative), and a
  program that merely shares a game's exe name must not be counted as that game (no false positive).
  Recorded exe paths only count when the file exists, so the installs here are real temp files.
*/
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-mute-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const programFiles = path.join(root, 'Program Files (x86)');
const mutedRoots = [programFiles];

function exeAt(...parts) {
  const file = path.join(...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  return file;
}

const steamCommon = path.join(programFiles, 'Steam', 'steamapps', 'common');

test('#110: a Steam game in the default library is followed, even with no exe recorded', () => {
  const game = exeAt(steamCommon, 'Gambonanza', 'Gambonanza.exe');
  assert.equal(shouldMuteProcessPath(game, mutedRoots, [{ appid: '123', source: 'Steam' }]), false);
});

test('#110: a launcher game in Program Files is followed through its recorded exe or exeList entry', () => {
  const hades = exeAt(programFiles, 'Epic Games', 'Hades', 'Hades.exe');
  assert.equal(shouldMuteProcessPath(hades, mutedRoots, [{ appid: 'hades', source: 'epic-official', exePath: hades }]), false);
  const exePathFor = (appid) => (appid === 'hades' ? hades : '');
  assert.equal(shouldMuteProcessPath(hades, mutedRoots, [{ appid: 'hades', source: 'epic-official' }], exePathFor), false);
  // A shipping binary below the recorded launcher, the common Unreal layout.
  const shipping = exeAt(programFiles, 'Epic Games', 'Hades', 'x64', 'Hades.exe');
  assert.equal(shouldMuteProcessPath(shipping, mutedRoots, [{ appid: 'hades', source: 'epic-official', exePath: hades }]), false);
});

test('#110: inside one Steam game folder, a launcher and its shipping exe both count as the game', () => {
  const launcher = exeAt(steamCommon, 'Hollow', 'Hollow.exe');
  const shipping = exeAt(steamCommon, 'Hollow', 'Binaries', 'Win64', 'Hollow-Win64-Shipping.exe');
  assert.equal(shouldMuteProcessPath(launcher, mutedRoots, [{ appid: '1', source: 'Steam', exePath: shipping }]), false);
});

test('#110: a moved game whose recorded exe is gone is still followed from a Steam library', () => {
  const moved = exeAt(steamCommon, 'Moved Game', 'Moved.exe');
  const stale = path.join(root, 'D-drive', 'SteamLibrary', 'steamapps', 'common', 'Moved Game', 'Moved.exe');
  assert.equal(shouldMuteProcessPath(moved, mutedRoots, [{ appid: '7', source: 'Steam', exePath: stale }]), false);
});

test('#110: a program that only shares a game name stays ignored', () => {
  // Unknown process.
  const tool = exeAt(programFiles, 'Vendor', 'Tool', 'Game.exe');
  assert.equal(shouldMuteProcessPath(tool, mutedRoots, []), true);
  // The game it shares a name with is installed elsewhere, and that install exists.
  const real = exeAt(root, 'Games', 'Game', 'Game.exe');
  assert.equal(shouldMuteProcessPath(tool, mutedRoots, [{ appid: '9', source: 'epic-official', exePath: real }]), true);
  // Same in a Steam library: another Steam game's folder is not this game's install.
  const other = exeAt(steamCommon, 'Other Game', 'Launcher.exe');
  const owner = exeAt(steamCommon, 'Owner Game', 'Launcher.exe');
  assert.equal(shouldMuteProcessPath(other, mutedRoots, [{ appid: '5', source: 'Steam', exePath: owner }]), true);
  // Nothing recorded for a non-Steam location: still muted.
  assert.equal(shouldMuteProcessPath(tool, mutedRoots, [{ appid: '9', source: 'epic-official' }], () => ''), true);
});

test('#110: outside the muted roots nothing changes', () => {
  const free = exeAt(root, 'Jeux', 'Free', 'Free.exe');
  assert.equal(shouldMuteProcessPath(free, mutedRoots, []), false);
});

/*
  Linux: the same filter over Unix paths. The distribution's programs, C:\windows in each Wine prefix
  and the runtimes a launch goes through are muted; the games themselves, wherever they sit under the
  home folder, are not.
*/
const { linuxMutedDirs } = require('../playtime/monitor.js');
const linuxRoots = linuxMutedDirs();
const home = '/home/player';
const steam = `${home}/.local/share/Steam`;

test('Linux: system programs and the runtimes behind a launch are muted', () => {
  for (const file of [
    '/usr/bin/python3.12',
    '/usr/lib/wine/wine64-preloader',
    '/usr/libexec/xdg-desktop-portal',
    '/run/pressure-vessel/pv-from-host/bin/pv-adverb',
    `${home}/.wine/drive_c/windows/system32/explorer.exe`,
    `${steam}/steamapps/compatdata/400/pfx/drive_c/windows/system32/steam.exe`,
    `${steam}/ubuntu12_32/reaper`,
    `${steam}/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap`,
    `${steam}/steamapps/common/Proton 9.0/files/bin/wineserver`,
    `${steam}/steamapps/common/Proton - Experimental/files/bin/wineserver`,
    `${steam}/compatibilitytools.d/GE-Proton9-20/files/bin/wineserver`,
    `${home}/.local/share/umu/steamrt3/pressure-vessel/bin/pv-adverb`,
    `${home}/.local/share/lutris/runners/wine/wine-ge-8-26-x86_64/bin/wineserver`,
    `${home}/.config/heroic/tools/proton/GE-Proton9-20/files/bin/wineserver`,
    `${home}/.local/share/bottles/runners/soda-9.0-1/bin/wineserver`,
  ]) {
    assert.equal(isMutedByPath(file, linuxRoots), true, file);
  }
});

test('Linux: games in a Steam library, a Wine prefix or the home folder are not muted', () => {
  for (const file of [
    `${steam}/steamapps/common/Portal/hl2_linux`,
    `${steam}/steamapps/common/Hollow Knight/hollow_knight.x86_64`,
    `${steam}/steamapps/common/ELDEN RING/Game/eldenring.exe`,
    `${home}/.wine/drive_c/Program Files/Game/Game.exe`,
    `${home}/Games/lutris/game/drive_c/Games/Game/Game.exe`,
    `${home}/Games/Native/Game.x86_64`,
    '/mnt/data/SteamLibrary/steamapps/common/Game/bin/linux64/game',
  ]) {
    assert.equal(isMutedByPath(file, linuxRoots), false, file);
  }
});

test('Linux: a process the index claims by name in a system folder stays muted', () => {
  const preloader = '/usr/lib/wine/wine64-preloader';
  assert.equal(shouldMuteProcessPath(preloader, linuxRoots, []), true);
  assert.equal(shouldMuteProcessPath(preloader, linuxRoots, [{ appid: '1', source: 'Steam' }]), true);
  assert.equal(shouldMuteProcessPath(preloader, linuxRoots, [{ appid: 'manual-1', source: 'Manual' }]), false);
});
