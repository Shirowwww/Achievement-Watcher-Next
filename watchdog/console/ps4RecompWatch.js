'use strict';

/*
  Notifies on the trophies PC ports of PS4 games log, read by the app's own parser so the library
  and the notifications agree. The user folder holding the logs may not exist before the first
  session: its nearest existing parent is watched until it does.
*/

const fs = require('fs');
const path = require('path');
const { iconPathOf } = require('../util/iconPath.js');
const watch = require('../util/nodeWatch.js');
const { longPath } = require('../util/longPath.js');
const moment = require('moment');
const debug = require('../util/log.js');
const { trophyGradeOf, platinumFields } = require('../util/trophyGrade.js');
const { guardWatcher } = require('../util/watchGuard.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const { notificationVolumePercent } = require('../util/notificationVolume.js');
const notifyStrings = require('../util/notifyStrings.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');

const ps4 = require(sharedAppModulePath('parser/ps4Recomp.js'));

const userDirFile = path.join(userDataDir(), 'cfg', 'userdir.db');
// The same icon cache and unlock journal as the app, so whatever either side wrote serves both.
ps4.setDataRoot(userDataDir());

// A first log carrying more than this at once is a copied-in profile, not a play session.
const NEW_LOG_NOTIFY_MAX = 10;
// A log replaced mid-read is read again a little later, a few times at most.
const UNSTABLE_RETRY_MS = 400;
const UNSTABLE_RETRIES = 5;
// How far up a missing user folder is followed: data/user, then the port folder.
const MAX_PARENT_LEVELS = 3;

let watchers = [];
let lifecycle = 0;
const timers = new Set();
const baselines = new Map();
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

// One record per game across the user's folders, grouped by the user folder their logs are in.
function discover(configFile = userDirFile) {
  const records = new Map();
  for (const dir of watchedFolders(configFile)) {
    try {
      for (const record of ps4.scan(dir)) if (!records.has(record.appid)) records.set(record.appid, record);
    } catch (err) {
      debug.warn(`[ps4recomp] discovery failed under "${dir}": ${err}`);
    }
  }
  const groups = new Map();
  for (const record of records.values()) {
    const resolved = path.resolve(record.data.userDir);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (!groups.has(key)) groups.set(key, { userDir: record.data.userDir, records: [] });
    groups.get(key).records.push(record);
  }
  return [...groups.values()];
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
      attribution: notifyStrings.forLang(ctx.options.achievement.lang).trophy,
    },
    prefetch: false, // the icons are already local files
    rumble: ctx.options.notification.rumble,
  };
}

function payloadFor(record, schema, described, time, delay) {
  const icon = iconPathOf(described);
  const gameIcon = iconPathOf(schema.img);
  const image = iconPathOf({ icon: schema.img && schema.img.header });
  return {
    source: ps4.SOURCE,
    appid: record.appid,
    gameDisplayName: schema.name || record.appid,
    achievementName: String(described.name),
    achievementDisplayName: described.displayName,
    achievementDescription: described.description,
    icon: icon && fs.existsSync(icon) ? icon : undefined,
    gameIcon: gameIcon || undefined,
    image: image || undefined,
    trophyGrade: trophyGradeOf(described.type),
    time: time || moment().unix(),
    delay,
  };
}

// False when the trophy list could not be read: the unlocks stay unannounced for the next change.
async function announce(record, fresh, ctx) {
  let schema;
  try {
    schema = await ps4.getGameData(record.data, ctx.options.achievement.lang);
  } catch (err) {
    debug.warn(`[ps4recomp] cannot read the trophy list of ${record.appid}: ${err}`);
    return false;
  }
  const byId = new Map(schema.achievement.list.map((entry) => [String(entry.name), entry]));
  let delay = 0;
  for (const [id, time] of fresh) {
    const described = byId.get(String(id));
    if (!described) {
      debug.warn(`[ps4recomp] ${record.appid} unlocked trophy ${id}, which its list does not describe`);
      continue;
    }
    debug.log(`[ps4recomp] Unlocked: ${schema.name} - ${described.displayName}`);
    await ctx.notify({ ...payloadFor(record, schema, described, time, delay), ...platinumFields(described.type, ctx.options) }, toastOptions(ctx));
    delay += 1;
  }
  return true;
}

function retryLater(record, ctx, attempt) {
  if (attempt >= UNSTABLE_RETRIES) return;
  const generation = lifecycle;
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (generation === lifecycle) changes.run(record.appid, () => handleChange(record, ctx, attempt + 1));
  }, UNSTABLE_RETRY_MS);
  timer.unref();
  timers.add(timer);
}

