'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/*
  Where Windows games keep their files on Linux: one Wine prefix per launcher setup. Each source
  below only lists candidates; a candidate counts once it holds `drive_c` and `user.reg`, and two
  spellings of one folder (a symlinked Steam root, say) are kept once.
*/

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDirs(p) {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => path.join(p, entry.name));
  } catch {
    return [];
  }
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function isPrefix(p) {
  return isDir(path.join(p, 'drive_c')) && fs.existsSync(path.join(p, 'user.reg'));
}

function xdgDirs({ env, home }) {
  return {
    data: env.XDG_DATA_HOME || path.join(home, '.local', 'share'),
    config: env.XDG_CONFIG_HOME || path.join(home, '.config'),
  };
}

// Native, the usual ~/.steam symlink, Flatpak and Snap installs of the Linux Steam client.
function steamRoots({ env, home }) {
  const { data } = xdgDirs({ env, home });
  return [
    path.join(data, 'Steam'),
    path.join(home, '.steam', 'steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
    path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
  ].filter(isDir);
}

function steamLibraries(root) {
  const libraries = [root];
  const vdf = readText(path.join(root, 'steamapps', 'libraryfolders.vdf'));
  if (vdf) {
    for (const match of vdf.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/g)) libraries.push(match[1].replace(/\\\\/g, '\\'));
  }
  return libraries;
}

function protonPrefixes(ctx) {
  const out = [];
  for (const root of steamRoots(ctx)) {
    for (const library of steamLibraries(root)) {
      for (const dir of listDirs(path.join(library, 'steamapps', 'compatdata'))) {
        out.push({ path: path.join(dir, 'pfx'), kind: 'proton', appid: path.basename(dir) });
      }
    }
  }
  return out;
}

// Lutris keeps its game configs under ~/.config/lutris, or under its data folder when that is absent.
function lutrisGameDirs(ctx) {
  const { config, data } = xdgDirs(ctx);
  const flatpak = path.join(ctx.home, '.var', 'app', 'net.lutris.Lutris');
  return [
    path.join(config, 'lutris', 'games'),
    path.join(data, 'lutris', 'games'),
    path.join(flatpak, 'config', 'lutris', 'games'),
    path.join(flatpak, 'data', 'lutris', 'games'),
  ];
}

function lutrisPrefixes(ctx) {
  const out = [];
  for (const dir of lutrisGameDirs(ctx)) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((name) => /\.ya?ml$/i.test(name));
    } catch {
      continue;
    }
    for (const name of names) {
      const match = /^\s*prefix:\s*['"]?(.+?)['"]?\s*$/m.exec(readText(path.join(dir, name)) || '');
      if (match) out.push({ path: match[1].replace(/^~(?=\/)/, ctx.home), kind: 'lutris' });
    }
  }
  return out;
}

function heroicPrefixes(ctx) {
  const { config } = xdgDirs(ctx);
  const out = [];
  const configDirs = [path.join(config, 'heroic'), path.join(ctx.home, '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'heroic')];
  for (const dir of configDirs) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(dir, 'GamesConfig')).filter((name) => name.endsWith('.json'));
    } catch {
      continue;
    }
    for (const name of names) {
      try {
        const parsed = JSON.parse(readText(path.join(dir, 'GamesConfig', name)) || '{}');
        for (const settings of Object.values(parsed)) {
          if (settings && typeof settings.winePrefix === 'string') out.push({ path: settings.winePrefix, kind: 'heroic' });
        }
      } catch {
        /* a half-written game config is skipped, not fatal */
      }
    }
  }
  for (const dir of listDirs(path.join(ctx.home, 'Games', 'Heroic', 'Prefixes'))) out.push({ path: dir, kind: 'heroic' });
  return out;
}

// A top-level `key: value` of a small YAML file, enough for the two Bottles settings read here.
function yamlValue(file, key) {
  const match = new RegExp(`^${key}:\\s*['"]?(.+?)['"]?\\s*$`, 'm').exec(readText(file) || '');
  return match ? match[1] : null;
}

// Bottles in their default folder, in a custom one (data.yml), or moved elsewhere (placeholder.yml).
function bottlesPrefixes(ctx) {
  const { data } = xdgDirs(ctx);
  const bases = [path.join(data, 'bottles'), path.join(ctx.home, '.var', 'app', 'com.usebottles.bottles', 'data', 'bottles')];
  const roots = [...bases.map((base) => path.join(base, 'bottles')), ...bases.map((base) => yamlValue(path.join(base, 'data.yml'), 'custom_bottles_path'))];
  return roots
    .filter(Boolean)
    .flatMap(listDirs)
    .map((dir) => ({ path: yamlValue(path.join(dir, 'placeholder.yml'), 'Path') || dir, kind: 'bottles' }));
}

function plainWinePrefixes(ctx) {
  return [ctx.env.WINEPREFIX, path.join(ctx.home, '.wine')].filter(Boolean).map((dir) => ({ path: dir, kind: 'wine' }));
}

function discoverPrefixes({ env = process.env, home = os.homedir(), extra = [] } = {}) {
  const ctx = { env, home };
  const candidates = [
    ...plainWinePrefixes(ctx),
    ...protonPrefixes(ctx),
    ...lutrisPrefixes(ctx),
    ...heroicPrefixes(ctx),
    ...bottlesPrefixes(ctx),
    ...extra.map((dir) => ({ path: dir, kind: 'manual' })),
  ];
  const seen = new Set();
  const prefixes = [];
  for (const candidate of candidates) {
    if (!candidate.path || !isPrefix(candidate.path)) continue;
    let real;
    try {
      real = fs.realpathSync(candidate.path);
    } catch {
      continue;
    }
    if (seen.has(real)) continue;
    seen.add(real);
    prefixes.push({ ...candidate, path: real });
  }
  return prefixes;
}

module.exports = { discoverPrefixes, steamRoots, isPrefix, lutrisGameDirs, bottlesPrefixes };
