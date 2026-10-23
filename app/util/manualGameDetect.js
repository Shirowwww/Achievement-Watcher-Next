'use strict';

/*
  What the "Add a game" dialog can say about an executable the moment it is picked: which emulator,
  recompilation or store it belongs to, its Steam AppID, and whether its achievements will reach the
  library. Every answer comes from the readers the library scan itself uses, injected here so the
  verdicts can be tested without a game on disk; the dialog only words them.
*/

const fs = require('fs');
const path = require('path');

/*
  Console emulators by executable name. `reader` says how their achievements reach AW Next: a
  folder reader of its own ('folder', the library lists the games once the folder is watched),
  the user's RetroAchievements account ('retro'), or nothing at all ('none').
*/
const CONSOLE_EMULATORS = [
  { test: /^rpcs3$/i, name: 'RPCS3', platform: 'PlayStation', reader: 'folder' },
  { test: /^shadps4/i, name: 'shadPS4', platform: 'PlayStation', reader: 'folder' },
  { test: /^kyty/i, name: 'Kyty', platform: 'PlayStation', reader: 'folder' },
  { test: /^xenia/i, name: 'Xenia', platform: 'Xbox', reader: 'folder' },
  { test: /^retroarch$/i, name: 'RetroArch', platform: 'Other', reader: 'retro' },
  { test: /^pcsx2/i, name: 'PCSX2', platform: 'PlayStation', reader: 'retro' },
  { test: /^duckstation/i, name: 'DuckStation', platform: 'PlayStation', reader: 'retro' },
  { test: /^ppsspp/i, name: 'PPSSPP', platform: 'PlayStation', reader: 'retro' },
  { test: /^dolphin$/i, name: 'Dolphin', platform: 'Other', reader: 'retro' },
  { test: /^flycast$/i, name: 'Flycast', platform: 'Other', reader: 'retro' },
  { test: /^emuhawk$/i, name: 'BizHawk', platform: 'Other', reader: 'retro' },
  { test: /^(?:yuzu|suyu|sudachi|citron|eden|torzu|ryujinx)$/i, name: '', platform: 'Nintendo Switch', reader: 'none' },
  { test: /^cemu$/i, name: 'Cemu', platform: 'Other', reader: 'none' },
  { test: /^(?:citra(?:-qt)?|lime3ds(?:-gui)?|azahar)$/i, name: '', platform: 'Other', reader: 'none' },
  { test: /^vita3k$/i, name: 'Vita3K', platform: 'PlayStation', reader: 'none' },
  { test: /^xemu$/i, name: 'xemu', platform: 'Xbox', reader: 'none' },
  { test: /^cxbx(?:-reloaded)?$/i, name: 'Cxbx-Reloaded', platform: 'Xbox', reader: 'none' },
];

// What a folder reader's record is, by its data type: the family shown and the console it plays.
const FOLDER_TYPES = {
  rpcs3: { kind: 'console-emulator', name: 'RPCS3', platform: 'PlayStation' },
  shadps4: { kind: 'console-emulator', name: 'shadPS4', platform: 'PlayStation' },
  kytyps5: { kind: 'console-emulator', name: 'Kyty', platform: 'PlayStation' },
  xenia: { kind: 'console-emulator', name: 'Xenia', platform: 'Xbox' },
  x360recomp: { kind: 'recomp', name: 'Xbox 360 Recomp', platform: 'PC' },
  ps4recomp: { kind: 'recomp', name: 'PS4 Recomp', platform: 'PC' },
  pcports: { kind: 'recomp', name: 'PC Port', platform: 'PC' },
  xlln: { kind: 'patch', name: 'XLiveLessNess', platform: 'PC' },
  markerpatch: { kind: 'patch', name: 'MarkerPatch', platform: 'PC' },
  madnesspatch: { kind: 'patch', name: 'MadnessPatch', platform: 'PC' },
  socialclub: { kind: 'steam-emulator', name: 'Goldberg SocialClub', platform: 'PC' },
};

const GOLDBERG_NAMES = { gbe: 'GBE Fork', goldberg: 'Goldberg' };

function consoleEmulatorFor(exePath) {
  const exe = String(exePath || '');
  const base = path.basename(exe, path.extname(exe));
  return CONSOLE_EMULATORS.find((entry) => entry.test.test(base)) || null;
}

const digits = (value) => (/^\d+$/.test(String(value || '').trim()) ? String(value).trim() : '');

async function attempt(read, fallback) {
  try {
    const value = await read();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function result(fields) {
  return { kind: 'none', name: '', appid: '', platform: 'PC', achievements: 'none', count: 0, games: [], ...fields };
}

// The games a folder reader claims, as plain { appid, source, type } records.
function gamesOf(records) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && record.data && record.data.type)
    .map((record) => ({ appid: String(record.appid || ''), source: String(record.source || ''), type: String(record.data.type) }));
}

