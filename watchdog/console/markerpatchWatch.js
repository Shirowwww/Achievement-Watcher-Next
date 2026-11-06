'use strict';

/*
  Watch the Dead Space 2 MarkerPatch install found through the user's Folders and notify on newly
  earned achievements.

  Everything about the format lives in the app's parser (app/parser/markerpatch.js), loaded here
  through sharedAppModule rather than copied - the settings.txt bitflag, the resource layout and the
  AchievementSupport gate all have to agree with what the library shows.

  Unlock state lives outside the install, at a fixed OS path
  (%LOCALAPPDATA%\EA Games\Dead Space 2\settings.txt), so unlike the per-game watchers there is only
  ever one target. If that folder does not exist yet, the watcher waits on the nearest existing
  ancestor and re-attaches once the game creates it - the same idea as xllnWatch's "watch the game
  folder until its profile tree appears", generalised to a two-segment path.
*/

const path = require('path');
const { iconPathOf } = require('../util/iconPath.js');
const moment = require('moment');
const debug = require('../util/log.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const kit = require('./watcherKit.js');
const { watchedFolders, resolveWatchTarget } = kit;

const markerpatch = require(sharedAppModulePath('parser/markerpatch.js'));

markerpatch.setIconRoot(path.join(userDataDir(), 'icon_cache', 'markerpatch'));

const watchers = kit.createWatcherList('markerpatch', debug);
let currentGame = null;
let currentCtx = null;
const changes = createChangeCoalescer();
const baseline = createBaselineCache({ prefix: 'markerpatch', tag: 'markerpatch', debug });
const cacheLoad = (key) => baseline.load(key);
const cacheSave = (key, unlocked) => baseline.save(key, unlocked);

// There is only one title here, so the first watched folder that carries it wins; Steam's own
// install is looked at last, so nobody has to add the folder.
function discoverGame(configFile = kit.userDirFile(), knownRoots = () => markerpatch.knownInstallRoots()) {
  for (const dir of [...watchedFolders(configFile), ...knownRoots()]) {
    let found;
    try {
      found = markerpatch.discover(dir);
    } catch (err) {
      debug.warn(`[markerpatch] discovery failed under "${dir}": ${err}`);
      continue;
    }
    if (found) return found;
  }
  return null;
}

async function handleChange(ctx) {
  try {
    if (!currentGame) return;
    if (!markerpatch.achievementSupportEnabled(currentGame.paths.ini)) return;

    const stateFile = markerpatch.stateFilePath();
    if (stateFile) await waitForFileStable(stateFile);

    const unlocked = markerpatch.getAchievements({ root: currentGame.root, ini: currentGame.paths.ini });
    if (unlocked.length === 0) return;

    const cache = cacheLoad('markerpatch');
    const isFirstObservation = !cache || !Array.isArray(cache.unlocked);

    if (!isFirstObservation) {
      const previous = new Set(cache.unlocked.map(String));
      const fresh = unlocked.filter((entry) => !previous.has(String(entry.id)));
      if (fresh.length > 0) {
        let schema = null;
        try {
          schema = await markerpatch.getGameData({ root: currentGame.root }, ctx.options.achievement.lang);
        } catch (err) {
          debug.warn(`[markerpatch] cannot read the achievement list: ${err}`);
        }
        // Keep the old baseline so these unlocks are announced on the next write instead of lost.
        if (!schema) return;
        const byId = new Map((schema?.achievement?.list || []).map((entry) => [String(entry.name), entry]));
        const gameName = schema?.name || 'Dead Space 2';
        const completion = { unlocked: unlocked.filter((entry) => byId.has(String(entry.id))).length, total: byId.size };

        let delay = 0;
        for (const entry of fresh) {
          const described = byId.get(String(entry.id));
          if (!described) {
            debug.warn(`[markerpatch] unlocked achievement ${entry.id}, which its own resources do not describe`);
            continue;
          }
          debug.log(`[markerpatch] Unlocked: ${gameName} - ${described.displayName}`);
          const icon = iconPathOf(described);
          await ctx.notify(
            {
              source: 'MarkerPatch',
              appid: markerpatch.APPID,
              gameDisplayName: gameName,
              achievementName: String(entry.id),
              achievementDisplayName: described.displayName,
              achievementDescription: described.description,
              icon: icon || undefined,
              time: entry.earned_time || moment().unix(),
              delay,
              completion,
            },
            kit.unlockToastOptions(ctx)
          );
          delay += 1;
        }
      }
    }

    cacheSave('markerpatch', unlocked.map((entry) => entry.id));
  } catch (err) {
    debug.warn(`[markerpatch] handleChange failed: ${err}`);
  }
}

function watchStateDir(dir) {
  const watcher = watchers.open(dir, { recursive: false }, (evt, name) => {
    if (evt !== 'update') return;
    if (String(path.basename(name || '')).toLowerCase() !== 'settings.txt') return;
    changes.run('markerpatch', () => handleChange(currentCtx));
  });
  if (watcher) debug.log(`[markerpatch] watching achievements under '${dir}'`);
}

// Watch for the settings.txt folder to exist - only ever one level at a time, never a deep
// recursive watch over a system folder. The walk stops at worst at %LOCALAPPDATA% itself.
function attach(stateFile) {
  if (!stateFile) return;
  const finalDir = path.dirname(stateFile);
  const target = resolveWatchTarget(finalDir);
  if (target.ready) {
    watchStateDir(target.dir);
    return;
  }
  if (!target.watchDir) return;
  if (kit.awaitSegment(watchers, target, () => attach(stateFile))) {
    debug.log(`[markerpatch] '${finalDir}' does not exist yet - waiting under '${target.watchDir}'`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the MarkerPatch source flag, the notify master switch and the mod's own
// AchievementSupport ini key.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'markerpatch')) return;

  let game;
  try {
    game = discoverGame();
  } catch (err) {
    debug.warn(`[markerpatch] discovery failed: ${err}`);
    return;
  }
  if (!game) return;
  if (!markerpatch.achievementSupportEnabled(game.paths.ini)) {
    debug.log(`[markerpatch] AchievementSupport is off in '${game.paths.ini}' - not watching`);
    return;
  }

  currentGame = game;
  currentCtx = ctx;

  // Seed the baseline up front so nothing already earned is replayed on launch.
  if (!cacheLoad('markerpatch')) {
    try {
      cacheSave('markerpatch', markerpatch.getAchievements({ root: game.root, ini: game.paths.ini }).map((entry) => entry.id));
    } catch (err) {
      debug.warn(`[markerpatch] baseline seed failed: ${err}`);
    }
  }

  // One state file per host (each Wine prefix on Linux); the game writes the one it runs in.
  for (const stateFile of markerpatch.stateFilePaths()) attach(stateFile);
};

module.exports.stop = () => {
  changes.clear();
  currentGame = null;
  currentCtx = null;
  watchers.closeAll();
};

module.exports._internal = { discoverGame, watchedFolders, iconPathOf, attach, resolveWatchTarget };
