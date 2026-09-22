'use strict';

/*
  Watch the Alice: Madness Returns MadnessPatch install found through the user's Folders and notify
  on newly earned achievements.

  Everything about the format lives in the app's parser (app/parser/madnesspatch.js), loaded here
  through sharedAppModule rather than copied - the Achievements.txt bitflag, the resource layout and
  the AchievementSupport gate all have to agree with what the library shows.

  Unlock state is per save profile, under Documents\My Games\...\CheckPoint\<profile>\. Profiles
  already on disk at startup are seeded silently (their back-catalogue is not a burst of fresh
  unlocks); a profile created during the session notifies its first unlocks, unless it arrives
  with so many that it was clearly copied in. If the CheckPoint
  folder does not exist yet, the watcher waits on the nearest existing ancestor and re-attaches once
  it appears - the same idea markerpatchWatch uses for settings.txt.
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

const madnesspatch = require(sharedAppModulePath('parser/madnesspatch.js'));

const userDirFile = path.join(userDataDir(), 'cfg', 'userdir.db');
madnesspatch.setIconRoot(path.join(userDataDir(), 'icon_cache', 'madnesspatch'));

let watchers = [];
let currentGame = null;
let currentCtx = null;
const changes = createChangeCoalescer();
const baseline = createBaselineCache({ prefix: 'madnesspatch', tag: 'madnesspatch', debug });
// A profile created mid-session whose first write carries more unlocks than this was copied in.
const NEW_PROFILE_NOTIFY_MAX = 10;
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
      found = madnesspatch.discover(dir);
    } catch (err) {
      debug.warn(`[madnesspatch] discovery failed under "${dir}": ${err}`);
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

function bitsOf(flag) {
  const ids = [];
  if (flag === null) return ids;
  for (let index = 0; index < madnesspatch.TOTAL; index += 1) {
    if ((flag & (1n << BigInt(index))) !== 0n) ids.push(`MADNESSPATCH_${index}`);
  }
  return ids;
}

async function handleChange(profile, file, ctx) {
  try {
    if (!currentGame) return;
    if (!madnesspatch.achievementSupportEnabled(currentGame.paths.ini)) return;
    if (file) await waitForFileStable(file);

    const unlocked = bitsOf(madnesspatch.readProfileState(file));

    const cache = cacheLoad(profile);
    const isNewProfile = !cache || !Array.isArray(cache.unlocked);
    // Profiles already on disk were seeded by start(), so one first seen here was created during this
    // session and its first unlocks are live. Past a handful it is a copied-in profile: baseline only.
    if (isNewProfile && unlocked.length > NEW_PROFILE_NOTIFY_MAX) {
      cacheSave(profile, unlocked);
      return;
    }

    const previous = new Set(isNewProfile ? [] : cache.unlocked.map(String));
    const fresh = unlocked.filter((id) => !previous.has(id));
    if (fresh.length > 0) {
      let schema = null;
      try {
        schema = await madnesspatch.getGameData({ root: currentGame.root }, ctx.options.achievement.lang);
      } catch (err) {
        debug.warn(`[madnesspatch] cannot read the achievement list: ${err}`);
      }
      const byId = new Map((schema?.achievement?.list || []).map((entry) => [String(entry.name), entry]));
      const gameName = schema?.name || 'Alice: Madness Returns';

      let delay = 0;
      for (const id of fresh) {
        const described = byId.get(id);
        if (!described) {
          debug.warn(`[madnesspatch] unlocked achievement ${id}, which its own resources do not describe`);
          continue;
        }
        debug.log(`[madnesspatch] Unlocked (${profile}): ${gameName} - ${described.displayName}`);
        const icon = iconPathOf(described);
        await ctx.notify(
          {
            source: 'MadnessPatch',
            appid: madnesspatch.APPID,
            gameDisplayName: gameName,
            achievementName: id,
            achievementDisplayName: described.displayName,
            achievementDescription: described.description,
            icon: icon || undefined,
            time: moment().unix(),
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

    cacheSave(profile, unlocked);
  } catch (err) {
    debug.warn(`[madnesspatch] handleChange failed for profile '${profile}': ${err}`);
  }
}

function watchCheckpointRoot(root) {
  try {
    const watcher = watch(root, { recursive: true }, (evt, name) => {
      if (evt !== 'update') return;
      const filePath = String(name || '');
      if (path.basename(filePath).toLowerCase() !== madnesspatch.STATE_FILE.toLowerCase()) return;
      const profile = path.basename(path.dirname(filePath));
      changes.run(profile, () => handleChange(profile, filePath, currentCtx));
    });
    watchers.push(guardWatcher(watcher, `'${root}'`, debug));
    debug.log(`[madnesspatch] watching achievements under '${root}'`);
  } catch (err) {
    debug.warn(`[madnesspatch] failed to watch '${root}': ${err}`);
  }
}

/*
  Watch for the CheckPoint folder to exist. Walks up from the target to the nearest existing
  ancestor (at worst Documents itself) and watches only that single level - never a deep recursive
  watch over a folder that has not been created yet - for the next path segment to appear, then
  retries from the top.
*/
// Pure: given the CheckPoint folder, say whether it already exists or which existing ancestor to
// watch meanwhile, and for what next path segment. Walking stops at worst at Documents itself.
function resolveWatchTarget(root) {
  if (isDirectory(root)) return { ready: true, dir: root };

  let probe = root;
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

function attach() {
  const root = madnesspatch.checkpointRoot();
  if (!root) return;
  const target = resolveWatchTarget(root);

  if (target.ready) {
    watchCheckpointRoot(target.dir);
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
    debug.log(`[madnesspatch] '${root}' does not exist yet - waiting under '${target.watchDir}'`);
  } catch (err) {
    debug.warn(`[madnesspatch] failed to watch '${target.watchDir}': ${err}`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the MadnessPatch source flag, the notify master switch and the mod's
// own AchievementSupport ini key.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.madnesspatch === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

  let game;
  try {
    game = discoverGame();
  } catch (err) {
    debug.warn(`[madnesspatch] discovery failed: ${err}`);
    return;
  }
  if (!game) return;
  if (!madnesspatch.achievementSupportEnabled(game.paths.ini)) {
    debug.log(`[madnesspatch] AchievementSupport is off in '${game.paths.ini}' - not watching`);
    return;
  }

  currentGame = game;
  currentCtx = ctx;

  // Seed every profile already on disk silently - a profile discovered at startup is not a "later
  // change", it is the baseline.
  for (const entry of madnesspatch.listProfiles()) {
    if (cacheLoad(entry.profile)) continue;
    try {
      cacheSave(entry.profile, bitsOf(madnesspatch.readProfileState(entry.file)));
    } catch (err) {
      debug.warn(`[madnesspatch] baseline seed failed for profile '${entry.profile}': ${err}`);
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

module.exports._internal = { discoverGame, watchedFolders, iconPathOf, attach, bitsOf, resolveWatchTarget };
