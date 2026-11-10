'use strict';

/*
  What every live watcher in this folder does the same way: the start gate, the notification
  options, the user's folders, the list of open watches and the waits for a folder that does not
  exist yet. Each watcher keeps its own file and says only what is specific to its source; a fix
  made here reaches all of them instead of the one it was written in.
*/

const fs = require('fs');
const path = require('path');
const watch = require('../util/nodeWatch.js');
const { longPath } = require('../util/longPath.js');
const { guardWatcher } = require('../util/watchGuard.js');
const { iconPathOf } = require('../util/iconPath.js');
const { notifyOptions } = require('../notification/notifyOptions.js');
const notifyStrings = require('../util/notifyStrings.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { isDirectory } = require(sharedAppModulePath('util/fsProbe.js'));
const userDirEntries = require(sharedAppModulePath('parser/userDirEntries.js'));
const portFinder = require(sharedAppModulePath('parser/portFinder.js'));

// A save, profile or unlock file first seen with more unlocks than this was copied in, not played.
const COPIED_IN_UNLOCKS = 10;
// How long a removed unlock file must stay gone to count as a reset, not a delete-then-create.
const RESET_CONFIRM_MS = 1000;
const DUPLICATE_UNLOCK_MS = 15000;

const userDirFile = () => userDirEntries.userDirFile(userDataDir());

// A switch is a boolean and a level is 0, 1 or 2 (a string when read back from options.ini): off is false or 0.
function sourceSwitchOn(sources, key) {
  const value = sources ? sources[key] : undefined;
  return value !== false && String(value) !== '0';
}

// `sourceSwitch` is the achievement_source key, or a function of achievement_source for a source with its own rule.
function canStart(ctx, sourceSwitch) {
  if (!ctx || !ctx.options) return false;
  const sources = ctx.options.achievement_source || {};
  const on = typeof sourceSwitch === 'function' ? sourceSwitch(sources) : sourceSwitchOn(sources, sourceSwitch);
  if (!on) return false;
  if (ctx.options.notification && ctx.options.notification.notify === false) return false;
  return typeof ctx.notify === 'function';
}

// A string from the Watchdog's locale mirror: 'achievement', 'trophy', 'eaAchievement'.
function localized(ctx, key) {
  return notifyStrings.forLang(ctx.options.achievement.lang)[key];
}

// Xbox titles show what an achievement is worth, the generic word when it is worth nothing.
function gamerscoreAttribution(ctx, gamerscore) {
  return gamerscore > 0 ? `${gamerscore} G` : localized(ctx, 'achievement');
}

function iconPrefetch(ctx) {
  return ctx.options.notification_advanced ? ctx.options.notification_advanced.iconPrefetch : true;
}

// The second argument of ctx.notify. `prefetch` stays false for icons that are already local files.
function unlockToastOptions(ctx, { attribution = localized(ctx, 'achievement'), prefetch = false, imageIntegration = '0' } = {}) {
  const toastId = typeof ctx.getToastID === 'function' ? ctx.getToastID() : undefined;
  return notifyOptions(ctx.options, { toastId, attribution, prefetch, imageIntegration });
}

// An unlock's own icon when the parser extracted it to a file that is there.
function existingIcon(described) {
  const icon = iconPathOf(described);
  return icon && fs.existsSync(icon) ? icon : undefined;
}

// The game's own square icon and key art, for presets that paint the game beside the unlock.
function gameArt(schema) {
  const img = schema && schema.img;
  return { gameIcon: iconPathOf(img) || undefined, image: iconPathOf({ icon: img && img.header }) || undefined };
}

// The folders of Settings > Folders that are on, read as the library and the monitor read them.
function watchedFolders(configFile = userDirFile()) {
  return userDirEntries
    .readUserDirEntries(configFile)
    .filter((entry) => entry.enabled)
    .map((entry) => entry.path);
}

// The game libraries of Settings that are on: cfg/librarydirs.db beside the folder list, as the app writes it.
function libraryFolders(configFile = userDirFile()) {
  try {
    const entries = JSON.parse(fs.readFileSync(path.join(path.dirname(configFile), 'librarydirs.db'), 'utf8'));
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => (typeof entry === 'string' ? { path: entry, enabled: true } : entry || {}))
      .filter((entry) => entry.enabled !== false && typeof entry.path === 'string' && entry.path.trim())
      .map((entry) => entry.path.trim());
  } catch {
    return [];
  }
}

