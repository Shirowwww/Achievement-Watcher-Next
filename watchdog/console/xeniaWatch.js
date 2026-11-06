'use strict';

// Watch Xenia's per-title GPD files and notify on newly earned achievements.
// The schema, icons and unlock state are read from the same binary file.

const fs = require('fs');
const path = require('path');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const moment = require('moment');
const debug = require('../util/log.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const kit = require('./watcherKit.js');

const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
// Same icon cache the app parser extracts into - icons written by either side are shared.
const iconCacheRoot = path.join(userDataDir(), 'icon_cache/xenia');

const xenia = require(sharedAppModulePath('parser/xenia.js'));

const watchers = kit.createWatcherList('xenia', debug);
const changes = createChangeCoalescer();

// One GPD read the way the library reads it: { title, list, imagesById }.
function read(gpdPath) {
  return xenia.readGpd(fs.readFileSync(gpdPath), gpdPath);
}

// Best-effort: make sure the achievement's embedded PNG exists in the shared icon cache and return
// its path ('' when unavailable). The app parser writes the same <titleId>/<imageId>.png layout.
function ensureIcon(titleId, imageId, imagesById) {
  try {
    const iconDir = path.join(iconCacheRoot, titleId);
    const iconPath = path.join(iconDir, `${imageId}.png`);
    if (fs.existsSync(iconPath)) return iconPath;
    const buf = imagesById && imagesById.get(String(imageId));
    if (!buf || buf.length === 0) return '';
    fs.mkdirSync(iconDir, { recursive: true });
    fs.writeFileSync(iconPath, buf);
    return iconPath;
  } catch {
    return '';
  }
}

// Discover per-title achievement GPDs under the user's saved folders (cfg/userdir.db - the same list
// the app scans), in both layouts app/parser/xenia.js reads.
function discover(configFile = kit.userDirFile()) {
  const targets = [];
  const seen = new Set();
  const userDirs = kit.watchedFolders(configFile);

  const subdirs = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  };
  const add = (titleId, dataDir, gpdPath) => {
    if (seen.has(titleId.toLowerCase())) return;
    targets.push({ titleId, dataDir, gpdPath });
    seen.add(titleId.toLowerCase());
  };
  // Older builds: <titleID>/00000001/<titleID>.gpd. Only the title's own GPD carries its achievements.
  const legacyTitle = (titleDir) => {
    const titleId = path.basename(titleDir);
    const dataDir = path.join(titleDir, '00000001');
    for (const name of [`${titleId}.gpd`, `${titleId}.GPD`]) {
      if (fs.existsSync(path.join(dataDir, name))) return add(titleId, dataDir, path.join(dataDir, name));
    }
  };
  // Canary profile package: <XUID>/FFFE07D1/00010000/<XUID>/<titleID>.gpd beside the dashboard's FFFE07D1.gpd.
  const profileFolder = (profileDir) => {
    if (!/^[0-9a-f]{16}$/i.test(path.basename(profileDir))) return;
    let names;
    try {
      names = fs.readdirSync(profileDir);
    } catch {
      return;
    }
    for (const name of names) {
      const match = /^([0-9a-f]{8})\.gpd$/i.exec(name);
      if (match && match[1].toLowerCase() !== 'fffe07d1') add(match[1], profileDir, path.join(profileDir, name));
    }
  };
  const xuidFolder = (xuidDir) => {
    const packages = path.join(xuidDir, 'FFFE07D1', '00010000');
    for (const profile of subdirs(packages)) profileFolder(path.join(packages, profile));
    for (const titleId of subdirs(xuidDir)) legacyTitle(path.join(xuidDir, titleId));
  };

  for (const dir of userDirs) {
    const content = path.basename(dir).toLowerCase() === 'content' ? dir : path.join(dir, 'content');
    for (const xuid of subdirs(content)) xuidFolder(path.join(content, xuid));
    // A folder picked inside the tree: the profile folder, a XUID folder or a legacy title folder.
    profileFolder(dir);
    if (/^[0-9a-f]{16}$/i.test(path.basename(dir))) xuidFolder(dir);
    if (/^[0-9a-f]{8}$/i.test(path.basename(dir))) legacyTitle(dir);
  }
  return targets;
}

const baseline = createBaselineCache({ prefix: 'xenia', tag: 'xenia', debug });
const cacheLoad = (key) => baseline.load(key);
const cacheSave = (key, unlocked) => baseline.save(key, unlocked);

// Xenia can rewrite the same GPD several times per unlock.
const isDuplicateUnlock = kit.createDuplicateGuard();

async function handleChange(target, ctx) {
  try {
    await waitForFileStable(target.gpdPath);

    const data = read(target.gpdPath);
    if (!data || data.list.length === 0) return;
    const gameName = data.title || target.titleId;

    const achievedNow = data.list.filter((a) => a.achieved);
    const cache = cacheLoad(target.titleId);
    const isFirstObservation = !cache || !Array.isArray(cache.unlocked);

    // First observation: record the baseline silently so a pre-existing profile full of earned
    // achievements doesn't toast on startup. Only real unlocks afterwards notify.
    if (!isFirstObservation) {
      const prev = new Set(cache.unlocked.map(String));
      let delay = 0;
      for (const a of achievedNow) {
        if (prev.has(String(a.id))) continue;
        if (isDuplicateUnlock(target.titleId, a.id)) continue;
        debug.log(`[xenia] Unlocked: ${gameName} - ${a.displayName}`);
        const iconPath = ensureIcon(target.titleId, a.imageId, data.imagesById);
        await ctx.notify(
          {
            source: 'Xenia Emulator',
            appid: target.titleId,
            gameDisplayName: gameName,
            achievementName: String(a.id),
            achievementDisplayName: a.displayName,
            achievementDescription: a.description,
            icon: iconPath || undefined,
            time: a.time || moment().unix(),
            delay,
            completion: { unlocked: achievedNow.length, total: data.list.length },
          },
          kit.unlockToastOptions(ctx, { attribution: kit.gamerscoreAttribution(ctx, a.gamerscore) })
        );
        delay += 1;
      }
    }

    cacheSave(target.titleId, achievedNow.map((a) => a.id));
  } catch (err) {
    debug.warn(`[xenia] handleChange failed for ${target.titleId}: ${err}`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the Xenia source flag + the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'xenia')) return;

  let targets;
  try {
    targets = discover();
  } catch (err) {
    debug.warn(`[xenia] discovery failed: ${err}`);
    return;
  }
  if (targets.length === 0) return;

  for (const target of targets) {
    // Seed the baseline up front so we never replay a back-catalogue of unlocks on launch.
    if (!cacheLoad(target.titleId)) {
      try {
        const data = read(target.gpdPath);
        if (data) cacheSave(target.titleId, data.list.filter((a) => a.achieved).map((a) => a.id));
      } catch (err) {
        debug.warn(`[xenia] baseline seed failed for ${target.titleId}: ${err}`);
      }
    }
    const wantedFile = path.basename(target.gpdPath).toLowerCase();
    const w = watchers.open(target.dataDir, { recursive: false }, (evt, name) => {
      if (evt !== 'update') return;
      // Only the title's own GPD matters - Xenia touching sibling files must not re-trigger.
      if (String(path.basename(name || '')).toLowerCase() !== wantedFile) return;
      changes.run(target.titleId, () => handleChange(target, ctx));
    });
    if (w) debug.log(`[xenia] watching achievements for ${target.titleId}`);
  }
};

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
};

// Exposed for unit testing the pure reader.
module.exports._internal = { read, discover };
