'use strict';

/*
  "Forget this game": everything AW Next keeps about one game, so the next scan meets it as new.

  Removing a game only hides it (blacklist), and resetting achievements and playtime still leaves
  the cached schema, the icons, the last scan's unlocks and whatever AW wrote into the game folder.
  Someone re-testing a setup from scratch had no way to tell which of those was still steering it.

  This module owns the file part: the per-game caches under userData, and AW Next's own emulator
  configuration in the game folder (awManagedConfig: only what AW wrote, never the crack's files).
  Unlock saves and playtime go through their existing reset paths, which keep a backup.
*/

const fs = require('fs');
const path = require('path');
const awManagedConfig = require('./awManagedConfig.js');

function listDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function exists(target) {
  try {
    fs.statSync(target);
    return true;
  } catch {
    return false;
  }
}

// Every cache entry of this appid, in every language and for every Steam account.
function cacheTargets(userDataPath, appids) {
  const cache = path.join(userDataPath, 'steam_cache');
  const targets = [];
  for (const id of appids) {
    targets.push(path.join(cache, 'icon', id));
    for (const langDir of listDirs(path.join(cache, 'schema'))) targets.push(path.join(langDir, `${id}.db`));
    for (const userDir of listDirs(path.join(cache, 'user'))) targets.push(path.join(userDir, `${id}.db`));
  }
  return targets.filter(exists);
}

/*
  appids       the library id and, when different, the Steam one the caches are keyed by
  settingsDirs the game's steam_settings folders (app.js gbeSteamSettingsDirsFor)
*/
function plan({ userDataPath, appids = [], settingsDirs = [] }) {
  const ids = [...new Set(appids.map((id) => String(id || '').trim()).filter((id) => /^\w[\w.-]*$/.test(id)))];
  const caches = userDataPath ? cacheTargets(userDataPath, ids) : [];
  const config = settingsDirs
    .map((dir) => awManagedConfig.strip(dir, { dryRun: true }))
    .filter((result) => result.changed);
  return { caches, config };
}

function run(forgetPlan) {
  const errors = [];
  let removed = 0;
  for (const target of forgetPlan.caches) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      removed++;
    } catch (err) {
      errors.push({ path: target, error: String((err && err.message) || err) });
    }
  }
  for (const entry of forgetPlan.config) {
    try {
      removed += awManagedConfig.strip(entry.steamSettings).removed.length;
    } catch (err) {
      errors.push({ path: entry.steamSettings, error: String((err && err.message) || err) });
    }
  }
  return { removed, errors };
}

module.exports = { plan, run };
