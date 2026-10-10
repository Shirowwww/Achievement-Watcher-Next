'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/*
  The icon a Linux desktop entry gives a native game. An ELF binary carries no icon of its own, but
  whoever installed the game (its installer, itch, Heroic, Lutris) usually wrote a .desktop file
  that launches it, and that file names the icon.
*/

// Largest first: the square logo wants the biggest picture there is.
const HICOLOR_SIZES = ['512x512', '256x256', '128x128', '96x96', '64x64', '48x48'];

function dataDirs({ env, home }) {
  const user = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  const system = (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(path.delimiter).filter(Boolean);
  return [user, ...system];
}

// The [Desktop Entry] group's keys; localized keys (Name[fr]) and other groups are not needed here.
function parseDesktopEntry(text) {
  const entry = {};
  let inGroup = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('[')) {
      inGroup = line.trim() === '[Desktop Entry]';
      continue;
    }
    const match = inGroup && /^([A-Za-z0-9-]+)\s*=\s*(.*)$/.exec(line);
    if (match) entry[match[1]] = match[2].trim();
  }
  return entry;
}

// The entry starts this binary: by its full path, or by name from its own folder (Path=).
function launches(entry, exePath) {
  const exec = entry.Exec || '';
  if (exec.includes(exePath)) return true;
  return !!entry.Path && path.resolve(entry.Path) === path.dirname(exePath) && exec.includes(path.basename(exePath));
}

function resolveIcon(icon, dirs) {
  if (!icon) return null;
  if (path.isAbsolute(icon)) return fs.existsSync(icon) ? icon : null;
  const candidates = [];
  for (const size of HICOLOR_SIZES) {
    for (const dir of dirs) candidates.push(path.join(dir, 'icons', 'hicolor', size, 'apps', `${icon}.png`));
  }
  for (const dir of dirs) candidates.push(path.join(dir, 'pixmaps', `${icon}.png`));
  return candidates.find((file) => fs.existsSync(file)) || null;
}

function desktopEntryIcon(exePath, { env = process.env, home = os.homedir() } = {}) {
  const exe = path.resolve(String(exePath || ''));
  const dirs = dataDirs({ env, home });
  for (const dir of dirs) {
    const applications = path.join(dir, 'applications');
    let names;
    try {
      names = fs.readdirSync(applications).filter((name) => name.endsWith('.desktop'));
    } catch {
      continue;
    }
    for (const name of names) {
      let entry;
      try {
        entry = parseDesktopEntry(fs.readFileSync(path.join(applications, name), 'utf8'));
      } catch {
        continue;
      }
      if (!launches(entry, exe)) continue;
      const icon = resolveIcon(entry.Icon, dirs);
      if (icon) return icon;
    }
  }
  return null;
}

module.exports = { desktopEntryIcon, parseDesktopEntry };
