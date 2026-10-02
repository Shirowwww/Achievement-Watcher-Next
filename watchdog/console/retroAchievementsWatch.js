'use strict';

/*
  Live RetroAchievements unlocks. There is no local file to watch: the emulator reports each unlock
  to retroachievements.org, so this asks the Web API for the account's recent unlocks - every few
  seconds while an emulator that can earn them runs (known by name, or by the RA toolkit dll beside
  it), and every few minutes otherwise, so an emulator neither test recognises is still covered.

  The API format, the cache and the account all live in app/parser/retroAchievements.js, loaded
  through sharedAppModule so the library and the notifications read one cache.
*/

const fs = require('fs');
const path = require('path');
const debug = require('../util/log.js');
const tasklist = require('../util/tasklist.js');
const aes = require('../util/aes.js');
const { notificationVolumePercent } = require('../util/notificationVolume.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');

const ra = require(sharedAppModulePath('parser/retroAchievements.js'));
ra.setUserDataPath(userDataDir());
ra.setCipher(aes);

// Windows emulators and frontends that report to RetroAchievements (its emulator support list),
// with the nightly and fork names that keep the same stem.
const EMULATOR_PROCESS =
  /^(?:retroarch|ralibretro|emuhawk|rapplewin|flycast|winarcadia|amiarcadia|ranes|ravba(?:-m)?|ravisualboyadvance(?:-m)?|rasnes9x|rap64|raproject64|raquasi88|rameka|ragens|raoricutron|project64|skyemu|linkboy|rmg|gopher64|dolphin|melonds|mesen|stella|gearboy|gearsystem|gearcoleco|(?:duckstation|pcsx2|ppsspp|xbsx2|dolphin-?\w+|flycast|melonds|retroarch)[\w.-]*)\.exe$/i;
// Every RA-integrated emulator (the RA* builds, RALibretro, WinArcadia and the forks) ships the
// RetroAchievements toolkit beside its executable, whatever the executable is called.
const INTEGRATION_DLLS = ['RA_Integration.dll', 'RA_Integration-x64.dll'];
const NOT_EMULATOR_PROCESS = /^dolphin-?(?:tool|memoryengine)\.exe$/i;
// Half the poll interval, so a poll is due on every second tick; a process snapshot costs ~6 ms.
const CHECK_INTERVAL_MS = 4 * 1000;
// The API blocks for ten minutes above roughly 13 calls a minute; 7.5 a minute keeps a margin for
// an import running at the same time, and an unlock still arrives within a few seconds.
const POLL_INTERVAL_MS = 8 * 1000;
// No emulator recognised: an unknown one (a new release, a renamed build) is still caught, late.
const IDLE_POLL_INTERVAL_MS = 5 * 60 * 1000;
// How far back the first request of a session looks, so an unlock earned just before the
// emulator was noticed is still announced.
const LOOKBACK_MINUTES = 3;
const REJECTED_KEY_PAUSE_MS = 5 * 60 * 1000;

let timer = null;
let session = null;
let busy = false;
// Announced or already known, by "<gameId>:<achievementId>". The state file is the lasting record;
// this covers the moment between a toast and its write, and a game the cache cannot hold.
const seen = new Set();

// pid -> whether that process carries the RA toolkit. Each pid is looked at once, and only the
// processes the name list does not already know.
const integrationByPid = new Map();

function hasIntegrationDll(entry) {
  const pid = Number(entry && entry.pid);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (!integrationByPid.has(pid)) {
    const exe = tasklist.getProcessPath(pid);
    const dir = exe ? path.dirname(exe) : '';
    integrationByPid.set(pid, !!dir && INTEGRATION_DLLS.some((name) => fs.existsSync(path.join(dir, name))));
  }
  return integrationByPid.get(pid);
}

function findEmulator(processes, probe = hasIntegrationDll) {
  const list = (processes || []).filter((entry) => entry && entry.process);
  const live = new Set(list.map((entry) => Number(entry.pid)));
  for (const pid of integrationByPid.keys()) if (!live.has(pid)) integrationByPid.delete(pid);
  const named = list.find((entry) => EMULATOR_PROCESS.test(entry.process) && !NOT_EMULATOR_PROCESS.test(entry.process));
  if (named) return named.process;
  const integrated = list.find((entry) => probe(entry));
  return integrated ? integrated.process : '';
}

