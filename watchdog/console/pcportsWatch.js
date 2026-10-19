'use strict';

/*
  Notifies on the unlocks of a PC port found under the user's Folders, read by the app's own parser
  so the library and the notifications agree. A file present at start is a silent baseline; one
  that does not exist yet is waited for, and everything true in it afterwards is new.
*/

const fs = require('fs');
const path = require('path');
const { iconPathOf } = require('../util/iconPath.js');
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

const pcports = require(sharedAppModulePath('parser/pcports.js'));

const userDirFile = path.join(userDataDir(), 'cfg', 'userdir.db');
pcports.setDataRoot(userDataDir());

// A file first seen with more unlocks than this was copied in, not played.
const NEW_FILE_NOTIFY_MAX = 10;
const RESET_CONFIRM_MS = 1000;

let watchers = [];
const changes = createChangeCoalescer();
const baseline = createBaselineCache({ prefix: 'pcports', tag: 'pcports', debug });
const cacheLoad = () => baseline.load(pcports.APPID);
const cacheSave = (unlocked) => baseline.save(pcports.APPID, unlocked);

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

// One title here: the first watched folder that holds the install wins.
function discoverGame(configFile = userDirFile) {
  for (const dir of watchedFolders(configFile)) {
    try {
      const found = pcports.discover(dir);
      if (found) return found;
    } catch (err) {
      debug.warn(`[pcports] discovery failed under "${dir}": ${err}`);
    }
  }
  return null;
}

function toastOptions(ctx) {
  return {
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
  };
}

// False when the schema could not be read: the baseline then stays, and the unlocks are retried.
async function announce(game, fresh, ctx) {
  let schema = null;
  try {
    schema = await pcports.getGameData({ root: game.root }, ctx.options.achievement.lang);
  } catch (err) {
    debug.warn(`[pcports] cannot read the achievement list: ${err}`);
    return false;
  }
  const byId = new Map(schema.achievement.list.map((entry) => [String(entry.name), entry]));
  const now = moment().unix();
  pcports.recordObservedTimes(fresh, now);
  let delay = 0;
  for (const id of fresh) {
    const described = byId.get(id);
    if (!described) continue;
    debug.log(`[pcports] Unlocked: ${schema.name} - ${described.displayName}`);
    const icon = iconPathOf(described);
    await ctx.notify(
      {
        source: pcports.SOURCE,
        appid: pcports.APPID,
        gameDisplayName: schema.name,
        achievementName: id,
        achievementDisplayName: described.displayName,
        achievementDescription: described.description,
        icon: icon || undefined,
        time: now,
        delay,
      },
      toastOptions(ctx)
    );
    delay += 1;
  }
  return true;
}

/*
  A removed file is a reset: the baseline follows it down, so earning an achievement again announces
  it. A save rewritten as delete-then-create is missing for a moment too, so only a file still gone
  a moment later counts; taking that moment for a reset would replay every achievement in it.
*/
async function handleChange(game, file, ctx, removed = false) {
  try {
    if (removed) {
      await new Promise((resolve) => setTimeout(resolve, RESET_CONFIRM_MS));
      if (!fs.existsSync(file)) {
        cacheSave([]);
        return;
      }
    }
    await waitForFileStable(file);
    // Locked or half written: keeping that as the baseline would replay everything on the next write.
    const unlocked = pcports.earnedIds(file);
    if (unlocked === null) return;
    const cache = cacheLoad();
    const hasBaseline = !!(cache && Array.isArray(cache.unlocked));
    const previous = new Set(hasBaseline ? cache.unlocked.map(String) : []);
    // An empty baseline, the start or a reset, then a full file at once: a save copied back in.
    const copiedIn = previous.size === 0 && unlocked.length > NEW_FILE_NOTIFY_MAX;
    const fresh = copiedIn ? [] : unlocked.filter((id) => !previous.has(id));
    if (fresh.length > 0 && !(await announce(game, fresh, ctx))) return;
    cacheSave(unlocked);
  } catch (err) {
    debug.warn(`[pcports] handleChange failed: ${err}`);
  }
}

/*
  The baseline of an unlock file already on disk, silently. One recorded before keeps what it had,
  minus what the file no longer holds, so a reset made while the Watchdog was stopped does not
  silence the achievements earned again.
*/
function seedBaseline(file) {
  const unlocked = pcports.earnedIds(file);
  if (unlocked === null) return;
  const cache = cacheLoad();
  if (!cache || !Array.isArray(cache.unlocked)) {
    cacheSave(unlocked);
    return;
  }
  const still = new Set(unlocked);
  const kept = cache.unlocked.filter((id) => still.has(String(id)));
  if (kept.length !== cache.unlocked.length) cacheSave(kept);
}

function watchFile(game, ctx) {
  const dir = path.dirname(game.progressFile);
  const name = path.basename(game.progressFile).toLowerCase();
  const watcher = watch(dir, { recursive: false }, (evt, changed) => {
    if (path.basename(String(changed || '')).toLowerCase() !== name) return;
    changes.run(pcports.APPID, () => handleChange(game, game.progressFile, ctx, evt === 'remove'));
  });
  watchers.push(guardWatcher(watcher, `'${dir}'`, debug));
  debug.log(`[pcports] watching '${game.progressFile}'`);
}

// Pure: the folder is there, or the nearest folder above it that is, and the segment it must grow next.
function resolveWatchTarget(dir) {
  if (isDirectory(dir)) return { ready: true };
  let probe = dir;
  const missing = [];
  while (probe && !isDirectory(probe)) {
    missing.unshift(path.basename(probe));
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  return isDirectory(probe) ? { ready: false, watchDir: probe, nextExpected: missing[0] } : { ready: false, watchDir: '', nextExpected: '' };
}

/*
  The game makes Zelda_LA (or the portable file) when it first saves. Until its folder exists the
  nearest existing folder above is watched for the next segment, and the file is read the moment
  its own folder appears, in case the game wrote it before the real watcher was attached.
*/
function attach(game, ctx) {
  const target = resolveWatchTarget(path.dirname(game.progressFile));
  if (target.ready) {
    watchFile(game, ctx);
    if (fs.existsSync(game.progressFile)) changes.run(pcports.APPID, () => handleChange(game, game.progressFile, ctx));
    return;
  }
  if (!target.watchDir) return;
  try {
    const watcher = watch(target.watchDir, { recursive: false }, (evt, name) => {
      if (path.basename(String(name || '')).toLowerCase() !== String(target.nextExpected).toLowerCase()) return;
      try {
        watcher.close();
      } catch {
        /* already closed */
      }
      watchers = watchers.filter((entry) => entry !== watcher);
      attach(game, ctx);
    });
    watchers.push(guardWatcher(watcher, `'${target.watchDir}'`, debug));
    debug.log(`[pcports] '${game.progressFile}' does not exist yet - waiting under '${target.watchDir}'`);
  } catch (err) {
    debug.warn(`[pcports] failed to watch '${target.watchDir}': ${err}`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the PC port source flag and the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.pcports === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

  let game;
  try {
    game = discoverGame();
  } catch (err) {
    debug.warn(`[pcports] discovery failed: ${err}`);
    return;
  }
  if (!game) return;

  seedBaseline(game.progressFile);
  attach(game, ctx);
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

module.exports._internal = { watchedFolders, discoverGame, handleChange, seedBaseline, resolveWatchTarget, attach };
