'use strict';

/*
  Notifies on the trophies PS3Recomp ports save in <gamedata>/trophies/<NPWRnnnnn>.json, read by
  the app's own parser so the library and the notifications agree. The runtime creates that folder
  with the first unlock: its nearest existing parent is watched until it appears. File events, no
  polling.
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

const ps3 = require(sharedAppModulePath('parser/ps3Recomp.js'));

const userDirFile = () => path.join(userDataDir(), 'cfg', 'userdir.db');
// The same icon cache as the app, so whatever either side wrote serves both.
ps3.setDataRoot(userDataDir());

// A first file carrying more than this at once is a copied-in save, not a play session.
const NEW_FILE_NOTIFY_MAX = 10;
// A file caught mid-rewrite is read again a little later, a few times at most.
const UNSTABLE_RETRY_MS = 400;
const UNSTABLE_RETRIES = 5;
// How far up a missing trophies folder is followed: gamedata, then the port's working folder.
const MAX_PARENT_LEVELS = 3;

let watchers = [];
let lifecycle = 0;
const timers = new Set();
const baselines = new Map();
const changes = createChangeCoalescer();

function watchedFolders(configFile = userDirFile()) {
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

// One record per game across the user's folders.
function discover(configFile = userDirFile()) {
  const records = new Map();
  for (const dir of watchedFolders(configFile)) {
    try {
      for (const record of ps3.scan(dir)) if (!records.has(record.appid)) records.set(record.appid, record);
    } catch (err) {
      debug.warn(`[ps3recomp] discovery failed under "${dir}": ${err}`);
    }
  }
  return [...records.values()];
}

const dirKey = (dir) => (process.platform === 'win32' ? path.resolve(dir).toLowerCase() : path.resolve(dir));

// The folders the records' unlock files are in, each with the records it holds.
function foldersOf(records) {
  const found = new Map();
  for (const record of records) {
    if (!record.data.progressFile) continue;
    const dir = path.dirname(String(record.data.progressFile));
    if (!found.has(dirKey(dir))) found.set(dirKey(dir), { dir: path.resolve(dir), records: [] });
    found.get(dirKey(dir)).records.push(record);
  }
  return [...found.values()];
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
    source: ps3.SOURCE,
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
    schema = await ps3.getGameData(record.data, ctx.options.achievement.lang);
  } catch (err) {
    debug.warn(`[ps3recomp] cannot read the trophy list of ${record.appid}: ${err}`);
    return false;
  }
  const byId = new Map(schema.achievement.list.map((entry) => [String(entry.name), entry]));
  let delay = 0;
  for (const [id, time] of fresh) {
    const described = byId.get(String(id));
    if (!described) continue;
    debug.log(`[ps3recomp] Unlocked: ${schema.name} - ${described.displayName}`);
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

// Announces what the file holds now and was not seen; a file being rewritten is read again shortly.
async function handleChange(record, ctx, attempt = 0) {
  try {
    const read = ps3.readUnlocks(record.data);
    if (read.unstable) {
      retryLater(record, ctx, attempt);
      return;
    }
    const previous = baselines.get(record.appid) || new Set();
    const fresh = [...read.unlocked].filter(([id]) => !previous.has(id));
    const copiedIn = previous.size === 0 && fresh.length > NEW_FILE_NOTIFY_MAX;
    if (fresh.length > 0 && !copiedIn && !(await announce(record, fresh, ctx))) return;
    // A relock read from the file is kept: the runtime only rewrites what it holds in memory.
    baselines.set(record.appid, new Set(read.unlocked.keys()));
  } catch (err) {
    debug.warn(`[ps3recomp] handleChange failed for ${record.appid}: ${err}`);
  }
}

// What is already unlocked at start is recorded silently, so nothing is replayed on launch.
function seedBaseline(record) {
  try {
    let read = ps3.readUnlocks(record.data);
    for (let attempt = 0; read.unstable && attempt < UNSTABLE_RETRIES; attempt++) read = ps3.readUnlocks(record.data);
    baselines.set(record.appid, new Set(read.unlocked.keys()));
  } catch (err) {
    debug.warn(`[ps3recomp] baseline seed failed for ${record.appid}: ${err}`);
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

function checkFolder(folder, ctx) {
  for (const record of folder.records) changes.run(record.appid, () => handleChange(record, ctx));
}

/*
  The trophies folder when it exists; else its nearest parent, re-attached one level closer each
  time a level appears. The records are read as soon as the folder itself does.
*/
function attach(folder, ctx) {
  if (isDirectory(folder.dir)) {
    const watcher = watch(longPath(folder.dir), { recursive: false }, (evt, name) => {
      if (!name || ps3.isProgressName(name)) checkFolder(folder, ctx);
    });
    watchers.push(guardWatcher(watcher, `'${folder.dir}'`, debug));
    debug.log(`[ps3recomp] watching the unlock files in '${folder.dir}'`);
    return;
  }
  const parent = nearestExisting(folder.dir);
  if (!parent) {
    debug.log(`[ps3recomp] '${folder.dir}' and its parents are missing, not watched`);
    return;
  }
  const generation = lifecycle;
  const pending = watch(longPath(parent), { recursive: false }, () => {
    if (generation !== lifecycle || (!isDirectory(folder.dir) && nearestExisting(folder.dir) === parent)) return;
    closeWatcher(pending);
    attach(folder, ctx);
    if (isDirectory(folder.dir)) checkFolder(folder, ctx);
  });
  watchers.push(guardWatcher(pending, `'${parent}'`, debug));
  debug.log(`[ps3recomp] waiting for '${folder.dir}' from '${parent}'`);
}

// Tear down and restart from the current options. Gated by the PS3 Recomp source and the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.ps3recomp === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

  for (const folder of foldersOf(discover())) {
    try {
      folder.records.forEach(seedBaseline);
      attach(folder, ctx);
    } catch (err) {
      debug.warn(`[ps3recomp] failed to watch ${folder.dir}: ${err}`);
    }
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

module.exports._internal = { discover, watchedFolders, foldersOf, handleChange, seedBaseline, nearestExisting, baselines, watcherCount: () => watchers.length };
