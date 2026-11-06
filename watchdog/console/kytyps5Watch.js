'use strict';

/*
  Watch KytyPS5's _Trophies folders and notify on newly earned trophies.

  The format lives in the app's parser (app/parser/kytyps5.js), loaded through sharedAppModule so
  the library and the notifications read the same files the same way. The emulator rewrites
  _Trophies/<titleId>/trophies_<user>_<label>.json on every unlock (a .tmp file renamed over it).
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
const { watchedFolders } = kit;
const { trophyGradeOf, platinumFields } = require(sharedAppModulePath('parser/trophyGrade.js'));
const { pathKey } = require(sharedAppModulePath('util/winHosts.js'));

const kyty = require(sharedAppModulePath('parser/kytyps5.js'));

// The same icon cache the app parser extracts into, so an icon written by either side serves both.
kyty.setIconRoot(path.join(userDataDir(), 'icon_cache', 'kytyps5'));

// A title's first unlock file carrying more than this is a copied-in save, not a play session.
const NEW_TITLE_NOTIFY_MAX = kit.COPIED_IN_UNLOCKS;

const watchers = kit.createWatcherList('kytyps5', debug);
const changes = createChangeCoalescer();
/*
  The user each title was last read for, and when. Kyty.ini is not watched, so a switch of user is
  only seen at the new user's next unlock: their older trophies are recorded silently, and only what
  was earned since that last read is announced.
*/
const usersSeen = new Map();

// Every title folder present now, game found or not: only one that appears later is new.
function titleIdsOnDisk(root) {
  try {
    return new Set(
      fs
        .readdirSync(path.join(root, kyty.TROPHY_DIR), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name.toUpperCase())
    );
  } catch {
    return new Set();
  }
}

// The other sources' install folders, looked up once per discovery pass and only when needed.
let kytyOptions = kyty.excludingOtherSources(() => watchedFolders());

// Each emulator folder below the user's folders once, with the titles it already has unlocks for.
function discover(configFile = kit.userDirFile()) {
  const roots = new Map();
  kytyOptions = kyty.excludingOtherSources(() => watchedFolders(configFile));
  for (const dir of watchedFolders(configFile)) {
    const root = kyty.emulatorRoot(dir);
    if (!root || roots.has(pathKey(root))) continue;
    let titles = [];
    try {
      titles = kyty.discover(root, kytyOptions);
    } catch (err) {
      debug.warn(`[kytyps5] discovery failed under "${root}": ${err}`);
    }
    roots.set(pathKey(root), { root, titles });
  }
  return [...roots.values()];
}

const baseline = createBaselineCache({ prefix: 'kytyps5', tag: 'kytyps5', debug });
const cacheLoad = (key) => baseline.load(key);
const cacheSave = (key, unlocked) => baseline.save(key, unlocked);

async function announce(title, fresh, ctx) {
  let schema = null;
  try {
    schema = await kyty.getGameData(title, ctx.options.achievement.lang);
  } catch (err) {
    debug.warn(`[kytyps5] cannot read the trophy list of ${title.titleId}: ${err}`);
    return;
  }
  const byId = new Map(schema.achievement.list.map((entry) => [String(entry.name), entry]));
  const gameName = schema.name || title.titleId;
  let delay = 0;
  for (const entry of fresh) {
    const described = byId.get(String(entry.id));
    if (!described) continue;
    debug.log(`[kytyps5] Unlocked: ${gameName} - ${described.displayName}`);
    await ctx.notify(
      {
        source: kyty.SOURCE,
        appid: title.titleId,
        gameDisplayName: gameName,
        achievementName: String(entry.id),
        achievementDisplayName: described.displayName,
        achievementDescription: described.description,
        icon: kit.existingIcon(described),
        ...kit.gameArt(schema),
        trophyGrade: trophyGradeOf(described.type),
        ...platinumFields(described.type, ctx.options),
        time: entry.earned_time || moment().unix(),
        delay,
      },
      kit.unlockToastOptions(ctx, { attribution: kit.localized(ctx, 'trophy') })
    );
    delay += 1;
  }
}

/*
  A title the Watchdog did not know at start has no baseline: its unlock file appeared while it ran,
  so everything in it is new. A title it knew is compared with what was recorded for it.
*/
async function handleChange(title, file, ctx, knownAtStart) {
  try {
    if (file) await waitForFileStable(file);
    const readAt = moment().unix();
    const unlocked = kyty.getAchievements(title);
    const user = kyty.activeUserId(title);
    const seen = usersSeen.get(title.titleId);
    usersSeen.set(title.titleId, { user, at: readAt });
    if (seen && seen.user !== user) {
      const fresh = unlocked.filter((entry) => Number(entry.earned_time) >= seen.at);
      if (fresh.length > 0 && fresh.length <= NEW_TITLE_NOTIFY_MAX) await announce(title, fresh, ctx);
      cacheSave(title.titleId, unlocked.map((entry) => entry.id));
      return;
    }
    const cache = cacheLoad(title.titleId);
    const hasBaseline = !!(cache && Array.isArray(cache.unlocked));
    if (hasBaseline || !knownAtStart.has(title.titleId)) {
      const previous = new Set(hasBaseline ? cache.unlocked.map(String) : []);
      const fresh = unlocked.filter((entry) => !previous.has(String(entry.id)));
      const copiedIn = !hasBaseline && fresh.length > NEW_TITLE_NOTIFY_MAX;
      if (fresh.length > 0 && !copiedIn) await announce(title, fresh, ctx);
    }
    cacheSave(title.titleId, unlocked.map((entry) => entry.id));
  } catch (err) {
    debug.warn(`[kytyps5] handleChange failed for ${title.titleId}: ${err}`);
  }
}

