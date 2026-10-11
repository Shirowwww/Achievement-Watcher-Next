'use strict';

// On Linux a game goes back to the launcher that owns it; AW never runs Wine itself.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { planLaunch, isWindowsProgram } = require('../../app/util/linuxGameLaunch.js');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function withHome(run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-launch-'));
  try {
    run(home, { env: {}, home });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('a Steam-owned game is started by Steam, whatever its executable', () => {
  assert.deepEqual(planLaunch({ game: { appid: 400, steamOfficial: true } }), { kind: 'uri', launcher: 'steam', url: 'steam://rungameid/400' });
  assert.equal(planLaunch({ game: { appid: 'gog-1', steamOfficial: true } }), null);
});

test('an executable in a Steam library or a Proton prefix is started by Steam', () => {
  withHome((home, ctx) => {
    const steamapps = path.join(home, '.local', 'share', 'Steam', 'steamapps');
    write(path.join(steamapps, 'appmanifest_220.acf'), '"AppState"\n{\n\t"appid"\t\t"220"\n\t"installdir"\t\t"Half-Life 2"\n}\n');
    const exe = write(path.join(steamapps, 'common', 'Half-Life 2', 'hl2.exe'), '');
    assert.equal(planLaunch({ exe }, ctx).url, 'steam://rungameid/220');

    const inPrefix = write(path.join(steamapps, 'compatdata', '1091500', 'pfx', 'drive_c', 'Game', 'game.exe'), '');
    assert.equal(planLaunch({ exe: inPrefix }, ctx).url, 'steam://rungameid/1091500');
  });
});

test('a Lutris game is started by its slug, matched on its executable or its prefix', () => {
  withHome((home, ctx) => {
    const prefix = path.join(home, 'Games', 'portal');
    const exe = write(path.join(prefix, 'drive_c', 'Portal', 'portal.exe'), '');
    const other = write(path.join(prefix, 'drive_c', 'Portal', 'tools', 'editor.exe'), '');
    write(
      path.join(home, '.config', 'lutris', 'games', 'portal-1760430000.yml'),
      `game:\n  exe: ${exe}\n  prefix: ${prefix}\nsystem: {}\nwine:\n  version: system\n`
    );
    assert.deepEqual(planLaunch({ exe }, ctx), { kind: 'uri', launcher: 'lutris', url: 'lutris:rungame/portal' });
    assert.equal(planLaunch({ exe: other }, ctx).url, 'lutris:rungame/portal');
  });
});

test('a Heroic game is started through its store runner, or by name when only its prefix is known', () => {
  withHome((home, ctx) => {
    const heroic = path.join(home, '.config', 'heroic');
    const install = path.join(home, 'Games', 'Heroic', 'Quail Game');
    const exe = write(path.join(install, 'Binaries', 'Quail.exe'), '');
    write(path.join(heroic, 'legendaryConfig', 'legendary', 'installed.json'), JSON.stringify({ Quail: { install_path: install } }));
    assert.deepEqual(planLaunch({ exe }, ctx), { kind: 'uri', launcher: 'heroic', url: 'heroic://launch/legendary/Quail' });

    const gogInstall = path.join(home, 'Games', 'Heroic', 'GogGame');
    const gogExe = write(path.join(gogInstall, 'game.exe'), '');
    write(path.join(heroic, 'gog_store', 'installed.json'), JSON.stringify({ installed: [{ appName: '1207658924', install_path: gogInstall }] }));
    assert.equal(planLaunch({ exe: gogExe }, ctx).url, 'heroic://launch/gog/1207658924');

    const prefix = path.join(home, 'Games', 'Heroic', 'Prefixes', 'Other');
    const prefixed = write(path.join(prefix, 'drive_c', 'Other', 'other.exe'), '');
    write(path.join(heroic, 'GamesConfig', 'Other App.json'), JSON.stringify({ 'Other App': { winePrefix: prefix } }));
    assert.equal(planLaunch({ exe: prefixed }, ctx).url, 'heroic://launch/Other%20App');
  });
});

test('what no launcher claims is spawned when native and opened by the desktop when it is a Windows program', () => {
  withHome((home, ctx) => {
    const native = write(path.join(home, 'games', 'game.x86_64'), '');
    const windows = write(path.join(home, '.wine', 'drive_c', 'Game', 'Game.EXE'), '');
    assert.deepEqual(planLaunch({ exe: native }, ctx), { kind: 'spawn' });
    assert.deepEqual(planLaunch({ exe: windows }, ctx), { kind: 'open' });
  });
  assert.equal(isWindowsProgram('/x/setup.msi'), true);
  assert.equal(isWindowsProgram('/x/start.sh'), false);
});
