'use strict';

/*
  Watch the unlock lists of recompiled Xbox 360 games and notify on newly earned achievements. The
  formats, discovery and schema all live in the app's parser (app/parser/x360Recomp.js), loaded here
  through sharedAppModule so the library and the notifications read the same files the same way.
*/

const fs = require('fs');
const path = require('path');
const { iconPathOf } = require('../util/iconPath.js');
const watch = require('../util/nodeWatch.js');
const { longPath } = require('../util/longPath.js');
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
const { isDirectory } = require(sharedAppModulePath('parser/x360Ports.js'));
const { pathKey } = require(sharedAppModulePath('util/winHosts.js'));

const userDirFile = path.join(userDataDir(), 'cfg', 'userdir.db');
// Same schema and icon caches as the app, so whatever either side fetched serves both.
x360.setDataRoot(userDataDir());

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
const NEW_LIST_SETTLE_MS = 3000;
// Longer than the runtime's delete-then-rename, short enough to follow a reset.
const LIST_GONE_MS = 1500;
const RECENT_UNLOCK_S = 15 * 60;
const DUPLICATE_UNLOCK_MS = 15000;
// The lists themselves (achievements\<TITLEID>.toml, a TSV profile, the JSON, ACH-DATA, per-profile
// lists) and the files whose arrival names a port's folders: reNut's renut.cfg, Lost Odyssey's
// game-path.txt and friends. Anything else in an achievements folder is never read.
const LIST_PATH_RE = /[\\/]achievements(?:[\\/][0-9a-f]{8}(?:\.toml|[\\/][^\\/]+\.tsv)?)?$|[\\/]savedata[\\/]achievements\.json$|[\\/]save[\\/](?:ach-data|sonicnextachievementdata\.bin)$|[\\/]profiles?[\\/](?:[^\\/]+[\\/])?achievements\.(?:ini|json)$|[\\/](?:renut\.cfg|game-path\.txt|saves\.path|gow2\.toml|gow2_game_path\.txt)$/i;

let watchers = [];
let lifecycle = 0; // bumped by stop(), so an in-flight rediscover() can tell it was cancelled
let rediscoverTimer = null;
let documentsTimer = null;
let settleTimer = null;
const changes = createChangeCoalescer();
// appid -> { key, waiting, lists, watchers }: what is watched for it, whether its list is still
// awaited, and the list folders it follows.
const watched = new Map();

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

