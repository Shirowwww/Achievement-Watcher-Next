'use strict';

/*
  The delivery layer as a whole: one notification in, and exactly the transports the plan called for
  out. This drives notification/toaster.js with stub transports and counts what a user would have
  seen - a fallback beside a working overlay would be a duplicate, not a rescue.
*/

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

// transportMemory resolves its store through AW_USER_DATA; keep this suite out of the real profile.
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-notify-delivery-'));
process.env.AW_USER_DATA = USER_DATA;

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const policy = require(path.join(__dirname, '..', 'notification', 'transportPolicy.js'));
const overlayAck = require(path.join(__dirname, '..', 'notification', 'overlayAck.js'));
const transportMemory = require(path.join(__dirname, '..', 'util', 'transportMemory.js'));
require(path.join(__dirname, '..', 'util', 'userData.js')).resetCache();

const TOASTER = fs.readFileSync(path.join(__dirname, '..', 'notification', 'toaster.js'), 'utf8');

// Ack replies the fake app sends back for an overlay request, keyed by how the test set it up.
const REPLY = {
  ACCEPT: (id) => overlayAck.report(id, { stage: 'accepted', ok: true, reason: 'Shirow' }),
  REJECT: (id) => overlayAck.report(id, { stage: 'accepted', ok: false, reason: 'no-preset' }),
  SILENCE: () => {},
};

// Sound stubs that make the chosen file visible: resolveSoundFile echoes the name it was asked for.
const ECHO_SOUNDS = {
  pickRandomSound: () => 'random.wav',
  resolveSoundFile: (name) => (name ? `resolved:${name}` : ''),
  tierSound: () => '',
  NO_SOUND: '__none__',
};

// `fullscreen`: false (no game), true (a game with fullscreen optimizations), null (unreadable), or
// a FULLSCREEN_KIND string. `gameDisplay` is the centre of the game's display, given with several.
function fullscreenKindOf(fullscreen) {
  if (fullscreen === true) return 'optimized';
  if (fullscreen === false) return 'none';
  return fullscreen;
}

function loadToaster({ overlayHost = 'ipc', reply = REPLY.ACCEPT, fullscreen = false, gameDisplay = null, sounds = null, gameSound = '', suppressed = false, urgent = false, showToast = null } = {}) {
  const calls = { overlays: [], toasts: [], balloons: [], broadcasts: [], shots: [] };

  const stubs = {
    path,
    fs,
    './transport/toast.js': Object.assign(
      async (message, toastOptions) => {
        calls.toasts.push([message, toastOptions]);
        if (showToast) await showToast(message, toastOptions);
      },
      { isUrgent: () => urgent }
    ),
    '../util/powerballoon': async (notification) => {
      calls.balloons.push(notification);
    },
    './prefetch.js': async (url) => url,
    '../util/squareIcon.js': { makeSquareIcon: async () => '' },
    '../util/notificationSound.js': sounds || { pickRandomSound: () => '', resolveSoundFile: () => '', tierSound: () => '', NO_SOUND: '__none__' },
    '../util/gameSound.js': { SOUND_NONE: '__none__', SOUND_RANDOM: '__random__', soundFor: () => gameSound },
    '../websocket.js': { broadcast: (payload) => calls.broadcasts.push(payload), isDeckyListening: () => false },
    '../queryUserNotificationState.js': {
      arePopupsSuppressed: async () => suppressed,
      fullscreenKind: async () => fullscreenKindOf(fullscreen),
      FULLSCREEN_KIND: require('../queryUserNotificationState.js').FULLSCREEN_KIND,
    },
    '../util/gameDisplay.js': { gameDisplayCenter: () => gameDisplay },
    './transportPolicy.js': policy,
    '../util/transportMemory.js': transportMemory,
    // The real registry, with a wait short enough that the "no answer at all" case does not make the
    // suite sit through the production timeout.
    './overlayAck.js': { ...overlayAck, wait: (id) => overlayAck.wait(id, 50) },
    '../util/log.js': { log: () => {}, warn: () => {}, error: () => {} },
    '../util/regodit.js': require('../util/regodit.js'),
    '../watchdog.js': {
      SpawnOverlayNotification: (args) => {
        calls.overlays.push(args);
        const id = (args.find((arg) => String(arg).startsWith('--notifyId=')) || '').split('=')[1];
        if (id) reply(id);
      },
    },
    '../util/notifyStrings.js': { forLang: () => ({ achievementUnlocked: 'Achievement unlocked !' }) },
    './souvenir.js': {
      capture: async (request) => {
        calls.shots.push({ ...request, at: Date.now() });
      },
    },
    './clip.js': { trigger: () => {} },
  };

  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', TOASTER)(
    (request) => {
      if (!(request in stubs)) throw new Error(`Unexpected module request: ${request}`);
      return stubs[request];
    },
    module,
    module.exports,
    { ...process, send: overlayHost === 'ipc' ? () => true : undefined, connected: overlayHost === 'ipc' }
  );

  return { notify: module.exports, calls };
}

