'use strict';

/*
  Watch the unlock lists of recompiled Xbox 360 games and notify on newly earned achievements. The
  formats, discovery and schema all live in the app's parser (app/parser/x360Recomp.js), loaded here
  through sharedAppModule so the library and the notifications read the same files the same way.
*/

const fs = require('fs');
const path = require('path');
const watch = require('node-watch');
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

const x360 = require(sharedAppModulePath('parser/x360Recomp.js'));

const userDirFile = path.join(userDataDir(), 'cfg', 'userdir.db');
// Same schema and icon caches as the app, so whatever either side fetched serves both.
x360.setDataRoot(userDataDir());

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

// The user's folders first, then Documents, one target per title.
function discover(configFile = userDirFile, documentsRoots = undefined) {
  const targets = [];
  const seen = new Set();
  const add = (records) => {
    for (const record of records) {
      if (seen.has(record.appid)) continue;
      seen.add(record.appid);
      targets.push(record);
    }
  };
  for (const dir of watchedFolders(configFile)) {
    try {
      add(x360.scan(dir));
    } catch (err) {
      debug.warn(`[x360recomp] discovery failed under "${dir}": ${err}`);
    }
  }
  try {
    add(x360.scanDocuments(documentsRoots));
  } catch (err) {
    debug.warn(`[x360recomp] Documents discovery failed: ${err}`);
  }
  return targets;
}

// The folder a target's list lives in, and whether a changed file there is that list.
function watchSpec(record) {
  const data = record.data;
  if (data.format === 'tsv') return { dir: data.dir, matches: (name) => /\.tsv$/i.test(name) };
  const wanted = path.basename(data.file).toLowerCase();
  return { dir: path.dirname(data.file), matches: (name) => name.toLowerCase() === wanted };
}

const baseline = createBaselineCache({ prefix: 'x360recomp', tag: 'x360recomp', debug });
const cacheLoad = (key) => baseline.load(key);
const cacheSave = (key, unlocked) => baseline.save(key, unlocked);

