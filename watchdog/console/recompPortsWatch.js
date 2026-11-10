'use strict';

/*
  Notifies on the unlocks of the recompiled ports app/parser/recompPorts.js knows (Dusklight,
  Ghostship, DKR-R...), read by the app's own parser so the library and the notifications agree.
  The same rules as pcportsWatch.js: a file present at start is a silent baseline, one that does not
  exist yet is waited for, a file first seen full was copied in, and a removed file is a reset.
*/

const fs = require('fs');
const path = require('path');
const moment = require('moment');
const debug = require('../util/log.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { iconPathOf } = require('../util/iconPath.js');
const kit = require('./watcherKit.js');

const ports = require(sharedAppModulePath('parser/recompPorts.js'));

ports.setDataRoot(userDataDir());

const watchers = kit.createWatcherList('recompports', debug);
const changes = createChangeCoalescer();
const baseline = createBaselineCache({ prefix: 'recompports', tag: 'recompports', debug });

// Every port to watch, once: those under the user's Folders first, then the game libraries', Quiver's and the saves found.
function discoverGames() {
  const games = new Map();
  for (const dir of kit.portWatchFolders()) {
    try {
      for (const entry of ports.scan(dir, { waiting: true })) if (!games.has(entry.data.port)) games.set(entry.data.port, entry);
    } catch (err) {
      debug.warn(`[recompports] discovery failed under "${dir}": ${err}`);
    }
  }
  for (const entry of ports.knownEntries()) if (!games.has(entry.data.port)) games.set(entry.data.port, entry);
  return [...games.values()].filter((entry) => entry.data.saveFile);
}

// False when the list could not be read: the baseline then stays, and the unlocks are retried.
async function announce(game, fresh, ctx, earned = fresh) {
  let schema = null;
  try {
    schema = await ports.getGameData(game.data);
  } catch (err) {
    debug.warn(`[recompports] cannot read the achievement list: ${err}`);
    return false;
  }
  const byId = new Map(schema.achievement.list.map((entry) => [String(entry.name), entry]));
  const now = moment().unix();
  const completion = { unlocked: earned.filter((id) => byId.has(String(id))).length, total: byId.size };
  ports.recordObservedTimes(game.data.port, fresh, now);
  let delay = 0;
  for (const id of fresh) {
    const described = byId.get(id);
    if (!described) continue;
    debug.log(`[recompports] Unlocked: ${schema.name} - ${described.displayName}`);
    // A cut sheet cell is an SVG, which a Windows toast does not draw: only a PNG goes with it.
    const icon = iconPathOf(described);
    await ctx.notify(
      {
        source: ports.SOURCE,
        appid: game.appid,
        gameDisplayName: schema.name,
        achievementName: id,
        achievementDisplayName: described.displayName,
        achievementDescription: described.description,
        icon: /\.png$/i.test(icon) ? icon : undefined,
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

// The files of a game: its slots, or its one unlock file.
const filesOf = (game) => (Array.isArray(game.data.saveFiles) && game.data.saveFiles.length > 0 ? game.data.saveFiles : [game.data.saveFile]);

// A removed slot is a reset only when every slot of the game is gone.
async function handleChange(game, ctx, file, removed = false) {
  try {
    if (removed) {
      if (await kit.stillGone(filesOf(game))) {
        baseline.save(game.appid, []);
        return;
      }
    } else {
      await waitForFileStable(file);
    }
    // Locked or half written: keeping that as the baseline would replay everything on the next write.
    const unlocked = ports.earnedIdsFor(game.data);
    if (unlocked === null) return;
    const cache = baseline.load(game.appid);
    const previous = new Set(cache && Array.isArray(cache.unlocked) ? cache.unlocked.map(String) : []);
    const copiedIn = previous.size === 0 && unlocked.length > kit.COPIED_IN_UNLOCKS;
    const fresh = copiedIn ? [] : unlocked.filter((id) => !previous.has(id));
    if (fresh.length > 0 && !(await announce(game, fresh, ctx, unlocked))) return;
    baseline.save(game.appid, unlocked);
  } catch (err) {
    debug.warn(`[recompports] handleChange failed: ${err}`);
  }
}

// The baseline of a file already on disk, silently; one kept from before loses what the file no longer holds.
function seedBaseline(game) {
  const unlocked = ports.earnedIdsFor(game.data);
  if (unlocked === null) return;
  const cache = baseline.load(game.appid);
  if (!cache || !Array.isArray(cache.unlocked)) {
    baseline.save(game.appid, unlocked);
    return;
  }
  const still = new Set(unlocked);
  const kept = cache.unlocked.filter((id) => still.has(String(id)));
  if (kept.length !== cache.unlocked.length) baseline.save(game.appid, kept);
}

function watchFile(game, ctx) {
  const dir = path.dirname(game.data.saveFile);
  const names = new Set(filesOf(game).map((file) => path.basename(file).toLowerCase()));
  const watcher = watchers.open(dir, { recursive: false }, (evt, changed) => {
    if (!names.has(path.basename(String(changed || '')).toLowerCase())) return;
    changes.run(game.appid, () => handleChange(game, ctx, String(changed), evt === 'remove'));
  });
  if (watcher) debug.log(`[recompports] watching '${game.data.saveFile}'`);
}

// Until the save's folder exists, the nearest existing folder above it waits for the next segment.
function attach(game, ctx) {
  const target = kit.resolveWatchTarget(path.dirname(game.data.saveFile));
  if (target.ready) {
    watchFile(game, ctx);
    const present = filesOf(game).find((file) => fs.existsSync(file));
    if (present) changes.run(game.appid, () => handleChange(game, ctx, present));
    return;
  }
  if (!target.watchDir) return;
  if (kit.awaitSegment(watchers, target, () => attach(game, ctx))) {
    debug.log(`[recompports] '${game.data.saveFile}' does not exist yet - waiting under '${target.watchDir}'`);
  }
}

// Restarted on every settings reload. Gated, like pcportsWatch, by the PC port source and notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();
  if (!kit.canStart(ctx, 'pcports')) return;

  let games = [];
  try {
    games = discoverGames();
  } catch (err) {
    debug.warn(`[recompports] discovery failed: ${err}`);
    return;
  }
  for (const game of games) {
    seedBaseline(game);
    attach(game, ctx);
  }
};

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
};

module.exports._internal = { discoverGames, handleChange, seedBaseline, attach };
