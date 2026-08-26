'use strict';

/*
  Watch the XLiveLessNess profiles of the Games for Windows LIVE games in the user's folders and
  notify on newly earned achievements.

  Everything about the format lives in the app's parser (app/parser/xlln.js), loaded here through
  sharedAppModule rather than copied: the SPAFILE reader, the state-file records and the discovery
  rules all have to agree with what the library shows, and two copies of a binary parser drift.
*/

const fs = require('fs');
const path = require('path');
const watch = require('node-watch');
const moment = require('moment');
const debug = require('../util/log.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { notificationVolumePercent } = require('../util/notificationVolume.js');
const notifyStrings = require('../util/notifyStrings.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');

const xlln = require(sharedAppModulePath('parser/xlln.js'));

const cacheDir = path.join(userDataDir(), 'steam_cache/console');
const userDirFile = path.join(userDataDir(), 'cfg', 'userdir.db');
// The same icon cache the app parser extracts into, so an icon written by either side serves both.
xlln.setIconRoot(path.join(userDataDir(), 'icon_cache', 'xlln'));

let watchers = [];
const changes = createChangeCoalescer();

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

// Every XLiveLessNess game below the user's folders, deduplicated by title.
function discover(configFile = userDirFile) {
  const targets = [];
  const seen = new Set();
  for (const dir of watchedFolders(configFile)) {
    let found = [];
    try {
      found = xlln.discover(dir);
    } catch (err) {
      debug.warn(`[xlln] discovery failed under "${dir}": ${err}`);
      continue;
    }
    for (const game of found) {
      if (seen.has(game.titleId)) continue;
      seen.add(game.titleId);
      targets.push(game);
    }
  }
  return targets;
}

/*
  The folder to watch. The profile tree only appears once the game has written something, so this
  falls back up the chain: an install that has never unlocked anything is still watched, at the
  storage root, and the first unlock arrives as a change there.
*/
function watchRootFor(game) {
  for (const root of xlln.storageRoots(game.gameDir)) {
    const candidates = [path.join(root, 'profile', 'title', game.titleId), path.join(root, 'profile', 'title'), path.join(root, 'profile'), root];
    for (const candidate of candidates) {
      try {
        if (fs.statSync(candidate).isDirectory()) return candidate;
      } catch {
        /* try the next one up */
      }
    }
  }
  return '';
}

function cacheFile(titleId) {
  return path.join(cacheDir, `xlln-${String(titleId).replace(/[^\w.-]/g, '_')}.json`);
}

function cacheLoad(titleId) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(titleId), 'utf8'));
  } catch {
    return null;
  }
}

function cacheSave(titleId, unlockedIds) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile(titleId), JSON.stringify({ unlocked: unlockedIds }), 'utf8');
  } catch (err) {
    debug.warn(`[xlln] cache save failed for ${titleId}: ${err}`);
  }
}

// The runtime can touch the same state file several times per unlock; the baseline diff already
// blocks true re-toasts, this only covers the burst while that baseline write races the next event.
const recentUnlocks = new Map();
function isDuplicateUnlock(titleId, achievementId) {
  const key = `${titleId}:${achievementId}`;
  const now = Date.now();
  for (const [seen, at] of recentUnlocks) if (now - at > 15000) recentUnlocks.delete(seen);
  const last = recentUnlocks.get(key);
  recentUnlocks.set(key, now);
  return last != null && now - last < 15000;
}

function iconPathOf(entry) {
  const icon = String(entry && entry.icon ? entry.icon : '');
  if (!icon.startsWith('file:///')) return '';
  return path.normalize(decodeURI(icon.slice('file:///'.length)));
}