function unlock(overrides = {}) {
  return {
    appid: '480',
    gameDisplayName: 'Spacewar',
    achievementName: 'ACH_WIN',
    achievementDisplayName: 'First blood',
    achievementDescription: 'Win a game',
    icon: 'https://example.invalid/ach.jpg',
    time: 1700000000,
    ...overrides,
  };
}

function options(mode, overrides = {}) {
  return {
    notify: true,
    lang: 'english',
    transport: { mode, websocket: false },
    toast: { appid: 'AW', winrt: true, balloonFallback: false, customAudio: '0', imageIntegration: '0' },
    prefetch: false,
    rumble: false,
    ...overrides,
  };
}

before(() => {
  fs.mkdirSync(path.join(USER_DATA, 'cfg'), { recursive: true });
});

beforeEach(() => {
  overlayAck._reset();
  policy._reset();
  transportMemory._reset();
  try {
    fs.rmSync(transportMemory.file(), { force: true });
  } catch {}
});

after(() => fs.rmSync(USER_DATA, { recursive: true, force: true }));

test('Automatic sends one overlay and no toast when the app confirms it rendered', async () => {
  const { notify, calls } = loadToaster();
  await notify(unlock(), options('auto'));
  assert.equal(calls.overlays.length, 1);
  assert.equal(calls.toasts.length, 0, 'a confirmed overlay must never be doubled by a toast');
});

test('a reported overlay failure is rescued by exactly one Windows notification', async () => {
  const { notify, calls } = loadToaster({ reply: REPLY.REJECT });
  await notify(unlock(), options('auto'));
  assert.equal(calls.overlays.length, 1);
  assert.equal(calls.toasts.length, 1, 'the user must still be told, once');
});

/*
  Silence is not failure: the process cannot tell whether a popup appeared, so a toast anyway risks
  duplicating it. Instead the overlay is marked unhealthy and only the NEXT notification switches
  transport - the rule that keeps "never duplicate" and "never pretend it worked" both true.
*/
test('an unanswered overlay produces no second notification, and moves the next one to Windows', async () => {
  const first = loadToaster({ reply: REPLY.SILENCE });
  await first.notify(unlock(), options('auto'));
  assert.equal(first.calls.overlays.length, 1);
  assert.equal(first.calls.toasts.length, 0, 'an unconfirmed overlay must not be duplicated onto a toast');

  const second = loadToaster({ reply: REPLY.ACCEPT });
  await second.notify(unlock({ achievementName: 'ACH_TWO' }), options('auto'));
  assert.equal(second.calls.overlays.length, 0);
  assert.equal(second.calls.toasts.length, 1);
});

test('Automatic uses a Windows notification while the game holds exclusive fullscreen', async () => {
  const { notify, calls } = loadToaster({ fullscreen: true });
  await notify(unlock(), options('auto'));
  assert.equal(calls.overlays.length, 0);
  assert.equal(calls.toasts.length, 1);
});

