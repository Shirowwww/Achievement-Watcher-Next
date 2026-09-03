'use strict';

/*
  Where the Watchdog finds notification presets.

  Mirrors the roots app/electron/init.js indexes for the in-game popup, so the OBS browser source
  renders the very preset the user picked in Settings instead of a second, drifting copy of the
  list. Generated and imported presets live under <userData> (app/presets sits inside app.asar once
  packaged, so nothing can be written below it); the bundled libraries ship beside the app and are
  reached through the same unpacked path every other shared file uses.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');
const { sharedAppModulePath } = require('./sharedAppModule.js');

/*
  Legacy preset names and the default are the app's rules, not a second set: reuse the module the
  overlay resolves with (listed in electron-builder.yml's asarUnpack so this require works packaged).

  Guarded, because of what depends on it. websocket.js loads this at start and toaster.js loads
  websocket.js on every notification, so a packaging slip that left the shared file inside the asar
  would take every notification down along with the browser source. The fallback loses only the
  renamed-preset aliases: the browser source then shows the default preset rather than the one a
  removed bundled name stands in for, and notifications keep working.
*/
let presetRules;
try {
  presetRules = require(sharedAppModulePath('util/notificationPreset.js'));
} catch {
  presetRules = {
    DEFAULT_PRESET: 'AW Next',
    resolveAvailablePresetName: (names, isAvailable) =>
      (Array.isArray(names) ? names : []).find((name) => isAvailable(name)) || 'AW Next',
  };
}
const { DEFAULT_PRESET, resolveAvailablePresetName } = presetRules;

/*
  The bundled preset library on disk. Resolved here rather than through sharedAppModulePath(), which
  is for single files it can read (test/core/sharedAppModules.test.js reads every path passed to it):
  this is a folder. Same two layouts as notificationSound.bundledSoundsDir() - packaged, `presets/**`
  is unpacked beside app.asar; in a dev checkout the app folder sits next to the watchdog folder.
*/
function bundledPresetsDir() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'presets'));
  candidates.push(path.join(__dirname, '..', '..', 'app', 'presets'));
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      /* try the next layout */
    }
  }
  return '';
}

// Generated and imported presets first, so re-saving under a bundled name shadows it rather than
// being ignored - the order app/electron/init.js indexes them in.
function presetRoots() {
  const bundled = bundledPresetsDir();
  return [
    path.join(userDataDir(), 'presets', 'Users Presets'),
    ...(bundled ? [path.join(bundled, 'Default Presets'), path.join(bundled, 'Users Presets')] : []),
  ];
}

// A browser source reloads its whole page on every OBS scene edit, and each reload asks for the
// markup plus every stylesheet, font and picture beside it. Index the folders once per short window
// so that burst costs one pair of readdir calls rather than one per file.
const INDEX_TTL_MS = 5000;
let cachedIndex = null;
let cachedAt = 0;
let cachedKey = '';

function indexPresetFolders(roots) {
  const folders = new Map();
  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue; // a root that does not exist is normal (no user presets yet, dev checkout layouts)
    }
    for (const name of entries) {
      if (folders.has(name)) continue;
      const folder = path.join(root, name);
      try {
        if (fs.statSync(path.join(folder, 'index.html')).isFile()) folders.set(name, folder);
      } catch {
        /* not a preset folder */
      }
    }
  }
  return folders;
}

function listPresetFolders(roots) {
  const list = Array.isArray(roots) && roots.length > 0 ? roots : presetRoots();
  const key = list.join('|');
  const now = Date.now();
  if (cachedIndex && cachedKey === key && now - cachedAt < INDEX_TTL_MS) return cachedIndex;
  cachedIndex = indexPresetFolders(list);
  cachedAt = now;
  cachedKey = key;
  return cachedIndex;
}

function invalidate() {
  cachedIndex = null;
  cachedAt = 0;
  cachedKey = '';
}

/*
  The folder a saved preset name renders from, with the app's own fallback chain: the name itself,
  then what a removed bundled preset was renamed to, then the default. `folder` is '' only when the
  preset library is missing entirely, which is what tells the caller it cannot render anything.
*/
function resolvePreset(name, roots) {
  const folders = listPresetFolders(roots);
  const candidates = [String(name || '').trim(), DEFAULT_PRESET].filter(Boolean);
  const resolved = resolveAvailablePresetName(candidates, (candidate) => folders.has(candidate));
  return { name: resolved, folder: folders.get(resolved) || '' };
}

module.exports = { DEFAULT_PRESET, presetRoots, listPresetFolders, resolvePreset, invalidate };