async function handleChange(game, stateFile, ctx) {
  try {
    if (stateFile) await waitForFileStable(stateFile);

    const unlocked = xlln.getAchievements(game);
    if (unlocked.length === 0) return;

    const cache = cacheLoad(game.titleId);
    const isFirstObservation = !cache || !Array.isArray(cache.unlocked);

    // First observation: record the baseline silently, so a profile that already holds a whole
    // back-catalogue of unlocks does not toast every one of them on launch.
    if (!isFirstObservation) {
      const previous = new Set(cache.unlocked.map(String));
      const fresh = unlocked.filter((entry) => !previous.has(String(entry.id)));
      if (fresh.length > 0) {
        let schema = null;
        try {
          schema = await xlln.getGameData(game, ctx.options.achievement.lang);
        } catch (err) {
          debug.warn(`[xlln] cannot read the achievement list of ${game.titleId}: ${err}`);
        }
        const byId = new Map((schema && schema.achievement && schema.achievement.list ? schema.achievement.list : []).map((entry) => [String(entry.name), entry]));
        const gameName = (schema && schema.name) || game.name || game.titleId;

        let delay = 0;
        for (const entry of fresh) {
          if (isDuplicateUnlock(game.titleId, entry.id)) continue;
          const described = byId.get(String(entry.id));
          if (!described) {
            debug.warn(`[xlln] ${gameName} unlocked achievement ${entry.id}, which its own executable does not describe`);
            continue;
          }
          debug.log(`[xlln] Unlocked: ${gameName} - ${described.displayName}`);
          const icon = iconPathOf(described);
          await ctx.notify(
            {
              source: 'XLiveLessNess',
              appid: game.titleId,
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
                attribution:
                  described.gamerscore > 0 ? `${described.gamerscore} G` : notifyStrings.forLang(ctx.options.achievement.lang).achievement,
              },
              prefetch: false, // the icons are already local files
              rumble: ctx.options.notification.rumble,
            }
          );
          delay += 1;
        }
      }
    }

    cacheSave(game.titleId, unlocked.map((entry) => entry.id));
  } catch (err) {
    debug.warn(`[xlln] handleChange failed for ${game.titleId}: ${err}`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the XLiveLessNess source flag and the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.xlln === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

  let targets;
  try {
    targets = discover();
  } catch (err) {
    debug.warn(`[xlln] discovery failed: ${err}`);
    return;
  }
  if (targets.length === 0) return;

  for (const game of targets) {
    // Seed the baseline up front so nothing already earned is replayed on launch.
    if (!cacheLoad(game.titleId)) {
      try {
        cacheSave(game.titleId, xlln.getAchievements(game).map((entry) => entry.id));
      } catch (err) {
        debug.warn(`[xlln] baseline seed failed for ${game.titleId}: ${err}`);
      }
    }

    attach(game, ctx);
  }
};

/*
  Start watching one game. A title that has never unlocked anything has no profile tree yet, and the
  runtime creates the whole chain at the moment of the first unlock - so the game folder itself is
  watched until it appears, then the real watcher takes over. Without that step the very first
  achievement of a freshly installed game would only show up on the next library refresh.
*/
function attach(game, ctx) {
  const root = watchRootFor(game);
  if (root) {
    try {
      const watcher = watch(root, { recursive: true }, (evt, name) => {
        if (evt !== 'update') return;
        if (String(path.basename(name || '')).toLowerCase() !== xlln.STATE_FILE) return;
        // The storage root can hold several titles; only this one's own tree is ours.
        if (!String(name || '').toUpperCase().includes(`${path.sep}${game.titleId}${path.sep}`)) return;
        changes.run(game.titleId, () => handleChange(game, name, ctx));
      });
      watchers.push(watcher);
      debug.log(`[xlln] watching achievements for ${game.titleId} under '${root}'`);
    } catch (err) {
      debug.warn(`[xlln] failed to watch ${root}: ${err}`);
    }
    return;
  }

  try {
    const pending = watch(game.gameDir, { recursive: false }, () => {
      if (!watchRootFor(game)) return; // still nothing: some other file in the game folder moved
      try {
        pending.close();
      } catch {
        /* already closed */
      }
      watchers = watchers.filter((entry) => entry !== pending);
      attach(game, ctx);
      changes.run(game.titleId, () => handleChange(game, '', ctx));
    });
    watchers.push(pending);
    debug.log(`[xlln] ${game.titleId} has no profile folder yet - waiting for one in '${game.gameDir}'`);
  } catch (err) {
    debug.warn(`[xlln] failed to watch ${game.gameDir}: ${err}`);
  }
}

module.exports.stop = () => {
  changes.clear();
  for (const watcher of watchers) {
    try {
      watcher.close();
    } catch {
      /* already closed */
    }
  }
  watchers = [];
};

module.exports._internal = { discover, watchRootFor, watchedFolders, iconPathOf, attach };