async function emulatorFolder(emulator, exeDir, deps) {
  const games = emulator.reader === 'folder' ? gamesOf(await attempt(() => deps.folderGames(exeDir), [])) : [];
  return result({ kind: 'console-emulator', name: emulator.name, platform: emulator.platform, achievements: emulator.reader, count: games.length, games, folder: exeDir });
}

// A game folder one of the library's own readers claims: a recompilation, a port, a patch.
function claimedFolder(games, gameDir) {
  const own = games.filter((game) => FOLDER_TYPES[game.type]);
  if (own.length === 0) return null;
  const family = FOLDER_TYPES[own[0].type];
  return result({ ...family, appid: own.length === 1 ? own[0].appid : '', achievements: 'folder', count: own.length, games: own, folder: gameDir });
}

/*
  A Steam emulator: GBE Fork, Goldberg, or a crack loader (CODEX, RUNE, OnlineFix, ColdClient...).
  Its saves land in the folders every scan reads and a manual entry takes them over by AppID, so an
  AppID is all it needs. Without one the scan looks the title up on Steam.
*/
function steamEmulator(found, loader, sceneGames) {
  const scene = sceneGames.find((game) => game.type === 'file' && game.appid);
  if (!found && !loader && !scene) return null;
  const name = (loader && loader.name) || (found && GOLDBERG_NAMES[found.emulator]) || (scene && scene.source) || 'Steam emulator';
  const appid = digits(found && found.appid) || digits(loader && loader.appid) || digits(scene && scene.appid);
  return result({ kind: 'steam-emulator', name, appid, achievements: appid ? 'tracked' : 'by-title', count: (found && found.schemaCount) || 0 });
}

