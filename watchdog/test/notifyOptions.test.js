'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The 100% popup reads the game's PlayStation link under userData: an empty one here.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wd-notify-options-'));
process.env.AW_USER_DATA = temp;
after(() => fs.rmSync(temp, { recursive: true, force: true }));
require('../util/userData.js').resetCache();

const { notifyOptions, unlockRarity, createUnlockNotify } = require('../notification/notifyOptions.js');

const options = (overrides = {}) => ({
  achievement: { lang: 'french' },
  notification: { notify: true, rumble: true },
  notification_transport: { mode: 'auto', websocket: true, winRT: true, balloon: true },
  notification_toast: { customToastAudio: '2', groupToast: false },
  notification_advanced: { iconPrefetch: true },
  overlay: { notificationVolume: 60 },
  ...overrides,
});

test('an unlock carries the language, the transport, the user sound, the volume and the rumble', () => {
  assert.deepEqual(notifyOptions(options(), { toastId: 'Some.AUMID', attribution: 'Game' }), {
    notify: true,
    lang: 'french',
    transport: { mode: 'auto', websocket: true },
    toast: {
      appid: 'Some.AUMID',
      winrt: true,
      balloonFallback: true,
      customAudio: '2',
      volume: 60,
      imageIntegration: '0',
      group: false,
      attribution: 'Game',
    },
    prefetch: true,
    rumble: true,
  });
});

test('a quiet notification keeps the volume but drops the toast sound and the rumble', () => {
  const quiet = notifyOptions(options(), { toastId: 'x', sound: false, rumble: false, imageIntegration: '1' });
  assert.equal(quiet.toast.customAudio, '0');
  assert.equal(quiet.toast.volume, 60, 'a sound file the toast still plays follows the user volume');
  assert.equal(quiet.toast.imageIntegration, '1');
  assert.equal(quiet.rumble, false);
});

test('prefetch follows the setting unless the caller knows its icons are local files', () => {
  assert.equal(notifyOptions(options(), {}).prefetch, true);
  assert.equal(notifyOptions(options(), { prefetch: false }).prefetch, false);
  assert.equal(notifyOptions(options({ notification_advanced: undefined }), {}).prefetch, true, 'a missing section prefetches');
});

test('the rarity is rounded to a tenth, rare only under the configured cutoff', () => {
  assert.deepEqual(unlockRarity(4.26, options()), { unlockRate: 4.3, rarityPercent: 4.3 });
  assert.deepEqual(unlockRarity(40, options()), { unlockRate: 40, rarityPercent: null });
  assert.deepEqual(unlockRarity(undefined, options()), { unlockRate: null, rarityPercent: null });
  assert.deepEqual(unlockRarity('nope', options()), { unlockRate: null, rarityPercent: null });
  assert.deepEqual(unlockRarity(-1, options()), { unlockRate: null, rarityPercent: null });
  // Settings > General > Rarity thresholds moves the cutoff; an inconsistent set falls back to 15%.
  assert.equal(unlockRarity(20, options({ achievement: { rareGoldMax: '5', rareSilverMax: '10', rareMax: '25' } })).rarityPercent, 20);
  assert.equal(unlockRarity(20, options({ achievement: { rareGoldMax: '5', rareSilverMax: '30', rareMax: '25' } })).rarityPercent, null);
  assert.equal(unlockRarity(15, undefined).rarityPercent, 15);
});

test('the unlock notify reports to the library, fills the souvenir and adds the 100% popup', async () => {
  const sent = [];
  const reported = [];
  const live = options({ souvenir: { screenshot: true }, notification: { notify: true, rumble: false, platinum: true } });
  const notify = createUnlockNotify(async (payload, opts) => sent.push({ payload, opts }), {
    getOptions: () => live,
    report: (game, name, time) => reported.push([game.appid, name, time]),
  });
  await notify(
    { source: 'Xbox PC', appid: '1234', achievementName: 'a1', gameDisplayName: 'G', time: 10, completion: { unlocked: 2, total: 2 } },
    { toast: { attribution: 'AW Next' } }
  );
  assert.deepEqual(reported, [['1234', 'a1', 10]]);
  assert.equal(sent.length, 2, 'the unlock, then the platinum');
  assert.deepEqual(sent[0].opts.souvenir, { screenshot: true });
  assert.equal(sent[0].payload.completion, undefined, 'completion is consumed, not sent');
  assert.equal(sent[1].payload.notificationType, 'platinum');
});