test('a toast over a fullscreen-optimized game breaks through and counts as seen', async () => {
  const { notify, calls } = loadToaster({ fullscreen: true, suppressed: true });
  await notify(unlock(), options('auto'));
  assert.equal(calls.toasts.length, 1);
  assert.equal(calls.toasts[0][1].toast.breakthrough, true);
  assert.equal(transportMemory.entryForGame('480').outcome, 'delivered');
});

// The popup used to open on the display under the cursor, which is not always the game's.
test('with several displays the popup is sent to the game display', async () => {
  const several = loadToaster({ gameDisplay: { x: -540, y: 960 } });
  await several.notify(unlock(), options('overlay'));
  assert.ok(several.calls.overlays[0].includes('--gameDisplayAt=-540,960'));

  const single = loadToaster({ gameDisplay: null });
  await single.notify(unlock(), options('overlay'));
  assert.equal(single.calls.overlays[0].some((arg) => String(arg).startsWith('--gameDisplayAt=')), false);
});

test('legacy exclusive mode records even a priority toast as kept back', async () => {
  const { notify, calls } = loadToaster({ fullscreen: 'exclusive', suppressed: true, urgent: true });
  await notify(unlock(), options('auto'));
  assert.equal(calls.overlays.length, 0);
  assert.equal(calls.toasts[0][1].toast.breakthrough, false);
  assert.equal(transportMemory.entryForGame('480').outcome, 'suppressed');
});

// A reminder stays until dismissed and only the app can hide it, so without the app it is not used.
test('a toast breaks through only when the app is there to hide it', async () => {
  const { notify, calls } = loadToaster({ overlayHost: 'spawn', fullscreen: true });
  await notify(unlock(), options('toast'));
  assert.equal(calls.toasts[0][1].toast.breakthrough, false);
});

test('Windows notification mode never reaches the overlay, fullscreen or not', async () => {
  for (const fullscreen of [false, true]) {
    const { notify, calls } = loadToaster({ fullscreen, reply: REPLY.REJECT });
    await notify(unlock(), options('toast'));
    assert.equal(calls.overlays.length, 0);
    assert.equal(calls.toasts.length, 1);
  }
});

test('overlay mode stays on the overlay in fullscreen and does not add a toast', async () => {
  const { notify, calls } = loadToaster({ fullscreen: true });
  await notify(unlock(), options('overlay'));
  assert.equal(calls.overlays.length, 1);
  assert.equal(calls.toasts.length, 0);
});

test('Both sends one of each - and a failing overlay adds nothing on top', async () => {
  const { notify, calls } = loadToaster({ reply: REPLY.REJECT });
  await notify(unlock(), options('both'));
  assert.equal(calls.overlays.length, 1);
  assert.equal(calls.toasts.length, 1, 'the planned toast is the only one; the fallback must not add a second');
});

test('nothing is sent at all when notifications are switched off', async () => {
  const { notify, calls } = loadToaster();
  await notify(unlock(), options('auto', { notify: false }));
  assert.deepEqual([calls.overlays.length, calls.toasts.length, calls.broadcasts.length], [0, 0, 0]);
});

test('what delivered the notification is recorded for the game, with why', async () => {
  const { notify } = loadToaster({ reply: REPLY.REJECT, fullscreen: false });
  await notify(unlock(), options('auto'));
  const entry = transportMemory.entryForGame('480');
  assert.equal(entry.transport, 'toast');
  assert.equal(entry.outcome, 'fallback');
  assert.equal(entry.reason, policy.REASON.OVERLAY);
});

// #126: a toast Windows files straight into the notification centre is a notification nobody saw.
test('a toast Windows kept off screen is recorded as suppressed, not delivered', async () => {
  const { notify, calls } = loadToaster({ suppressed: true });
  await notify(unlock(), options('toast'));
  assert.equal(calls.toasts.length, 1);
  assert.equal(transportMemory.entryForGame('480').outcome, 'suppressed');
});

