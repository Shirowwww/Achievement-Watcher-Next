'use strict';

/*
  What a game folder set up with the Nemirtingas Epic emulator needs before AW Next can see its
  unlocks (#112). Read-only: nothing here edits the emulator's own file.

  Only one fact is certain enough to be called a problem: the emulator writes to
  %APPDATA%\NemirtingasEpicEmu, the one place AW Next reads, only when SavePath is "appdata" (its own
  documentation). The Epic launch arguments are a hint, not a fault: some EOS games only sign in to
  the emulator when started with them (the reporter's did), others never need them, so they are
  offered only while the emulator has saved nothing for the game.

  The emulator is recognised only by its config folder sitting beside an EOSSDK library, so a stale
  nepice_settings left after the emulator was removed raises nothing. Both config shapes are read:
  nested under "EOSEmu" (current) and flat ("appid", "savepath", ...). Unknown values stay unknown.
*/

const fs = require('fs');
const path = require('path');
const { hostPath, hostPaths, hostsFor } = require(path.join(__dirname, 'winHosts.js'));

const CONFIG_DIR = 'nepice_settings';
const CONFIG_FILE = 'NemirtingasEpicEmu.json';
// Bounded walk: the emulator dll sits beside the exe or a few engine folders below it.
const MAX_DEPTH = 5;
const MAX_DIRS = 1500;
// The password value the emulator expects in place of a real exchange code (any 32 hex chars).
const AUTH_PASSWORD = 'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd';
const PLACEHOLDER = /^<.*>$|^$/;
// The library the emulator replaces: EOSSDK-Win64-Shipping.dll, EOSSDK-Win32-Shipping.dll.
const EOS_LIBRARY = /^eossdk-win(32|64)-shipping\.dll$/i;

function findConfig(gameDir) {
  if (!gameDir) return '';
  const queue = [{ dir: gameDir, depth: 0 }];
  let seen = 0;
  while (queue.length > 0 && seen < MAX_DIRS) {
    const { dir, depth } = queue.shift();
    seen += 1;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (entry.name.toLowerCase() === CONFIG_DIR) {
        const file = path.join(child, CONFIG_FILE);
        if (fs.existsSync(file) && entries.some((sibling) => EOS_LIBRARY.test(sibling.name))) return file;
      } else if (depth < MAX_DEPTH) {
        queue.push({ dir: child, depth: depth + 1 });
      }
    }
  }
  return '';
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// The settings that matter here, from either config shape. Absent values stay '' or null.
function readSettings(raw) {
  const root = raw && typeof raw === 'object' ? raw : {};
  const emu = root.EOSEmu && typeof root.EOSEmu === 'object' ? root.EOSEmu : null;
  if (emu) {
    const application = emu.Application || {};
    const user = emu.User || {};
    const overlay = emu.Plugins && emu.Plugins.Overlay ? emu.Plugins.Overlay : {};
    return {
      appId: text(application.AppId),
      savePath: typeof application.SavePath === 'string' ? application.SavePath.trim() : null,
      epicId: text(user.EpicId),
      userName: text(user.UserName),
      language: text(user.Language),
      overlay: overlay.Enabled === true,
    };
  }
  return {
    appId: text(root.appid),
    savePath: typeof root.savepath === 'string' ? root.savepath.trim() : null,
    epicId: text(root.epicid),
    userName: text(root.username),
    language: text(root.language),
    // The flat format's "enable_overlay" was documented as unused, so it is not a crash risk.
    overlay: false,
  };
}

function hasAppId(settings) {
  return !PLACEHOLDER.test(settings.appId);
}

// The arguments an Epic launcher would pass, built from the emulator's own config.
function launchArguments(settings) {
  if (!hasAppId(settings)) return '';
  const name = (settings.userName || 'Player').replace(/"/g, '');
  const parts = [
    '-AUTH_LOGIN=unused',
    `-AUTH_PASSWORD=${AUTH_PASSWORD}`,
    '-AUTH_TYPE=exchangecode',
    `-epicapp=${settings.appId}`,
    '-epicenv=Prod',
    '-EpicPortal',
    `-epicusername="${name}"`,
  ];
  if (/^[0-9a-f]+$/i.test(settings.epicId)) parts.push(`-epicuserid=${settings.epicId}`);
  parts.push(`-epicsandboxid=${settings.appId}`, `-epiclocale=${settings.language || 'en'}`);
  return parts.join(' ');
}

function hasEpicArguments(args) {
  return /(^|\s)-epicapp=\S/i.test(String(args || ''));
}

// %APPDATA% of the hosts a game folder belongs to (its Wine prefix on Linux).
function appDataFolders(gameDir) {
  return hostsFor(gameDir)
    .map((host) => hostPath(host, 'APPDATA'))
    .filter(Boolean);
}

// The emulator already saved for this AppId, so however the game is started, it signs in.
// `appData` is one %APPDATA% folder or several (one per host the game may run in).
function hasSavedFor(appId, appData = hostPaths('APPDATA')) {
  if (!appId) return false;
  const wanted = appId.toLowerCase();
  return [].concat(appData || []).some((dir) => {
    const root = path.join(dir, 'NemirtingasEpicEmu');
    let users = [];
    try {
      users = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      return false;
    }
    return users.some((user) => {
      try {
        return fs.readdirSync(path.join(root, user.name)).some((name) => name.toLowerCase() === wanted);
      } catch {
        return false;
      }
    });
  });
}

/*
  The report Game Health shows. `problem` is set only for a save path AW Next cannot read.
  `hint` is 'launch-args' while nothing was saved for the game and no Epic arguments are set; the
  overlay flag reminds that the plugin crashed the reporter's game. A config that cannot be parsed
  right now (the emulator may be rewriting it) reports nothing rather than a guess.
*/
function diagnose({ gameDir, launchArgs = '', appData = appDataFolders(gameDir) } = {}) {
  const configFile = findConfig(gameDir);
  if (!configFile) return null;
  let settings;
  try {
    settings = readSettings(JSON.parse(fs.readFileSync(configFile, 'utf8')));
  } catch {
    return null;
  }
  const savesInAppData = settings.savePath === null ? null : settings.savePath.toLowerCase() === 'appdata';
  const problem = savesInAppData === false ? 'save-path' : '';
  const suggestedArgs = launchArguments(settings);
  const hint =
    !problem && suggestedArgs && !hasEpicArguments(launchArgs) && !hasSavedFor(settings.appId, appData) ? 'launch-args' : '';
  return {
    configFile,
    problem,
    hint,
    overlay: settings.overlay,
    appId: hasAppId(settings) ? settings.appId : '',
    suggestedArgs,
  };
}

module.exports = { CONFIG_FILE, findConfig, readSettings, launchArguments, hasEpicArguments, hasSavedFor, diagnose };
