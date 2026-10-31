'use strict';

/*
  The recompiled ports recompPorts.js knows. For each: `exe` names the executable that marks an
  install, `repos` the source repositories Quiver records for it (lowercase), `saves({ root, host,
  hostPath })` the unlock files in the order the game picks them, a portable install first, and
  `format` the reader in recompPortFormats.js. Every path comes from the port's own source code.
  `icons` says where recompPortArt.js finds the achievement pictures (none for a port that draws
  them in code).
*/

const path = require('path');
const fs = require('fs');

const MAX_DESCRIPTOR_BYTES = 64 * 1024;

const exists = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

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

module.exports = [
  {
    id: 'dusklight',
    title: 'The Legend of Zelda: Twilight Princess (Dusklight)',
    exe: /^dusklight(?:\.exe)?$/i,
    repos: ['twilitrealm/dusklight'],
    format: 'keyedProgress',
    saves: (where) => borealisFolders(where, 'TwilitRealm', 'Dusklight', ['Dusk']).map((folder) => path.join(folder, 'achievements.json')),
  },
  {
    // libultraship built portable: saves sit beside the game, one file per slot A to D.
    id: 'ghostship',
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
    title: 'Diddy Kong Racing (DKR-R)',
    exe: /^DKR-R(?:\.exe|-.+\.appimage)$/i,
    repos: ['thatguymcd/dkr-r'],
    format: 'catalogueEntries',
    saves: (where) => dkrFolders(where).map((folder) => path.join(folder, 'achievements', 'progress-v1.json')),
  },
];