test('a priority toast, a visible screen or an overlay beside the toast keeps the delivered outcome', async () => {
  for (const [suppressed, urgent, mode] of [
    [true, true, 'toast'],
    [false, false, 'toast'],
    [true, false, 'both'],
  ]) {
    transportMemory._reset();
    fs.rmSync(transportMemory.file(), { force: true });
    const { notify } = loadToaster({ suppressed, urgent });
    await notify(unlock(), options(mode));
    assert.equal(transportMemory.entryForGame('480').outcome, 'delivered', `suppressed=${suppressed} urgent=${urgent} mode=${mode}`);
  }
});

// Playtime fires as the game closes, when nothing is covering the screen any more. Recording it
// would overwrite what was learned in game with a result that says nothing about in-game delivery.
test('playtime notifications are not what the per-game memory learns from', async () => {
  const { notify } = loadToaster();
  await notify(unlock({ notificationType: 'playtime', silent: true }), options('auto'));
  assert.equal(transportMemory.entryForGame('480'), null);
});

// The overlay popup already plays the game's own sound; a Windows notification for the same game
// must not fall back to the global one.
test('a Windows notification plays the sound chosen in the game panel', async () => {
  const { notify, calls } = loadToaster({ sounds: ECHO_SOUNDS, gameSound: 'Xbox Classic.wav' });
  await notify(unlock(), options('toast', { overlay: { notificationSound: 'Global.wav' } }));
  assert.equal(calls.toasts[0][1].toast.soundFile, 'resolved:Xbox Classic.wav');
});

test('a game set to no sound gets a silent Windows notification', async () => {
  const { notify, calls } = loadToaster({ sounds: ECHO_SOUNDS, gameSound: '__none__' });
  await notify(unlock(), options('toast', { overlay: { notificationSound: 'Global.wav' } }));
  assert.equal(calls.toasts[0][1].toast.soundFile, '');
});

test('a game set to random sound picks a random file for its Windows notification', async () => {
  const { notify, calls } = loadToaster({ sounds: ECHO_SOUNDS, gameSound: '__random__' });
  await notify(unlock(), options('toast', { overlay: { notificationSound: 'Global.wav' } }));
  assert.equal(calls.toasts[0][1].toast.soundFile, 'random.wav');
});

test('a game with no sound of its own keeps the global sound on Windows notifications', async () => {
  const { notify, calls } = loadToaster({ sounds: ECHO_SOUNDS });
  await notify(unlock(), options('toast', { overlay: { notificationSound: 'Global.wav' } }));
  assert.equal(calls.toasts[0][1].toast.soundFile, 'resolved:Global.wav');
});

test('a silent notification stays silent whatever the game panel chose', async () => {
  const { notify, calls } = loadToaster({ sounds: ECHO_SOUNDS, gameSound: 'Xbox Classic.wav' });
  await notify(unlock({ notificationType: 'playtime', silent: true }), options('toast'));
  assert.equal(calls.toasts[0][1].toast.soundFile, '');
});

// The progress sound belongs to the kind of popup, so it wins over a game's own unlock sound.
const TIER_SOUNDS = { ...ECHO_SOUNDS, tierSound: require(path.join(__dirname, '..', 'util', 'notificationSound.js')).tierSound };
const progressEvent = () => unlock({ progress: { current: 3, max: 10 } });

test('a progress notification set to no sound is silent, even for a game with its own sound', async () => {
  const { notify, calls } = loadToaster({ sounds: TIER_SOUNDS, gameSound: 'Xbox Classic.wav' });
  await notify(progressEvent(), options('toast', { overlay: { notificationSound: 'Global.wav', notificationSoundProgress: '__none__' } }));
  assert.equal(calls.toasts[0][1].toast.soundFile, '');
});

