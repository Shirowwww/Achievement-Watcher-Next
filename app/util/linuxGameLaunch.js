'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const linuxLaunchers = require(path.join(__dirname, 'linuxLaunchers.js'));

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

/*
  `lutris:rungame/<slug>` starts a Lutris game. A game is ours when its config names this
  executable, or when the executable lives inside the prefix the config sets up.
*/
function lutrisSlugForPath(exe, ctx) {
  const games = linuxLaunchers.lutrisGames(ctx);
  const game = games.find((entry) => entry.executable && realOrSelf(entry.executable) === realOrSelf(exe)) || games.find((entry) => isInside(exe, entry.prefix));
  return game ? game.id : '';
}

const HEROIC_RUNNERS = { epic: 'legendary', gog: 'gog', amazon: 'nile', sideload: 'sideload' };

function heroicUrlForPath(exe, ctx) {
  const installs = [...linuxLaunchers.epicInstalls(ctx), ...linuxLaunchers.gogInstalls(ctx), ...linuxLaunchers.amazonInstalls(ctx), ...linuxLaunchers.heroicSideloads(ctx)];
  const install = installs.find((entry) => entry.launcher === 'heroic' && isInside(exe, entry.installPath));
  // The path form is the one every Heroic release reads; the query form only exists in newer ones.
  if (install) return `heroic://launch/${HEROIC_RUNNERS[install.store]}/${encodeURIComponent(install.id)}`;
  // A game whose files are inside its own Heroic prefix is still named by its settings.
  const prefixed = linuxLaunchers.heroicPrefixes(ctx).find((entry) => isInside(exe, entry.winePrefix));
  return prefixed ? `heroic://launch/${encodeURIComponent(prefixed.id)}` : '';
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

/*
  Hands a launcher URI to the desktop through xdg-open. Electron's shell.openExternal goes through the
  OpenURI portal first and reports success even where no portal answers, so a click could do nothing
  and say nothing; xdg-open's exit code says whether a handler took the link. Outside a full desktop
  xdg-open runs the launcher in the foreground, so a launch still running after `settleMs` counts as
  taken rather than being waited for.
*/
function openUri(url, { start = spawn, settleMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = start('xdg-open', [url], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const settled = setTimeout(() => {
      child.unref();
      resolve();
    }, settleMs);
    child.on('error', (err) => {
      clearTimeout(settled);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(settled);
      if (code === 0) return resolve();
      const detail = stderr.trim();
      reject(new Error(code === 3 || code === 4 ? `no application handles ${url.split(':')[0]}: links${detail ? ` (${detail})` : ''}` : detail || `xdg-open exited with ${code}`));
    });
  });
}

module.exports = { planLaunch, isWindowsProgram, openUri };
