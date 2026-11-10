'use strict';

/*
  Notifies on the trophies PS3Recomp ports save in <gamedata>/trophies/<NPWRnnnnn>.json, read by
  the app's own parser so the library and the notifications agree. The runtime creates that folder
  with the first unlock: its nearest existing parent is watched until it appears. File events, no
  polling.
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

const ps3 = require(sharedAppModulePath('parser/ps3Recomp.js'));

// The same icon cache as the app, so whatever either side wrote serves both.
ps3.setDataRoot(userDataDir());

// A file caught mid-rewrite is read again a little later, a few times at most.
const UNSTABLE_RETRIES = 5;
// How far up a missing trophies folder is followed: gamedata, then the port's working folder.
const MAX_PARENT_LEVELS = 3;

const watchers = kit.createWatcherList('ps3recomp', debug);
const retries = kit.createRetrier({ delayMs: 400, attempts: UNSTABLE_RETRIES });
let lifecycle = 0;
const baselines = new Map();
const changes = createChangeCoalescer();

// One record per game across the user's folders.
function discover(configFile = kit.userDirFile()) {
  const records = new Map();
  for (const dir of kit.portWatchFolders(configFile)) {
    try {
      for (const record of ps3.scan(dir)) if (!records.has(record.appid)) records.set(record.appid, record);
    } catch (err) {
      debug.warn(`[ps3recomp] discovery failed under "${dir}": ${err}`);
    }
  }
  return [...records.values()];
}

// The folders the records' unlock files are in, each with the records it holds.
function foldersOf(records) {
  const found = new Map();
  for (const record of records) {
    if (!record.data.progressFile) continue;
    const dir = path.dirname(String(record.data.progressFile));
    if (!found.has(pathKey(dir))) found.set(pathKey(dir), { dir: path.resolve(dir), records: [] });
    found.get(pathKey(dir)).records.push(record);
  }
  return [...found.values()];
}

function payloadFor(record, schema, described, time, delay) {
  return {
    source: ps3.SOURCE,
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
    const toast = kit.unlockToastOptions(ctx, { attribution: kit.localized(ctx, 'trophy') });
    await ctx.notify({ ...payloadFor(record, schema, described, time, delay), ...platinumFields(described.type, ctx.options) }, toast);
    delay += 1;
  }
  return true;
}

// Announces what the file holds now and was not seen; a file being rewritten is read again shortly.
async function handleChange(record, ctx, attempt = 0) {
  try {
    const read = ps3.readUnlocks(record.data);
    if (read.unstable) {
      retries.later(attempt, (next) => changes.run(record.appid, () => handleChange(record, ctx, next)));
      return;
    }
    const previous = baselines.get(record.appid) || new Set();
    const fresh = [...read.unlocked].filter(([id]) => !previous.has(id));
    const copiedIn = previous.size === 0 && fresh.length > kit.COPIED_IN_UNLOCKS;
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

const nearestExisting = (dir) => kit.nearestExistingParent(dir, MAX_PARENT_LEVELS);

function checkFolder(folder, ctx) {
  for (const record of folder.records) changes.run(record.appid, () => handleChange(record, ctx));
}

/*
  The trophies folder when it exists; else its nearest parent, re-attached one level closer each
  time a level appears. The records are read as soon as the folder itself does.
*/
function attach(folder, ctx) {
  if (isDirectory(folder.dir)) {
    const watcher = watchers.open(folder.dir, { recursive: false }, (evt, name) => {
      if (!name || ps3.isProgressName(name)) checkFolder(folder, ctx);
    });
    if (watcher) debug.log(`[ps3recomp] watching the unlock files in '${folder.dir}'`);
    return;
  }
  const parent = nearestExisting(folder.dir);
  if (!parent) {
    debug.log(`[ps3recomp] '${folder.dir}' and its parents are missing, not watched`);
    return;
  }
  const generation = lifecycle;
  const pending = watchers.open(parent, { recursive: false }, () => {
    if (generation !== lifecycle || (!isDirectory(folder.dir) && nearestExisting(folder.dir) === parent)) return;
    watchers.close(pending);
    attach(folder, ctx);
    if (isDirectory(folder.dir)) checkFolder(folder, ctx);
  });
  if (pending) debug.log(`[ps3recomp] waiting for '${folder.dir}' from '${parent}'`);
}

// Tear down and restart from the current options. Gated by the PS3 Recomp source and the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'ps3recomp')) return;

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
  retries.cancel();
  watchers.closeAll();
  baselines.clear();
};

module.exports._internal = { discover, watchedFolders, foldersOf, handleChange, seedBaseline, nearestExisting, baselines, watcherCount: () => watchers.size };