// The runtime writes a temp file then renames it, which can fire twice for one unlock.
const recentUnlocks = new Map();
function isDuplicateUnlock(appid, achievementId) {
  const key = `${appid}:${achievementId}`;
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

async function handleChange(record, changedFile, ctx) {
  try {
    if (changedFile) await waitForFileStable(changedFile);
    // ReXGlue deletes the list before renaming its replacement in: read in between, it looks empty,
    // and that baseline would replay every unlock as new on the next write. Still gone a moment
    // later, it was removed on purpose (a reset): the baseline starts over, so re-earned ones toast.
    if (record.data.file && !fs.existsSync(record.data.file)) {
      await new Promise((resolve) => setTimeout(resolve, LIST_GONE_MS));
      if (!fs.existsSync(record.data.file)) cacheSave(record.appid, []);
      return;
    }

    const unlocked = x360.getAchievements(record.data);
    const cache = cacheLoad(record.appid);
    const isFirstObservation = !cache || !Array.isArray(cache.unlocked);

    // First observation: record the baseline silently so a back-catalogue does not toast on launch.
    if (!isFirstObservation) {
      const previous = new Set(cache.unlocked.map(String));
      const fresh = unlocked.filter((entry) => !previous.has(String(entry.id)));
      if (fresh.length > 0) {
        let schema = null;
        try {
          schema = await x360.getGameData(record.data, ctx.options.achievement.lang);
        } catch (err) {
          debug.warn(`[x360recomp] cannot load the achievement list of ${record.appid}: ${err}`);
        }
        const byId = new Map((schema && schema.achievement ? schema.achievement.list : []).map((entry) => [String(entry.name), entry]));
        const gameName = (schema && schema.name) || record.appid;

        let delay = 0;
        for (const entry of fresh) {
          if (isDuplicateUnlock(record.appid, entry.id)) continue;
          const described = byId.get(String(entry.id));
          if (!described) {
            debug.warn(`[x360recomp] ${gameName} unlocked achievement ${entry.id}, which its list does not describe`);
            continue;
          }
          debug.log(`[x360recomp] Unlocked: ${gameName} - ${described.displayName}`);
          const icon = iconPathOf(described);
          await ctx.notify(
            {
              source: x360.SOURCE,
              appid: record.appid,
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

    cacheSave(record.appid, unlocked.map((entry) => entry.id));
  } catch (err) {
    debug.warn(`[x360recomp] handleChange failed for ${record.appid}: ${err}`);
  }
}

/*
  A game's list only appears with its first unlock, so a game never seen before has nothing to watch
  at startup. The watched folders are followed for a new `achievements` path (one native recursive
  watch per root, no polling) and discovery runs again when one shows up. Documents is only checked
  every two minutes, and cheaply: it holds Windows' legacy junctions ("My Music"), whose EPERM on a
  recursive watch killed the whole Watchdog in a restart loop. A slow full pass is the safety net. A
  list found that way is new: its recent unlocks toast, anything older joins the baseline, since a
  folder added later can hold years of history.
*/
const FALLBACK_REDISCOVER_MS = 10 * 60 * 1000;
const DOCUMENTS_CHECK_MS = 2 * 60 * 1000;
let documentsTimer = null;
const NEW_LIST_SETTLE_MS = 3000;
const LIST_PATH_RE = /[\\/]achievements(?:[\\/]|$)|[\\/]savedata[\\/]achievements\.json$/i;
// Longer than the runtime's delete-then-rename, short enough to follow a reset.
const LIST_GONE_MS = 1500;
const RECENT_UNLOCK_S = 15 * 60;
let rediscoverTimer = null;
const watched = new Set();

function seedBaseline(record, { keepRecent = false, now = Math.floor(Date.now() / 1000) } = {}) {
  if (cacheLoad(record.appid)) return;
  try {
    const unlocked = x360.getAchievements(record.data);
    const old = keepRecent ? unlocked.filter((entry) => !(entry.earned_time > now - RECENT_UNLOCK_S)) : unlocked;
    cacheSave(record.appid, old.map((entry) => entry.id));
  } catch (err) {
    debug.warn(`[x360recomp] baseline seed failed for ${record.appid}: ${err}`);
  }
}

function attach(record, ctx) {
  const spec = watchSpec(record);
  try {
    const watcher = watch(spec.dir, { recursive: false }, (evt, name) => {
      if ((evt !== 'update' && evt !== 'remove') || !spec.matches(path.basename(name || ''))) return;
      changes.run(record.appid, () => handleChange(record, name, ctx));
    });
    guardWatcher(watcher, `'${spec.dir}'`, debug);
    watchers.push(watcher);
    watched.add(record.appid);
    debug.log(`[x360recomp] watching achievements for ${record.appid} in '${spec.dir}'`);
  } catch (err) {
    debug.warn(`[x360recomp] failed to watch ${spec.dir}: ${err}`);
  }
}

async function rediscover(ctx, found = discover) {
  let targets;
  try {
    targets = found();
  } catch (err) {
    debug.warn(`[x360recomp] rediscovery failed: ${err}`);
    return;
  }
  for (const record of targets) {
    if (watched.has(record.appid)) continue;
    seedBaseline(record, { keepRecent: true });
    attach(record, ctx);
    await handleChange(record, '', ctx);
  }
}

// Tear down any existing watchers and (re)start from the current options. Gated by the Xbox 360
// source flag, which covers the emulator and the recompilations alike, and the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.xenia === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

  let targets;
  try {
    targets = discover();
  } catch (err) {
    debug.warn(`[x360recomp] discovery failed: ${err}`);
    return;
  }

  for (const record of targets) {
    seedBaseline(record);
    attach(record, ctx);
  }
  watchForNewLists(ctx);
  rediscoverTimer = setInterval(() => rediscover(ctx), FALLBACK_REDISCOVER_MS);
  rediscoverTimer.unref();
  documentsTimer = setInterval(() => rediscover(ctx, () => x360.scanDocuments()), DOCUMENTS_CHECK_MS);
  documentsTimer.unref();
};


let settleTimer = null;

function watchForNewLists(ctx, configFile = userDirFile) {
  const roots = watchedFolders(configFile).filter((dir, i, all) => {
    if (all.findIndex((other) => other.toLowerCase() === dir.toLowerCase()) !== i) return false;
    try {
      return fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
  for (const dir of roots) {
    try {
      const watcher = watch(dir, { recursive: true, filter: (name) => LIST_PATH_RE.test(String(name || '')) }, () => {
        // A game writes its list in bursts: wait for it to settle, then look once.
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => rediscover(ctx), NEW_LIST_SETTLE_MS);
        settleTimer.unref();
      });
      guardWatcher(watcher, `'${dir}'`, debug);
      watchers.push(watcher);
    } catch (err) {
      debug.warn(`[x360recomp] cannot follow '${dir}' for new games: ${err}`);
    }
  }
}

module.exports.stop = () => {
  if (rediscoverTimer) clearInterval(rediscoverTimer);
  rediscoverTimer = null;
  clearTimeout(settleTimer);
  settleTimer = null;
  if (documentsTimer) clearInterval(documentsTimer);
  documentsTimer = null;
  changes.clear();
  for (const watcher of watchers) {
    try {
      watcher.close();
    } catch {
      /* already closed */
    }
  }
  watchers = [];
  watched.clear();
};

module.exports._internal = { discover, watchSpec, watchedFolders, iconPathOf, handleChange, seedBaseline, rediscover, LIST_PATH_RE };
