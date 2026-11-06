'use strict';

// Watch RPCS3 trophy sets for live toasts. Schema comes from TROPCONF.SFM (same trophy XML family
// as ShadPS4, read with a small dependency-free parser) and unlock state from the binary
// TROPUSR.DAT the emulator rewrites on every unlock.

const fs = require('fs');
const path = require('path');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const moment = require('moment');
const debug = require('../util/log.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const kit = require('./watcherKit.js');
const { trophyGradeOf, platinumFields } = require(sharedAppModulePath('parser/trophyGrade.js'));
const { xdgAppDirs } = require(sharedAppModulePath('util/xdgAppDirs.js'));
const { decodeXmlEntities: decodeXml } = require(sharedAppModulePath('util/xmlText.js'));
const layout = require(sharedAppModulePath('parser/rpcs3Layout.js'));
const { readUserData } = require(sharedAppModulePath('parser/rpcs3.js'));

const USER_FILE = 'TROPUSR.DAT';
const SCHEMA_FILE = 'TROPCONF.SFM';

const watchers = kit.createWatcherList('rpcs3', debug);
const changes = createChangeCoalescer();

// Parse TROPCONF.SFM into { title, trophies:[{id, ttype, hidden, displayName, description}] }.
function parseSchema(xml) {
  const title = decodeXml((xml.match(/<title-name>([\s\S]*?)<\/title-name>/i) || [])[1] || '').trim();
  const trophies = [];
  const re = /<trophy\b([^>]*)>([\s\S]*?)<\/trophy>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const body = m[2];
    const attr = (n) => {
      const a = attrs.match(new RegExp(`${n}\\s*=\\s*"([^"]*)"`, 'i'));
      return a ? a[1] : '';
    };
    const id = parseInt(attr('id'), 10);
    if (!Number.isFinite(id)) continue;
    trophies.push({
      id,
      ttype: String(attr('ttype') || 'B').trim().toUpperCase(),
      hidden: /yes/i.test(attr('hidden')) ? 1 : 0,
      displayName: decodeXml((body.match(/<name>([\s\S]*?)<\/name>/i) || [])[1] || '').trim(),
      description: decodeXml((body.match(/<detail>([\s\S]*?)<\/detail>/i) || [])[1] || '').trim(),
    });
  }
  return { title, trophies };
}

// Read one trophy set: schema names merged with the binary unlock state, by trophy id.
function read(trophyDir) {
  const schema = parseSchema(fs.readFileSync(path.join(trophyDir, SCHEMA_FILE), 'utf8'));
  const stateById = new Map();
  for (const t of readUserData(fs.readFileSync(path.join(trophyDir, USER_FILE)))) {
    stateById.set(t.id, { achieved: t.achieved, time: t.earned_time });
  }
  const list = schema.trophies.map((t) => {
    const st = stateById.get(t.id) || { achieved: false, time: 0 };
    const icon = path.join(trophyDir, `TROP${String(t.id).padStart(3, '0')}.PNG`);
    return { id: t.id, type: t.ttype, hidden: t.hidden, displayName: t.displayName, description: t.description, icon, achieved: st.achieved, time: st.time };
  });
  return { name: schema.title, list };
}

// Discover trophy sets under the user's saved folders (cfg/userdir.db - the same list the app
// scans) and the configuration folder of the Linux build (~/.config/rpcs3, or its Flatpak copy).
// The app's own layout reader finds dev_hdd0 in each, so an install, a configuration folder or a
// relocated virtual disk is watched whether or not rpcs3.exe sits beside it.
function discover(configFile = kit.userDirFile(), nativeRoots = xdgAppDirs('rpcs3')) {
  const targets = [];
  const seen = new Set();

  // No saved folders yet: the Linux build's own folder is still watched.
  for (const dir of [...kit.watchedFolders(configFile), ...nativeRoots]) {
    for (const root of layout.trophyRoots(dir)) {
      let games;
      try {
        games = fs.readdirSync(root.path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        continue;
      }
      for (const game of games) {
        if (seen.has(game.toLowerCase())) continue;
        const trophyDir = path.join(root.path, game);
        if (!fs.existsSync(path.join(trophyDir, USER_FILE)) || !fs.existsSync(path.join(trophyDir, SCHEMA_FILE))) continue;
        targets.push({ appid: game, trophyDir });
        seen.add(game.toLowerCase());
      }
    }
  }
  return targets;
}

const baseline = createBaselineCache({ prefix: 'rpcs3', tag: 'rpcs3', debug });
const cacheLoad = (key) => baseline.load(key);
const cacheSave = (key, unlocked) => baseline.save(key, unlocked);

async function handleChange(target, ctx) {
  try {
    await waitForFileStable(path.join(target.trophyDir, USER_FILE));

    const data = read(target.trophyDir);
    if (data.list.length === 0) return;
    const gameName = data.name || target.appid;

    const achievedNow = data.list.filter((t) => t.achieved);
    const cache = cacheLoad(target.appid);
    const isFirstObservation = !cache || !Array.isArray(cache.unlocked);

    // First observation: record the baseline silently so a pre-existing profile full of earned
    // trophies doesn't toast on startup. Only real unlocks afterwards notify.
    if (!isFirstObservation) {
      const prev = new Set(cache.unlocked);
      let delay = 0;
      for (const t of achievedNow) {
        if (prev.has(t.id)) continue;
        debug.log(`[rpcs3] Unlocked: ${gameName} - ${t.displayName}`);
        await ctx.notify(
          {
            source: 'RPCS3 Emulator',
            appid: target.appid,
            gameDisplayName: gameName,
            achievementName: String(t.id),
            achievementDisplayName: t.displayName,
            achievementDescription: t.description,
            icon: fs.existsSync(t.icon) ? t.icon : undefined,
            trophyGrade: trophyGradeOf(t.type),
            ...platinumFields(t.type, ctx.options),
            time: t.time || moment().unix(),
            delay,
          },
          kit.unlockToastOptions(ctx, { attribution: kit.localized(ctx, 'trophy') })
        );
        delay += 1;
      }
    }

    cacheSave(target.appid, achievedNow.map((t) => t.id));
  } catch (err) {
    debug.warn(`[rpcs3] handleChange failed for ${target.appid}: ${err}`);
  }
}

// Tear down any existing watchers and (re)start from the current options. Safe to call on every
// settings reload. Gated by the RPCS3 source flag + the master notify switch.
module.exports.start = async (ctx) => {
  module.exports.stop();

  if (!kit.canStart(ctx, 'rpcs3')) return;

  let targets;
  try {
    targets = discover();
  } catch (err) {
    debug.warn(`[rpcs3] discovery failed: ${err}`);
    return;
  }
  if (targets.length === 0) return;

  for (const target of targets) {
    // Seed the baseline up front so we never replay a back-catalogue of unlocks on launch.
    if (!cacheLoad(target.appid)) {
      try {
        cacheSave(target.appid, read(target.trophyDir).list.filter((t) => t.achieved).map((t) => t.id));
      } catch (err) {
        debug.warn(`[rpcs3] baseline seed failed for ${target.appid}: ${err}`);
      }
    }
    const w = watchers.open(target.trophyDir, { recursive: false }, (evt, name) => {
      if (evt !== 'update') return;
      if (String(path.basename(name || '')).toUpperCase() !== USER_FILE) return;
      changes.run(target.appid, () => handleChange(target, ctx));
    });
    if (w) debug.log(`[rpcs3] watching trophies for ${target.appid}`);
  }
};

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
};

// Exposed for unit testing the pure readers.
module.exports._internal = { read, discover };
