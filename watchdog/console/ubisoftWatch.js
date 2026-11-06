'use strict';

// Watch Ubisoft spool files and notify from the cached achievement archive.
// The file readers are the app's own (parser/ubisoftFiles.js), so both sides read the same way.

const fs = require('fs');
const path = require('path');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const moment = require('moment');
const debug = require('../util/log.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const kit = require('./watcherKit.js');
const { loadSchema, readTitles, indexedUplayName, gameNameFor } = require('./ubisoftArchive.js');

const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { readUbisoftSpoolFile, readZipEntries, parseLocalizationText, cleanTitle, defaultSpoolRoot } = require(sharedAppModulePath('parser/ubisoftFiles.js'));

const watchers = kit.createWatcherList('ubisoft', debug);
const changes = createChangeCoalescer();

// [{id, time(unix s)}] - deduped, sorted by time; the library's own spool reader, reshaped.
function readSpool(filePath) {
  return readUbisoftSpoolFile(filePath).records.map((r) => ({ id: String(r.achievementId), time: r.earned_time }));
}

// One folder per Ubisoft account. Each is watched even when it holds no spool yet, since an
// installed game gets its spool only at its first unlock.
function spoolUserDirs(spoolRoot = defaultSpoolRoot()) {
  try {
    return fs
      .readdirSync(spoolRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(spoolRoot, entry.name));
  } catch {
    return [];
  }
}

// The target a spool file name stands for, or null for any other file.
function spoolTarget(name, spoolDir) {
  const match = path.basename(String(name || '')).match(/^(\d+)\.spool$/i);
  return match ? { appid: match[1], spoolDir, spoolFilePath: path.join(spoolDir, match[0]) } : null;
}

function discover(spoolRoot) {
  const targets = [];
  for (const dir of spoolUserDirs(spoolRoot)) {
    let files = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const target = spoolTarget(file, dir);
      if (target) targets.push(target);
    }
  }
  return targets;
}

const baseline = createBaselineCache({ prefix: 'ubisoft', tag: 'ubisoft', debug });
const cacheLoad = (key) => baseline.load(key);
const cacheSave = (key, unlocked) => baseline.save(key, unlocked);

async function handleChange(target, ctx) {
  try {
    await waitForFileStable(target.spoolFilePath);
    const records = readSpool(target.spoolFilePath);
    if (!records.length) return;

    const known = baselineFor(target, cacheLoad(target.appid), records);

    if (known) {
      const prev = new Set(known);
      // schema loaded lazily, only when there is something new to toast
      let schema = null;
      let delay = 0;
      for (const record of records) {
        if (prev.has(record.id)) continue;
        if (!schema) schema = loadSchema(target.appid, ctx.options.achievement.lang) || { texts: new Map(), iconFor: () => undefined };
        const text = schema.texts.get(record.id) || {};
        // The spool holds earned records only, so the total comes from the archive's text list.
        const completion = { unlocked: records.filter((r) => schema.texts.has(r.id)).length, total: schema.texts.size };
        debug.log(`[ubisoft] Unlocked: ${target.name} - ${text.displayName || record.id}`);
        await ctx.notify(
          {
            source: 'Ubisoft Connect',
            appid: target.appid,
            gameDisplayName: target.name,
            achievementName: record.id,
            achievementDisplayName: text.displayName || String(record.id),
            achievementDescription: text.description || '',
            icon: schema.iconFor(record.id),
            time: record.time || moment().unix(),
            delay,
            completion,
          },
          kit.unlockToastOptions(ctx, { attribution: target.name }) // icons are extracted to local files
        );
        delay += 1;
      }
    }

    cacheSave(target.appid, records.map((r) => r.id));
  } catch (err) {
    debug.warn(`[ubisoft] handleChange failed for ${target.appid}: ${err}`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the Ubisoft-official source flag + the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'ubisoftOfficial')) return;

  let targets;
  try {
    targets = discover();
  } catch (err) {
    debug.warn(`[ubisoft] discovery failed: ${err}`);
    return;
  }
  const spoolDirs = spoolUserDirs();
  if (spoolDirs.length === 0) return;

  const titles = readTitles();
  const nameFor = (appid) => gameNameFor(appid, titles);
  for (const target of targets) {
    target.name = nameFor(target.appid);

    // Seed the baseline up front so we never replay a back-catalogue of unlocks on launch.
    if (!cacheLoad(target.appid)) {
      try {
        cacheSave(target.appid, readSpool(target.spoolFilePath).map((r) => r.id));
      } catch (err) {
        debug.warn(`[ubisoft] baseline read failed for ${target.appid}: ${err}`);
      }
    }
  }

  // one watcher per user dir (several spools share it)
  const startedAt = moment().unix();
  for (const spoolDir of spoolDirs) {
    const dirTargets = targets.filter((t) => t.spoolDir === spoolDir);
    const w = watchers.open(spoolDir, { recursive: false, filter: /\.spool$/i }, (evt, name) => {
      if (evt !== 'update' || !name) return;
      const hit = matchSpoolTarget(dirTargets, name, spoolDir, startedAt);
      if (!hit) return;
      if (!hit.name) hit.name = nameFor(hit.appid);
      changes.run(hit.appid, () => handleChange(hit, ctx));
    });
    if (w) debug.log(`[ubisoft] watching ${dirTargets.length} spool(s) in ${spoolDir}`);
  }
};

// The watched target a changed file belongs to. A spool that appeared after the watch started is
// a game's first unlock: it joins the list, flagged so its records from now on are toasted.
function matchSpoolTarget(dirTargets, name, spoolDir, startedAt) {
  const target = spoolTarget(name, spoolDir);
  if (!target) return null;
  const known = dirTargets.find((t) => path.basename(t.spoolFilePath).toLowerCase() === path.basename(target.spoolFilePath).toLowerCase());
  if (known) return known;
  target.firstSeenAfter = startedAt;
  dirTargets.push(target);
  return target;
}

// Without a stored baseline, the records already earned before a new spool was seen; null when the
// spool existed at startup, whose records are a back-catalogue never to be replayed.
function baselineFor(target, cache, records) {
  if (cache && Array.isArray(cache.unlocked)) return cache.unlocked;
  if (!target.firstSeenAfter) return null;
  return records.filter((r) => r.time && r.time < target.firstSeenAfter).map((r) => r.id);
}

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
};

// Exposed for unit testing the pure readers.
module.exports._internal = {
  readSpool,
  readZipEntries,
  parseLocTxt: parseLocalizationText,
  loadSchema,
  discover,
  spoolUserDirs,
  matchSpoolTarget,
  baselineFor,
  readTitles,
  indexedUplayName,
  cleanConfigTitle: cleanTitle,
};
