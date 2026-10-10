'use strict';

/*
  Where a RetroAchievements game lives on this PC. The account only knows a title and a console, so
  the ROM is found through RetroArch's own playlists: the ones a content scan writes and the
  history of everything launched (playlists/builtin/content_history.lpl). Both are plain JSON with
  the ROM path, the core and, for scanned content, the libretro database the file was matched in.

  A name match is all there is: RetroArch keeps no log of which RetroAchievements game id it
  loaded unless file logging is on, and hashing ROMs the way rcheevos does is a per-console
  algorithm. The console is checked wherever the playlist names its database, so a Master System
  ROM is never taken for the Mega Drive game of the same name.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { xdgAppDirs } = require('../util/xdgAppDirs.js');

// The libretro database a scanned playlist names, for each RetroAchievements console. Only used to
// reject a ROM of the wrong console: a history entry carries no database and is matched by name.
const CONSOLE_DATABASES = {
  'nes/famicom': ['Nintendo - Nintendo Entertainment System', 'Nintendo - Family Computer Disk System'],
  'snes/super famicom': ['Nintendo - Super Nintendo Entertainment System'],
  'game boy': ['Nintendo - Game Boy'],
  'game boy color': ['Nintendo - Game Boy Color'],
  'game boy advance': ['Nintendo - Game Boy Advance'],
  'nintendo 64': ['Nintendo - Nintendo 64'],
  'nintendo ds': ['Nintendo - Nintendo DS'],
  'virtual boy': ['Nintendo - Virtual Boy'],
  'genesis/mega drive': ['Sega - Mega Drive - Genesis'],
  'master system': ['Sega - Master System - Mark III'],
  'game gear': ['Sega - Game Gear'],
  'sega cd': ['Sega - Mega-CD - Sega CD'],
  '32x': ['Sega - 32X'],
  saturn: ['Sega - Saturn'],
  dreamcast: ['Sega - Dreamcast'],
  playstation: ['Sony - PlayStation'],
  'playstation 2': ['Sony - PlayStation 2'],
  'playstation portable': ['Sony - PlayStation Portable'],
  'pc engine/turbografx-16': ['NEC - PC Engine - TurboGrafx 16', 'NEC - PC Engine SuperGrafx'],
  'pc engine cd/turbografx-cd': ['NEC - PC Engine CD - TurboGrafx-CD'],
  'atari 2600': ['Atari - 2600'],
  'atari lynx': ['Atari - Lynx'],
  'neo geo pocket': ['SNK - Neo Geo Pocket', 'SNK - Neo Geo Pocket Color'],
  wonderswan: ['Bandai - WonderSwan', 'Bandai - WonderSwan Color'],
};

// The usual install folders. A portable build keeps everything beside retroarch.exe; the installer
// and Scoop put it in fixed places, the Linux builds in their XDG or Flatpak config folder.
function candidateRoots(env = process.env) {
  const roots = [];
  for (const drive of ['C', 'D', 'E', 'F', 'G']) {
    roots.push(`${drive}:\\RetroArch-Win64`, `${drive}:\\RetroArch`, `${drive}:\\Games\\RetroArch`, `${drive}:\\Jeux\\RetroArch`);
  }
  if (env.APPDATA) roots.push(path.join(env.APPDATA, 'RetroArch'));
  if (env.ProgramFiles) roots.push(path.join(env.ProgramFiles, 'RetroArch'));
  if (env['ProgramFiles(x86)']) roots.push(path.join(env['ProgramFiles(x86)'], 'RetroArch'));
  if (env.USERPROFILE) roots.push(path.join(env.USERPROFILE, 'scoop', 'apps', 'retroarch', 'current'));
  roots.push(...xdgAppDirs('retroarch', { env }));
  return roots;
}

function findRoots(roots = candidateRoots()) {
  return roots.filter((root) => fs.existsSync(path.join(root, 'retroarch.cfg')));
}

// retroarch.cfg writes a folder inside the install as ":\playlists" (":/playlists" on other hosts),
// and the Linux build its default as "~/.config/retroarch/playlists".
function playlistDirectory(root, home = os.homedir()) {
  let configured = '';
  try {
    const match = /^playlist_directory\s*=\s*"([^"]*)"/m.exec(fs.readFileSync(path.join(root, 'retroarch.cfg'), 'utf8'));
    configured = match ? match[1].trim() : '';
  } catch {
    /* unreadable config: the default folder below */
  }
  if (!configured || configured === 'default') return path.join(root, 'playlists');
  if (configured.startsWith(':')) return path.join(root, configured.slice(1).replace(/\\/g, '/'));
  if (configured.startsWith('~/')) return path.join(home, configured.slice(2));
  return configured;
}

function readPlaylist(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed && parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function listPlaylists(dir) {
  const files = [];
  for (const folder of [dir, path.join(dir, 'builtin')]) {
    let names = [];
    try {
      names = fs.readdirSync(folder);
    } catch {
      continue;
    }
    for (const name of names) if (name.toLowerCase().endsWith('.lpl') && !/^content_(image|music|video)_history/i.test(name)) files.push(path.join(folder, name));
  }
  return files;
}

// Every ROM RetroArch knows about, as { romPath, label, database, core }.
function readEntries(roots = findRoots()) {
  const entries = [];
  for (const root of roots) {
    for (const file of listPlaylists(playlistDirectory(root))) {
      for (const item of readPlaylist(file)) {
        if (!item || typeof item.path !== 'string' || !item.path) continue;
        entries.push({
          // An archive member is written "game.zip#game.nes"; the file on disk is the archive.
          romPath: item.path.split('#')[0],
          label: String(item.label || '') || path.basename(item.path.split('#').pop()),
          database: String(item.db_name || '').replace(/\.lpl$/i, ''),
          core: String(item.core_name || ''),
        });
      }
    }
  }
  return entries;
}

// "Legend of Zelda, The (USA) (Rev 1).nes" and "The Legend of Zelda" compare equal.
function normalizeTitle(value) {
  let title = String(value || '')
    .replace(/\.[a-z0-9]{1,4}$/i, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .trim();
  const article = /^(.*),\s*(the|a|an)$/i.exec(title);
  if (article) title = `${article[2]} ${article[1]}`;
  return title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function consoleMatches(entry, consoleName) {
  if (!entry.database) return true;
  const databases = CONSOLE_DATABASES[String(consoleName || '').trim().toLowerCase()];
  return !databases || databases.includes(entry.database);
}

// The ROM for one RetroAchievements game, or null. The most recent playlist entry wins, which is
// the order RetroArch writes its history in.
function findRom(entries, { title, console: consoleName } = {}, exists = fs.existsSync) {
  const wanted = normalizeTitle(title);
  if (!wanted) return null;
  for (const entry of entries) {
    if (normalizeTitle(entry.label) !== wanted && normalizeTitle(path.basename(entry.romPath)) !== wanted) continue;
    if (!consoleMatches(entry, consoleName) || !exists(entry.romPath)) continue;
    return { romPath: entry.romPath, core: entry.core };
  }
  return null;
}

module.exports = { CONSOLE_DATABASES, candidateRoots, findRoots, playlistDirectory, readEntries, normalizeTitle, findRom };
