'use strict';

/*
  Notifies on the trophies PC ports of PS4 games record (logs, progress files), read by the app's
  own parser so the library and the notifications agree. A folder holding them may not exist
  before the first session: its nearest existing parent is watched until it does.
*/

const path = require('path');
const moment = require('moment');
const debug = require('../util/log.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const kit = require('./watcherKit.js');
const { watchedFolders, isDirectory } = kit;
const { trophyGradeOf, platinumFields } = require(sharedAppModulePath('parser/trophyGrade.js'));
const { pathKey } = require(sharedAppModulePath('util/winHosts.js'));

const ps4 = require(sharedAppModulePath('parser/ps4Recomp.js'));

// The same icon cache and unlock journal as the app, so whatever either side wrote serves both.
ps4.setDataRoot(userDataDir());

// A log replaced mid-read is read again a little later, a few times at most.
const UNSTABLE_RETRIES = 5;
// How far up a missing user folder is followed: data/user, then the port folder.
const MAX_PARENT_LEVELS = 3;

const watchers = kit.createWatcherList('ps4recomp', debug);
const retries = kit.createRetrier({ delayMs: 400, attempts: UNSTABLE_RETRIES });
let lifecycle = 0;
const baselines = new Map();
const changes = createChangeCoalescer();

// One record per game across the user's folders, grouped by the user folder their logs are in.
function discover(configFile = kit.userDirFile()) {
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
    const key = pathKey(record.data.userDir);
    if (!groups.has(key)) groups.set(key, { userDir: record.data.userDir, records: [] });
    groups.get(key).records.push(record);
  }
  return [...groups.values()];
}

function payloadFor(record, schema, described, time, delay) {
  return {
    source: ps4.SOURCE,
    appid: record.appid,
    gameDisplayName: schema.name || record.appid,
    achievementName: String(described.name),
    achievementDisplayName: described.displayName,
    achievementDescription: described.description,
    icon: kit.existingIcon(described),
    ...kit.gameArt(schema),
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
    const toast = kit.unlockToastOptions(ctx, { attribution: kit.localized(ctx, 'trophy') });
    await ctx.notify({ ...payloadFor(record, schema, described, time, delay), ...platinumFields(described.type, ctx.options) }, toast);
    delay += 1;
  }
  return true;
}

/*
  Compares what the logs hold now with what was seen: every new line is announced. A log being
  rewritten is read again shortly, never taken as an empty one.
*/
async function handleChange(record, ctx, attempt = 0) {
  try {
    const read = ps4.readUnlocks(record.data);
    if (read.unstable) {
      retries.later(attempt, (next) => changes.run(record.appid, () => handleChange(record, ctx, next)));
      return;
    }
    const previous = baselines.get(record.appid) || new Set();
    const fresh = [...read.unlocked].filter(([id]) => !previous.has(id));
    const copiedIn = previous.size === 0 && fresh.length > kit.COPIED_IN_UNLOCKS;
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

const nearestExisting = (dir) => kit.nearestExistingParent(dir, MAX_PARENT_LEVELS);

function checkGroup(group, ctx) {
  for (const record of group.records) changes.run(record.appid, () => handleChange(record, ctx));
}

const listed = (value) => (Array.isArray(value) ? value : []);

/*
  The folders a group's records read: the log folder, the user folders and the progress folders in
  them (trophies/, trophy/<NP id>/), the session log folders, recursively since a launcher may date
  a folder per session, and the folders of declared logs.
*/
function foldersOf(group) {
  const found = new Map();
  const add = (dir, recursive = false) => {
    if (!dir) return;
    const resolved = path.resolve(String(dir));
    const key = pathKey(resolved);
    found.set(key, { dir: resolved, recursive: recursive || (found.has(key) && found.get(key).recursive) });
  };
  for (const { data } of group.records) {
    add(data.logDir || data.userDir);
    for (const dir of [data.userDir, ...listed(data.progressDirs)].filter(Boolean)) {
      add(dir);
      add(path.join(dir, 'trophies'));
      if (data.npcommid) add(path.join(dir, 'trophy', data.npcommid));
    }
    for (const entry of listed(data.sessionDirs)) add(typeof entry === 'string' ? entry : entry && entry.dir, true);
    for (const file of listed(data.logFiles)) add(path.dirname(String(file)));
  }
  return [...found.values()];
}

function attachLogs(folder, group, ctx) {
  const watcher = watchers.open(folder.dir, { recursive: folder.recursive }, (evt, name) => {
    if (ps4.isProgressName(name)) checkGroup(group, ctx);
  });
  if (watcher) debug.log(`[ps4recomp] watching the unlock records in '${folder.dir}'`);
}

/*
  Folders that do not exist yet: their nearest parent is watched, one level closer each time a level
  appears, and the records are read as soon as a folder itself does. One watcher per parent.
*/
function awaitFolders(parent, folders, group, ctx) {
  const generation = lifecycle;
  let waiting = folders;
  const pending = watchers.open(parent, { recursive: false }, () => {
    if (generation !== lifecycle) return;
    const moved = waiting.filter((folder) => isDirectory(folder.dir) || nearestExisting(folder.dir) !== parent);
    if (moved.length === 0) return;
    waiting = waiting.filter((folder) => !moved.includes(folder));
    if (waiting.length === 0) watchers.close(pending);
    attach(moved, group, ctx);
    if (moved.some((folder) => isDirectory(folder.dir))) checkGroup(group, ctx);
  });
  if (pending) debug.log(`[ps4recomp] waiting for ${folders.length} folder(s) from '${parent}'`);
}

function attach(folders, group, ctx) {
  const waiting = new Map();
  for (const folder of folders) {
    if (isDirectory(folder.dir)) {
      attachLogs(folder, group, ctx);
      continue;
    }
    const parent = nearestExisting(folder.dir);
    if (parent) waiting.set(parent, [...(waiting.get(parent) || []), folder]);
    else debug.log(`[ps4recomp] '${folder.dir}' and its parents are missing, not watched`);
  }
  for (const [parent, list] of waiting) awaitFolders(parent, list, group, ctx);
}

// Tear down and restart from the current options. Gated by the PS4 Recomp source and the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'ps4recomp')) return;

  let groups;
  try {
    groups = discover();
  } catch (err) {
    debug.warn(`[ps4recomp] discovery failed: ${err}`);
    return;
  }
  for (const group of groups) {
    group.records.forEach(seedBaseline);
    attach(foldersOf(group), group, ctx);
  }
};

module.exports.stop = () => {
  lifecycle += 1;
  changes.clear();
  retries.cancel();
  watchers.closeAll();
  baselines.clear();
};

module.exports._internal = { discover, watchedFolders, handleChange, seedBaseline, nearestExisting, foldersOf, baselines };