const listing = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
};

/*
  Where the recompiled-port watchers look: the Folders, then the ports set straight in a game
  library, which the library reads at every scan too (portFinder.js), each game folder listed once.
*/
function portWatchFolders(configFile = userDirFile()) {
  const watched = watchedFolders(configFile);
  return [...watched, ...portFinder.libraryPorts(libraryFolders(configFile), listing, (dir) => portFinder.isUnder(dir, watched))];
}

// A runtime can rewrite one file several times per unlock; the baseline diff blocks true re-toasts,
// this covers the burst while the baseline write races the next event.
function createDuplicateGuard(windowMs = DUPLICATE_UNLOCK_MS) {
  const recent = new Map();
  return (scope, id) => {
    const key = `${scope}:${id}`;
    const now = Date.now();
    for (const [seen, at] of recent) if (now - at > windowMs) recent.delete(seen);
    const last = recent.get(key);
    recent.set(key, now);
    return last != null && now - last < windowMs;
  };
}

function closeQuietly(watcher) {
  try {
    watcher.close();
  } catch {
    /* already closed */
  }
}

/*
  The watches one watcher holds. `open` guards the watch (an 'error' event would otherwise kill the
  Watchdog) and logs a watch that cannot start under the watcher's tag; it returns null then.
*/
function createWatcherList(tag, debug) {
  let list = [];
  return {
    open(dir, options, onEvent) {
      try {
        const watcher = watch(longPath(dir), options, onEvent);
        guardWatcher(watcher, `'${dir}'`, debug);
        list.push(watcher);
        return watcher;
      } catch (err) {
        debug.warn(`[${tag}] failed to watch '${dir}': ${err}`);
        return null;
      }
    },
    includes: (watcher) => list.includes(watcher),
    close(watcher) {
      closeQuietly(watcher);
      list = list.filter((entry) => entry !== watcher);
    },
    closeAll() {
      for (const watcher of list) closeQuietly(watcher);
      list = [];
    },
    get size() {
      return list.length;
    },
  };
}

// Pure: the folder is there, or the nearest folder above it that is and the segment it must grow next.
function resolveWatchTarget(dir) {
  if (isDirectory(dir)) return { ready: true, dir };
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

// The nearest existing parent of `dir`, at most `levels` up; '' when none is.
function nearestExistingParent(dir, levels) {
  let current = path.dirname(dir);
  for (let level = 0; level < levels; level++, current = path.dirname(current)) {
    if (isDirectory(current)) return current;
  }
  return '';
}

/*
  Watches target.watchDir, one level only, until target.nextExpected appears there, then closes and
  calls `onAppear` (which resolves again from the top). node-watch listens from 'ready' on, a tick
  later on Linux, so a segment created before that is caught there.
*/
function awaitSegment(watchers, target, onAppear) {
  const expected = String(target.nextExpected || '').toLowerCase();
  const advance = () => {
    if (!watchers.includes(watcher) || !fs.existsSync(path.join(target.watchDir, target.nextExpected))) return;
    watchers.close(watcher);
    onAppear();
  };
  const watcher = watchers.open(target.watchDir, { recursive: false }, (evt, name) => {
    if (path.basename(String(name || '')).toLowerCase() === expected) advance();
  });
  if (watcher) watcher.on('ready', advance);
  return watcher;
}

// True when none of `files` exists any more `ms` after a remove event: a reset, not a rewrite.
async function stillGone(files, ms = RESET_CONFIRM_MS) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return !files.some((file) => fs.existsSync(file));
}

// Re-reads of a file caught mid-rewrite, a few at most, all dropped by cancel() on stop.
function createRetrier({ delayMs, attempts }) {
  const timers = new Set();
  let generation = 0;
  return {
    later(attempt, run) {
      if (attempt >= attempts) return;
      const scheduled = generation;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (scheduled === generation) run(attempt + 1);
      }, delayMs);
      timer.unref();
      timers.add(timer);
    },
    cancel() {
      generation += 1;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}

module.exports = {
  COPIED_IN_UNLOCKS,
  userDirFile,
  canStart,
  localized,
  gamerscoreAttribution,
  iconPrefetch,
  unlockToastOptions,
  existingIcon,
  gameArt,
  watchedFolders,
  portWatchFolders,
  createDuplicateGuard,
  createWatcherList,
  isDirectory,
  resolveWatchTarget,
  nearestExistingParent,
  awaitSegment,
  stillGone,
  createRetrier,
};
