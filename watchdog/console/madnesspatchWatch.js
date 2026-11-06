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

const madnesspatch = require(sharedAppModulePath('parser/madnesspatch.js'));

madnesspatch.setIconRoot(path.join(userDataDir(), 'icon_cache', 'madnesspatch'));

const watchers = kit.createWatcherList('madnesspatch', debug);
let currentGame = null;
let currentCtx = null;
const changes = createChangeCoalescer();
const baseline = createBaselineCache({ prefix: 'madnesspatch', tag: 'madnesspatch', debug });
// A profile created mid-session whose first write carries more unlocks than this was copied in.
const NEW_PROFILE_NOTIFY_MAX = kit.COPIED_IN_UNLOCKS;
const cacheLoad = (key) => baseline.load(key);
const cacheSave = (key, unlocked) => baseline.save(key, unlocked);

// There is only one title here, so the first watched folder that carries it wins; Steam's own
// install is looked at last, so nobody has to add the folder.
function discoverGame(configFile = kit.userDirFile(), knownRoots = () => madnesspatch.knownInstallRoots()) {
  for (const dir of [...watchedFolders(configFile), ...knownRoots()]) {
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

    // Locked or half-written: saving that as the baseline would replay every unlock on the next write.
    const state = madnesspatch.readProfileState(file);
    if (state === null) return;
    const unlocked = bitsOf(state);

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
      // Keep the old baseline so these unlocks are announced on the next write instead of lost.
      if (!schema) return;
      const byId = new Map((schema?.achievement?.list || []).map((entry) => [String(entry.name), entry]));
      const gameName = schema?.name || 'Alice: Madness Returns';
      const completion = { unlocked: unlocked.filter((id) => byId.has(id)).length, total: byId.size };

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
            completion,
          },
          kit.unlockToastOptions(ctx)
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
  const watcher = watchers.open(root, { recursive: true }, (evt, name) => {
    if (evt !== 'update') return;
    const filePath = String(name || '');
    if (path.basename(filePath).toLowerCase() !== madnesspatch.STATE_FILE.toLowerCase()) return;
    const profile = path.basename(path.dirname(filePath));
    changes.run(profile, () => handleChange(profile, filePath, currentCtx));
  });
  if (watcher) debug.log(`[madnesspatch] watching achievements under '${root}'`);
}

/*
  Watch for the CheckPoint folder to exist: only its nearest existing ancestor (at worst Documents
  itself), one level, for the next path segment - never a deep recursive watch over a folder that
  has not been created yet - then retry from the top.
*/
function attach(root) {
  if (!root) return;
  const target = resolveWatchTarget(root);
  if (target.ready) {
    watchCheckpointRoot(target.dir);
    return;
  }
  if (!target.watchDir) return;
  if (kit.awaitSegment(watchers, target, () => attach(root))) {
    debug.log(`[madnesspatch] '${root}' does not exist yet - waiting under '${target.watchDir}'`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the MadnessPatch source flag, the notify master switch and the mod's
// own AchievementSupport ini key.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'madnesspatch')) return;

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

  // One checkpoint folder per host (each Wine prefix on Linux); the game writes the one it runs in.
  for (const root of madnesspatch.checkpointRoots()) attach(root);
};

module.exports.stop = () => {
  changes.clear();
  currentGame = null;
  currentCtx = null;
  watchers.closeAll();
};

module.exports._internal = { discoverGame, watchedFolders, iconPathOf, attach, bitsOf, resolveWatchTarget };
