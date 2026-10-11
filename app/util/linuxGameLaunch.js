'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/*
  How a game is started on Linux. AW never runs Wine itself: a Windows game goes back to the
  launcher that owns it (Steam, Lutris, Heroic) through that launcher's URI, which the desktop
  hands over with xdg-open. A native program is spawned directly. A Windows program no launcher
  claims is opened through the desktop's own file association, so whatever the user set up for
  .exe files (Wine, Bottles, nothing) decides.
*/

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function readJson(p) {
  const text = readText(p);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function listFiles(dir, pattern) {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => pattern.test(name))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function realOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// True when `file` is `dir` itself or sits below it.
function isInside(file, dir) {
  if (!file || !dir) return false;
  const relative = path.relative(realOrSelf(dir), realOrSelf(file));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function xdgConfig({ env, home }) {
  return env.XDG_CONFIG_HOME || path.join(home, '.config');
}

function numericAppid(appid) {
  const id = String(appid == null ? '' : appid).trim();
  return /^[0-9]+$/.test(id) ? id : '';
}

// .../steamapps/compatdata/<appid>/... (Proton prefix) or .../steamapps/common/<installdir>/...
function steamAppidForPath(exe) {
  const parts = path.resolve(exe).split(path.sep);
  const at = parts.lastIndexOf('steamapps');
  if (at < 0 || at + 2 >= parts.length) return '';
  const steamapps = parts.slice(0, at + 1).join(path.sep) || path.sep;
  if (parts[at + 1] === 'compatdata') return numericAppid(parts[at + 2]);
  if (parts[at + 1] !== 'common') return '';
  const installdir = parts[at + 2];
  for (const manifest of listFiles(steamapps, /^appmanifest_\d+\.acf$/)) {
    const text = readText(manifest) || '';
    const dir = /"installdir"\s+"([^"]*)"/i.exec(text);
    if (dir && dir[1] === installdir) return numericAppid(/"appid"\s+"(\d+)"/i.exec(text)?.[1] || '');
  }
  return '';
}

function yamlValue(block, key) {
  const match = new RegExp(`^\\s+${key}:\\s*['"]?(.+?)['"]?\\s*$`, 'm').exec(block);
  return match ? match[1] : '';
}

/*
  Lutris names each game config `<slug>-<timestamp>.yml`, and `lutris:rungame/<slug>` starts it.
  A game is ours when its config names this executable, or when the executable lives inside the
  prefix the config sets up.
*/
function lutrisSlugForPath(exe, ctx) {
  const dirs = [path.join(xdgConfig(ctx), 'lutris', 'games'), path.join(ctx.home, '.var', 'app', 'net.lutris.Lutris', 'config', 'lutris', 'games')];
  let byPrefix = '';
  for (const dir of dirs) {
    for (const file of listFiles(dir, /\.ya?ml$/i)) {
      const text = readText(file) || '';
      const game = /^game:\s*\n((?:[ \t]+.*\n?)*)/m.exec(text);
      if (!game) continue;
      const slug = path.basename(file).replace(/\.ya?ml$/i, '').replace(/-\d+$/, '');
      const expand = (value) => value.replace(/^~(?=\/)/, ctx.home);
      const gameExe = expand(yamlValue(game[1], 'exe'));
      const prefix = expand(yamlValue(game[1], 'prefix'));
      if (gameExe && path.isAbsolute(gameExe) && realOrSelf(gameExe) === realOrSelf(exe)) return slug;
      if (!byPrefix && prefix && isInside(exe, prefix)) byPrefix = slug;
    }
  }
  return byPrefix;
}

function heroicConfigDirs(ctx) {
  return [path.join(xdgConfig(ctx), 'heroic'), path.join(ctx.home, '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'heroic')];
}

// Every installed Heroic game as { runner, appName, installPath }, from the stores' own records.
function heroicInstalls(ctx) {
  const out = [];
  for (const dir of heroicConfigDirs(ctx)) {
    const legendary = readJson(path.join(dir, 'legendaryConfig', 'legendary', 'installed.json'));
    for (const [appName, entry] of Object.entries(legendary || {})) {
      if (entry && entry.install_path) out.push({ runner: 'legendary', appName, installPath: entry.install_path });
    }
    const gog = readJson(path.join(dir, 'gog_store', 'installed.json'));
    for (const entry of (gog && gog.installed) || []) {
      if (entry && entry.appName && entry.install_path) out.push({ runner: 'gog', appName: entry.appName, installPath: entry.install_path });
    }
    const nile = readJson(path.join(dir, 'nile_config', 'nile', 'installed.json'));
    for (const entry of Array.isArray(nile) ? nile : []) {
      if (entry && entry.id && entry.path) out.push({ runner: 'nile', appName: entry.id, installPath: entry.path });
    }
    const sideload = readJson(path.join(dir, 'sideload_apps', 'library.json'));
    for (const entry of (sideload && sideload.games) || []) {
      const executable = entry && entry.install && entry.install.executable;
      if (entry && entry.app_name && executable) out.push({ runner: 'sideload', appName: entry.app_name, installPath: path.dirname(executable) });
    }
  }
  return out;
}

// A game whose files are inside its own Heroic prefix still names its appName: GamesConfig/<appName>.json.
function heroicAppNameForPrefix(exe, ctx) {
  for (const dir of heroicConfigDirs(ctx)) {
    for (const file of listFiles(path.join(dir, 'GamesConfig'), /\.json$/i)) {
      const parsed = readJson(file) || {};
      for (const [appName, settings] of Object.entries(parsed)) {
        if (settings && typeof settings.winePrefix === 'string' && isInside(exe, settings.winePrefix)) return appName;
      }
    }
  }
  return '';
}

function heroicUrlForPath(exe, ctx) {
  const install = heroicInstalls(ctx).find((entry) => isInside(exe, entry.installPath));
  // The path form is the one every Heroic release reads; the query form only exists in newer ones.
  if (install) return `heroic://launch/${install.runner}/${encodeURIComponent(install.appName)}`;
  const appName = heroicAppNameForPrefix(exe, ctx);
  return appName ? `heroic://launch/${encodeURIComponent(appName)}` : '';
}

function isWindowsProgram(exe) {
  return /\.(exe|bat|cmd|com|msi|lnk)$/i.test(String(exe || ''));
}

/*
  The launch plan for one game: { kind: 'uri', url, launcher } to hand to the desktop,
  { kind: 'spawn' } for a native program, or { kind: 'open' } for the desktop's file association.
  `game` is the library record (Steam-owned games carry `steamOfficial` and a numeric appid).
*/
function planLaunch({ exe, game } = {}, { env = process.env, home = os.homedir() } = {}) {
  const ctx = { env, home };
  const steamOwned = game && game.steamOfficial && numericAppid(game.appid);
  if (steamOwned) return { kind: 'uri', launcher: 'steam', url: `steam://rungameid/${steamOwned}` };
  if (!exe) return null;
  const steamAppid = steamAppidForPath(exe);
  if (steamAppid) return { kind: 'uri', launcher: 'steam', url: `steam://rungameid/${steamAppid}` };
  const slug = lutrisSlugForPath(exe, ctx);
  if (slug) return { kind: 'uri', launcher: 'lutris', url: `lutris:rungame/${encodeURIComponent(slug)}` };
  const heroic = heroicUrlForPath(exe, ctx);
  if (heroic) return { kind: 'uri', launcher: 'heroic', url: heroic };
  return { kind: isWindowsProgram(exe) ? 'open' : 'spawn' };
}

module.exports = { planLaunch, isWindowsProgram };