// The user's folders first, then Documents, one target per title; a known port still waiting for
// its list gives way to that title's list found elsewhere.
function discover(configFile = userDirFile, documentsRoots = undefined) {
  let targets = [];
  const add = (records) => {
    targets = x360.mergeRecords(targets, records).records;
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

// The list files of a target: one, or one per profile or install of the game.
function listFiles(data) {
  if (Array.isArray(data.profileFiles) && data.profileFiles.length) return data.profileFiles;
  return data.file ? [data.file] : [];
}

// Each folder a target's lists live in, and whether a changed file there is one of them.
function listSpecs(record) {
  const data = record.data;
  if (data.format === 'tsv') return data.dir ? [{ dir: data.dir, matches: (name) => /\.tsv$/i.test(name) }] : [];
  const byDir = new Map();
  for (const file of listFiles(data)) {
    const dir = path.dirname(file);
    if (!byDir.has(dir)) byDir.set(dir, new Set());
    byDir.get(dir).add(path.basename(file).toLowerCase());
  }
  return [...byDir].map(([dir, names]) => ({ dir, matches: (name) => names.has(name.toLowerCase()) }));
}

const watchSpec = (record) => listSpecs(record)[0];

// The nearest folder that exists on the way to `dir`, never above `stop`; '' when there is none.
function nearestExisting(dir, stop) {
  const stopKey = stop ? pathKey(path.resolve(stop)) : '';
  let current = path.resolve(dir);
  for (;;) {
    if (isDirectory(current)) return current;
    const parent = path.dirname(current);
    const parentKey = pathKey(parent);
    if (!stopKey || pathKey(current) === stopKey || parent === current || (parentKey !== stopKey && !parentKey.startsWith(stopKey + path.sep))) return '';
    current = parent;
  }
}

/*
  What to watch for a target. A list folder that exists is watched for its files. One that does
  not exist yet (a known port before its first unlock) is waited for from its nearest existing
  parent, bounded by the port's own root (`pendingRoot`), never recursively.
*/
function watchSpecs(record) {
  return listSpecs(record).map((spec) => {
    if (isDirectory(spec.dir)) return spec;
    const parent = nearestExisting(spec.dir, record.data.pendingRoot);
    return parent ? { dir: parent, waitingFor: spec.dir } : null;
  }).filter(Boolean);
}

const watchKey = (specs) => specs.map((spec) => `${spec.waitingFor ? 'wait' : 'list'}:${pathKey(spec.dir)}`).join('|') || 'none';

const listExists = (data) => (data.format === 'tsv' ? isDirectory(data.dir || '') : listFiles(data).some((file) => fs.existsSync(file)));

const baseline = createBaselineCache({ prefix: 'x360recomp', tag: 'x360recomp', debug });
const { load: cacheLoad, save: cacheSave } = baseline;

// The runtime writes a temp file then renames it, which can fire twice for one unlock.
const recentUnlocks = new Map();
function isDuplicateUnlock(appid, achievementId) {
  const key = `${appid}:${achievementId}`;
  const now = Date.now();
  for (const [seen, at] of recentUnlocks) if (now - at > DUPLICATE_UNLOCK_MS) recentUnlocks.delete(seen);
  const last = recentUnlocks.get(key);
  recentUnlocks.set(key, now);
  return last != null && now - last < DUPLICATE_UNLOCK_MS;
}

/*
  ReXGlue deletes the list before renaming its replacement in: read in between, it looks empty, and
  that baseline would replay every unlock as new on the next write. Still gone a moment later, it
  was removed on purpose (a reset): the baseline starts over, so re-earned ones toast. With several
  profiles, the one whose list went is the one reset; the others still count. True when it was gone.
*/
async function settledGoneList(record, changedFile) {
  const listFile = changedFile && record.data.format !== 'tsv' ? changedFile : record.data.file;
  if (!listFile || fs.existsSync(listFile)) return false;
  await new Promise((resolve) => setTimeout(resolve, LIST_GONE_MS));
  if (!fs.existsSync(listFile)) cacheSave(record.appid, x360.getAchievements(record.data).map((entry) => entry.id));
  return true;
}

function toastOptions(ctx, described) {
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
      attribution: described.gamerscore > 0 ? `${described.gamerscore} G` : notifyStrings.forLang(ctx.options.achievement.lang).achievement,
    },
    prefetch: false, // the icons are already local files
    rumble: ctx.options.notification.rumble,
  };
}

function unlockEvent(record, entry, described, game) {
  const icon = iconPathOf(described);
  return {
    source: x360.SOURCE,
    appid: record.appid,
    gameDisplayName: game.name,
    achievementName: String(entry.id),
    achievementDisplayName: described.displayName,
    achievementDescription: described.description,
    icon: icon || undefined,
    time: entry.earned_time || moment().unix(),
    delay: game.delay,
    completion: game.completion,
  };
}

// Toasts the `fresh` unlocks; false when the game's list could not be loaded to describe them.
async function announceUnlocks(record, fresh, unlocked, ctx) {
  let schema = null;
  try {
    schema = await x360.getGameData(record.data, ctx.options.achievement.lang);
  } catch (err) {
    debug.warn(`[x360recomp] cannot load the achievement list of ${record.appid}: ${err}`);
  }
  if (!schema) return false;
  const byId = new Map((schema.achievement ? schema.achievement.list : []).map((entry) => [String(entry.name), entry]));
  const name = schema.name || record.appid;
  const completion = { unlocked: unlocked.filter((entry) => byId.has(String(entry.id))).length, total: byId.size };
  let delay = 0;
  for (const entry of fresh) {
    if (isDuplicateUnlock(record.appid, entry.id)) continue;
    const described = byId.get(String(entry.id));
    if (!described) {
      debug.warn(`[x360recomp] ${name} unlocked achievement ${entry.id}, which its list does not describe`);
      continue;
    }
    debug.log(`[x360recomp] Unlocked: ${name} - ${described.displayName}`);
    await ctx.notify(unlockEvent(record, entry, described, { name, completion, delay }), toastOptions(ctx, described));
    delay += 1;
  }
  return true;
}