test('a progress notification plays the progress sound, and an unlock keeps the unlock sound', async () => {
  const overlay = { notificationSound: 'Global.wav', notificationSoundProgress: 'Tick.wav' };
  const { notify, calls } = loadToaster({ sounds: TIER_SOUNDS });
  await notify(progressEvent(), options('toast', { overlay }));
  await notify(unlock(), options('toast', { overlay }));
  assert.equal(calls.toasts[0][1].toast.soundFile, 'resolved:Tick.wav');
  assert.equal(calls.toasts[1][1].toast.soundFile, 'resolved:Global.wav');
});

test('a progress notification left on "same as unlocks" keeps the game sound', async () => {
  const { notify, calls } = loadToaster({ sounds: TIER_SOUNDS, gameSound: 'Xbox Classic.wav' });
  await notify(progressEvent(), options('toast', { overlay: { notificationSound: 'Global.wav' } }));
  assert.equal(calls.toasts[0][1].toast.soundFile, 'resolved:Xbox Classic.wav');
});

test('a game that only ever worked on toasts is not asked to try the overlay blind', async () => {
  transportMemory.remember('480', { transport: 'toast', reason: policy.REASON.FULLSCREEN_HIDDEN, outcome: 'delivered' });
  // Windows could not answer this time: the memory is all there is to go on.
  const { notify, calls } = loadToaster({ fullscreen: null });
  await notify(unlock(), options('auto'));
  assert.equal(calls.overlays.length, 0);
  assert.equal(calls.toasts.length, 1);
});

/*
  A Windows toast is posted by the app (util/powertoast.js sends the XML over IPC, the app answers
  whether Windows took it). Driven here through the real toast transport with a fake app on the
  channel, so a refusal reaches the same outcomes the PowerShell path produced.
*/
const realToast = require(path.join(__dirname, '..', 'notification', 'transport', 'toast.js'));
const powertoast = require(path.join(__dirname, '..', 'util', 'powertoast.js'));

async function asWindowsChild(answer, run) {
  const saved = { send: process.send, connected: process.connected, aumid: process.env.AW_AUMID };
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const requests = [];
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  process.env.AW_AUMID = 'AW';
  process.connected = true;
  process.send = (msg) => {
    requests.push(msg);
    if (msg.windowsToast) setImmediate(() => powertoast.reportAppToast({ id: msg.windowsToast.id, ...answer }));
    return true;
  };
  try {
    await run();
  } finally {
    Object.defineProperty(process, 'platform', platform);
    process.send = saved.send;
    process.connected = saved.connected;
    if (saved.aumid === undefined) delete process.env.AW_AUMID;
    else process.env.AW_AUMID = saved.aumid;
  }
  return requests;
}

test('a Windows toast goes to the app as XML and is recorded delivered once Windows shows it', async () => {
  const { notify, calls } = loadToaster({ showToast: realToast });
  const requests = await asWindowsChild({ ok: true }, () => notify(unlock(), options('toast')));
  assert.equal(calls.toasts.length, 1);
  assert.equal(requests.length, 1);
  assert.match(requests[0].windowsToast.xml, /<text><!\[CDATA\[First blood\nWin a game\]\]><\/text>/);
  assert.equal(transportMemory.entryForGame('480').outcome, 'delivered');
});

test('a toast Windows refused is recorded failed, and the balloon rescues it when enabled', async () => {
  const refused = loadToaster({ showToast: realToast });
  await asWindowsChild({ ok: false, reason: 'disabled' }, () => refused.notify(unlock(), options('toast')));
  assert.equal(transportMemory.entryForGame('480').outcome, 'failed');
  assert.equal(refused.calls.balloons.length, 0);

  const rescued = loadToaster({ showToast: realToast });
  const withBalloon = options('toast');
  withBalloon.toast = { ...withBalloon.toast, balloonFallback: true };
  await asWindowsChild({ ok: false, reason: 'disabled' }, () => rescued.notify(unlock(), withBalloon));
  assert.equal(rescued.calls.balloons.length, 1);
  assert.equal(transportMemory.entryForGame('480').outcome, 'fallback');
});