/*
  A title seen before keeps its baseline, minus what is no longer unlocked: a reset made while the
  Watchdog was stopped would otherwise leave those trophies "already seen" and silence them.
*/
function seedBaseline(title) {
  try {
    const unlocked = kyty.getAchievements(title).map((entry) => entry.id);
    usersSeen.set(title.titleId, { user: kyty.activeUserId(title), at: moment().unix() });
    const cache = cacheLoad(title.titleId);
    if (cache && Array.isArray(cache.unlocked)) {
      const still = new Set(unlocked.map(String));
      const kept = cache.unlocked.filter((id) => still.has(String(id)));
      if (kept.length !== cache.unlocked.length) cacheSave(title.titleId, kept);
      return;
    }
    cacheSave(title.titleId, unlocked);
  } catch (err) {
    debug.warn(`[kytyps5] baseline seed failed for ${title.titleId}: ${err}`);
  }
}

// The title an unlock file belongs to, found again when it is one the emulator just created.
function titleFor(target, file) {
  const titleId = path.basename(path.dirname(file)).toUpperCase();
  const known = target.titles.find((title) => title.titleId === titleId);
  if (known) return known;
  const found = kyty.discover(target.root, kytyOptions).find((title) => title.titleId === titleId);
  if (found) target.titles.push(found);
  return found || null;
}

function attachTrophies(target, ctx, knownAtStart) {
  const trophies = path.join(target.root, kyty.TROPHY_DIR);
  const watcher = watchers.open(trophies, { recursive: true }, (evt, name) => {
    if (!kyty.UNLOCKS_FILE.test(path.basename(name || ''))) return;
    const title = titleFor(target, name);
    // A removed file is a reset: the baseline follows it down, so re-earning a trophy announces it.
    if (title) changes.run(title.titleId, () => handleChange(title, evt === 'remove' ? '' : name, ctx, knownAtStart));
  });
  if (watcher) debug.log(`[kytyps5] watching trophies under '${trophies}'`);
  return watcher;
}

// What the emulator wrote between creating _Trophies and the watcher starting has no event to come.
function catchUp(target, ctx, knownAtStart) {
  const trophies = path.join(target.root, kyty.TROPHY_DIR);
  let folders = [];
  try {
    folders = fs.readdirSync(trophies, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return;
  }
  for (const folder of folders) {
    const dir = path.join(trophies, folder.name);
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((name) => kyty.UNLOCKS_FILE.test(name));
    } catch {
      continue;
    }
    if (names.length === 0) continue;
    const file = path.join(dir, names[0]);
    const title = titleFor(target, file);
    if (title) changes.run(title.titleId, () => handleChange(title, file, ctx, knownAtStart));
  }
}

/*
  The emulator creates _Trophies at the first unlock it ever records, so until then its own folder
  is watched for it, and the real watcher takes over the moment it appears.
*/
function attach(target, ctx, knownAtStart) {
  if (fs.existsSync(path.join(target.root, kyty.TROPHY_DIR))) {
    attachTrophies(target, ctx, knownAtStart);
    return;
  }
  const takeOver = () => {
    if (!watchers.includes(pending) || !fs.existsSync(path.join(target.root, kyty.TROPHY_DIR))) return;
    watchers.close(pending);
    const trophies = attachTrophies(target, ctx, knownAtStart);
    if (trophies) trophies.on('ready', () => catchUp(target, ctx, knownAtStart));
    catchUp(target, ctx, knownAtStart);
  };
  const pending = watchers.open(target.root, { recursive: false }, takeOver);
  if (!pending) return;
  // node-watch listens from 'ready' on, a tick later on Linux: what appeared before sends no event.
  pending.on('ready', takeOver);
  debug.log(`[kytyps5] no trophies yet - waiting for one in '${target.root}'`);
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the KytyPS5 source flag and the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'kytyps5')) return;

  let targets;
  try {
    targets = discover();
  } catch (err) {
    debug.warn(`[kytyps5] discovery failed: ${err}`);
    return;
  }

  for (const target of targets) {
    // Seeded up front so nothing already earned is replayed on launch. A game with no unlock folder
    // yet has no baseline: its first unlock is new, and a big copied-in save is still told apart.
    const onDisk = titleIdsOnDisk(target.root);
    target.titles.filter((title) => onDisk.has(title.titleId)).forEach(seedBaseline);
    attach(target, ctx, onDisk);
  }
};

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
};

module.exports._internal = { catchUp, usersSeen, discover, watchedFolders, iconPathOf, handleChange, titleFor, titleIdsOnDisk, seedBaseline };