async function handleChange(record, changedFile, ctx) {
  try {
    if (changedFile) await waitForFileStable(changedFile);
    if (await settledGoneList(record, changedFile)) return;
    const unlocked = x360.getAchievements(record.data);
    const cache = cacheLoad(record.appid);
    // First observation: record the baseline silently so a back-catalogue does not toast on launch.
    if (cache && Array.isArray(cache.unlocked)) {
      const previous = new Set(cache.unlocked.map(String));
      const fresh = unlocked.filter((entry) => !previous.has(String(entry.id)));
      // Keep the old baseline so these unlocks are announced on the next write instead of lost.
      if (fresh.length > 0 && !(await announceUnlocks(record, fresh, unlocked, ctx))) return;
    }
    cacheSave(record.appid, unlocked.map((entry) => entry.id));
  } catch (err) {
    debug.warn(`[x360recomp] handleChange failed for ${record.appid}: ${err}`);
  }
}

/*
  The baseline a title starts from. Seen for the first time, it takes every unlock its lists hold.
  With `keepRecent` (a list found after startup, a profile copied in later) only the older unlocks
  join, an existing baseline included: the recent ones still toast, years-old ones never do.
*/
function seedBaseline(record, { keepRecent = false, now = Math.floor(Date.now() / 1000) } = {}) {
  const cache = cacheLoad(record.appid);
  if (cache && !keepRecent) return;
  const known = cache && Array.isArray(cache.unlocked) ? cache.unlocked.map(String) : [];
  try {
    const unlocked = x360.getAchievements(record.data);
    const old = keepRecent ? unlocked.filter((entry) => !(entry.earned_time > now - RECENT_UNLOCK_S)) : unlocked;
    const ids = old.map((entry) => String(entry.id));
    if (cache && ids.every((id) => known.includes(id))) return;
    cacheSave(record.appid, [...new Set([...known, ...ids])]);
  } catch (err) {
    debug.warn(`[x360recomp] baseline seed failed for ${record.appid}: ${err}`);
  }
}

function scheduleRediscover(ctx) {
  // A game writes its list in bursts: wait for it to settle, then look once.
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => rediscover(ctx), NEW_LIST_SETTLE_MS);
  settleTimer.unref();
}

// A list a title is already watched for: its own watcher handles the change.
function isWatchedList(file) {
  const key = pathKey(file);
  const parent = pathKey(path.dirname(file));
  const name = path.basename(file);
  return [...watched.values()].some((entry) => entry.lists.some((list) => list.key === key || (list.key === parent && list.matches(name))));
}

// Whether a change seen by the recursive watch over a root can reveal a list not watched yet.
function wakesDiscovery(name) {
  const file = String(name || '');
  return LIST_PATH_RE.test(file) && !isWatchedList(file);
}

function onEvent(spec, record, ctx, evt, name) {
  const changed = path.basename(name || '').toLowerCase();
  if (spec.waitingFor) {
    // Only the next folder on the way to the list matters; discovery then looks again.
    const next = path.relative(spec.dir, spec.waitingFor).split(/[\\/]/)[0].toLowerCase();
    if (changed === next) scheduleRediscover(ctx);
    return;
  }
  if ((evt !== 'update' && evt !== 'remove') || !spec.matches(changed)) return;
  changes.run(record.appid, () => handleChange(record, name, ctx));
}

function openWatch(spec, record, ctx) {
  try {
    const watcher = watch(longPath(spec.dir), { recursive: false }, (evt, name) => onEvent(spec, record, ctx, evt, name));
    guardWatcher(watcher, `'${spec.dir}'`, debug);
    watchers.push(watcher);
    if (spec.waitingFor) debug.log(`[x360recomp] ${record.appid}: unlock source pending, waiting for '${spec.waitingFor}' from '${spec.dir}'`);
    else debug.log(`[x360recomp] watching achievements for ${record.appid} in '${spec.dir}'`);
    return watcher;
  } catch (err) {
    debug.warn(`[x360recomp] failed to watch ${spec.dir}: ${err}`);
    return null;
  }
}

