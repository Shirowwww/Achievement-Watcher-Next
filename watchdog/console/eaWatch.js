'use strict';

// Watch EA Desktop's verbose log and notify on achievements seen after the baseline.

const fs = require('fs');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const moment = require('moment');
const debug = require('../util/log.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const kit = require('./watcherKit.js');

const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const ea = require(sharedAppModulePath('parser/ea.js'));

const watchers = kit.createWatcherList('ea', debug);
const changes = createChangeCoalescer();

// The library's reader of the log; the library counts times in ms, notifications in seconds.
function readStates(logsRoot = ea.defaultEaLogsRoot()) {
  return ea.readEaAchievementStates(logsRoot).map(({ entry, snapshot }) => ({
    entry: { ...entry, name: entry.gameName || entry.appid },
    unlocked: new Map(Object.entries(snapshot).map(([id, state]) => [id, Math.floor((state.earned_time || 0) / 1000)])),
  }));
}

function cacheKey(entry) {
  return `${entry.appid}-${String(entry.achievementSet || '').replace(/[^\w.-]/g, '_')}`;
}

const baseline = createBaselineCache({ prefix: 'ea', tag: 'ea', debug });
// EA keys a baseline on the game AND its achievement set, so the key is built before it goes in.
const cacheLoad = (entry) => baseline.load(cacheKey(entry));
const cacheSave = (entry, unlocked) => baseline.save(cacheKey(entry), unlocked);

function unlockEvent(entry, achievement, time, delay, completion) {
  return {
    source: 'EA Desktop',
    appid: entry.appid,
    gameDisplayName: entry.name,
    achievementName: achievement.id,
    achievementDisplayName: achievement.name || achievement.id,
    achievementDescription: achievement.description || achievement.howTo,
    icon: achievement.imageId ? `${ea.EA_ICON_BASE}/${ea.normalizeEaImageId(achievement.imageId)}-208.png` : undefined,
    time: time || moment().unix(),
    delay,
    completion,
  };
}

async function handleChange(changedFile, ctx) {
  try {
    if (changedFile) await waitForFileStable(changedFile);
    let delay = 0;

    for (const { entry, unlocked } of readStates()) {
      const cache = cacheLoad(entry);
      const isFirstObservation = !cache || !Array.isArray(cache.unlocked);
      const prev = new Set(isFirstObservation ? [] : cache.unlocked.map(String));
      const unlockedNow = new Set(Array.from(unlocked.keys()).map(String));
      const completion = { unlocked: entry.achievements.filter((a) => unlockedNow.has(String(a.id))).length, total: entry.achievements.length };

      if (!isFirstObservation) {
        for (const achId of unlockedNow) {
          if (prev.has(achId)) continue;
          const achievement = entry.achievements.find((a) => a.id === achId);
          if (!achievement) continue;
          debug.log(`[ea] Unlocked: ${entry.name} - ${achievement.name || achId}`);
          // The icons are EA CDN urls, fetched ahead only when the user asked for it.
          await ctx.notify(
            unlockEvent(entry, achievement, unlocked.get(achId), delay, completion),
            kit.unlockToastOptions(ctx, { attribution: kit.localized(ctx, 'eaAchievement'), prefetch: kit.iconPrefetch(ctx) })
          );
          delay += 1;
        }
      }

      cacheSave(entry, unlockedNow);
    }
  } catch (err) {
    debug.warn(`[ea] handleChange failed: ${err}`);
  }
}

module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'ea')) return;
  const logsRoot = ea.defaultEaLogsRoot();
  if (!logsRoot || !fs.existsSync(logsRoot)) return;

  await handleChange(null, ctx);

  const w = watchers.open(logsRoot, { recursive: false, filter: /EADesktopVerbose\.(log|bak)$/i }, (evt, name) => {
    if (evt !== 'update') return;
    changes.run('ea-log', () => handleChange(name, ctx));
  });
  if (w) debug.log(`[ea] watching ${logsRoot}`);
};

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
};

module.exports._internal = { readStates, cacheKey };