function rarityOf(schema, achievementId) {
  const entry = schema && schema.achievement.list.find((achievement) => String(achievement.name) === String(achievementId));
  const percent = entry && entry.rarityPct != null ? Number(entry.rarityPct) : NaN;
  if (!Number.isFinite(percent)) return null;
  const rounded = Math.round(percent * 10) / 10;
  return rounded >= 0 && rounded <= 15 ? rounded : null;
}

async function announce(ctx, unlock, schema, delay) {
  const options = ctx.options;
  await ctx.notify(
    {
      source: ra.SOURCE,
      appid: ra.toAppid(unlock.gameId),
      gameDisplayName: (schema && schema.name) || unlock.gameName,
      achievementName: unlock.achievementId,
      achievementDisplayName: unlock.title,
      achievementDescription: unlock.description,
      rarityPercent: rarityOf(schema, unlock.achievementId),
      icon: unlock.icon || undefined,
      gameIcon: (schema && schema.img && schema.img.icon) || unlock.gameIcon || '',
      image: (schema && schema.img && schema.img.header) || '',
      time: unlock.time || Math.floor(Date.now() / 1000),
      delay,
    },
    {
      notify: options.notification.notify,
      lang: options.achievement.lang,
      transport: {
        mode: options.notification_transport.mode,
        websocket: options.notification_transport.websocket,
      },
      toast: {
        appid: typeof ctx.getToastID === 'function' ? ctx.getToastID() : ctx.toastID,
        winrt: options.notification_transport.winRT,
        balloonFallback: options.notification_transport.balloon,
        customAudio: options.notification_toast.customToastAudio,
        volume: notificationVolumePercent(options),
        imageIntegration: '1',
        group: options.notification_toast.groupToast,
        attribution: ra.SOURCE,
      },
      prefetch: options.notification_advanced ? options.notification_advanced.iconPrefetch : true,
      rumble: options.notification.rumble,
    }
  );
}

/*
  The unlocks of one game from one answer. What the state file already marks earned is not new: a
  hardcore re-earn of a softcore unlock, or an import that ran in between. A game played for the first
  time is imported on the spot, after the new unlocks are picked out, so the library has it too.
*/
async function handleGame(ctx, auth, gameId, unlocks, delayStart) {
  const state = ra.readState(gameId);
  const fresh = unlocks.filter((unlock) => {
    const key = `${gameId}:${unlock.achievementId}`;
    const isNew = !seen.has(key) && !(state[unlock.achievementId] && state[unlock.achievementId].earned);
    seen.add(key);
    return isNew;
  });

  let schema = ra.readSchema(gameId);
  if (!schema) {
    try {
      ra.writeGame(gameId, await ra.fetchGameProgress(auth, gameId));
      schema = ra.readSchema(gameId);
      if (schema) debug.log(`[retroachievements] added ${schema.name} to the library`);
    } catch (err) {
      debug.warn(`[retroachievements] could not import game ${gameId}: ${err.code || err.message || err}`);
    }
  }

  let delay = delayStart;
  for (const unlock of fresh) {
    debug.log(`[retroachievements] Unlocked: ${unlock.gameName} - ${unlock.title}${unlock.hardcore ? ' (hardcore)' : ''}`);
    try {
      await announce(ctx, unlock, schema, delay);
    } catch (err) {
      debug.warn(`[retroachievements] notification failed: ${err.message || err}`);
    }
    delay += 1;
  }
  if (schema) ra.recordUnlocks(gameId, unlocks);
  // After the state write, so a library that re-reads the game on this message sees the unlock.
  if (typeof ctx.reportUnlock === 'function') {
    for (const unlock of fresh) ctx.reportUnlock({ appid: ra.toAppid(gameId) }, unlock.achievementId, unlock.time);
  }
  return delay;
}

