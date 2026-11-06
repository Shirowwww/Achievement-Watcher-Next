'use strict';

/*
  Watch RUNE's Ubisoft Connect emulator saves and notify on newly earned achievements.

  The file layout and parser are the app's own (app/parser/runeUplay.js, loaded through
  sharedAppModule); names and icons come from Ubisoft's achievement archive, read by the same
  loader the Ubisoft Connect watcher uses. Saves already on disk at startup are the baseline.
  A root that does not exist yet is waited for from its nearest existing ancestor.
*/

const path = require('path');
const moment = require('moment');
const debug = require('../util/log.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const kit = require('./watcherKit.js');
const ubisoftArchive = require('./ubisoftArchive.js');

const runeUplay = require(sharedAppModulePath('parser/runeUplay.js'));
const { pathKey } = require(sharedAppModulePath('util/winHosts.js'));

const watchers = kit.createWatcherList('rune-uplay', debug);
const changes = createChangeCoalescer();
const baseline = createBaselineCache({ prefix: 'rune-uplay', tag: 'rune-uplay', debug });

// <achievements>\<user>\<product>\achievements.cfg -> { userId, uplayId }, or null for anything else.
function identify(file) {
  const parts = path.resolve(String(file || '')).split(path.sep);
  if (parts.length < 4 || parts[parts.length - 1].toLowerCase() !== runeUplay.CFG_NAME) return null;
  const uplayId = runeUplay.normalizeAchievementId(parts[parts.length - 2]);
  const userId = parts[parts.length - 3];
  return uplayId && userId ? { userId, uplayId } : null;
}

const earnedIds = (snapshot) =>
  Object.entries(snapshot)
    .filter(([, entry]) => entry.earned)
    .sort((a, b) => a[1].earned_time - b[1].earned_time)
    .map(([id]) => id);

async function notifyUnlocks(identity, fresh, snapshot, ctx) {
  const schema = ubisoftArchive.loadSchema(identity.uplayId, ctx.options.achievement.lang) || { texts: new Map(), iconFor: () => undefined };
  const gameName = ubisoftArchive.gameNameFor(identity.uplayId);
  // The cfg may list only the touched achievements, so the total is the archive's text list.
  const completion = { unlocked: earnedIds(snapshot).filter((id) => schema.texts.has(id)).length, total: schema.texts.size };
  let delay = 0;
  for (const id of fresh) {
    const text = schema.texts.get(id) || {};
    debug.log(`[rune-uplay] Unlocked: ${gameName} - ${text.displayName || id}`);
    await ctx.notify(
      {
        source: runeUplay.SOURCE,
        appid: `uplay-${identity.uplayId}`,
        gameDisplayName: gameName,
        achievementName: id,
        achievementDisplayName: text.displayName || id,
        achievementDescription: text.description || '',
        icon: schema.iconFor(id),
        time: snapshot[id].earned_time || moment().unix(),
        delay,
        completion,
      },
      kit.unlockToastOptions(ctx, { attribution: gameName })
    );
    delay += 1;
  }
}

async function handleChange(file, ctx) {
  try {
    const identity = identify(file);
    if (!identity) return;
    await waitForFileStable(file);

    // An unreadable or half-written file must not become the baseline, or every unlock replays.
    const read = runeUplay.readAchievementsFile(file);
    if (!read.valid) {
      debug.warn(`[rune-uplay] ${file} unreadable (${read.reason})`);
      return;
    }
    const earned = earnedIds(read.snapshot);
    const key = `${identity.userId}_${identity.uplayId}`;
    const cache = baseline.load(key);
    const isNewSave = !cache || !Array.isArray(cache.unlocked);

    // A save first seen mid-session with that many unlocks was copied in, not earned.
    if (isNewSave && earned.length > kit.COPIED_IN_UNLOCKS) {
      baseline.save(key, earned);
      return;
    }
    const previous = new Set(isNewSave ? [] : cache.unlocked.map(String));
    const fresh = earned.filter((id) => !previous.has(id));
    if (fresh.length > 0) await notifyUnlocks(identity, fresh, read.snapshot, ctx);
    baseline.save(key, earned);
  } catch (err) {
    debug.warn(`[rune-uplay] handleChange failed for ${file}: ${err}`);
  }
}

function watchAchievements(root, ctx) {
  const watcher = watchers.open(root, { recursive: true }, (evt, name) => {
    if (evt !== 'update') return;
    const file = String(name || '');
    if (!identify(file)) return;
    changes.run(file, () => handleChange(file, ctx));
  });
  if (watcher) debug.log(`[rune-uplay] watching '${root}'`);
}

function attach(root, ctx) {
  const target = kit.resolveWatchTarget(root);
  if (target.ready) {
    watchAchievements(target.dir, ctx);
    return;
  }
  if (!target.watchDir) return;
  if (kit.awaitSegment(watchers, target, () => attach(root, ctx))) {
    debug.log(`[rune-uplay] '${root}' does not exist yet - waiting under '${target.watchDir}'`);
  }
}

function seedBaselines(roots) {
  for (const entry of runeUplay.discoverFiles(roots)) {
    const key = `${entry.userId}_${entry.uplayId}`;
    if (baseline.load(key)) continue;
    const read = runeUplay.readAchievementsFile(entry.file);
    if (read.valid) baseline.save(key, earnedIds(read.snapshot));
  }
}

// Folders the user added under Settings > Folders that are, or hold, a RUNE Ubisoft Connect tree.
function addedRoots(configFile = kit.userDirFile()) {
  return kit.watchedFolders(configFile).filter((dir) => typeof dir === 'string' && runeUplay.resolveAchievementsRoot(dir));
}

// The same folder reached twice (default root, added root, its achievements child) is one watch.
function uniqueAchievementsRoots(roots) {
  const seen = new Set();
  const out = [];
  for (const root of roots) {
    const resolved = runeUplay.resolveAchievementsRoot(root);
    if (!resolved || seen.has(pathKey(resolved))) continue;
    seen.add(pathKey(resolved));
    out.push(resolved);
  }
  return out;
}

// Safe to call on every settings reload. Gated by the RUNE (Uplay R2) source switch and the
// notification master switch.
module.exports.start = async (ctx, roots = [...runeUplay.defaultRoots(), ...addedRoots()]) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'runeUplay')) return;

  const achievementsRoots = uniqueAchievementsRoots(roots);
  try {
    seedBaselines(roots);
  } catch (err) {
    debug.warn(`[rune-uplay] baseline seed failed: ${err}`);
  }
  for (const root of achievementsRoots) attach(root, ctx);
};

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
};

module.exports._internal = {
  addedRoots,
  uniqueAchievementsRoots,
  identify,
  earnedIds,
  resolveWatchTarget: kit.resolveWatchTarget,
  handleChange,
  seedBaselines,
  baseline,
};
