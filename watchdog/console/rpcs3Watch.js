'use strict';

// Watch RPCS3 trophy sets for live toasts. Schema comes from TROPCONF.SFM (same trophy XML family
// as ShadPS4, read with a small dependency-free parser) and unlock state from the binary
// TROPUSR.DAT the emulator rewrites on every unlock.

const fs = require('fs');
const path = require('path');
const watch = require('node-watch');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const { createBaselineCache } = require('../util/baselineCache.js');
const moment = require('moment');
const debug = require('../util/log.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { notificationVolumePercent } = require('../util/notificationVolume.js');
const notifyStrings = require('../util/notifyStrings.js');
const { userDataDir } = require('../util/userData.js');

const userDirFile = path.join(userDataDir(), 'cfg', 'userdir.db');

const USER_FILE = 'TROPUSR.DAT';
const SCHEMA_FILE = 'TROPCONF.SFM';

let watchers = [];
const changes = createChangeCoalescer();

function decodeXml(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

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

// TROPUSR.DAT binary layout (mirrors app/parser/rpcs3.js, which the watchdog cannot require from
// inside the app archive): magic header, then two delimiter-separated record halves - trophy
// records (id at 0-4, timestamp at 16-20, big-endian) followed by state records (achieved at 12-16).
const magic = {
  header: Buffer.from('818F54AD', 'hex'),
  delimiter: [Buffer.from('0400000050', 'hex'), Buffer.from('0600000060', 'hex')],
};

function indexOfAny(buffer, values, offset = 0) {
  for (const value of values) {
    const pos = buffer.indexOf(value, offset);
    if (pos > -1) return { pos, offset: value.length };
  }
  return { pos: -1, offset: 0 };
}

function bufferSplit(buffer, separators) {
  const result = [];
  let pos = -1;
  let prev = 0;
  while (pos++ < buffer.length) {
    const search = indexOfAny(buffer, separators, pos);
    pos = search.pos > 0 ? search.pos : buffer.length;
    result.push(buffer.slice(prev, pos));
    prev = pos + search.offset;
  }
  return result;
}

function indexOfNthOccurrence(buffer, search, n) {
  let i = -1;
  while (n-- && i++ < buffer.length) {
    i = buffer.indexOf(search, i);
    if (i < 0) break;
  }
  return i;
}

function parseUserData(buffer) {
  if (!buffer.slice(0, magic.header.length).equals(magic.header)) throw 'ERR_UNEXPECTED_FILE_FORMAT';
  const headerEndPos = indexOfNthOccurrence(buffer, magic.delimiter[0], 2) + magic.delimiter[0].length;
  const stats = bufferSplit(buffer.slice(headerEndPos), magic.delimiter);
  if (stats.length % 2 !== 0) throw 'ERR_UNEXPECTED_TROPHY_COUNT';
  const length = stats.length / 2;
  if (length > 128) throw 'ERR_UNEXPECTED_MAX_TROPHY_LIMIT_EXCEEDED';

  const result = [];
  for (let i = 0; i <= length - 1; i++) {
    try {
      const timestamp = stats[i].slice(16, 20);
      result.push({
        id: stats[i].slice(0, 4).readInt32BE(),
        unlockTime: timestamp.equals(Buffer.from('ffffffff', 'hex')) ? 0 : timestamp.readInt32BE(),
        achieved: stats[i + length].slice(12, 16).readInt32BE() === 1,
      });
    } catch {
      continue;
    }
  }
  return result;
}

// Read one trophy set: schema names merged with the binary unlock state, by trophy id.
function read(trophyDir) {
  const schema = parseSchema(fs.readFileSync(path.join(trophyDir, SCHEMA_FILE), 'utf8'));
  const stateById = new Map();
  for (const t of parseUserData(fs.readFileSync(path.join(trophyDir, USER_FILE)))) {
    stateById.set(t.id, { achieved: t.achieved, time: t.unlockTime });
  }
  const list = schema.trophies.map((t) => {
    const st = stateById.get(t.id) || { achieved: false, time: 0 };
    const icon = path.join(trophyDir, `TROP${String(t.id).padStart(3, '0')}.PNG`);
    return { id: t.id, type: t.ttype, hidden: t.hidden, displayName: t.displayName, description: t.description, icon, achieved: st.achieved, time: st.time };
  });
  return { name: schema.title, list };
}

// Discover trophy sets under the user's saved folders (cfg/userdir.db - the same list the app
// scans). An RPCS3 root is any folder holding rpcs3.exe with dev_hdd0/home/<user>/trophy/<game>.
function discover(configFile = userDirFile) {
  const targets = [];
  const seen = new Set();

  let userDirs = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (Array.isArray(parsed)) {
      userDirs = parsed
        .filter((entry) => typeof entry === 'string' || (entry && entry.enabled !== false))
        .map((entry) => (typeof entry === 'string' ? entry : entry.path))
        .filter(Boolean);
    }
  } catch {
    return targets;
  }

  for (const dir of userDirs) {
    if (!fs.existsSync(path.join(dir, 'rpcs3.exe'))) continue;
    let users;
    try {
      users = fs.readdirSync(path.join(dir, 'dev_hdd0', 'home'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      continue;
    }
    for (const user of users) {
      let games;
      try {
        games = fs.readdirSync(path.join(dir, 'dev_hdd0', 'home', user, 'trophy'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        continue;
      }
      for (const game of games) {
        if (seen.has(game.toLowerCase())) continue;
        const trophyDir = path.join(dir, 'dev_hdd0', 'home', user, 'trophy', game);
        if (!fs.existsSync(path.join(trophyDir, USER_FILE)) || !fs.existsSync(path.join(trophyDir, SCHEMA_FILE))) continue;
        targets.push({ appid: game, trophyDir });
        seen.add(game.toLowerCase());
      }
    }
  }
  return targets;
}

const baseline = createBaselineCache({ prefix: 'rpcs3', tag: 'rpcs3', debug });
const cacheFile = baseline.file;
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
            time: t.time || moment().unix(),
            delay,
          },
          {
            notify: ctx.options.notification.notify,
            transport: {
              mode: ctx.options.notification_transport.mode,
              websocket: ctx.options.notification_transport.websocket,
            },
            toast: {
              appid: typeof ctx.getToastID === 'function' ? ctx.getToastID() : ctx.toastID,
              winrt: ctx.options.notification_transport.winRT,
              balloonFallback: ctx.options.notification_transport.balloon,
              customAudio: ctx.options.notification_toast.customToastAudio,
              volume: notificationVolumePercent(ctx.options),
              imageIntegration: '0',
              group: ctx.options.notification_toast.groupToast,
              attribution: notifyStrings.forLang(ctx.options.achievement.lang).trophy,
            },
            prefetch: false, // icons are already local files
            rumble: ctx.options.notification.rumble,
          }
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

  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.rpcs3 === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

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
    try {
      const w = watch(target.trophyDir, { recursive: false }, (evt, name) => {
        if (evt !== 'update') return;
        if (String(path.basename(name || '')).toUpperCase() !== USER_FILE) return;
        changes.run(target.appid, () => handleChange(target, ctx));
      });
      watchers.push(w);
      debug.log(`[rpcs3] watching trophies for ${target.appid}`);
    } catch (err) {
      debug.warn(`[rpcs3] failed to watch ${target.trophyDir}: ${err}`);
    }
  }
};

module.exports.stop = () => {
  changes.clear();
  for (const w of watchers) {
    try {
      w.close();
    } catch {}
  }
  watchers = [];
};

// Exposed for unit testing the pure readers.
module.exports._internal = { read, discover };
