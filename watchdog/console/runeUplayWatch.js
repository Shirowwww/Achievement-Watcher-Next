'use strict';

/*
  Watch RUNE's Ubisoft Connect emulator saves and notify on newly earned achievements.

  The file layout and parser are the app's own (app/parser/runeUplay.js, loaded through
  sharedAppModule); names and icons come from Ubisoft's achievement archive, read by the same
  loader the Ubisoft Connect watcher uses. Saves already on disk at startup are the baseline.
  A root that does not exist yet is waited for from its nearest existing ancestor.
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
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { userDataDir } = require('../util/userData.js');
const ubisoftWatch = require('./ubisoftWatch.js');

const runeUplay = require(sharedAppModulePath('parser/runeUplay.js'));
const userDirFile = path.join(userDataDir(), 'cfg', 'userdir.db');

let watchers = [];
const changes = createChangeCoalescer();
const baseline = createBaselineCache({ prefix: 'rune-uplay', tag: 'rune-uplay', debug });
// A save first seen mid-session with more unlocks than this was copied in, not earned.
const NEW_SAVE_NOTIFY_MAX = 10;

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

// <achievements>\<user>\<product>\achievements.cfg -> { userId, uplayId }, or null for anything else.
function identify(file) {
  const parts = path.resolve(String(file || '')).split(path.sep);
  if (parts.length < 4 || parts[parts.length - 1].toLowerCase() !== runeUplay.CFG_NAME) return null;
  const uplayId = runeUplay.normalizeAchievementId(parts[parts.length - 2]);
  const userId = parts[parts.length - 3];
  return uplayId && userId ? { userId, uplayId } : null;
}

const earnedIds = (snapshot) =>
  Object.entries(snapshot)
    .filter(([, entry]) => entry.earned)
    .sort((a, b) => a[1].earned_time - b[1].earned_time)
    .map(([id]) => id);

function gameNameFor(uplayId) {
  const titles = ubisoftWatch._internal.readTitles();
  const titleKey = [...titles.keys()].find((key) => key.startsWith(`${uplayId}_`));
  return ubisoftWatch._internal.indexedUplayName(uplayId) || (titleKey && titles.get(titleKey)) || `Ubisoft ${uplayId}`;
}

async function notifyUnlocks(identity, fresh, snapshot, ctx) {
  const schema = ubisoftWatch._internal.loadSchema(identity.uplayId, ctx.options.achievement.lang) || { texts: new Map(), iconFor: () => undefined };
  const gameName = gameNameFor(identity.uplayId);
  let delay = 0;
  for (const id of fresh) {
    const text = schema.texts.get(id) || {};
    debug.log(`[rune-uplay] Unlocked: ${gameName} - ${text.displayName || id}`);
    await ctx.notify(
      {
        source: runeUplay.SOURCE,
        appid: `uplay-${identity.uplayId}`,
        gameDisplayName: gameName,
        achievementName: id,
        achievementDisplayName: text.displayName || id,
        achievementDescription: text.description || '',
        icon: schema.iconFor(id),
        time: snapshot[id].earned_time || moment().unix(),
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
          attribution: gameName,
        },
        prefetch: false,
        rumble: ctx.options.notification.rumble,
      }
    );
    delay += 1;
  }
}

async function handleChange(file, ctx) {
  try {
    const identity = identify(file);
    if (!identity) return;
    await waitForFileStable(file);

    // An unreadable or half-written file must not become the baseline, or every unlock replays.
    const read = runeUplay.readAchievementsFile(file);
    if (!read.valid) {
      debug.warn(`[rune-uplay] ${file} unreadable (${read.reason})`);
      return;
    }
    const earned = earnedIds(read.snapshot);
    const key = `${identity.userId}_${identity.uplayId}`;
    const cache = baseline.load(key);
    const isNewSave = !cache || !Array.isArray(cache.unlocked);

    if (isNewSave && earned.length > NEW_SAVE_NOTIFY_MAX) {
      baseline.save(key, earned);
      return;
    }
    const previous = new Set(isNewSave ? [] : cache.unlocked.map(String));
    const fresh = earned.filter((id) => !previous.has(id));
    if (fresh.length > 0) await notifyUnlocks(identity, fresh, read.snapshot, ctx);
    baseline.save(key, earned);
  } catch (err) {
    debug.warn(`[rune-uplay] handleChange failed for ${file}: ${err}`);
  }
}

// Pure: the folder to watch now, or the nearest existing ancestor and the segment it waits for.
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

function watchAchievements(root, ctx) {
  try {
    const watcher = watch(root, { recursive: true }, (evt, name) => {
      if (evt !== 'update') return;
      const file = String(name || '');
      if (!identify(file)) return;
      changes.run(file, () => handleChange(file, ctx));
    });
    watchers.push(guardWatcher(watcher, `'${root}'`, debug));
    debug.log(`[rune-uplay] watching '${root}'`);
  } catch (err) {
    debug.warn(`[rune-uplay] failed to watch '${root}': ${err}`);
  }
}

function attach(root, ctx) {
  const target = resolveWatchTarget(root);
  if (target.ready) {
    watchAchievements(target.dir, ctx);
    return;
  }
  if (!target.watchDir) return;
  try {
    const watcher = watch(target.watchDir, { recursive: false }, (evt, name) => {
      if (evt !== 'update') return;
      if (path.basename(String(name || '')).toLowerCase() !== target.nextExpected.toLowerCase()) return;
      try {
        watcher.close();
      } catch {
        /* already closed */
      }
      watchers = watchers.filter((entry) => entry !== watcher);
      attach(root, ctx);
    });
    watchers.push(guardWatcher(watcher, `'${target.watchDir}'`, debug));
    debug.log(`[rune-uplay] '${root}' does not exist yet - waiting under '${target.watchDir}'`);
  } catch (err) {
    debug.warn(`[rune-uplay] failed to watch '${target.watchDir}': ${err}`);
  }
}

