'use strict';

/*
  Without a registry or WinRT: playtime goes to cfg/playtime.json and a toast becomes a desktop
  notification shown by the app on the Watchdog's behalf.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { EventEmitter } = require('node:events');

const playtimeFile = require('../../app/util/playtimeFile.js');
const { createDesktopNotifier, busHasNotificationService, localIcon } = require('../../app/electron/desktopNotification.js');
const powertoast = require('../../watchdog/util/powertoast.js');

test('playtime sessions add up per appid and stamp the last session', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-playtime-'));
  const file = playtimeFile.playtimeFile(dir);
  try {
    assert.deepEqual(playtimeFile.read(file, '400'), { total: 0, last: 0 });
    playtimeFile.addSession(file, '400', 23, 1_700_000_000_000);
    playtimeFile.addSession(file, '400', 40.9, 1_700_000_100_000);
    playtimeFile.addSession(file, '220', -5, 1_700_000_200_000);
    assert.deepEqual(playtimeFile.read(file, '400'), { total: 63, last: 1_700_000_100 });
    assert.deepEqual(playtimeFile.read(file, '220'), { total: 0, last: 1_700_000_200 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable playtime file is an error, never an empty store that would be saved over', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-playtime-'));
  const file = playtimeFile.playtimeFile(dir);
  try {
    fs.mkdirSync(file, { recursive: true }); // a directory where the file should be
    assert.throws(() => playtimeFile.read(file, '400'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('off Windows a toast is sent to the app with the game it should open', async () => {
  const sent = [];
  await powertoast(
    { title: 'Achievement Unlocked', message: 'Lab Rat', icon: '/cache/icon.jpg', uniqueID: '400:PORTAL_GET_PORTALGUNS', scenario: 'urgent' },
    { send: (m) => sent.push(m), platform: 'linux' }
  );
  assert.deepEqual(sent, [
    {
      desktopNotification: {
        title: 'Achievement Unlocked',
        body: 'Lab Rat',
        icon: '/cache/icon.jpg',
        silent: false,
        urgent: true,
        appid: '400',
        achievement: 'PORTAL_GET_PORTALGUNS',
      },
    },
  ]);
  await assert.rejects(powertoast({ title: 't' }, { send: null, platform: 'linux' }), /no app/);
});

class FakeNotification extends EventEmitter {
  static isSupported() {
    return true;
  }
  constructor(options) {
    super();
    this.options = options;
    FakeNotification.created.push(this);
  }
  show() {
    this.shown = true;
  }
}
FakeNotification.created = [];

test('the app shows it with a local icon only, and a click opens the game', async () => {
  const opened = [];
  const notifier = createDesktopNotifier({ Notification: FakeNotification, onClick: (target) => opened.push(target), hasService: async () => true, platform: 'linux' });
  assert.equal(await notifier.show({ title: 'T', body: 'B', icon: 'https://cdn/x.jpg', urgent: true, appid: '400', achievement: 'A' }), true);
  const [shown] = FakeNotification.created;
  assert.equal(shown.shown, true);
  assert.equal(shown.options.icon, undefined, 'a remote URL is not handed to the notification service');
  assert.equal(shown.options.urgency, 'critical');
  shown.emit('click');
  assert.deepEqual(opened, [{ appid: '400', achievement: 'A' }]);

  assert.equal(localIcon(__filename), __filename);
  assert.equal(localIcon(require('node:url').pathToFileURL(__filename).href), __filename);
  assert.equal(localIcon(path.join(__dirname, 'missing.png')), undefined);
});

// libnotify blocks the main process ~25 s per notification when no daemon answers, so without a
// notification service nothing reaches it; the bus is asked again a minute later, not on every call.
test('without a notification service nothing is shown, and the bus is asked again later', async () => {
  FakeNotification.created = [];
  let clock = 0;
  let asked = 0;
  let up = false;
  const logs = [];
  const notifier = createDesktopNotifier({
    Notification: FakeNotification,
    platform: 'linux',
    now: () => clock,
    log: (m) => logs.push(m),
    hasService: async () => {
      asked += 1;
      return up;
    },
  });
  assert.equal(await notifier.show({ title: 'T' }), false);
  assert.equal(await notifier.notify({ title: 'K' }), false);
  assert.equal(FakeNotification.created.length, 0);
  assert.equal(asked, 1);
  assert.equal(logs.length, 1);

  up = true;
  clock = 61 * 1000;
  assert.equal(await notifier.notify({ title: 'K' }), true);
  assert.equal(await notifier.show({ title: 'T' }), true);
  assert.equal(asked, 2, 'a service found once is not asked about again');
  assert.equal(FakeNotification.created.length, 2);
});

test('Windows never asks the bus', async () => {
  const notifier = createDesktopNotifier({ Notification: FakeNotification, platform: 'win32', hasService: async () => assert.fail('asked') });
  assert.equal(await notifier.notify({ title: 'K' }), true);
});

test('the service counts when running or started on demand, and gdbus missing keeps the old behaviour', async () => {
  const bus = (answers) => (cmd, args, opts, done) => {
    const method = args[args.indexOf('--method') + 1].split('.').pop();
    const answer = answers[method];
    if (answer instanceof Error) done(answer);
    else done(null, answer);
  };
  const failed = Object.assign(new Error('Error: GDBus.Error:org.freedesktop.DBus.Error.Spawn.ChildExited'), { code: 1 });
  assert.equal(await busHasNotificationService(bus({ NameHasOwner: '(true,)\n' })), true);
  assert.equal(await busHasNotificationService(bus({ NameHasOwner: '(false,)\n', StartServiceByName: '(uint32 1,)\n' })), true);
  assert.equal(await busHasNotificationService(bus({ NameHasOwner: '(false,)\n', StartServiceByName: failed })), false);
  assert.equal(await busHasNotificationService(bus({ NameHasOwner: Object.assign(new Error('no bus'), { code: 1 }) })), false);
  assert.equal(await busHasNotificationService(bus({ NameHasOwner: Object.assign(new Error('spawn gdbus ENOENT'), { code: 'ENOENT' }) })), true);
});