/*
  Compares what the logs hold now with what was seen: every new line is announced. A log being
  rewritten is read again shortly, never taken as an empty one.
*/
async function handleChange(record, ctx, attempt = 0) {
  try {
    const read = ps4.readUnlocks(record.data);
    if (read.unstable) {
      retryLater(record, ctx, attempt);
      return;
    }
    const previous = baselines.get(record.appid) || new Set();
    const fresh = [...read.unlocked].filter(([id]) => !previous.has(id));
    const copiedIn = previous.size === 0 && fresh.length > NEW_LOG_NOTIFY_MAX;
    if (fresh.length > 0 && !copiedIn && !(await announce(record, fresh, ctx))) return;
    baselines.set(record.appid, new Set(read.unlocked.keys()));
  } catch (err) {
    debug.warn(`[ps4recomp] handleChange failed for ${record.appid}: ${err}`);
  }
}

// What is already unlocked at start is recorded silently, so nothing is replayed on launch.
function seedBaseline(record) {
  try {
    let read = ps4.readUnlocks(record.data);
    for (let attempt = 0; read.unstable && attempt < UNSTABLE_RETRIES; attempt++) read = ps4.readUnlocks(record.data);
    baselines.set(record.appid, new Set(read.unlocked.keys()));
  } catch (err) {
    debug.warn(`[ps4recomp] baseline seed failed for ${record.appid}: ${err}`);
    baselines.set(record.appid, new Set());
  }
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function nearestExisting(dir) {
  let current = path.dirname(dir);
  for (let level = 0; level < MAX_PARENT_LEVELS; level++, current = path.dirname(current)) {
    if (isDirectory(current)) return current;
  }
  return '';
}

function closeWatcher(watcher) {
  try {
    watcher.close();
  } catch {
    /* already closed */
  }
  watchers = watchers.filter((entry) => entry !== watcher);
}

function checkGroup(group, ctx) {
  for (const record of group.records) changes.run(record.appid, () => handleChange(record, ctx));
}

function attachLogs(group, ctx) {
  const logName = (name) => ps4.LOG_FILES.includes(path.basename(String(name || '')).toLowerCase());
  const watcher = watch(longPath(group.userDir), { recursive: false }, (evt, name) => {
    if (logName(name)) checkGroup(group, ctx);
  });
  watchers.push(guardWatcher(watcher, `'${group.userDir}'`, debug));
  debug.log(`[ps4recomp] watching the unlock logs in '${group.userDir}'`);
}

/*
  A user folder that does not exist yet: its nearest parent is watched, one level closer each time
  a level appears, and the logs are read as soon as the folder itself does.
*/
function attach(group, ctx) {
  try {
    if (isDirectory(group.userDir)) {
      attachLogs(group, ctx);
      return;
    }
    const parent = nearestExisting(group.userDir);
    if (!parent) {
      debug.log(`[ps4recomp] '${group.userDir}' and its parents are missing, not watched`);
      return;
    }
    const generation = lifecycle;
    const pending = watch(longPath(parent), { recursive: false }, () => {
      if (generation !== lifecycle || (!isDirectory(group.userDir) && nearestExisting(group.userDir) === parent)) return;
      closeWatcher(pending);
      attach(group, ctx);
      if (isDirectory(group.userDir)) checkGroup(group, ctx);
    });
    watchers.push(guardWatcher(pending, `'${parent}'`, debug));
    debug.log(`[ps4recomp] no user folder yet - waiting for '${group.userDir}' from '${parent}'`);
  } catch (err) {
    debug.warn(`[ps4recomp] failed to watch ${group.userDir}: ${err}`);
  }
}

// Tear down and restart from the current options. Gated by the PS4 Recomp source and the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.ps4recomp === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

  let groups;
  try {
    groups = discover();
  } catch (err) {
    debug.warn(`[ps4recomp] discovery failed: ${err}`);
    return;
  }
  for (const group of groups) {
    group.records.forEach(seedBaseline);
    attach(group, ctx);
  }
};

module.exports.stop = () => {
  lifecycle += 1;
  changes.clear();
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  for (const watcher of watchers.slice()) closeWatcher(watcher);
  watchers = [];
  baselines.clear();
};

module.exports._internal = { discover, watchedFolders, handleChange, seedBaseline, nearestExisting, baselines };
