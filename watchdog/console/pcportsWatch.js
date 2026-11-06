'use strict';

/*
  Notifies on the unlocks of a PC port found under the user's Folders, read by the app's own parser
  so the library and the notifications agree. A file present at start is a silent baseline; one
  that does not exist yet is waited for, and everything true in it afterwards is new.
*/

const fs = require('fs');
const path = require('path');
const { iconPathOf } = require('../util/iconPath.js');
const moment = require('moment');
const debug = require('../util/log.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const kit = require('./watcherKit.js');
const { watchedFolders, resolveWatchTarget } = kit;

const pcports = require(sharedAppModulePath('parser/pcports.js'));

pcports.setDataRoot(userDataDir());

const watchers = kit.createWatcherList('pcports', debug);
const changes = createChangeCoalescer();
const baseline = createBaselineCache({ prefix: 'pcports', tag: 'pcports', debug });
const cacheLoad = () => baseline.load(pcports.APPID);
const cacheSave = (unlocked) => baseline.save(pcports.APPID, unlocked);

// One title here: the first watched folder that holds the install wins.
function discoverGame(configFile = kit.userDirFile()) {
  for (const dir of watchedFolders(configFile)) {
    try {
      const found = pcports.discover(dir);
      if (found) return found;
    } catch (err) {
      debug.warn(`[pcports] discovery failed under "${dir}": ${err}`);
    }
  }
  return null;
}

// False when the schema could not be read: the baseline then stays, and the unlocks are retried.
async function announce(game, fresh, ctx, earned = fresh) {
  let schema = null;
  try {
    schema = await pcports.getGameData({ root: game.root }, ctx.options.achievement.lang);
  } catch (err) {
    debug.warn(`[pcports] cannot read the achievement list: ${err}`);
    return false;
  }
  const byId = new Map(schema.achievement.list.map((entry) => [String(entry.name), entry]));
  const now = moment().unix();
  const completion = { unlocked: earned.filter((id) => byId.has(String(id))).length, total: byId.size };
  pcports.recordObservedTimes(fresh, now);
  let delay = 0;
  for (const id of fresh) {
    const described = byId.get(id);
    if (!described) continue;
    debug.log(`[pcports] Unlocked: ${schema.name} - ${described.displayName}`);
    const icon = iconPathOf(described);
    await ctx.notify(
      {
        source: pcports.SOURCE,
        appid: pcports.APPID,
        gameDisplayName: schema.name,
        achievementName: id,
        achievementDisplayName: described.displayName,
        achievementDescription: described.description,
        icon: icon || undefined,
        time: now,
        delay,
        completion,
      },
      kit.unlockToastOptions(ctx)
    );
    delay += 1;
  }
  return true;
}

/*
  A removed file is a reset: the baseline follows it down, so earning an achievement again announces
  it. A save rewritten as delete-then-create is missing for a moment too, so only a file still gone
  a moment later counts; taking that moment for a reset would replay every achievement in it.
*/
async function handleChange(game, file, ctx, removed = false) {
  try {
    if (removed && (await kit.stillGone([file]))) {
      cacheSave([]);
      return;
    }
    await waitForFileStable(file);
    // Locked or half written: keeping that as the baseline would replay everything on the next write.
    const unlocked = pcports.earnedIds(file);
    if (unlocked === null) return;
    const cache = cacheLoad();
    const hasBaseline = !!(cache && Array.isArray(cache.unlocked));
    const previous = new Set(hasBaseline ? cache.unlocked.map(String) : []);
    // An empty baseline, the start or a reset, then a full file at once: a save copied back in.
    const copiedIn = previous.size === 0 && unlocked.length > kit.COPIED_IN_UNLOCKS;
    const fresh = copiedIn ? [] : unlocked.filter((id) => !previous.has(id));
    if (fresh.length > 0 && !(await announce(game, fresh, ctx, unlocked))) return;
    cacheSave(unlocked);
  } catch (err) {
    debug.warn(`[pcports] handleChange failed: ${err}`);
  }
}

/*
  The baseline of an unlock file already on disk, silently. One recorded before keeps what it had,
  minus what the file no longer holds, so a reset made while the Watchdog was stopped does not
  silence the achievements earned again.
*/
function seedBaseline(file) {
  const unlocked = pcports.earnedIds(file);
  if (unlocked === null) return;
  const cache = cacheLoad();
  if (!cache || !Array.isArray(cache.unlocked)) {
    cacheSave(unlocked);
    return;
  }
  const still = new Set(unlocked);
  const kept = cache.unlocked.filter((id) => still.has(String(id)));
  if (kept.length !== cache.unlocked.length) cacheSave(kept);
}

function watchFile(game, ctx) {
  const dir = path.dirname(game.progressFile);
  const name = path.basename(game.progressFile).toLowerCase();
  const watcher = watchers.open(dir, { recursive: false }, (evt, changed) => {
    if (path.basename(String(changed || '')).toLowerCase() !== name) return;
    changes.run(pcports.APPID, () => handleChange(game, game.progressFile, ctx, evt === 'remove'));
  });
  if (watcher) debug.log(`[pcports] watching '${game.progressFile}'`);
}

/*
  The game makes Zelda_LA (or the portable file) when it first saves. Until its folder exists the
  nearest existing folder above is watched for the next segment, and the file is read the moment
  its own folder appears, in case the game wrote it before the real watcher was attached.
*/
function attach(game, ctx) {
  const target = resolveWatchTarget(path.dirname(game.progressFile));
  if (target.ready) {
    watchFile(game, ctx);
    if (fs.existsSync(game.progressFile)) changes.run(pcports.APPID, () => handleChange(game, game.progressFile, ctx));
    return;
  }
  if (!target.watchDir) return;
  if (kit.awaitSegment(watchers, target, () => attach(game, ctx))) {
    debug.log(`[pcports] '${game.progressFile}' does not exist yet - waiting under '${target.watchDir}'`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the PC port source flag and the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'pcports')) return;

  let game;
  try {
    game = discoverGame();
  } catch (err) {
    debug.warn(`[pcports] discovery failed: ${err}`);
    return;
  }
  if (!game) return;

  seedBaseline(game.progressFile);
  attach(game, ctx);
};

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
};

module.exports._internal = { watchedFolders, discoverGame, handleChange, seedBaseline, resolveWatchTarget, attach };
