'use strict';

/*
  Save roots on Linux come from Wine prefixes found on disk, read without starting Wine, plus the
  native XDG data folder. On Windows the host list must stay exactly "this machine".
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseHive, readValue, listSubkeys, listValueNames } = require('../../app/util/wineRegistry.js');
const { discoverPrefixes } = require('../../app/util/winePrefixes.js');
const { listHosts, winToUnix, pathKey, hostsFor, hostFor } = require('../../app/util/winHosts.js');

// Real symlinks and POSIX paths: these describe Linux and do not run on Windows.
const LINUX_ONLY = { skip: process.platform === 'win32' && 'Linux-only' };

const USER_REG = [
  'WINE REGISTRY Version 2',
  ';; All keys relative to REGISTRY\\\\User\\\\S-1-5-21-0-0-0-1000',
  '',
  '[Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Explorer\\\\User Shell Folders] 1791978481',
  '#time=1dd5bd1dd7d5264',
  '"AppData"=str(2):"%USERPROFILE%\\\\AppData\\\\Roaming"',
  '"Personal"=str(2):"D:\\\\Docs\\\\Jos\\x00e9"',
  '',
  '[Software\\\\Valve\\\\Steam] 1791978481',
  '"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"',
  '"RunningAppID"=dword:000001e0',
  '@="default"',
  '',
].join('\n');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makePrefix(dir, users = ['steamuser']) {
  for (const user of [...users, 'Public']) fs.mkdirSync(path.join(dir, 'drive_c', 'users', user), { recursive: true });
  fs.writeFileSync(path.join(dir, 'user.reg'), USER_REG);
  return dir;
}

test('a Wine hive gives back strings, expandable strings, DWORDs and the default value', () => {
  const keys = parseHive(USER_REG);
  const shell = keys.get('software\\microsoft\\windows\\currentversion\\explorer\\user shell folders');
  assert.deepEqual(shell.get('appdata'), { type: 'REG_EXPAND_SZ', value: '%USERPROFILE%\\AppData\\Roaming' });
  assert.equal(shell.get('personal').value, 'D:\\Docs\\José');
  const steam = keys.get('software\\valve\\steam');
  assert.equal(steam.get('steampath').value, 'C:\\Program Files (x86)\\Steam');
  assert.deepEqual(steam.get('runningappid'), { type: 'REG_DWORD', value: 480 });
  assert.equal(steam.get('').value, 'default');
});

test('readValue takes the slash spelling the Windows registry helpers use', () => {
  const dir = tmp('aw-reg-');
  try {
    fs.writeFileSync(path.join(dir, 'user.reg'), USER_REG);
    assert.equal(readValue(path.join(dir, 'user.reg'), 'Software/Valve/Steam', 'SteamPath').value, 'C:\\Program Files (x86)\\Steam');
    assert.equal(readValue(path.join(dir, 'user.reg'), 'Software/Valve/Steam', 'Missing'), null);
    assert.equal(readValue(path.join(dir, 'missing.reg'), 'Software/Valve/Steam', 'SteamPath'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('prefixes are found from Wine, Proton, Lutris, Heroic and Bottles, once each', LINUX_ONLY, () => {
  const home = tmp('aw-home-');
  try {
    makePrefix(path.join(home, '.wine'), ['player']);
    const steam = path.join(home, '.local', 'share', 'Steam');
    const library = path.join(home, 'SteamLibrary');
    fs.mkdirSync(path.join(steam, 'steamapps'), { recursive: true });
    fs.writeFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders"\n{\n\t"1"\n\t{\n\t\t"path"\t\t"${library}"\n\t}\n}\n`);
    makePrefix(path.join(library, 'steamapps', 'compatdata', '400', 'pfx'));
    fs.mkdirSync(path.join(steam, 'steamapps', 'compatdata', '999'), { recursive: true }); // no prefix yet
    const lutris = makePrefix(path.join(home, 'Games', 'some-game'), ['player']);
    fs.mkdirSync(path.join(home, '.config', 'lutris', 'games'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'lutris', 'games', 'some-game.yml'), `game:\n  exe: x.exe\n  prefix: ${lutris}\n`);
    const heroic = makePrefix(path.join(home, 'Games', 'Heroic', 'Prefixes', 'default', 'Game'), ['player']);
    fs.mkdirSync(path.join(home, '.config', 'heroic', 'GamesConfig'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'heroic', 'GamesConfig', 'abc.json'), JSON.stringify({ abc: { winePrefix: heroic } }));
    makePrefix(path.join(home, '.local', 'share', 'bottles', 'bottles', 'Gaming'), ['player']);

    const found = discoverPrefixes({ env: {}, home });
    const byKind = Object.fromEntries(found.map((p) => [p.kind, p]));
    assert.deepEqual(Object.keys(byKind).sort(), ['bottles', 'heroic', 'lutris', 'proton', 'wine']);
    assert.equal(byKind.proton.appid, '400');
    assert.equal(found.length, 5, 'the Heroic prefix listed twice is kept once');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a Linux host list is the XDG folder plus one host per prefix user, with Documents from user.reg', LINUX_ONLY, () => {
  const home = tmp('aw-home-');
  try {
    const prefix = makePrefix(path.join(home, '.wine'), ['player']);
    fs.mkdirSync(path.join(prefix, 'dosdevices'));
    fs.mkdirSync(path.join(home, 'd-drive'));
    fs.symlinkSync(path.join(home, 'd-drive'), path.join(prefix, 'dosdevices', 'd:'));
    const hosts = listHosts({ platform: 'linux', env: {}, home });

    assert.deepEqual(hosts.map((h) => h.kind), ['linux', 'wine']);
    assert.equal(hosts[0].env.APPDATA, path.join(home, '.local', 'share'));
    assert.equal(hosts[0].documents(), path.join(home, 'Documents'));
    const wine = hosts[1];
    assert.equal(wine.env.APPDATA, path.join(fs.realpathSync(prefix), 'drive_c', 'users', 'player', 'AppData', 'Roaming'));
    assert.equal(wine.env.PUBLIC, path.join(fs.realpathSync(prefix), 'drive_c', 'users', 'Public'));
    assert.equal(wine.documents(), path.join(home, 'd-drive', 'Docs', 'José'), 'the redirected Documents folder follows the D: drive link');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Windows keeps exactly one host: this machine, read from its own environment', () => {
  const env = {
    APPDATA: 'C:\\Users\\A\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\A\\AppData\\Local',
    Public: 'C:\\Users\\Public',
    PROGRAMDATA: 'C:\\ProgramData',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    USERPROFILE: 'C:\\Users\\A',
  };
  const registry = { value: (hive, key, name) => `${hive}\\${key}\\${name}`, subkeys: () => ['a', 'b'] };
  const hosts = listHosts({ platform: 'win32', env, nativeDocuments: () => 'C:\\Users\\A\\Documents', nativeRegistry: registry });
  assert.equal(hosts.length, 1);
  assert.deepEqual(hosts[0].env, {
    APPDATA: env.APPDATA,
    LOCALAPPDATA: env.LOCALAPPDATA,
    PUBLIC: env.Public,
    PROGRAMDATA: env.PROGRAMDATA,
    PROGRAMFILES: env.ProgramFiles,
    PROGRAMFILES_X86: env['ProgramFiles(x86)'],
    USERPROFILE: env.USERPROFILE,
  });
  assert.equal(hosts[0].documents(), 'C:\\Users\\A\\Documents');
  assert.equal(hosts[0].regValue('HKLM', 'Software/X', 'Y'), 'HKLM\\Software/X\\Y', "the caller's registry answers");
  assert.deepEqual(hosts[0].regSubkeys('HKLM', 'Software/X'), ['a', 'b']);
  assert.equal(hosts[0].localPath('D:\\Games\\X'), 'D:\\Games\\X', 'a Windows path is already local');
});

test('Windows paths map into the prefix: C: to drive_c, Z: to the filesystem root', LINUX_ONLY, () => {
  const prefix = tmp('aw-pfx-');
  try {
    assert.equal(winToUnix(prefix, 'C:\\users\\steamuser\\Documents'), path.join(prefix, 'drive_c', 'users', 'steamuser', 'Documents'));
    assert.equal(winToUnix(prefix, 'Z:\\home\\player\\Game\\game.exe'), '/home/player/Game/game.exe');
    // Proton starts xalia.exe under an extended-length path with a "wine/.." step in it.
    assert.equal(winToUnix(prefix, '\\\\?\\Z:\\opt\\proton\\files\\share\\wine/../xalia/xalia.exe'), '/opt/proton/files/share/xalia/xalia.exe');
    assert.equal(winToUnix(prefix, 'Q:\\nowhere'), null);
    assert.equal(winToUnix(prefix, 'relative\\path'), null);
  } finally {
    fs.rmSync(prefix, { recursive: true, force: true });
  }
});

test('a Wine hive lists subkeys and value names as spelled, parents included', () => {
  const dir = tmp('aw-reg-');
  try {
    const file = path.join(dir, 'user.reg');
    fs.writeFileSync(file, USER_REG);
    assert.deepEqual(listSubkeys(file, 'Software'), ['Microsoft', 'Valve'], 'Software has no values of its own and is still a parent');
    assert.deepEqual(listSubkeys(file, 'software/valve'), ['Steam']);
    assert.deepEqual(listValueNames(file, 'Software/Valve/Steam'), ['SteamPath', 'RunningAppID', '']);
    assert.deepEqual(listSubkeys(path.join(dir, 'missing.reg'), 'Software'), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a prefix host reads both hives, expands its own variables and maps paths both ways', LINUX_ONLY, () => {
  const home = tmp('aw-home-');
  try {
    const prefix = makePrefix(path.join(home, '.wine'), ['player']);
    fs.writeFileSync(
      path.join(prefix, 'system.reg'),
      ['WINE REGISTRY Version 2', '', '[Software\\\\Wow6432Node\\\\Ubisoft\\\\Launcher] 1', '"InstallDir"="C:\\\\Ubisoft\\\\"', ''].join('\n')
    );
    const host = listHosts({ platform: 'linux', env: {}, home })[1];
    const driveC = path.join(fs.realpathSync(prefix), 'drive_c');

    assert.equal(host.regValue('HKLM', 'Software/WOW6432Node/Ubisoft/Launcher', 'InstallDir'), 'C:\\Ubisoft\\');
    assert.equal(host.regValue('HKCU', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'AppData'), 'C:\\users\\player\\AppData\\Roaming');
    assert.equal(host.regValue('HKCU', 'Software/Valve/Steam', 'RunningAppID'), 480);
    assert.deepEqual(host.regSubkeys('HKLM', 'Software/WOW6432Node'), ['Ubisoft']);
    assert.equal(host.localPath('C:\\Ubisoft\\'), path.join(driveC, 'Ubisoft'));
    assert.equal(host.windowsPath(path.join(driveC, 'users', 'player', 'AppData')), 'C:\\users\\player\\AppData');
    assert.equal(host.windowsPath('/home/player/Games/x.exe'), 'Z:\\home\\player\\Games\\x.exe');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a game folder belongs to the prefix it sits in, otherwise to every host', LINUX_ONLY, () => {
  const home = tmp('aw-home-');
  try {
    const prefix = makePrefix(path.join(home, '.wine'), ['player']);
    const hosts = listHosts({ platform: 'linux', env: {}, home });
    const inPrefix = path.join(prefix, 'drive_c', 'Games', 'Portal');
    assert.deepEqual(hostsFor(inPrefix, hosts).map((h) => h.kind), ['wine']);
    assert.deepEqual(hostsFor(path.join(home, 'Games', 'Native'), hosts).map((h) => h.kind), ['linux', 'wine']);
    const withSave = (host) => host.kind === 'wine';
    assert.equal(hostFor(path.join(home, 'Games', 'Native'), withSave, hosts).kind, 'wine', 'the host that already has the files wins');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Windows-style variables set on purpose name a host listed before the others', LINUX_ONLY, () => {
  const home = tmp('aw-home-');
  try {
    const hosts = listHosts({ platform: 'linux', env: { APPDATA: '/sandbox/AppData' }, home });
    assert.deepEqual(hosts.map((h) => h.kind), ['env', 'linux']);
    assert.equal(hosts[0].env.APPDATA, '/sandbox/AppData');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('path keys fold case only where the filesystem does', () => {
  assert.equal(pathKey('/A/b', 'linux'), path.resolve('/A/b'));
  assert.notEqual(pathKey('/A/b', 'linux'), pathKey('/a/b', 'linux'));
  assert.equal(pathKey('/A/b', 'win32'), path.resolve('/A/b').toLowerCase());
});
