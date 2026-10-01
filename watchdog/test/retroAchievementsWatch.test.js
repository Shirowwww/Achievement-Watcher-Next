'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const watcher = require('../console/retroAchievementsWatch.js');

const ra = require(sharedAppModulePath('parser/retroAchievements.js'));
const { findEmulator, handleGame, seen } = watcher._internal;

const GAME = {
  ID: 1,
  Title: 'Sonic the Hedgehog',
  ConsoleName: 'Mega Drive',
  NumDistinctPlayers: 200,
  Achievements: {
    9: { ID: 9, NumAwarded: 150, Title: 'That Was Easy', BadgeName: '1', DisplayOrder: 1, DateEarned: '2016-03-12 17:47:29' },
    11: { ID: 11, NumAwarded: 2, Title: 'Rare', BadgeName: '2', DisplayOrder: 2 },
  },
};

function unlock(achievementId, extra = {}) {
  return { gameId: '1', achievementId, title: `Achievement ${achievementId}`, description: '', points: 5, hardcore: false, icon: '', gameIcon: '', gameName: 'Sonic the Hedgehog (Mega Drive)', time: 1700000000, ...extra };
}

function context() {
  const sent = [];
  const reported = [];
  return {
    sent,
    reported,
    reportUnlock: (game, name) => reported.push(`${game.appid}:${name}`),
    options: {
      achievement: { lang: 'english' },
      notification: { notify: true, rumble: false },
      notification_transport: { mode: 'toast', websocket: false, winRT: true, balloon: false },
      notification_toast: { customToastAudio: '1', groupToast: false },
      notification_advanced: { iconPrefetch: true },
    },
    getToastID: () => 'test',
    notify: async (message) => {
      sent.push(message);
    },
  };
}

function freshUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ra-watch-'));
  ra.setUserDataPath(dir);
  seen.clear();
  return dir;
}

test('only an emulator that reports to RetroAchievements starts the polling', () => {
  for (const name of ['retroarch.exe', 'RetroArch.exe', 'duckstation-qt-x64-ReleaseLTCG.exe', 'pcsx2-qt.exe', 'PPSSPPWindows64.exe', 'EmuHawk.exe', 'RALibretro.exe', 'Dolphin.exe']) {
    assert.equal(findEmulator([{ process: 'explorer.exe' }, { process: name }]), name, name);
  }
  for (const name of ['explorer.exe', 'steam.exe', 'retroarch.exe.bak', 'dolphin-tool.exe', 'xenia.exe']) {
    assert.equal(findEmulator([{ process: name }]), '', name);
  }
});

test('an unlock already in the cache is not announced, a new one is, and only once', async () => {
  freshUserData();
  ra.writeGame('1', GAME);
  const ctx = context();

  await handleGame(ctx, { username: 'a', apiKey: 'x' }, '1', [unlock('9'), unlock('11', { hardcore: true })], 0);
  assert.deepEqual(
    ctx.sent.map((m) => m.achievementName),
    ['11']
  );
  assert.equal(ctx.sent[0].appid, 'ra-1');
  assert.equal(ctx.sent[0].source, 'RetroAchievements');
  assert.equal(ctx.sent[0].gameDisplayName, 'Sonic the Hedgehog (Mega Drive)');
  assert.equal(ctx.sent[0].rarityPercent, 1, 'rare enough to be flagged, from the cached schema');
  assert.equal(ra.readState('1')['11'].earned, true, 'the unlock is recorded for the library');
  assert.deepEqual(ctx.reported, ['ra-1:11'], 'and the open library is told, so its tile moves now');

  await handleGame(ctx, { username: 'a', apiKey: 'x' }, '1', [unlock('11', { hardcore: true })], 0);
  assert.equal(ctx.sent.length, 1, 'the next poll returns the same unlock and stays quiet');
});

test('a game played for the first time is imported and its new unlock still announced', async () => {
  freshUserData();
  const ctx = context();
  const original = ra.fetchGameProgress;
  ra.fetchGameProgress = async () => ({ ...GAME, Achievements: { ...GAME.Achievements, 11: { ...GAME.Achievements[11], DateEarned: '2024-01-01 10:00:00' } } });
  try {
    await handleGame(ctx, { username: 'a', apiKey: 'x' }, '1', [unlock('11')], 0);
  } finally {
    ra.fetchGameProgress = original;
  }
  assert.deepEqual(
    ctx.sent.map((m) => m.achievementName),
    ['11'],
    'the import already marks it earned, so it must be picked out before'
  );
  assert.deepEqual(ra.listCachedTitles(), ['ra-1']);
});

test('a game that cannot be imported is still announced from the unlock itself', async () => {
  freshUserData();
  const ctx = context();
  const original = ra.fetchGameProgress;
  ra.fetchGameProgress = async () => {
    throw Object.assign(new Error('retroachievements-network-error'), { code: 'retroachievements-network-error' });
  };
  try {
    await handleGame(ctx, { username: 'a', apiKey: 'x' }, '1', [unlock('11')], 0);
  } finally {
    ra.fetchGameProgress = original;
  }
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].gameDisplayName, 'Sonic the Hedgehog (Mega Drive)');
});

test('the watcher stays off when the source or notifications are switched off', async () => {
  const ctx = context();
  ctx.options.achievement_source = { retroAchievements: false };
  await watcher.start(ctx);
  watcher.stop();
  ctx.options.achievement_source = { retroAchievements: true };
  ctx.options.notification.notify = false;
  await watcher.start(ctx);
  watcher.stop();
  assert.equal(ctx.sent.length, 0);
});

test('a rate limit pauses polling for as long as the API asks, then reaches back to the last answer', async () => {
  freshUserData();
  const { poll } = watcher._internal;
  const original = ra.fetchRecentUnlocks;
  const windows = [];
  try {
    ra.fetchRecentUnlocks = async () => {
      throw Object.assign(new Error('retroachievements-rate-limited'), { code: 'retroachievements-rate-limited', retryAfterMs: 232000 });
    };
    const session = { auth: { username: 'a', apiKey: 'x' }, lastPoll: 0, lastSuccess: Date.now() - 10 * 60000, pausedUntil: 0 };
    const before = Date.now();
    await poll(context(), session);
    assert.ok(session.pausedUntil >= before + 232000, 'paused for the Retry-After');

    ra.fetchRecentUnlocks = async (_auth, minutes) => {
      windows.push(minutes);
      return [];
    };
    await poll(context(), session);
    assert.ok(windows[0] >= 10, 'the next window covers the time the limit made it miss');
  } finally {
    ra.fetchRecentUnlocks = original;
  }
});
