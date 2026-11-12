'use strict';

/*
  The recompiled ports recompPorts.js knows. For each: `exe` names the executable that marks an
  install, `repos` the source repositories Quiver records for it (lowercase), `saves({ root, host,
  hostPath })` the unlock files in the order the game picks them, a portable install first, and
  `format` the reader in recompPortFormats.js. Every path comes from the port's own source code.
  `icons` says where recompPortArt.js finds the achievement pictures (none for a port that draws
  them in code). `console` is the console of the game ported, for the game page, and `detailsTitle`
  the game whose page a mod or fan game borrows. `nested` names folders of an install holding
  another port (Pikmin 2 in Open Nectar).
*/

const path = require('path');
const fs = require('fs');
const { isFile: exists } = require(path.join(__dirname, '..', 'util', 'fsProbe.js'));

const MAX_DESCRIPTOR_BYTES = 64 * 1024;

// Borealis' data_location.json ({ version: 1, mode, customPath }), or null.
function readDescriptor(file) {
  try {
    if (!file || fs.statSync(file).size > MAX_DESCRIPTOR_BYTES) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    return parsed && parsed.version === 1 && typeof parsed.mode === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/*
  Where Borealis (Dusklight's data layer) puts a game's data: the folder a data_location.json beside
  the exe or in the default folder names (portable: <exe>\data, custom: its customPath), else the
  SDL pref path <APPDATA>\<org>\<app>, else a legacy one the game has not moved yet.
*/
function borealisFolders({ root, host, hostPath }, org, app, legacyApps = []) {
  const preferred = hostPath(host, 'APPDATA', org, app);
  const descriptor = [root && path.join(root, 'data_location.json'), preferred && path.join(preferred, 'data_location.json')].map(readDescriptor).find(Boolean);
  // A portable or custom folder is the only one the game writes: an older default file there is stale.
  if (descriptor && descriptor.mode === 'portable' && root) return [path.join(root, 'data')];
  if (descriptor && descriptor.mode === 'custom' && typeof descriptor.customPath === 'string') {
    const custom = typeof host.localPath === 'function' ? host.localPath(descriptor.customPath) : descriptor.customPath;
    if (custom && path.isAbsolute(custom)) return [custom];
  }
  return [preferred, ...legacyApps.map((legacy) => hostPath(host, 'APPDATA', org, legacy))].filter(Boolean);
}

/*
  SMS Launcher passes the game a file in its own Electron userData: SMS-Launcher-Portable beside a
  portable launcher, else "sms-launcher" (the package name, which Electron uses; "SMS Launcher", the
  product name, is read too) under %APPDATA%, or under ~/.config on Linux.
*/
function smsLauncherFolders({ root, host, hostPath }) {
  const portable = root ? path.join(root, 'SMS-Launcher-Portable') : '';
  if (portable && fs.existsSync(portable)) return [portable];
  const base = host.kind === 'linux' ? ['USERPROFILE', '.config'] : ['APPDATA'];
  return [hostPath(host, ...base, 'sms-launcher'), hostPath(host, ...base, 'SMS Launcher')].filter(Boolean);
}

const SMS_LAUNCHER = /^SMS[- ]Launcher.*\.(?:exe|appimage)$/i;

// Where the achievement pictures are fetched from, at the commit the lists were read from.
const GHOSTSHIP_ICONS = 'https://raw.githubusercontent.com/HarbourMasters/Ghostship/aefb89b85e7b78daff62b491ebb2669d2d9270f0/port/textures/achievements/';
const SMB1R_ICON_SHEET =
  'https://raw.githubusercontent.com/JHDev2006/Super-Mario-Bros.-Remastered-Public/7610559d5477c6e3606cf7c35dfeea5ffa25c1a5/Assets/Sprites/UI/AchievementIcons.png';

// DKR-R: <exe>\dkr-runtime-data with portable.txt, else %APPDATA%\DKRPort, or ~/.config/dkr-port on Linux.
function dkrFolders({ root, host, hostPath }) {
  if (root && exists(path.join(root, 'portable.txt'))) return [path.join(root, 'dkr-runtime-data')];
  const folder = host.kind === 'linux' ? hostPath(host, 'USERPROFILE', '.config', 'dkr-port') : hostPath(host, 'APPDATA', 'DKRPort');
  return folder ? [folder] : [];
}

// Pictures of Road Rash 64, at the commit its list was read from (native/assets/achievements/<id>.png).
const RR64_ICONS = 'https://raw.githubusercontent.com/linkssy2/RoadRash64Recompiled/37e33d4f832857a60a34f1369b83b32afe00d25d/native/assets/achievements/';

// RecompFrontend's get_app_folder_path(): the exe folder with portable.txt, else %LOCALAPPDATA%\<id>, or ~/.config/<id>.
function rr64Folders({ root, host, hostPath }) {
  if (root && exists(path.join(root, 'portable.txt'))) return [root];
  const folder = host.kind === 'linux' ? hostPath(host, 'USERPROFILE', '.config', 'RoadRash64Recompiled') : hostPath(host, 'LOCALAPPDATA', 'RoadRash64Recompiled');
  return folder ? [folder] : [];
}

// The game's folder is its working directory (the launcher chdirs there), so its files sit beside the exe.
const besideExe = (name) => ({ root }) => (root ? [path.join(root, name)] : []);

/*
  The FH2 mod's profiles: every User_<id>.ini in <azimuth>\fh2-mods\Achievements (its .bak and .damaged
  left out), then Achievements.txt, its report with the progress of each locked achievement. Before the
  first unlock, the offline profile's file gives the Watchdog a folder to wait on.
  shortcut: a profile created after the scan is read from the next scan on, not watched live before.
*/
const FH2_OFFLINE_PROFILE = 'User_9000000000000.ini';
const FH2_REPORT = 'Achievements.txt';
const FH2_ICONS = 'https://m.exophase.com/xbox/awards/m/';
const SANCTUARY_ICONS = 'https://m.exophase.com/psn/awards/m/';
function fh2Profiles({ root }) {
  if (!root) return [];
  const folder = path.join(root, 'fh2-mods', 'Achievements');
  let names = [];
  try {
    names = fs.readdirSync(folder).filter((name) => /^User_\w+\.ini$/i.test(name)).sort();
  } catch {
    names = [];
  }
  return [...(names.length > 0 ? names : [FH2_OFFLINE_PROFILE]), FH2_REPORT].map((name) => path.join(folder, name));
}

module.exports = [
  {
    id: 'dusklight',
    console: 'GameCube',
    title: 'The Legend of Zelda: Twilight Princess (Dusklight)',
    exe: /^dusklight(?:\.exe)?$/i,
    repos: ['twilitrealm/dusklight'],
    format: 'keyedProgress',
    saves: (where) => borealisFolders(where, 'TwilitRealm', 'Dusklight', ['Dusk']).map((folder) => path.join(folder, 'achievements.json')),
  },
  {
    // libultraship built portable: saves sit beside the game, one file per slot A to D.
    id: 'ghostship',
    console: 'Nintendo 64',
    icons: { from: 'files', url: GHOSTSHIP_ICONS },
    title: 'Super Mario 64 (Ghostship)',
    exe: /^Ghostship(?:\.exe|\.appimage)?$/i,
    repos: ['harbourmasters/ghostship'],
    format: 'shipSlot',
    slots: true,
    saves: ({ root }) => (root ? [0, 1, 2, 3].map((slot) => path.join(root, 'saves', `save_${slot}.json`)) : []),
  },
  {
    id: 'sms',
    console: 'GameCube',
    icons: { from: 'launcher', folder: ['achievement-icons'] },
    title: 'Super Mario Sunshine (SMS Launcher)',
    exe: SMS_LAUNCHER,
    repos: ['chasem-dev/sms-launcher'],
    format: 'idTimeLines',
    saves: (where) => smsLauncherFolders(where).map((folder) => path.join(folder, 'achievements.txt')),
  },
  {
    // The Super Mario Eclipse mod, launched from the same launcher with its own list. The launcher
    // alone does not say the mod is installed: listed once it has saved an unlock (`ifSaved`).
    id: 'smseclipse',
    console: 'GameCube',
    detailsTitle: 'Super Mario Sunshine',
    icons: { from: 'launcher', folder: ['achievement-icons', 'eclipse'] },
    title: 'Super Mario Eclipse (SMS Launcher)',
    exe: SMS_LAUNCHER,
    ifSaved: true,
    repos: [],
    format: 'idTimeLines',
    saves: (where) => smsLauncherFolders(where).map((folder) => path.join(folder, 'achievements-eclipse.txt')),
  },
  {
    // Godot: user:// is %APPDATA%\SMB1R (config/name, use_custom_user_dir), or <exe>\config with portable.txt.
    id: 'smb1r',
    console: 'NES/Famicom',
    detailsTitle: 'Super Mario Bros.',
    icons: { from: 'sheet', url: SMB1R_ICON_SHEET, cell: 32 },
    title: 'Super Mario Bros. Remastered',
    exe: /^(?:SMB1R|SuperMarioBrosRemastered)\.(?:exe|x86_64|arm64)$/i,
    repos: ['jhdev2006/super-mario-bros.-remastered-public'],
    format: 'indexBits',
    saves: ({ root, host, hostPath }) =>
      root && exists(path.join(root, 'portable.txt')) ? [path.join(root, 'config', 'achievements.sav')] : [hostPath(host, 'APPDATA', 'SMB1R', 'achievements.sav')],
  },
  {
    id: 'dkrr',
    console: 'Nintendo 64',
    title: 'Diddy Kong Racing (DKR-R)',
    exe: /^DKR-R(?:\.exe|-.+\.appimage)$/i,
    repos: ['thatguymcd/dkr-r'],
    format: 'catalogueEntries',
    saves: (where) => dkrFolders(where).map((folder) => path.join(folder, 'achievements', 'progress-v1.json')),
  },
  {
    // Darhkfox/SuperMarioAllStars @ 0c49e5e: src/app/achstore.cpp (local-time dates), src/game/achievements.cpp,
    // app_win.cpp (exe folder), platform/linux/app_linux.cpp dataDir ($XDG_DATA_HOME/SuperMarioAllStars).
    id: 'smas',
    console: 'SNES/Super Famicom',
    title: 'Super Mario All-Stars (PC port)',
    exe: /^SuperMarioAllStars(?:\.exe|-.+\.appimage)?$/i,
    repos: ['darhkfox/supermarioallstars'],
    format: 'iniUnlocked',
    saves: ({ root, host, hostPath }) =>
      host.kind === 'linux' ? [hostPath(host, 'APPDATA', 'SuperMarioAllStars', 'achievements.ini')].filter(Boolean) : besideExe('achievements.ini')({ root }),
  },
  {
    // linkssy2/RoadRash64Recompiled @ 37e33d4: native/src/rr64_achievements.cpp; folder from RecompFrontend
    // @ b1a1477 (recompui/src/util/file.cpp), program id "RoadRash64Recompiled" (native/src/main.cpp).
    id: 'rr64',
    console: 'Nintendo 64',
    icons: { from: 'files', url: RR64_ICONS },
    // The game, then the port in brackets: covers and the game page look the game up without it.
    title: 'Road Rash 64 (Recompiled)',
    exe: /^RoadRash64Recompiled(?:\.exe|-.+\.appimage)?$/i,
    repos: ['linkssy2/roadrash64recompiled'],
    format: 'idList',
    saves: (where) => rr64Folders(where).map((folder) => path.join(folder, 'achievements.txt')),
  },
  {
    // Zorkats/G-Diffuser @ 257c93b: port/gdx_achievements.cpp. saves/ is beside the exe on Windows and in the
    // working directory elsewhere (assumed to be the exe folder).
    id: 'gdiffuser',
    console: 'Nintendo 64',
    title: 'F-Zero X (G-Diffuser)',
    exe: /^G-Diffuser(?:-JP)?(?:\.exe|\.appimage)?$/i,
    repos: ['zorkats/g-diffuser'],
    format: 'unlockPairs',
    saves: ({ root }) => (root ? [path.join(root, 'saves', 'achievements.txt')] : []),
  },
  {
    // SSunnKing/Open-Nectar---Pikmin-Native-PC-Port @ ae283b5: games/pikmin1/pc_port/pc_achievements.cpp, the file
    // in the working directory; launcher_main.cpp starts nectar in the install folder (nectar-pal is the PAL build).
    id: 'nectar',
    console: 'GameCube',
    title: 'Pikmin (Open Nectar)',
    exe: /^nectar(?:-pal)?(?:\.exe)?$/i,
    nested: ['pikmin2'],
    repos: ['ssunnking/open-nectar---pikmin-native-pc-port'],
    format: 'idList',
    saves: besideExe('pikmin_achievements.txt'),
  },
  {
    // Same repository and commit: games/pikmin2/pc_port/pc_achievements.cpp. Pikmin 2 lives in <install>\pikmin2,
    // its exe is pikmin2_pc (EU) or pikmin2_pc-usa once packaged, nectar2 / nectar2-pal in a build tree.
    id: 'nectar2',
    console: 'GameCube',
    title: 'Pikmin 2 (Open Nectar)',
    exe: /^(?:nectar2(?:-pal)?|pikmin2_pc(?:-usa)?)(?:\.exe)?$/i,
    repos: [],
    format: 'idList',
    saves: besideExe('pikmin2_achievements.txt'),
  },
  {
    // Trinculo54/fh2-achievements @ 884bb56: a mod for Azimuth (azimuth.exe, Forza Horizon 2's Xbox One build).
    // src/rules.cpp kDefs, src/achievements.cpp: one <azimuth>\fh2-mods\Achievements\<user>.ini per profile, UTC dates.
    id: 'fh2azimuth',
    console: 'Xbox One',
    title: 'Forza Horizon 2 (Azimuth)',
    // Goals from the rules' P(have, need); pictures are the Xbox ones Exophase serves (ids matched by title).
    exe: /^azimuth\.exe$/i,
    repos: ['trinculo54/fh2-achievements'],
    icons: { from: 'files', url: FH2_ICONS },
    format: 'fh2Mod',
    ifSaved: true,
    slots: true,
    saves: fh2Profiles,
  },
  {
    // CaduGimenes/SanctuaryPort @ c3592c5: src/runtime_services.c (trophy_record), launcher-rust/src/core/paths.rs
    // (user folder: <exe>\user by default), assets/trophies/Diablo_III.json; pictures from Exophase by title.
    // shortcut: a user folder moved by SANCTUARY_USER_DIR or the launcher's settings is not followed; read it if asked.
    id: 'sanctuary',
    console: 'PlayStation 4',
    title: 'Diablo III (SanctuaryPort)',
    exe: /^SanctuaryPort\.exe$/i,
    repos: ['cadugimenes/sanctuaryport'],
    icons: { from: 'files', url: SANCTUARY_ICONS },
    format: 'trophyIdLines',
    saves: besideExe(path.join('user', 'trophies.txt')),
  },
];
