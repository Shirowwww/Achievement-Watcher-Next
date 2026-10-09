'use strict';

/*
  What Linux launchers recorded about the games they installed. The fixtures are the files each
  launcher writes, in its own format: legendary's installed.json and metadata (Heroic and standalone),
  Heroic's gog_store and nile files, Lutris's pga.db and game YAML, and Bottles's bottle.yml.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const linuxLaunchers = require('../../app/util/linuxLaunchers.js');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

function context() {
  const home = tmp('aw-launchers-');
  return { home, env: { XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local', 'share') } };
}

function writeLegendary(dir, installPath) {
  write(path.join(dir, 'installed.json'), {
    Fortnite: {
      app_name: 'Fortnite',
      install_path: installPath,
      title: 'Fortnite',
      version: '1.0',
      executable: 'FortniteGame/Binaries/Win64/FortniteLauncher.exe',
      is_dlc: false,
      platform: 'Windows',
    },
    FortniteDLC: { app_name: 'FortniteDLC', install_path: installPath, title: 'Pack', is_dlc: true },
  });
  write(path.join(dir, 'metadata', 'Fortnite.json'), {
    app_name: 'Fortnite',
    app_title: 'Fortnite',
    metadata: { id: '4fe75bbc5a674f4f9b356b5c90567da5', namespace: 'fn', title: 'Fortnite' },
  });
}

test('Heroic and standalone legendary installs carry the Epic catalog ids from their metadata', () => {
  const ctx = context();
  const games = path.join(ctx.home, 'Games', 'Heroic', 'Fortnite');
  writeLegendary(path.join(ctx.env.XDG_CONFIG_HOME, 'heroic', 'legendaryConfig', 'legendary'), games);
  writeLegendary(path.join(ctx.env.XDG_CONFIG_HOME, 'legendary'), games);

  const installs = linuxLaunchers.epicInstalls(ctx);
  assert.deepEqual(
    installs.map((entry) => entry.launcher),
    ['heroic', 'legendary'],
    'the DLC is not a game of its own'
  );
  assert.deepEqual(installs[0], {
    launcher: 'heroic',
    store: 'epic',
    id: 'Fortnite',
    title: 'Fortnite',
    installPath: games,
    executable: path.join(games, 'FortniteGame', 'Binaries', 'Win64', 'FortniteLauncher.exe'),
    namespace: 'fn',
    catalogItemId: '4fe75bbc5a674f4f9b356b5c90567da5',
  });
});

test('the Flatpak Heroic is read too, and a missing or broken file lists nothing', () => {
  const ctx = context();
  const flatpak = path.join(ctx.home, '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'heroic');
  write(path.join(flatpak, 'gog_store', 'installed.json'), {
    installed: [
      { appName: '1207658924', install_path: '/games/Witcher', executable: '', platform: 'windows', is_dlc: false },
      { appName: '1207658925', install_path: '/games/Witcher', is_dlc: true },
    ],
  });
  write(path.join(ctx.env.XDG_CONFIG_HOME, 'heroic', 'nile_config', 'nile', 'installed.json'), '{not json');

  assert.deepEqual(linuxLaunchers.gogInstalls(ctx), [
    { launcher: 'heroic', store: 'gog', id: '1207658924', title: '', installPath: '/games/Witcher', executable: '' },
  ]);
  assert.deepEqual(linuxLaunchers.amazonInstalls(ctx), []);
  assert.deepEqual(linuxLaunchers.epicInstalls(ctx), []);
});

test('Amazon games come from nile installed.json', () => {
  const ctx = context();
  write(path.join(ctx.env.XDG_CONFIG_HOME, 'heroic', 'nile_config', 'nile', 'installed.json'), [
    { id: 'amzn1.adg.product.1234', version: 'v1', path: '/games/Heroic/Amazon Game', size: 1 },
  ]);
  assert.deepEqual(linuxLaunchers.amazonInstalls(ctx), [
    { launcher: 'heroic', store: 'amazon', id: 'amzn1.adg.product.1234', title: '', installPath: '/games/Heroic/Amazon Game', executable: '' },
  ]);
});

// The columns Lutris's own schema gives the games table (lutris/database/schema.py).
function writeLutrisDb(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE games (id INTEGER PRIMARY KEY, name TEXT, sortname TEXT, slug TEXT, installer_slug TEXT,
    parent_slug TEXT, platform TEXT, runner TEXT, executable TEXT, directory TEXT, updated DATETIME,
    lastplayed INTEGER, installed INTEGER, installed_at INTEGER, year INTEGER, configpath TEXT,
    has_custom_banner INTEGER, has_custom_icon INTEGER, has_custom_coverart_big INTEGER, playtime REAL,
    service TEXT, service_id TEXT, discord_id TEXT)`);
  const insert = db.prepare(
    'INSERT INTO games (name, slug, runner, directory, installed, configpath, service, service_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const row of rows) insert.run(row.name, row.slug, row.runner, row.directory, row.installed, row.configpath, row.service ?? null, row.service_id ?? null);
  db.close();
}

test('Lutris games come from pga.db, with the executable from the game config in its data folder', () => {
  const ctx = context();
  const lutrisData = path.join(ctx.env.XDG_DATA_HOME, 'lutris');
  const exe = path.join(ctx.home, 'Games', 'gog-galaxy', 'drive_c', 'Galaxy', 'GalaxyClient.exe');
  writeLutrisDb(path.join(lutrisData, 'pga.db'), [
    { name: 'The Witcher', slug: 'the-witcher', runner: 'wine', directory: path.join(ctx.home, 'Games', 'the-witcher'), installed: 1, configpath: 'the-witcher-1', service: 'gog', service_id: '1207658924' },
    { name: 'GOG Galaxy', slug: 'gog-galaxy', runner: 'wine', directory: '', installed: 1, configpath: 'gog-galaxy-2' },
    { name: 'Removed', slug: 'removed', runner: 'wine', directory: '/games/removed', installed: 0, configpath: 'removed' },
  ]);
  // No ~/.config/lutris: this Lutris keeps its game configs next to pga.db.
  write(path.join(lutrisData, 'games', 'gog-galaxy-2.yml'), `game:\n  exe: ${exe}\n  prefix: ${path.join(ctx.home, 'Games', 'gog-galaxy')}\nwine:\n  version: lutris-GE\n`);

  const games = linuxLaunchers.lutrisGames(ctx);
  assert.deepEqual(
    games.map((game) => [game.id, game.store, game.serviceId, game.installPath, game.executable]),
    [
      ['the-witcher', 'gog', '1207658924', path.join(ctx.home, 'Games', 'the-witcher'), ''],
      ['gog-galaxy', '', '', path.dirname(exe), exe],
    ]
  );
});

function makeBottle(dir, config) {
  fs.mkdirSync(path.join(dir, 'drive_c', 'users', 'aw'), { recursive: true });
  write(path.join(dir, 'user.reg'), 'WINE REGISTRY Version 2\n');
  write(path.join(dir, 'bottle.yml'), config);
}

// A Unix program path next to a Windows one: this describes a Linux bottle.
test('Bottles programs come from bottle.yml, Windows paths turned into the bottle drive_c', { skip: process.platform === 'win32' && 'Linux-only' }, () => {
  const ctx = context();
  const bottles = path.join(ctx.env.XDG_DATA_HOME, 'bottles', 'bottles');
  makeBottle(
    path.join(bottles, 'Games'),
    [
      'Name: Games',
      'Path: Games',
      'External_Programs:',
      '  0b7c2a3e:',
      '    executable: Game.exe',
      '    name: Some Game',
      "    path: 'C:\\Games\\Some Game\\Game.exe'",
      '',
    ].join('\n')
  );
  // A bottle moved to another drive leaves a placeholder that points at it.
  const moved = path.join(ctx.home, 'external', 'Moved');
  makeBottle(moved, ['Name: Moved', 'External_Programs:', '  1:', `    path: ${path.join(moved, 'drive_c', 'Tool', 'tool.exe')}`, ''].join('\n'));
  write(path.join(bottles, 'Moved', 'placeholder.yml'), `Path: ${moved}\n`);

  const programs = linuxLaunchers.bottlesPrograms(ctx);
  assert.deepEqual(
    programs.map((program) => [program.bottle, program.title, program.executable]),
    [
      ['Games', 'Some Game', path.join(bottles, 'Games', 'drive_c', 'Games', 'Some Game', 'Game.exe')],
      ['Moved', '', path.join(moved, 'drive_c', 'Tool', 'tool.exe')],
    ]
  );
});

test('only the stores own clients count as official installs', () => {
  const ctx = context();
  const epicGame = path.join(ctx.home, 'Games', 'Heroic', 'Fortnite');
  writeLegendary(path.join(ctx.env.XDG_CONFIG_HOME, 'heroic', 'legendaryConfig', 'legendary'), epicGame);
  writeLutrisDb(path.join(ctx.env.XDG_DATA_HOME, 'lutris', 'pga.db'), [
    { name: 'Repack', slug: 'repack', runner: 'wine', directory: '/games/repack', installed: 1, configpath: 'repack' },
  ]);

  assert.deepEqual(linuxLaunchers.storeInstallDirs(ctx), [epicGame]);
  assert.deepEqual(
    linuxLaunchers.listInstalls(ctx).map((entry) => entry.launcher),
    ['heroic', 'lutris']
  );
});
