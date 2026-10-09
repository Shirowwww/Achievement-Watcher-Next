'use strict';

/*
  The games Linux launchers installed, read from the files each launcher keeps, never by starting it:
  Heroic (Epic through legendary, GOG through gogdl, Amazon through nile), standalone legendary,
  Lutris and Bottles. Native, Flatpak and custom locations are all looked at.

  Every entry is { launcher, store, id, title, installPath, executable }, with Unix paths; Epic
  entries also carry the catalog `namespace` and `catalogItemId` their achievements are keyed on.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { winToUnix } = require(path.join(__dirname, 'winHosts.js'));
const { lutrisGameDirs, bottlesPrefixes } = require(path.join(__dirname, 'winePrefixes.js'));

const FLATPAK = {
  heroic: 'com.heroicgameslauncher.hgl',
  lutris: 'net.lutris.Lutris',
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readYaml(file) {
  try {
    return yaml.load(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function xdg({ env = process.env, home = os.homedir() } = {}) {
  return {
    home,
    env,
    config: env.XDG_CONFIG_HOME || path.join(home, '.config'),
    data: env.XDG_DATA_HOME || path.join(home, '.local', 'share'),
  };
}

function flatpakDir(ctx, app, kind) {
  return path.join(ctx.home, '.var', 'app', FLATPAK[app], kind);
}

// A launcher writes relative executables with either slash.
function joinRelative(base, relative) {
  if (!base || !relative) return '';
  if (path.isAbsolute(relative)) return relative;
  return path.join(base, ...String(relative).split(/[\\/]+/).filter(Boolean));
}

function heroicDirs(ctx) {
  return [path.join(ctx.config, 'heroic'), path.join(flatpakDir(ctx, 'heroic', 'config'), 'heroic')];
}

function legendaryDirs(ctx) {
  const dirs = heroicDirs(ctx).map((dir) => ({ launcher: 'heroic', dir: path.join(dir, 'legendaryConfig', 'legendary') }));
  dirs.push({ launcher: 'legendary', dir: ctx.env.LEGENDARY_CONFIG_PATH || path.join(ctx.config, 'legendary') });
  return dirs;
}

// legendary's installed.json, with the catalog ids from the metadata file it keeps per game.
function epicInstalls(options) {
  const ctx = xdg(options);
  const out = [];
  for (const { launcher, dir } of legendaryDirs(ctx)) {
    const installed = readJson(path.join(dir, 'installed.json'));
    if (!installed || typeof installed !== 'object') continue;
    for (const game of Object.values(installed)) {
      if (!game || !game.app_name || !game.install_path || game.is_dlc) continue;
      const metadata = readJson(path.join(dir, 'metadata', `${game.app_name}.json`))?.metadata || {};
      out.push({
        launcher,
        store: 'epic',
        id: game.app_name,
        title: game.title || metadata.title || '',
        installPath: game.install_path,
        executable: joinRelative(game.install_path, game.executable),
        namespace: metadata.namespace || '',
        catalogItemId: metadata.id || '',
      });
    }
  }
  return out;
}

function gogInstalls(options) {
  const ctx = xdg(options);
  const out = [];
  for (const dir of heroicDirs(ctx)) {
    const installed = readJson(path.join(dir, 'gog_store', 'installed.json'))?.installed;
    for (const game of Array.isArray(installed) ? installed : []) {
      if (!game || !game.appName || !game.install_path || game.is_dlc) continue;
      out.push({
        launcher: 'heroic',
        store: 'gog',
        id: String(game.appName),
        title: '',
        installPath: game.install_path,
        executable: joinRelative(game.install_path, game.executable),
      });
    }
  }
  return out;
}

function amazonInstalls(options) {
  const ctx = xdg(options);
  const out = [];
  for (const dir of heroicDirs(ctx)) {
    const installed = readJson(path.join(dir, 'nile_config', 'nile', 'installed.json'));
    for (const game of Array.isArray(installed) ? installed : []) {
      if (!game || !game.id || !game.path) continue;
      out.push({ launcher: 'heroic', store: 'amazon', id: game.id, title: '', installPath: game.path, executable: '' });
    }
  }
  return out;
}

// node:sqlite comes with Electron's Node; without it Lutris games are simply not listed.
function openReadOnly(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(file, { readOnly: true });
  } catch {
    return null;
  }
}

function lutrisRows(file) {
  const db = openReadOnly(file);
  if (!db) return [];
  try {
    return db.prepare('SELECT slug, name, runner, directory, configpath, service, service_id FROM games WHERE installed = 1').all();
  } catch {
    return [];
  } finally {
    db.close();
  }
}

// The `game:` section of a Lutris game config, wherever this Lutris keeps its configs.
function lutrisGameConfig(ctx, configpath) {
  if (!configpath) return {};
  const file = lutrisGameDirs(ctx)
    .map((dir) => path.join(dir, `${configpath}.yml`))
    .find((candidate) => fs.existsSync(candidate));
  return (file && readYaml(file)?.game) || {};
}

function lutrisGames(options) {
  const ctx = xdg(options);
  const out = [];
  for (const db of [path.join(ctx.data, 'lutris', 'pga.db'), path.join(flatpakDir(ctx, 'lutris', 'data'), 'lutris', 'pga.db')]) {
    for (const row of lutrisRows(db)) {
      const game = lutrisGameConfig(ctx, row.configpath);
      const executable = typeof game.exe === 'string' && path.isAbsolute(game.exe) ? game.exe : '';
      const installPath = row.directory || (executable ? path.dirname(executable) : '');
      if (!installPath) continue;
      out.push({
        launcher: 'lutris',
        store: row.service || '',
        id: row.slug,
        title: row.name || '',
        installPath,
        executable,
        runner: row.runner || '',
        serviceId: row.service_id || '',
      });
    }
  }
  return out;
}

function bottlesPrograms(options) {
  const ctx = xdg(options);
  const out = [];
  for (const { path: dir } of bottlesPrefixes(ctx)) {
    const config = readYaml(path.join(dir, 'bottle.yml'));
    for (const [id, program] of Object.entries(config?.External_Programs || {})) {
      const raw = String(program?.path || '');
      const executable = /^[a-z]:[\\/]/i.test(raw) ? winToUnix(dir, raw) : raw;
      if (!executable || !path.isAbsolute(executable)) continue;
      out.push({
        launcher: 'bottles',
        store: '',
        id,
        title: program.name || '',
        installPath: path.dirname(executable),
        executable,
        bottle: config.Name || path.basename(dir),
      });
    }
  }
  return out;
}

function listInstalls(options) {
  return [...epicInstalls(options), ...gogInstalls(options), ...amazonInstalls(options), ...lutrisGames(options), ...bottlesPrograms(options)];
}

function storeInstallFiles(ctx) {
  return [
    ...legendaryDirs(ctx).map(({ dir }) => path.join(dir, 'installed.json')),
    ...heroicDirs(ctx).flatMap((dir) => [path.join(dir, 'gog_store', 'installed.json'), path.join(dir, 'nile_config', 'nile', 'installed.json')]),
  ];
}

function filesSignature(files) {
  return files
    .map((file) => {
      try {
        return `${file}:${fs.statSync(file).mtimeMs}`;
      } catch {
        return file;
      }
    })
    .join('|');
}

/*
  Folders a store's own client put there: the Heroic and legendary installs of Epic, GOG and Amazon.
  A scan asks once per folder, so the lists are read again only when one of their files changed.
*/
let storeDirsCache = { signature: null, dirs: [] };

function storeInstallDirs(options) {
  const signature = filesSignature(storeInstallFiles(xdg(options)));
  if (signature !== storeDirsCache.signature) {
    const dirs = [...epicInstalls(options), ...gogInstalls(options), ...amazonInstalls(options)].map((entry) => entry.installPath);
    storeDirsCache = { signature, dirs };
  }
  return storeDirsCache.dirs;
}

module.exports = { epicInstalls, gogInstalls, amazonInstalls, lutrisGames, bottlesPrograms, listInstalls, storeInstallDirs };