function attach(record, ctx) {
  const specs = watchSpecs(record);
  const lists = specs.filter((spec) => !spec.waitingFor).map((spec) => ({ key: pathKey(spec.dir), matches: spec.matches }));
  const entry = { key: watchKey(specs), waiting: !specs.length || specs.some((spec) => spec.waitingFor), lists, watchers: [] };
  watched.set(record.appid, entry);
  if (!specs.length) debug.log(`[x360recomp] ${record.appid}: unlock source pending, nothing to watch until discovery finds where`);
  for (const spec of specs) {
    const watcher = openWatch(spec, record, ctx);
    if (watcher) entry.watchers.push(watcher);
  }
}

function closeWatcher(watcher) {
  try {
    watcher.close();
  } catch {
    /* already closed */
  }
}

function detach(appid) {
  const entry = watched.get(appid);
  if (!entry) return;
  for (const watcher of entry.watchers) closeWatcher(watcher);
  watchers = watchers.filter((watcher) => !entry.watchers.includes(watcher));
  watched.delete(appid);
}

/*
  A full pass re-attaches a title whose watched folders changed (a list that appeared, a new
  profile); a partial one (Documents only) replaces only a title still waiting for its list, so two
  sources of one title never take turns.
*/
async function rediscover(ctx, found = discover, { full = found === discover } = {}) {
  let targets;
  try {
    targets = found();
  } catch (err) {
    debug.warn(`[x360recomp] rediscovery failed: ${err}`);
    return;
  }
  const generation = lifecycle;
  for (const record of targets) {
    // A stop() during the await below would otherwise leave this loop attaching orphan watchers.
    if (generation !== lifecycle) return;
    const current = watched.get(record.appid);
    if (current && (current.key === watchKey(watchSpecs(record)) || (!full && !current.waiting))) continue;
    detach(record.appid);
    attach(record, ctx);
    if (!listExists(record.data)) continue;
    seedBaseline(record, { keepRecent: true });
    await handleChange(record, '', ctx);
  }
}

// The user's folders to follow for new games, each once, compared the way the platform compares paths.
function watchRoots(configFile = userDirFile) {
  const seen = new Set();
  return watchedFolders(configFile).filter((dir) => {
    const key = pathKey(dir);
    if (seen.has(key) || !isDirectory(dir)) return false;
    seen.add(key);
    return true;
  });
}

function watchForNewLists(ctx, configFile = userDirFile) {
  for (const dir of watchRoots(configFile)) {
    try {
      const watcher = watch(longPath(dir), { recursive: true, filter: wakesDiscovery }, () => scheduleRediscover(ctx));
      guardWatcher(watcher, `'${dir}'`, debug);
      watchers.push(watcher);
    } catch (err) {
      debug.warn(`[x360recomp] cannot follow '${dir}' for new games: ${err}`);
    }
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
    // A list that does not exist yet has no back-catalogue: its baseline starts when it appears.
    if (listExists(record.data)) seedBaseline(record);
    attach(record, ctx);
  }
  watchForNewLists(ctx);
  rediscoverTimer = setInterval(() => rediscover(ctx), FALLBACK_REDISCOVER_MS);
  rediscoverTimer.unref();
  documentsTimer = setInterval(() => rediscover(ctx, () => x360.scanDocuments()), DOCUMENTS_CHECK_MS);
  documentsTimer.unref();
};

module.exports.stop = () => {
  lifecycle += 1;
  if (rediscoverTimer) clearInterval(rediscoverTimer);
  rediscoverTimer = null;
  clearTimeout(settleTimer);
  settleTimer = null;
  if (documentsTimer) clearInterval(documentsTimer);
  documentsTimer = null;
  changes.clear();
  for (const watcher of watchers) closeWatcher(watcher);
  watchers = [];
  watched.clear();
};

module.exports._internal = { discover, watchSpec, watchSpecs, watchedFolders, watchRoots, iconPathOf, handleChange, seedBaseline, rediscover, wakesDiscovery, watched, LIST_PATH_RE };
