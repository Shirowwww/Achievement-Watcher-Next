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

const fs = require('fs');
const path = require('path');
const watch = require('../util/nodeWatch.js');
const moment = require('moment');
const debug = require('../util/log.js');
const { guardWatcher } = require('../util/watchGuard.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { notificationVolumePercent } = require('../util/notificationVolume.js');
const notifyStrings = require('../util/notifyStrings.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');

const markerpatch = require(sharedAppModulePath('parser/markerpatch.js'));

const userDirFile = path.join(userDataDir(), 'cfg', 'userdir.db');
markerpatch.setIconRoot(path.join(userDataDir(), 'icon_cache', 'markerpatch'));

let watchers = [];
let currentGame = null;
let currentCtx = null;
const changes = createChangeCoalescer();
const baseline = createBaselineCache({ prefix: 'markerpatch', tag: 'markerpatch', debug });
const cacheLoad = (key) => baseline.load(key);
const cacheSave = (key, unlocked) => baseline.save(key, unlocked);

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function watchedFolders(configFile = userDirFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => typeof entry === 'string' || (entry && entry.enabled !== false && entry.notify !== false))
      .map((entry) => (typeof entry === 'string' ? entry : entry.path))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// There is only one title here, so the first watched folder that carries it wins.
function discoverGame(configFile = userDirFile) {
  for (const dir of watchedFolders(configFile)) {
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

function iconPathOf(entry) {
  const icon = String(entry && entry.icon ? entry.icon : '');
  if (!icon.startsWith('file:///')) return '';
  return path.normalize(decodeURI(icon.slice('file:///'.length)));
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
        const byId = new Map((schema?.achievement?.list || []).map((entry) => [String(entry.name), entry]));
        const gameName = schema?.name || 'Dead Space 2';

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
            },
            {
              notify: ctx.options.notification.notify,
              transport: {
                mode: ctx.options.notification_transport.mode,
                websocket: ctx.options.notification_transport.websocket,
              },
              toast: {
                appid: typeof ctx.getToastID === 'function' ? ctx.getToastID() : ctx.toastID,
                winrt: ctx.options.notification_transport.winRT,
                balloonFallback: ctx.options.notification_transport.balloon,
                customAudio: ctx.options.notification_toast.customToastAudio,
                volume: notificationVolumePercent(ctx.options),
                imageIntegration: '0',
                group: ctx.options.notification_toast.groupToast,
                attribution: notifyStrings.forLang(ctx.options.achievement.lang).achievement,
              },
              prefetch: false, // the icons are already local files
              rumble: ctx.options.notification.rumble,
            }
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
  try {
    const watcher = watch(dir, { recursive: false }, (evt, name) => {
      if (evt !== 'update') return;
      if (String(path.basename(name || '')).toLowerCase() !== 'settings.txt') return;
      changes.run('markerpatch', () => handleChange(currentCtx));
    });
    watchers.push(guardWatcher(watcher, `'${dir}'`, debug));
    debug.log(`[markerpatch] watching achievements under '${dir}'`);
  } catch (err) {
    debug.warn(`[markerpatch] failed to watch '${dir}': ${err}`);
  }
}

/*
  Pure: given the folder that should eventually hold settings.txt, say whether it already exists or
  which existing ancestor to watch meanwhile, and for what next path segment. Walking stops at worst
  at %LOCALAPPDATA% itself, which always exists.
*/
function resolveWatchTarget(finalDir) {
  if (isDirectory(finalDir)) return { ready: true, dir: finalDir };

  let probe = finalDir;
  const missing = [];
  while (probe && !isDirectory(probe)) {
    missing.unshift(path.basename(probe));
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  if (!isDirectory(probe)) return { ready: false, watchDir: '', nextExpected: '' };
  return { ready: false, watchDir: probe, nextExpected: missing[0] };
}

// Watch for the settings.txt folder to exist - only ever one level at a time, never a deep
// recursive watch over a system folder.
function attach() {
  const stateFile = markerpatch.stateFilePath();
  if (!stateFile) return;
  const finalDir = path.dirname(stateFile);
  const target = resolveWatchTarget(finalDir);

  if (target.ready) {
    watchStateDir(target.dir);
    return;
  }
  if (!target.watchDir) return;

  try {
    const watcher = watch(target.watchDir, { recursive: false }, (evt, name) => {
      if (evt !== 'update') return;
      if (String(path.basename(name || '')).toLowerCase() !== String(target.nextExpected || '').toLowerCase()) return;
      try {
        watcher.close();
      } catch {
        /* already closed */
      }
      watchers = watchers.filter((entry) => entry !== watcher);
      attach();
    });
    watchers.push(guardWatcher(watcher, `'${target.watchDir}'`, debug));
    debug.log(`[markerpatch] '${finalDir}' does not exist yet - waiting under '${target.watchDir}'`);
  } catch (err) {
    debug.warn(`[markerpatch] failed to watch '${target.watchDir}': ${err}`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the MarkerPatch source flag, the notify master switch and the mod's own
// AchievementSupport ini key.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.markerpatch === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

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

  attach();
};

module.exports.stop = () => {
  changes.clear();
  currentGame = null;
  currentCtx = null;
  for (const watcher of watchers) {
    try {
      watcher.close();
    } catch {
      /* already closed */
    }
  }
  watchers = [];
};

module.exports._internal = { discoverGame, watchedFolders, iconPathOf, attach, resolveWatchTarget };