/*
  `deps` (all optional, each failure costs only its own answer):
    gameDirFor(exe)      the game folder, '' when the exe sits loose in a library
    folderGames(dir)     what the library's folder readers find there (previewWatchedFolder)
    goldberg(dir)        goldberg.findCompatibleGames([dir])[0]-shaped, when it is an emulator setup
    crackLoader(dir)     crackLoaderDetect.detectWorkingCrackLoader(dir)
    uplayEmulator(dir)   true when a Goldberg Uplay R2 loader serves the folder
    steamAppid(dir)      the AppID Steam's own manifest gives the folder
    launcherInstall(dir) true when an official launcher owns the folder
*/
async function detectManualGame(exePath, deps = {}) {
  const exe = String(exePath || '');
  const exeDir = path.dirname(exe);
  const call = (name, dir, fallback) => attempt(() => (deps[name] ? deps[name](dir) : fallback), fallback);

  const emulator = consoleEmulatorFor(exe);
  if (emulator) return { gameDir: exeDir, ...(await emulatorFolder(emulator, exeDir, deps)) };

  // No game folder (an exe loose in a library root, or roots that could not be read): probing its
  // folder would read a whole collection as this one game, so it is reported as unknown.
  const gameDir = deps.gameDirFor ? await attempt(() => deps.gameDirFor(exe), '') : exeDir;
  if (!gameDir) return { gameDir: '', ...result({}) };

  const games = gamesOf(await call('folderGames', gameDir, []));
  const claimed = claimedFolder(games, gameDir);
  if (claimed) return { gameDir, ...claimed };

  const steamAppid = digits(await call('steamAppid', gameDir, ''));
  const [found, loader, uplay] = await Promise.all([call('goldberg', gameDir, null), call('crackLoader', gameDir, null), call('uplayEmulator', gameDir, false)]);
  const emulated = steamEmulator(found, loader, games);
  if (emulated) return { gameDir, ...emulated };
  if (uplay) return { gameDir, ...result({ kind: 'steam-emulator', name: 'Uplay R2', achievements: 'by-title' }) };

  if (steamAppid) return { gameDir, ...result({ kind: 'store', name: 'Steam', appid: steamAppid, achievements: 'store' }) };
  if (await call('launcherInstall', gameDir, false)) return { gameDir, ...result({ kind: 'store', achievements: 'store' }) };
  return { gameDir, ...result({}) };
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

// Loader markers are lowercase basenames; on Linux "OnlineFix.ini" must be read under its own case.
function readMarker(dir, marker) {
  try {
    const name = fs.readdirSync(dir).find((entry) => entry.toLowerCase() === marker.toLowerCase());
    return name ? readText(path.join(dir, name)) : '';
  } catch {
    return '';
  }
}

/*
  The game a crack loader serves, from the files beside it: the library scan reaches the ini only
  four levels down, and a packaged Unreal build keeps it six down (Engine/.../Steamworks/Steamv<N>/
  Win64). OnlineFix's RealAppId comes first: its FakeAppId is Spacewar (480), never the game.
*/
function loaderAppid(loader) {
  if (!loader || !loader.dir) return '';
  const texts = (loader.markers || []).filter((name) => /\.ini$/i.test(name)).map((name) => readMarker(loader.dir, name));
  for (const pattern of [/^\s*RealAppId\s*=\s*(\d+)\s*$/im, /^\s*App_?Id\s*=\s*(\d+)\s*$/im]) {
    for (const text of texts) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
  }
  return digits(readText(path.join(loader.dir, 'steam_appid.txt')));
}

// crackLoaderDetect groups the scene runtimes under one family; the files say which one it is.
function loaderName(loader) {
  if (!loader || !/scene emulator/i.test(loader.name)) return loader ? loader.name : '';
  const markers = (loader.markers || []).map((name) => name.toLowerCase());
  if (markers.some((name) => name.endsWith('.rne'))) return 'RUNE';
  if (markers.includes('cpy.ini')) return 'CPY';
  const text = markers
    .filter((name) => name.endsWith('.ini'))
    .map((name) => readMarker(loader.dir, name))
    .join('\n');
  if (/\bRUNE\b/.test(text)) return 'RUNE';
  if (/\bCODEX\b/.test(text)) return 'CODEX';
  return 'Scene emulator';
}

/*
  The library's own readers. `folderGames` is achievements.previewWatchedFolder, passed in because the
  renderer already holds that module. A Goldberg layout counts only with an emulator dll or a
  steam_settings folder: Valve's own dll and steam_appid.txt ship with plenty of untouched games.
*/
function defaultReaders({ folderGames, blockedRoots = [] } = {}) {
  const exeDetect = require('../parser/exeDetect.js');
  const goldberg = require('../parser/goldberg.js');
  const launcherDetect = require('../parser/launcherDetect.js');
  const crackLoaderDetect = require('./crackLoaderDetect.js');
  return {
    gameDirFor: (exe) => exeDetect.gameDirForExe(exe, { blockedRoots }),
    folderGames,
    goldberg: (dir) => {
      const emulator = goldberg.detectEmulator(dir);
      const real = emulator.type === 'gbe' || !!emulator.steamSettings || emulator.dll.some((dll) => crackLoaderDetect.isEmulatorDll(dll));
      return real ? goldberg.findCompatibleGames([dir], { maxDepth: 2 })[0] || { appid: '', emulator: emulator.type } : null;
    },
    crackLoader: (dir) => {
      const loader = crackLoaderDetect.detectWorkingCrackLoader(dir);
      return loader ? { ...loader, name: loaderName(loader), appid: loaderAppid(loader) } : null;
    },
    uplayEmulator: (dir) => require('../parser/uplayR2.js').hasEmulatorEvidence(dir),
    steamAppid: (dir) => launcherDetect.steamLibraryAppid(dir),
    launcherInstall: (dir) => launcherDetect.isOfficialLauncherInstall(dir),
  };
}

const OK = 'fas fa-check-circle';
const OFF = 'fas fa-minus-circle';
const INFO = 'fas fa-info-circle';
const PLATFORM_NAMES = { PlayStation: 'PlayStation', Xbox: 'Xbox', 'Nintendo Switch': 'Nintendo Switch' };

function emulatorCheck(found, t) {
  const label = {
    recomp: t('manual-game-check-recomp', 'Recompiled game', 'Jeu recompilé'),
    patch: t('manual-game-check-patch', 'Achievement patch', 'Patch de succès'),
    store: t('manual-game-check-store', 'Installed by', 'Installé par'),
  }[found.kind] || t('manual-game-check-emulator', 'Emulator', 'Émulateur');
  if (found.kind === 'none') return { state: 'off', icon: OFF, label, value: t('manual-game-none-found', 'None found', 'Aucun trouvé') };
  if (found.kind === 'store') return { state: 'info', icon: INFO, label, value: found.name || t('manual-game-official-launcher', 'Official launcher', 'Lanceur officiel') };
  return { state: 'ok', icon: OK, label, value: found.name || PLATFORM_NAMES[found.platform] || '' };
}

function appidCheck(found, t) {
  const label = t('manual-game-check-appid', 'Steam AppID', 'AppID Steam');
  if (/^\d+$/.test(found.appid)) return { state: 'ok', icon: OK, label, value: found.appid };
  if (found.achievements === 'by-title') return { state: 'info', icon: INFO, label, value: t('manual-game-appid-by-title', 'Looked up by name', 'Cherché par le nom') };
  if (['console-emulator', 'recomp', 'patch'].includes(found.kind)) return { state: 'info', icon: INFO, label, value: t('manual-game-appid-not-needed', 'Not needed', 'Pas nécessaire') };
  return { state: 'off', icon: OFF, label, value: t('manual-game-appid-unknown', 'Unknown', 'Inconnu') };
}

function achievementsCheck(found, t) {
  const label = t('manual-game-check-achievements', 'Achievements', 'Succès');
  const count = { count: found.count };
  switch (found.achievements) {
    case 'tracked':
      return { state: 'ok', icon: OK, label, value: found.count > 0 ? t('manual-game-ach-count', '{count} will be tracked', '{count} seront suivis', count) : t('manual-game-ach-tracked', 'Will be tracked', 'Seront suivis') };
    case 'folder':
      if (found.kind === 'console-emulator' && found.count > 0) {
        return { state: 'ok', icon: OK, label, value: t('manual-game-ach-games', '{count} games in its folder', '{count} jeux dans son dossier', count) };
      }
      return { state: 'ok', icon: OK, label, value: t('manual-game-ach-folder', 'Read from its folder', 'Lus depuis son dossier') };
    case 'by-title':
      return { state: 'info', icon: INFO, label, value: t('manual-game-ach-by-title', 'If Steam knows its name', 'Si Steam connaît son nom') };
    case 'retro':
      return { state: 'info', icon: INFO, label, value: t('manual-game-ach-retro', 'Through RetroAchievements', 'Via RetroAchievements') };
    case 'store':
      return { state: 'info', icon: INFO, label, value: t('manual-game-ach-store', 'Through your account', 'Via ton compte') };
    default:
      return { state: 'off', icon: OFF, label, value: t('manual-game-ach-none', 'Not tracked', 'Non suivis') };
  }
}

function verdictFor(found, t) {
  if (found.achievements === 'tracked' || found.achievements === 'folder') {
    return { tone: 'tracked', icon: 'fas fa-trophy', text: t('manual-game-verdict-tracked', 'Achievements tracked', 'Succès suivis') };
  }
  if (found.achievements === 'retro') return { tone: 'folder', icon: 'fas fa-trophy', text: 'RetroAchievements' };
  if (found.achievements === 'store') return { tone: 'folder', icon: 'fas fa-trophy', text: t('manual-game-ach-store', 'Through your account', 'Via ton compte') };
  return { tone: 'neutral', icon: 'fas fa-clock', text: t('manual-game-verdict-playtime', 'Playtime', 'Temps de jeu') };
}

/*
  What the dialog shows for a verdict. A folder one of the library's own readers claims is added by
  following that folder, never as a manual entry: the reader's card already holds the game, and a
  manual one beside it would be the same game twice.
*/
function describeDetection(found, { t, watched = false, inLibrary = false } = {}) {
  const translate = typeof t === 'function' ? t : (key, english, french, params = {}) => english.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  const route = found.achievements === 'folder' && found.folder ? 'folder' : 'manual';
  const playtime =
    route === 'folder'
      ? { state: 'info', icon: INFO, label: translate('manual-game-check-playtime', 'Playtime', 'Temps de jeu'), value: translate('manual-game-playtime-card', 'With its own card', 'Avec sa propre fiche') }
      : { state: 'ok', icon: OK, label: translate('manual-game-check-playtime', 'Playtime', 'Temps de jeu'), value: translate('manual-game-playtime-tracked', 'Tracked when it runs', 'Suivi au lancement') };
  let note = '';
  if (route === 'folder') {
    note = watched
      ? translate('manual-game-note-watched', 'This folder is already followed: its games are in your library.', 'Ce dossier est déjà suivi : ses jeux sont dans ta bibliothèque.')
      : translate('manual-game-note-folder', 'AW Next reads this folder itself: Add follows it, and its games appear with their achievements.', 'AW Next lit ce dossier lui-même : Ajouter le suit, et ses jeux apparaissent avec leurs succès.');
  } else if (inLibrary) {
    note = translate('manual-game-note-in-library', 'This game is already in your library.', 'Ce jeu est déjà dans ta bibliothèque.');
  }
  return {
    route,
    canAdd: !(route === 'folder' && watched),
    verdict: verdictFor(found, translate),
    note,
    checks: [emulatorCheck(found, translate), appidCheck(found, translate), achievementsCheck(found, translate), playtime],
  };
}

module.exports = { detectManualGame, describeDetection, defaultReaders, consoleEmulatorFor, CONSOLE_EMULATORS, FOLDER_TYPES };
