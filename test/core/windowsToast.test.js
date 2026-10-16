'use strict';

/*
  Windows toasts without PowerShell: the Watchdog builds the toast XML and the app posts it with
  Electron's Notification under its own AppUserModelID, then says whether Windows took it.
*/

const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');

const { createDesktopNotifier } = require('../../app/electron/desktopNotification.js');
const powertoast = require('../../watchdog/util/powertoast.js');

const AUMID = 'io.github.shirowwww.achievement.watcher';

function unlockToast(overrides = {}) {
  return {
    aumid: AUMID,
    title: 'Achievement Unlocked',
    message: 'Lab Rat\nGet both portal guns',
    uniqueID: '400:PORTAL_GET_PORTALGUNS',
    time: 1700000000,
    scenario: 'urgent',
    activation: { type: 'protocol', launch: 'achievement-watcher://game/400/PORTAL_GET_PORTALGUNS' },
    progress: { value: 40, status: '4/10' },
    disableWinRT: true,
    ...overrides,
  };
}

// A fake app on the other end of the IPC channel: records each request and answers it.
function fakeApp(answer) {
  const sent = [];
  const send = (msg) => {
    sent.push(msg);
    const reply = answer(msg.windowsToast);
    if (reply) setImmediate(() => powertoast.reportAppToast({ id: msg.windowsToast.id, ...reply }));
  };
  return { sent, send };
}

const appRoute = (send, overrides = {}) => ({ send, platform: 'win32', connected: true, appAumid: AUMID, timeoutMs: 200, ...overrides });

test('a Windows toast under the app id goes to the app as toast XML, and resolves once Windows took it', async () => {
  const app = fakeApp(() => ({ ok: true }));
  await powertoast(unlockToast(), appRoute(app.send));

  assert.equal(app.sent.length, 1);
  const { id, xml } = app.sent[0].windowsToast;
  assert.ok(id);
  assert.match(xml, /^<toast /);
  assert.match(xml, /scenario="urgent"/);
  assert.match(xml, /activationType="protocol" launch="achievement-watcher:\/\/game\/400\/PORTAL_GET_PORTALGUNS"/);
  assert.match(xml, /<text><!\[CDATA\[Achievement Unlocked\]\]><\/text>/);
  assert.match(xml, /<progress value="0.40" status="4\/10"/);
  assert.doesNotMatch(xml, /disableWinRT/);
});

test('a toast Windows refused is a failure the delivery layer can see', async () => {
  const app = fakeApp(() => ({ ok: false, reason: 'toast notifications are disabled' }));
  await assert.rejects(powertoast(unlockToast(), appRoute(app.send)), /toast notifications are disabled/);
});

test('a toast the app never answers for fails after the timeout instead of hanging delivery', async () => {
  const app = fakeApp(() => null);
  await assert.rejects(powertoast(unlockToast(), appRoute(app.send, { timeoutMs: 30 })), /did not report/);
  // A late answer for a request nobody waits for any more is dropped.
  powertoast.reportAppToast({ id: app.sent[0].windowsToast.id, ok: true });
});

test('a send that throws fails the toast at once', async () => {
  const send = () => {
    throw new Error('channel closed');
  };
  await assert.rejects(powertoast(unlockToast(), appRoute(send)), /channel closed/);
});

test('only the app id, over a live channel, takes the app route', () => {
  const send = () => {};
  const live = { send, connected: true, appAumid: AUMID };
  assert.equal(powertoast.canAppShowToast({ aumid: AUMID }, live), true);
  assert.equal(powertoast.canAppShowToast({ aumid: 'Microsoft.XboxGamingOverlay_8wekyb3d8bbwe!App' }, live), false, 'the app cannot post under another id');
  assert.equal(powertoast.canAppShowToast({ aumid: AUMID }, { ...live, connected: false }), false);
  assert.equal(powertoast.canAppShowToast({ aumid: AUMID }, { ...live, send: undefined }), false);
  assert.equal(powertoast.canAppShowToast({ aumid: AUMID }, { ...live, appAumid: '' }), false);
});

class FakeNotification extends EventEmitter {
  static isSupported() {
    return true;
  }
  constructor(options) {
    super();
    if (FakeNotification.throwOnCreate) throw new Error('invalid toast XML');
    this.options = options;
    FakeNotification.created.push(this);
  }
  show() {
    setImmediate(() => (FakeNotification.fail ? this.emit('failed', {}, FakeNotification.fail) : this.emit('show', {})));
  }
}

function resetFake() {
  FakeNotification.created = [];
  FakeNotification.fail = '';
  FakeNotification.throwOnCreate = false;
}

test('the app posts the XML as is and reports that Windows showed it', async () => {
  resetFake();
  const notifier = createDesktopNotifier({ Notification: FakeNotification, platform: 'win32' });
  assert.deepEqual(await notifier.showToastXml('<toast/>'), { ok: true });
  assert.deepEqual(FakeNotification.created[0].options, { toastXml: '<toast/>' });
});

test('the app reports why Windows did not show the toast', async () => {
  resetFake();
  FakeNotification.fail = 'HRESULT 0x803e0105';
  const notifier = createDesktopNotifier({ Notification: FakeNotification, platform: 'win32' });
  assert.deepEqual(await notifier.showToastXml('<toast/>'), { ok: false, reason: 'HRESULT 0x803e0105' });

  resetFake();
  FakeNotification.throwOnCreate = true;
  await assert.rejects(notifier.showToastXml('<toast/>'), /invalid toast XML/, 'init.js turns the rejection into a failed report');
});
