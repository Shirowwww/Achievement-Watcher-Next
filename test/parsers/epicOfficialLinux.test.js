'use strict';

/*
  On Linux the installed Epic games are the ones Heroic or legendary installed: same index fields as
  the Epic launcher's .item manifests, so the official source reads them the same way.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const epicOfficial = require('../../app/parser/epicOfficial.js');

function heroicHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-epic-heroic-'));
  const config = path.join(home, '.config');
  const legendary = path.join(config, 'heroic', 'legendaryConfig', 'legendary');
  const installPath = path.join(home, 'Games', 'Heroic', 'RocketLeague');
  fs.mkdirSync(path.join(installPath, 'Binaries', 'Win64'), { recursive: true });
  fs.writeFileSync(path.join(installPath, 'Binaries', 'Win64', 'RocketLeague.exe'), '');
  fs.mkdirSync(path.join(legendary, 'metadata'), { recursive: true });
  fs.writeFileSync(
    path.join(legendary, 'installed.json'),
    JSON.stringify({ Sugar: { app_name: 'Sugar', title: 'Rocket League', install_path: installPath, executable: 'Binaries/Win64/RocketLeague.exe' } })
  );
  fs.writeFileSync(
    path.join(legendary, 'metadata', 'Sugar.json'),
    JSON.stringify({ app_name: 'Sugar', metadata: { id: '9773aa1aa54f4f7b80e44bef04986cea', namespace: '9773aa1aa54f4f7b80e44bef04986cea' } })
  );
  return { home, config, installPath };
}

test('a Heroic install becomes an entry of the Epic install index', () => {
  const { home, config, installPath } = heroicHome();
  const [entry] = epicOfficial._internal.linuxEpicInstallIndex({ home, env: { XDG_CONFIG_HOME: config } });
  assert.deepEqual(entry, {
    title: 'Rocket League',
    namespace: '9773aa1aa54f4f7b80e44bef04986cea',
    catalogItemId: '9773aa1aa54f4f7b80e44bef04986cea',
    appName: 'Sugar',
    installLocation: installPath,
    executablePath: path.join(installPath, 'Binaries', 'Win64', 'RocketLeague.exe'),
    processName: 'RocketLeague.exe',
    launcher: 'heroic',
  });
});

test('on Linux the official Epic scan lists what Heroic installed', { skip: process.platform === 'win32' && 'Linux-only' }, () => {
  const { config, installPath } = heroicHome();
  const saved = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = config;
  try {
    const records = epicOfficial.scan();
    assert.equal(records.length, 1);
    assert.equal(records[0].appid, '9773aa1aa54f4f7b80e44bef04986cea');
    assert.equal(records[0].source, 'epic-official');
    assert.equal(records[0].data.gameDir, installPath);
    assert.equal(records[0].data.exe, path.join(installPath, 'Binaries', 'Win64', 'RocketLeague.exe'));
    assert.equal(records[0].data.launcher, 'heroic');
  } finally {
    if (saved === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = saved;
  }
});
