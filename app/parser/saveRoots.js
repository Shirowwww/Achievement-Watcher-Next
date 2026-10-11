'use strict';

const fs = require('fs');
const path = require('path');
const listDrive = require(path.join(__dirname, '..', 'util', 'listDrive.js'));
const { hostPath, hostFor } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));
const { appHosts } = require(path.join(__dirname, '..', 'util', 'appHosts.js'));

// Same folder once: case-insensitively on Windows, exactly on case-sensitive Linux filesystems.
function addUnique(out, candidate) {
  if (!candidate) return;
  const value = String(candidate).trim();
  if (!value) return;
  const fold = (p) => (process.platform === 'win32' ? path.normalize(p).toLowerCase() : path.normalize(p));
  const key = fold(value);
  if (out.some((p) => fold(p) === key)) return;
  out.push(value);
}

// One path per host (see util/winHosts.js) under the same folder variable.
function hostsPaths(hosts, envName, ...segments) {
  return hosts.map((host) => hostPath(host, envName, ...segments)).filter(Boolean);
}

const steamSourceFolderNames = ['RUNE', 'CODEX'];

function expandKnownSteamSourceRoots(root) {
  const roots = [];
  if (!root) return roots;
  addUnique(roots, root);

  for (const name of steamSourceFolderNames) {
    const child = path.join(root, name);
    try {
      if (fs.existsSync(child) && fs.statSync(child).isDirectory()) addUnique(roots, child);
    } catch {
      /* Optional community save folders may be unreadable or missing. */
    }
  }

  return roots;
}

// Where an installed (non-portable) RUNE release in `gameDir` writes, whether or not anything is
// there yet: on Linux, inside the Wine prefix the game sits in (see util/winHosts.js).
function publicSceneSaveRoot(gameDir) {
  return hostPath(hostFor(gameDir), 'PUBLIC', 'Documents', 'Steam', 'RUNE');
}

function defaultSteamEmuSaveRoots({ existingOnly = false, expandProgramDataSteam = false } = {}) {
  const roots = [];
  for (const host of appHosts()) addHostRoots(roots, host, { expandProgramDataSteam });
  return existingOnly ? roots.filter((p) => fs.existsSync(p)) : roots;
}

// One host's emulator save roots: this machine on Windows, each Wine prefix and the XDG data folder
// on Linux (see util/winHosts.js).
function addHostRoots(roots, host, { expandProgramDataSteam }) {
  const envPath = (envName, ...segments) => hostPath(host, envName, ...segments);
  [
    envPath('PUBLIC', 'Documents', 'OnlineFix'),
    envPath('PUBLIC', 'Documents', 'Steam', 'RUNE'),
    envPath('PUBLIC', 'Documents', 'Steam', 'CODEX'),
    envPath('PUBLIC', 'Documents', 'Steam', 'RLD!'),
    envPath('PUBLIC', 'Documents', 'EMPRESS'),
    envPath('APPDATA', 'Goldberg SteamEmu Saves'),
    envPath('APPDATA', 'Goldberg UplayEmu Saves'),
    // The R1 loader's own default root. Its R2 sibling was listed here from the start; leaving this
    // one out meant an unredirected R1 install was invisible to discovery even though the Watchdog
    // watched the folder live.
    envPath('APPDATA', 'R1 UplayEmu Saves'),
    envPath('APPDATA', 'Goldberg SocialClub Emu Saves'),
    envPath('APPDATA', 'GSE Saves'),
    envPath('APPDATA', 'EMPRESS'),
    // EMPRESS also writes %APPDATA%\EMPRESS\remote\<appid> with no appid level above it.
    envPath('APPDATA', 'EMPRESS', 'remote'),
    // RAZOR1911 (post-2023 releases): plain-text `achievement` file per appid.
    envPath('APPDATA', '.1911'),
    envPath('APPDATA', 'Steam', 'CODEX'),
    envPath('APPDATA', 'Steam', 'RUNE'),
    envPath('APPDATA', 'Steam', 'RLD!'),
    envPath('APPDATA', 'SmartSteamEmu'),
    envPath('APPDATA', 'CreamAPI'),
    envPath('LOCALAPPDATA', 'SKIDROW'),
    envPath('LOCALAPPDATA', 'anadius', 'LSX emu', 'achievement_watcher'),
  ].forEach((p) => addUnique(roots, p));

  // A redirected or unreadable Documents folder means "we do not know where it is", never a failed
  // scan: this feeds the save-root list every emulator source walks.
  let docs = null;
  try {
    docs = host.documents();
  } catch {
    docs = null;
  }
  if (docs) {
    // The Watchdog spells it SKIDROW: the same folder on NTFS (kept once), another one on Linux.
    addUnique(roots, path.join(docs, 'SkidRow'));
    addUnique(roots, path.join(docs, 'SKIDROW'));
    // DARKSiDERS writes its per-appid tree under Documents rather than beside the game whenever the
    // release is not portable; the emulator ini in the game folder points here (see userDir.scan).
    addUnique(roots, path.join(docs, 'DARKSiDERS'));
  }

  const programDataSteam = envPath('PROGRAMDATA', 'Steam');
  if (programDataSteam) {
    if (expandProgramDataSteam) {
      try {
        for (const ent of fs.readdirSync(programDataSteam, { withFileTypes: true })) {
          if (ent.isDirectory()) addUnique(roots, path.join(programDataSteam, ent.name));
        }
      } catch {
        /* ProgramData Steam layout is optional. */
      }
    } else {
      addUnique(roots, programDataSteam);
    }
  }
}