test('a toast the app showed while Windows holds popups back is still recorded suppressed', async () => {
  const { notify } = loadToaster({ showToast: realToast, suppressed: true });
  await asWindowsChild({ ok: true }, () => notify(unlock(), options('toast')));
  assert.equal(transportMemory.entryForGame('480').outcome, 'suppressed');
});

/*
  Screenshot souvenirs. A popup can take seconds to show its text (an entry animation, or a queue
  of popups shown one at a time), so the shot waits for the app to say the text is on screen.
*/
const SHOT = { souvenir: { screenshot: true, dir: 'shots', hdr: 'off' } };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requestId = (args) => (args.find((arg) => String(arg).startsWith('--notifyId=')) || '').split('=')[1];

test('a souvenir waits until the popup reports its text on screen', async () => {
  const { notify, calls } = loadToaster();
  await notify(unlock(), options('overlay', SHOT));
  assert.ok(calls.overlays[0].includes('--paintReport=1'), 'the popup must be asked to report when it is painted');

  await sleep(1000);
  assert.equal(calls.shots.length, 0, 'an accepted popup that has not painted yet is not photographed');

  overlayAck.report(requestId(calls.overlays[0]), { stage: 'painted', ok: true, reason: 'preset:settled' });
  await sleep(10);
  assert.equal(calls.shots.length, 1);
  assert.equal(calls.shots[0].achievement, 'First blood');
});

// Both plans its toast and authorizes no fallback, so the id here exists for the souvenir alone.
test('with no popup coming, the souvenir gives the toast its head start, and adds no toast', async () => {
  const { notify, calls } = loadToaster({ reply: REPLY.REJECT });
  const started = Date.now();
  await notify(unlock(), options('both', SHOT));
  await sleep(1000);
  assert.ok(calls.overlays[0].includes('--paintReport=1'));
  assert.equal(calls.shots.length, 1);
  assert.ok(calls.shots[0].at - started >= 700, 'the toast shown instead needs a moment to slide in');
  assert.equal(calls.toasts.length, 1, 'an id asked for the souvenir must never authorize a second toast');
});

test('a souvenir beside a Windows notification alone keeps its short fixed delay', async () => {
  const { notify, calls } = loadToaster();
  const started = Date.now();
  await notify(unlock(), options('toast', SHOT));
  await sleep(1000);
  assert.equal(calls.shots.length, 1);
  assert.ok(calls.shots[0].at - started >= 700, 'the toast needs a moment to slide in');
  assert.equal(calls.overlays.length, 0);
});

test('progress and playtime notifications never ask for a paint report or a screenshot', async () => {
  const { notify, calls } = loadToaster();
  await notify(unlock({ notificationType: 'playtime', silent: true }), options('overlay', SHOT));
  await sleep(1000);
  assert.equal(calls.overlays[0].includes('--paintReport=1'), false);
  assert.equal(calls.shots.length, 0);
});

test('a popup that never reports painting is photographed after the paint timeout', async () => {
  const id = overlayAck.track(overlayAck.nextId());
  const started = Date.now();
  assert.equal(await overlayAck.whenPainted(id, 60), 'timeout');
  assert.ok(Date.now() - started >= 55);
});

test('a paint report for another popup does not release this one', async () => {
  const mine = overlayAck.track(overlayAck.nextId());
  const other = overlayAck.track(overlayAck.nextId());
  const waiting = overlayAck.whenPainted(mine, 200);
  overlayAck.report(other, { stage: 'painted', ok: true, reason: 'content:settled' });
  overlayAck.report(mine, { stage: 'rendered', ok: true, reason: 'shown' });
  setTimeout(() => overlayAck.report(mine, { stage: 'painted', ok: true, reason: 'no-signal:limit' }), 20);
  assert.equal(await waiting, 'no-signal:limit');
});
