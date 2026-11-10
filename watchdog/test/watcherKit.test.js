'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kit = require('../console/watcherKit.js');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-watcher-kit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const waitFor = async (condition, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end && !condition()) await new Promise((resolve) => setTimeout(resolve, 25));
  return condition();
};

const options = (overrides = {}) => ({
  achievement: { lang: 'english' },
  achievement_source: {},
  notification: { notify: true, rumble: false },
  notification_transport: { mode: 'auto', websocket: false, winRT: true, balloon: false },
  notification_toast: { customToastAudio: '1', groupToast: false },
  notification_advanced: { iconPrefetch: false },
  overlay: { notificationVolume: 80 },
  ...overrides,
});

test('a source is off only at false or level 0, as normalize leaves it in options.ini', () => {
  const starts = (sources) => kit.canStart({ options: options({ achievement_source: sources }), notify: () => {} }, 's');
  for (const off of [false, 0, '0']) assert.equal(starts({ s: off }), false, String(off));
  for (const on of [true, 1, 2, '2', undefined]) assert.equal(starts({ s: on }), true, String(on));
  assert.equal(starts(undefined), true, 'a missing section keeps the source on');
});

test('a watcher starts only with options, its source on, the master switch on and a notify function', () => {
  const notify = () => {};
  assert.equal(kit.canStart({ options: options(), notify }, 'xenia'), true);
  assert.equal(kit.canStart(null, 'xenia'), false);
  assert.equal(kit.canStart({ notify }, 'xenia'), false);
  assert.equal(kit.canStart({ options: options({ achievement_source: { xenia: false } }), notify }, 'xenia'), false);
  assert.equal(kit.canStart({ options: options({ notification: { notify: false } }), notify }, 'xenia'), false);
  assert.equal(kit.canStart({ options: options() }, 'xenia'), false);
  // A source with its own rule passes it as a function of achievement_source.
  assert.equal(kit.canStart({ options: options({ achievement_source: { a: 1 } }), notify }, (s) => s.a === 2), false);
});

test('the notification options carry the transport, the toast and the volume from the settings', () => {
  const ctx = { options: options(), getToastID: () => 'Some.AUMID' };
  assert.deepEqual(kit.unlockToastOptions(ctx, { attribution: 'Trophy' }), {
    notify: true,
    // Without it the balloon fallback speaks English whatever the setting.
    lang: 'english',
    transport: { mode: 'auto', websocket: false },
    toast: {
      appid: 'Some.AUMID',
      winrt: true,
      balloonFallback: false,
      customAudio: '1',
      volume: 80,
      imageIntegration: '0',
      group: false,
      attribution: 'Trophy',
    },
    prefetch: false,
    rumble: false,
  });
  assert.equal(typeof kit.unlockToastOptions(ctx).toast.attribution, 'string', 'the generic word by default');
  assert.equal(kit.gamerscoreAttribution(ctx, 20), '20 G');
  assert.equal(kit.iconPrefetch({ options: { notification_advanced: undefined } }), true);
});

// Settings writes notify: true on every row and shows no switch for it: only a folder turned off is left out.
test('the user folders are the ones turned on, whatever their notify field says', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'userdir.db');
  fs.writeFileSync(
    file,
    JSON.stringify(['C:/legacy', { path: 'C:/on', enabled: true, notify: true }, { path: 'C:/off', enabled: false }, { path: 'C:/quiet', notify: false }, { enabled: true }])
  );
  assert.deepEqual(kit.watchedFolders(file), ['C:/legacy', 'C:/on', 'C:/quiet'].map((folder) => path.resolve(folder)));
  assert.deepEqual(kit.watchedFolders(path.join(dir, 'missing.db')), []);
  fs.writeFileSync(file, '{"not":"a list"}');
  assert.deepEqual(kit.watchedFolders(file), []);
});