function defaultSteamScanRoots(additionalSearch = []) {
  const roots = defaultSteamEmuSaveRoots({ expandProgramDataSteam: true });
  for (const dir of additionalSearch || []) {
    for (const root of expandKnownSteamSourceRoots(dir)) addUnique(roots, root);
  }
  return roots;
}

// A path is "Steam-ish" when its name contains a Steam library/install segment; these must never
// become emulator-scan library roots, since Steam games are handled by the Steam source.
function isSteamLikePath(p) {
  const value = String(p || '');
  if (!value) return false;
  const normalized = value.replace(/\//g, path.sep);
  return /(?:^|[\\/])(steam|steamapps|steamlibrary|steam library|steam games)(?:[\\/]|$)/i.test(normalized);
}

// Common game-library folder names in many languages, probed on every fixed drive by Smart Find.
// `Program Files` variants are scoped to their Games subfolder, never the whole Windows install.
const GAME_LIBRARY_FOLDER_NAMES = [
  // English / neutral
  'Games',
  'Games Library',
  'GameLibrary',
  'Game Library',
  'Games Folder',
  'Repacks',
  'Repack',
  // French
  'Jeux',
  'Bibliothèque de jeux',
  'Bibliotheque de jeux',
  'Bibliothèque',
  'Bibliotheque',
  // German
  'Spiele',
  'Spielbibliothek',
  'Spielebibliothek',
  // Spanish / Latam
  'Juegos',
  'Biblioteca de juegos',
  // Italian
  'Giochi',
  'Libreria giochi',
  'Biblioteca giochi',
  // Portuguese
  'Jogos',
  'Biblioteca de jogos',
  // Dutch
  'Spellen',
  'Spelletjes',
  'Gamebibliotheek',
  // Swedish
  'Spel',
  'Spelbibliotek',
  // Danish
  'Spil',
  'Spilbibliotek',
  // Norwegian
  'Spill',
  'Spillbibliotek',
  // Finnish
  'Pelit',
  'Pelikirjasto',
  // Polish
  'Gry',
  'Biblioteka gier',
  // Czech / Slovak
  'Hry',
  'Knihovna her',
  'Knižnica hier',
  // Hungarian
  'Játékok',
  'Jatekkoenyvtar',
  'Játékkönyvtár',
  // Romanian
  'Jocuri',
  'Biblioteca de jocuri',
  // Russian
  'Игры',
  'Библиотека игр',
  // Ukrainian
  'Ігри',
  'Ігрова бібліотека',
  // Bulgarian
  'Игри',
  // Greek
  'Παιχνίδια',
  'Βιβλιοθήκη παιχνιδιών',
  // Turkish
  'Oyunlar',
  'Oyun Kütüphanesi',
  // Arabic
  'ألعاب',
  'مكتبة الألعاب',
  // Hebrew
  'משחקים',
  'ספריית משחקים',
  // Japanese
  'ゲーム',
  'ゲームライブラリ',
  // Korean
  '게임',
  '게임 라이브러리',
  // Chinese (simplified + traditional)
  '游戏',
  '游戏库',
  '遊戲',
  '遊戲庫',
  // Thai
  'เกม',
  'เกมส์',
  // Vietnamese
  'Trò chơi',
  'Thư viện trò chơi',
  // Indonesian
  'Permainan',
  'Perpustakaan Game',
  // Hindi
  'गेम',
  'गेम्स',
  // Storefront-neutral custom roots
  'GOG Games',
  'Epic Games',
  path.join('Program Files', 'Games'),
  path.join('Program Files (x86)', 'Games'),
];

// True when a folder name looks like a game library ("Jeux", "Games Library", "Repacks", ...). Used
// to peek into Desktop subfolders safely: a Desktop\Jeux\<game> layout is scanned, loose folders are not.
function isLibraryLikeFolderName(name) {
  const value = String(name || '').trim();
  if (!value) return false;
  const base = path.basename(value).toLowerCase();
  if (GAME_LIBRARY_FOLDER_NAMES.some((candidate) => path.basename(candidate).toLowerCase() === base)) return true;
  return /^my ?games$/i.test(base);
}

// Per-user game-library candidates under the user profile or AppData. Only library-like names are
// probed, never the raw AppData/LocalAppData roots (application config, false positives).
function profileLibraryRoots() {
  const roots = [];
  const names = [];
  const seen = new Set();
  for (const name of GAME_LIBRARY_FOLDER_NAMES) {
    const base = path.basename(name);
    // Storefront-managed names (GOG Games / Epic Games) are deliberately excluded here: those
    // folders hold launcher data and stale uninstalled-game leftovers, not user-created libraries.
    if (/^(gog games|epic games)$/i.test(base)) continue;
    if (!base) continue;
    const key = base.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(base);
  }
  const hosts = appHosts();
  for (const base of [...hostsPaths(hosts, 'USERPROFILE'), ...hostsPaths(hosts, 'APPDATA'), ...hostsPaths(hosts, 'LOCALAPPDATA')]) {
    for (const name of names) addUnique(roots, path.join(base, name));
  }
  return roots;
}

// The roots Smart Find treats as drives: every fixed drive on Windows; on Linux the mount points
// and each prefix's C:.
async function driveRoots() {
  if (process.platform !== 'win32') {
    const roots = [];
    try {
      for (const mount of await listDrive()) addUnique(roots, mount);
    } catch {
      /* no mount list: the prefixes below still count */
    }
    for (const host of appHosts()) if (host.root) addUnique(roots, path.join(host.root, 'drive_c'));
    return roots;
  }
  try {
    return (await listDrive({ ignoreSystemDrive: false })).map((drive) => `${drive}\\`);
  } catch {
    return [];
  }
}

async function discoverLibraryRoots() {
  const candidates = [];
  for (const drive of await driveRoots()) {
    for (const name of GAME_LIBRARY_FOLDER_NAMES) candidates.push(path.join(drive, name));
  }
  for (const root of profileLibraryRoots()) candidates.push(root);

  // Portable installs are often grouped under Desktop\Games or Desktop\Jeux; only immediate children
  // matching the library allowlist are accepted, so the Desktop itself never becomes an invisible root.
  const hosts = appHosts();
  for (const desktop of [...hostsPaths(hosts, 'USERPROFILE', 'Desktop'), ...hostsPaths(hosts, 'PUBLIC', 'Desktop')]) {
    try {
      for (const entry of fs.readdirSync(desktop, { withFileTypes: true })) {
        if (entry.isDirectory() && isLibraryLikeFolderName(entry.name)) candidates.push(path.join(desktop, entry.name));
      }
    } catch {
      /* Desktop may be redirected, missing or unreadable. */
    }
  }

  // Probe every drive/profile candidate in parallel - disk stats dominate this pass.
  const results = await Promise.all(
    candidates.map(async (p) => {
      try {
        return (await fs.promises.stat(p)).isDirectory() && !isSteamLikePath(p) ? p : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

// Folder names people keep their console emulators in. A portable RPCS3/shadPS4/Xenia is not a game
// and never sits in a "Games" folder, so the game-library allowlist above cannot find one.
const EMULATOR_LIBRARY_FOLDER_NAMES = [
  'Emulators',
  'Emulator',
  'Emulation',
  'Emus',
  'Emulateurs',
  'Émulateurs',
  'Emuladores',
  'Emulatori',
  'Emulatoren',
  'Emulatory',
  'Эмуляторы',
  'エミュレータ',
  '模拟器',
];

// The same shape as discoverLibraryRoots(), for emulator folders: every fixed drive and the user
// profile, one stat per candidate, no recursion.
async function discoverEmulatorRoots() {
  const candidates = [];
  for (const drive of await driveRoots()) {
    for (const name of EMULATOR_LIBRARY_FOLDER_NAMES) candidates.push(path.join(drive, name));
  }
  const hosts = appHosts();
  for (const base of [...hostsPaths(hosts, 'USERPROFILE'), ...hostsPaths(hosts, 'USERPROFILE', 'Desktop'), ...hostsPaths(hosts, 'LOCALAPPDATA')]) {
    for (const name of EMULATOR_LIBRARY_FOLDER_NAMES) candidates.push(path.join(base, name));
  }

  const results = await Promise.all(
    candidates.map(async (p) => {
      try {
        return (await fs.promises.stat(p)).isDirectory() ? p : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

module.exports = {
  publicSceneSaveRoot,
  defaultSteamEmuSaveRoots,
  defaultSteamScanRoots,
  discoverEmulatorRoots,
  discoverLibraryRoots,
  expandKnownSteamSourceRoots,
  isSteamLikePath,
  EMULATOR_LIBRARY_FOLDER_NAMES,
  GAME_LIBRARY_FOLDER_NAMES,
  isLibraryLikeFolderName,
  profileLibraryRoots,
};
