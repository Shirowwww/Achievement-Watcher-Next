'use strict';

/*
  The updater state machine. Every phase the UI can render is reachable here without a release, a
  network or Electron - which is the whole point of moving it out of electron/init.js, where the
  same information lived as four booleans nothing could exercise.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const updateStatus = require(path.join(__dirname, '..', '..', 'app', 'util', 'updateStatus.js'));

function run(events, start = updateStatus.initialState()) {
  return events.reduce((state, event) => updateStatus.reduce(state, event), start);
}

test('a fresh state says nothing is happening', () => {
  const state = updateStatus.initialState();
  assert.equal(state.phase, 'idle');
  assert.equal(state.percent, -1);
  assert.equal(state.cancellable, false);
  assert.equal(updateStatus.isBusy(state), false);
});

test('the happy path walks check to install', () => {
  let state = updateStatus.reduce(updateStatus.initialState(), { type: 'checking' });
  assert.equal(state.phase, 'checking');

  state = updateStatus.reduce(state, { type: 'available', version: '3.10.1' });
  assert.equal(state.phase, 'available');
  assert.equal(state.version, '3.10.1');
  assert.equal(state.cancellable, false, 'nothing is transferring yet');

  state = updateStatus.reduce(state, { type: 'download-started', version: '3.10.1' });
  assert.equal(state.phase, 'downloading');
  assert.equal(state.percent, 0);
  assert.equal(state.cancellable, true);

  state = updateStatus.reduce(state, { type: 'progress', percent: 42.4, bytesPerSecond: 2048, transferred: 424, total: 1000 });
  assert.equal(state.percent, 42.4);
  assert.equal(state.version, '3.10.1', 'progress must not lose the version');

  state = updateStatus.reduce(state, { type: 'downloaded', version: '3.10.1' });
  assert.equal(state.phase, 'ready');
  assert.equal(state.percent, 100);
  assert.equal(state.cancellable, false, 'a finished download cannot be cancelled');

  state = updateStatus.reduce(state, { type: 'installing', version: '3.10.1' });
  assert.equal(state.phase, 'installing');
  assert.equal(updateStatus.isBusy(state), true);
});

test('a download held back for a running game is its own phase, not silence', () => {
  const state = run([{ type: 'download-started', version: '3.10.1' }, { type: 'downloaded' }, { type: 'held' }]);
  assert.equal(state.phase, 'held');
  assert.equal(state.version, '3.10.1', 'the held state still names the version it is holding');
});

test('a cancellation returns to idle rather than to an error', () => {
  const state = run([{ type: 'download-started', version: '3.10.1' }, { type: 'progress', percent: 30 }, { type: 'cancelled' }]);
  assert.deepEqual(state, updateStatus.initialState());
});

test('progress that arrives after the download ended is ignored', () => {
  const ready = run([{ type: 'download-started', version: '3.10.1' }, { type: 'downloaded' }]);
  // electron-updater can emit one last chunk after the file is written; it must not reopen the
  // downloading phase and put a live Cancel button back on screen.
  const after = updateStatus.reduce(ready, { type: 'progress', percent: 99 });
  assert.equal(after.phase, 'ready');
  assert.equal(after.percent, 100);
});

test('a check that fires mid-download does not erase it', () => {
  const downloading = run([{ type: 'download-started', version: '3.10.1' }, { type: 'progress', percent: 12 }]);
  const after = updateStatus.reduce(downloading, { type: 'checking' });
  assert.equal(after.phase, 'downloading');
  assert.equal(after.percent, 12);
});

test('an error keeps the version it failed on and carries the message', () => {
  const state = run([{ type: 'available', version: '3.10.1' }, { type: 'error', message: 'net::ERR_CONNECTION_RESET' }]);
  assert.equal(state.phase, 'error');
  assert.equal(state.version, '3.10.1');
  assert.equal(state.error, 'net::ERR_CONNECTION_RESET');
  assert.equal(state.cancellable, false);
});

test('an unknown event leaves the state exactly as it was', () => {
  const state = run([{ type: 'download-started', version: '3.10.1' }]);
  assert.equal(updateStatus.reduce(state, { type: 'who-knows' }), state);
  assert.equal(updateStatus.reduce(state, null), state);
});

test('percent is clamped, and a broken counter reads as zero rather than NaN', () => {
  const downloading = run([{ type: 'download-started', version: '3.10.1' }]);
  assert.equal(updateStatus.reduce(downloading, { type: 'progress', percent: 140 }).percent, 100);
  assert.equal(updateStatus.reduce(downloading, { type: 'progress', percent: -5 }).percent, 0);
  assert.equal(updateStatus.reduce(downloading, { type: 'progress', percent: 'nonsense' }).percent, 0);
  assert.equal(updateStatus.reduce(downloading, { type: 'progress', percent: 10, bytesPerSecond: -1 }).bytesPerSecond, 0);
});

test('the broadcast throttle fires on whole percents and on every phase change', () => {
  const a = run([{ type: 'download-started', version: '3.10.1' }, { type: 'progress', percent: 10.1 }]);
  const b = updateStatus.reduce(a, { type: 'progress', percent: 10.4 });
  const c = updateStatus.reduce(a, { type: 'progress', percent: 10.6 });

  assert.equal(updateStatus.shouldPublish(null, a), true, 'the first state is always published');
  assert.equal(updateStatus.shouldPublish(a, b), false, 'sub-percent chunks must not wake the renderers');
  assert.equal(updateStatus.shouldPublish(a, c), true);
  assert.equal(updateStatus.shouldPublish(a, updateStatus.reduce(a, { type: 'downloaded' })), true);
});

test('the estimate is only offered when there is something to base it on', () => {
  const downloading = run([{ type: 'download-started', version: '3.10.1' }]);
  assert.equal(updateStatus.etaSeconds(downloading), -1, 'no rate yet');
  const measured = updateStatus.reduce(downloading, { type: 'progress', percent: 50, bytesPerSecond: 100, transferred: 500, total: 1000 });
  assert.equal(updateStatus.etaSeconds(measured), 5);
  assert.equal(updateStatus.etaSeconds(updateStatus.initialState()), -1);
});

test('every phase the reducer can produce is one the UI knows about', () => {
  const produced = new Set();
  const events = [
    { type: 'checking' },
    { type: 'available', version: '1' },
    { type: 'download-started', version: '1' },
    { type: 'progress', percent: 1 },
    { type: 'downloaded' },
    { type: 'held' },
    { type: 'installing' },
    { type: 'error', message: 'x' },
    { type: 'cancelled' },
    { type: 'not-available' },
    { type: 'reset' },
  ];
  let state = updateStatus.initialState();
  for (const event of events) {
    state = updateStatus.reduce(state, event);
    produced.add(state.phase);
  }
  for (const phase of produced) assert.ok(updateStatus.PHASES.includes(phase), `unlisted phase ${phase}`);
});