async function poll(ctx, current) {
  current.lastPoll = Date.now();
  let unlocks;
  try {
    // The window is relative to the server's clock, so a skewed local clock cannot hide an unlock,
    // and it reaches back to the last answer, so a run of failed polls loses nothing.
    const minutes = current.lastSuccess ? (Date.now() - current.lastSuccess) / 60000 + 1 : LOOKBACK_MINUTES;
    unlocks = await ra.fetchRecentUnlocks(current.auth, minutes);
  } catch (err) {
    if (err && err.code === 'retroachievements-rate-limited') {
      // An import running alongside can spend the whole allowance. The window above reaches back to
      // the last answer, so nothing earned during the pause is lost.
      current.pausedUntil = Date.now() + (err.retryAfterMs || 60000);
      debug.warn(`[retroachievements] rate limited, polling again in ${Math.round((err.retryAfterMs || 60000) / 1000)}s`);
    } else if (err && err.code === 'retroachievements-unauthorized') {
      current.pausedUntil = Date.now() + REJECTED_KEY_PAUSE_MS;
      current.auth = ra.loadAuth() || current.auth;
      debug.warn('[retroachievements] the Web API key was rejected; reconnect the account in Settings');
    } else {
      debug.warn(`[retroachievements] poll failed: ${(err && (err.code || err.message)) || err}`);
    }
    return;
  }
  current.lastSuccess = current.lastPoll;

  const byGame = new Map();
  for (const unlock of unlocks) {
    if (!byGame.has(unlock.gameId)) byGame.set(unlock.gameId, []);
    byGame.get(unlock.gameId).push(unlock);
  }
  let delay = 0;
  for (const [gameId, list] of byGame) delay = await handleGame(ctx, current.auth, gameId, list, delay);
}

async function tick(ctx) {
  if (busy) return;
  busy = true;
  try {
    // The account first: with none connected (most installs) there is no reason to list processes.
    if (!session) {
      const auth = ra.loadAuth();
      if (!auth) return;
      session = { auth, emulator: '', lastPoll: 0, lastSuccess: 0, pausedUntil: 0 };
    }
    const current = session;

    let emulator = '';
    try {
      emulator = findEmulator(await tasklist.list());
    } catch (err) {
      debug.warn(`[retroachievements] process snapshot failed: ${err}`);
      return;
    }

    if (emulator !== current.emulator) {
      const closed = current.emulator;
      current.emulator = emulator;
      if (emulator) debug.log(`[retroachievements] ${emulator} is running - polling unlocks for ${current.auth.username}`);
      else {
        debug.log(`[retroachievements] ${closed} closed - back to polling every ${IDLE_POLL_INTERVAL_MS / 60000} min`);
        // One last look: the unlock earned right before quitting is reported as the emulator closes.
        current.lastPoll = 0;
      }
    }
    const now = Date.now();
    const interval = current.emulator ? POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;
    if (now < current.pausedUntil || now - current.lastPoll < interval) return;
    // Re-read before each request: the account may have been disconnected or switched since.
    const auth = ra.loadAuth();
    if (!auth) {
      session = null;
      return;
    }
    current.auth = auth;
    await poll(ctx, current);
  } catch (err) {
    debug.warn(`[retroachievements] ${err.message || err}`);
  } finally {
    busy = false;
  }
}

// Safe to call on every settings reload. Gated by the RetroAchievements source flag and the master
// notify switch; the account itself is read when an emulator starts, so connecting later needs no restart.
module.exports.start = async (ctx) => {
  module.exports.stop();
  if (!ctx || !ctx.options) return;
  if (ctx.options.achievement_source && ctx.options.achievement_source.retroAchievements === false) return;
  if (ctx.options.notification && ctx.options.notification.notify === false) return;
  if (typeof ctx.notify !== 'function') return;

  timer = setInterval(() => tick(ctx), CHECK_INTERVAL_MS);
  tick(ctx);
};

module.exports.stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
  session = null;
};

module.exports._internal = { findEmulator, handleGame, poll, tick, rarityOf, EMULATOR_PROCESS, seen };