test('the same unlock seen twice within the window is a duplicate, another one is not', () => {
  const isDuplicate = kit.createDuplicateGuard();
  assert.equal(isDuplicate('game', 1), false);
  assert.equal(isDuplicate('game', 1), true);
  assert.equal(isDuplicate('game', 2), false);
  assert.equal(isDuplicate('other', 1), false);
  const instant = kit.createDuplicateGuard(0);
  instant('game', 1);
  assert.equal(instant('game', 1), false, 'past the window it is a new event');
});

test('a missing folder resolves to its nearest existing ancestor and the next segment', (t) => {
  const dir = tempDir(t);
  assert.deepEqual(kit.resolveWatchTarget(dir), { ready: true, dir });
  assert.deepEqual(kit.resolveWatchTarget(path.join(dir, 'a', 'b')), { ready: false, watchDir: dir, nextExpected: 'a' });
  fs.mkdirSync(path.join(dir, 'x', 'y'), { recursive: true });
  assert.equal(kit.nearestExistingParent(path.join(dir, 'x', 'y', 'z'), 3), path.join(dir, 'x', 'y'));
  assert.equal(kit.nearestExistingParent(path.join(dir, 'p', 'q', 'r', 's'), 2), '', 'never further up than asked');
});

test('a wait for a folder hands over once it appears, and its watch is closed', async (t) => {
  const dir = tempDir(t);
  const watchers = kit.createWatcherList('kit-test', { warn: () => {} });
  t.after(() => watchers.closeAll());
  let appeared = 0;
  const target = kit.resolveWatchTarget(path.join(dir, 'Saves', 'Profile'));
  assert.ok(kit.awaitSegment(watchers, target, () => (appeared += 1)));
  assert.equal(watchers.size, 1);
  fs.mkdirSync(path.join(dir, 'Saves'));
  assert.ok(await waitFor(() => appeared === 1), 'the new segment is seen');
  assert.equal(watchers.size, 0, 'the waiting watch is closed');
});

test('a removed file counts as a reset only while it stays gone', async (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'save.bin');
  assert.equal(await kit.stillGone([file], 10), true);
  fs.writeFileSync(file, 'x');
  assert.equal(await kit.stillGone([file], 10), false);
});

test('a retry runs a little later, never after cancel, and never past its attempts', async () => {
  const runs = [];
  const retrier = kit.createRetrier({ delayMs: 10, attempts: 2 });
  retrier.later(0, (attempt) => runs.push(attempt));
  retrier.later(2, (attempt) => runs.push(attempt));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(runs, [1]);
  retrier.later(0, (attempt) => runs.push(attempt));
  retrier.cancel();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(runs, [1]);
});

test('the port watchers follow a recompiled port set straight in a game library, besides the Folders', (t) => {
  const root = tempDir(t);
  const cfg = path.join(root, 'cfg');
  const watched = path.join(root, 'Watched');
  const games = path.join(root, 'Games');
  const write = (file, text = '') => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  write(path.join(games, 'ReCasted', 'rcps4-probe.exe'), 'MZ');
  write(path.join(games, 'Regular', 'Regular.exe'), 'MZ');
  write(path.join(games, 'Off', 'rcps4-probe.exe'), 'MZ');
  fs.mkdirSync(watched, { recursive: true });
  write(path.join(cfg, 'userdir.db'), JSON.stringify([{ path: watched, enabled: true }]));
  write(path.join(cfg, 'librarydirs.db'), JSON.stringify([{ path: games, enabled: true }, { path: path.join(root, 'Disabled'), enabled: false }]));

  const [first, ...fromLibrary] = kit.portWatchFolders(path.join(cfg, 'userdir.db'));
  assert.equal(first, watched, 'the Folders come first');
  assert.deepEqual(fromLibrary.sort(), [path.join(games, 'Off'), path.join(games, 'ReCasted')], 'what looks like a port, its reader deciding later');
  assert.deepEqual(kit.portWatchFolders(path.join(root, 'absent', 'userdir.db')), [], 'no settings, nothing');
});