function seedBaselines(roots) {
  for (const entry of runeUplay.discoverFiles(roots)) {
    const key = `${entry.userId}_${entry.uplayId}`;
    if (baseline.load(key)) continue;
    const read = runeUplay.readAchievementsFile(entry.file);
    if (read.valid) baseline.save(key, earnedIds(read.snapshot));
  }
}

// Folders the user added under Settings > Folders that are, or hold, a RUNE Ubisoft Connect tree.
function addedRoots(configFile = userDirFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => typeof entry === 'string' || (entry && entry.enabled !== false && entry.notify !== false))
      .map((entry) => (typeof entry === 'string' ? entry : entry.path))
      .filter((dir) => typeof dir === 'string' && runeUplay.resolveAchievementsRoot(dir));
  } catch {
    return [];
  }
}

// The same folder reached twice (default root, added root, its achievements child) is one watch.
function uniqueAchievementsRoots(roots) {
  const seen = new Set();
  const out = [];
  for (const root of roots) {
    const resolved = runeUplay.resolveAchievementsRoot(root);
    if (!resolved || seen.has(resolved.toLowerCase())) continue;
    seen.add(resolved.toLowerCase());
    out.push(resolved);
  }
  return out;
}

// Safe to call on every settings reload. Gated by the Ubisoft Connect emulator source switch and
// the notification master switch.
module.exports.start = async (ctx, roots = [...runeUplay.defaultRoots(), ...addedRoots()]) => {
  module.exports.stop();

  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.lumaPlay === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

  const achievementsRoots = uniqueAchievementsRoots(roots);
  try {
    seedBaselines(roots);
  } catch (err) {
    debug.warn(`[rune-uplay] baseline seed failed: ${err}`);
  }
  for (const root of achievementsRoots) attach(root, ctx);
};

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

module.exports._internal = { addedRoots, uniqueAchievementsRoots, identify, earnedIds, resolveWatchTarget, handleChange, seedBaselines, baseline };
