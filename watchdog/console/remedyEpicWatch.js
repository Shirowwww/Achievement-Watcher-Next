'use strict';

const fs = require('fs');
const moment = require('moment');
const debug = require('../util/log.js');
const kit = require('./watcherKit.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const { completionOf } = require('../util/completionPopup.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const { userDataDir } = require('../util/userData.js');

const remedy = require(sharedAppModulePath('util/remedyAchievements.js'));
const epicOfficial = require(sharedAppModulePath('parser/epicOfficial.js'));

epicOfficial.setUserDataPath(userDataDir());

const baseline = createBaselineCache({ prefix: 'remedy-epic', tag: 'remedy-epic', debug });
const duplicateGuard = kit.createDuplicateGuard();

let timer = null;
const signatures = new Map();
let schemaCache = null;

function diffUnlocked(cache, snapshot) {
  const unlocked = Object.keys(snapshot).filter((id) => snapshot[id]?.Achieved);
  if (!cache || !Array.isArray(cache.unlocked)) return { firstObservation: true, unlocked, fresh: [] };
  const previous = new Set(cache.unlocked.map(String));
  return {
    firstObservation: false,
    unlocked,
    fresh: unlocked.filter((id) => !previous.has(String(id))),
  };
}

async function loadSchema(ctx) {
  const appid = {
    appid: remedy.REMEDY_ALAN_WAKE_2_APP_ID,
    data: {
      type: 'epicOfficial',
      runeEpic: true,
      namespace: remedy.REMEDY_ALAN_WAKE_2_APP_ID,
      epicAppName: 'AlanWake2',
      title: 'Alan Wake 2',
    },
  };
  return epicOfficial.getGameData(appid, ctx.options.achievement.lang);
}

async function handleFiles(ctx) {
  const files = remedy.remedyAchievementFiles().filter((file) => fs.existsSync(file));
  if (files.length === 0) return;

  if (!schemaCache) {
    try {
      schemaCache = await loadSchema(ctx);
    } catch (err) {
      debug.warn(`[remedy-epic] unable to load Alan Wake 2 schema: ${err.message || err}`);
    }
  }
  const list = schemaCache?.achievement?.list || [];
  const byName = new Map(list.map((entry) => [String(entry.name), entry]));

  for (const file of files) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    const signature = `${stat.size}:${stat.mtimeMs}`;
    if (signatures.get(file) === signature) continue;
    signatures.set(file, signature);

    await waitAndRead(file, ctx, byName, list);
  }
}

async function waitAndRead(file, ctx, byName, list) {
  const snapshot = remedy.readRemedyAlanWake2Unlocks({ files: [file] });
  const diff = diffUnlocked(baseline.load(remedy.REMEDY_ALAN_WAKE_2_APP_ID), snapshot);
  const unlocked = diff.unlocked;
  const key = remedy.REMEDY_ALAN_WAKE_2_APP_ID;
  const fresh = diff.fresh;

  if (!diff.firstObservation) {
    const unlockedSet = new Set(unlocked.map(String));
    const completion = completionOf(
      list.map((entry) => ({ name: entry.name, displayName: entry.displayName, description: entry.description })),
      unlockedSet
    );
    let delay = 0;
    for (const id of fresh) {
      if (duplicateGuard(key, id)) continue;
      const achievement = byName.get(String(id));
      if (!achievement) {
        debug.warn(`[remedy-epic] Alan Wake 2 unlocked achievement ${id} is missing from the Epic schema`);
        continue;
      }
      debug.log(`[remedy-epic] Unlocked: Alan Wake 2 - ${achievement.displayName || id}`);
      await ctx.notify(
        {
          source: 'epic-official',
          appid: key,
          gameDisplayName: 'Alan Wake 2',
          achievementName: String(id),
          achievementDisplayName: achievement.displayName || id,
          achievementDescription: achievement.description || '',
          icon: achievement.icon || undefined,
          gameIcon: undefined,
          time: moment().unix(),
          delay,
          completion,
        },
        kit.unlockToastOptions(ctx, { attribution: 'Alan Wake 2' })
      );
      delay += 1;
    }
  }

  baseline.save(key, unlocked);
}

module.exports.start = async (ctx) => {
  module.exports.stop();
  if (!kit.canStart(ctx, 'epicOfficial')) return;

  await handleFiles(ctx);
  timer = setInterval(() => handleFiles(ctx).catch((err) => {
    debug.warn(`[remedy-epic] live poll failed: ${err.message || err}`);
  }), 1000);
  if (typeof timer.unref === 'function') timer.unref();
  debug.log('[remedy-epic] polling Remedy Alan Wake 2 achievement state');
};

module.exports.stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
  signatures.clear();
  schemaCache = null;
};

module.exports._internal = { diffUnlocked, handleFiles };
