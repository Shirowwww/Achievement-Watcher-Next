'use strict';

/*
  Watches Xbox 360 profiles copied off a modded console (app/parser/x360Profile.js) under the saved
  folders. Nothing runs on this PC, so an unlock shows up when the profile is copied over again: each
  title is then compared with its baseline and announced like a Xenia unlock. Follows the Xenia switch.
*/

const crypto = require('crypto');
const path = require('path');
const debug = require('../util/log.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const kit = require('./watcherKit.js');
const xeniaWatch = require('./xeniaWatch.js');

const x360Profile = require(sharedAppModulePath('parser/x360Profile.js'));

const watchers = kit.createWatcherList('x360profile', debug);
const changes = createChangeCoalescer();

// One baseline per copy of a profile: two folders may hold the same one. Hashed, so the profile id
// (the file name) stays out of the cache's file names.
const baselineKey = (file, titleId) => `profile_${titleId}_${crypto.createHash('sha1').update(path.resolve(file).toLowerCase()).digest('hex').slice(0, 16)}`;

// Profiles read whole at least once: until then a title has no baseline worth comparing with.
const readable = new Set();

function discover(configFile = kit.userDirFile()) {
  const seen = new Map();
  for (const dir of kit.watchedFolders(configFile)) {
    for (const file of x360Profile.findProfiles(dir)) seen.set(file.toLowerCase(), file);
  }
  return [...seen.values()];
}

function seed(file) {
  const titles = x360Profile.readProfile(file);
  for (const { titleId, list } of titles) {
    const key = baselineKey(file, titleId);
    if (!xeniaWatch.hasBaseline(key)) xeniaWatch.seedBaseline(key, list);
  }
  if (titles.length) readable.add(file.toLowerCase());
}

async function handleChange(file, ctx) {
  try {
    await waitForFileStable(file);
    const titles = x360Profile.readProfile(file);
    // A title new to a profile already read whole was played on the console since: announce it.
    // A profile half-copied when watching began is only baselined by its first whole read.
    const announceNew = readable.has(file.toLowerCase());
    for (const data of titles) {
      await xeniaWatch.announceUnlocks({ key: baselineKey(file, data.titleId), titleId: data.titleId, data, ctx, source: x360Profile.SOURCE, announceNew });
    }
    if (titles.length) readable.add(file.toLowerCase());
  } catch (err) {
    debug.warn(`[x360profile] reading a re-copied profile failed: ${err}`);
  }
}

module.exports.start = async (ctx) => {
  module.exports.stop();
  if (!kit.canStart(ctx, 'xenia')) return;

  let files;
  try {
    files = discover();
  } catch (err) {
    debug.warn(`[x360profile] discovery failed: ${err}`);
    return;
  }
  for (const file of files) {
    try {
      seed(file);
    } catch (err) {
      debug.warn(`[x360profile] baseline seed failed: ${err}`);
    }
    const wanted = path.basename(file).toLowerCase();
    // The folder, not the file: an FTP copy often replaces the file instead of writing into it.
    watchers.open(path.dirname(file), { recursive: false }, (evt, name) => {
      if (evt !== 'update' || path.basename(String(name || '')).toLowerCase() !== wanted) return;
      changes.run(file.toLowerCase(), () => handleChange(file, ctx));
    });
  }
  if (files.length) debug.log(`[x360profile] watching ${files.length} console profile(s)`);
};

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
  readable.clear();
};

module.exports._internal = { discover, seed, handleChange, baselineKey };
