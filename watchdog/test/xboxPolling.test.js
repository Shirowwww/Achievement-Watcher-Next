'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  runXboxPoll,
  matchesActiveXboxPoll,
  xboxTitleForGame,
  nextPollDelay,
  startPollLoop,
  finishPollLoop,
  stopPollLoop,
  XBOX_POLL_INTERVAL_MS,
  XBOX_POLL_MAX_BACKOFF_MS,
  XBOX_EXIT_POLL_DELAY_MS,
} = require('../util/xboxPolling.js');
const { sameTitleAppid } = require('../../app/util/fuzzyAppid.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createState(appid = '100') {
  return {
    appid,
    auth: { token: 'old' },
    snapshot: { before: true },
    polling: false,
  };
}

test('Xbox polls are single-flight and resume once the prior poll completes', async () => {
  const state = createState();
  let current = state;
  const firstAuth = deferred();
  let ensureCalls = 0;
  let pollCalls = 0;
  const writes = [];
  const run = () =>
    runXboxPoll({
      state,
      getCurrentState: () => current,
      ensureSession: () => {
        ensureCalls += 1;
        return ensureCalls === 1 ? firstAuth.promise : { token: 'next' };
      },
      pollOnce: ({ previousSnapshot }) => {
        pollCalls += 1;
        return { snapshot: { round: pollCalls, previousSnapshot }, newUnlocked: [] };
      },
      writeState: (appid, snapshot) => writes.push({ appid, snapshot }),
    });

  const first = run();
  assert.equal(ensureCalls, 1);
  assert.equal(await run(), false, 'an interval tick must not overlap an in-flight request');
  assert.equal(ensureCalls, 1);

  firstAuth.resolve({ token: 'fresh' });
  assert.equal(await first, true);
  assert.equal(state.polling, false);
  assert.equal(pollCalls, 1);
  assert.equal(writes.length, 1);

  assert.equal(await run(), true, 'the next interval tick may run after the first settles');
  assert.equal(ensureCalls, 2);
  assert.equal(pollCalls, 2);
});

test('a replaced poll state cannot continue after session refresh', async () => {
  const state = createState('100');
  const replacement = createState('200');
  let current = state;
  const refreshed = deferred();
  let pollCalls = 0;
  let writes = 0;

  const pending = runXboxPoll({
    state,
    getCurrentState: () => current,
    ensureSession: () => refreshed.promise,
    pollOnce: () => {
      pollCalls += 1;
      return { snapshot: {}, newUnlocked: [] };
    },
    writeState: () => {
      writes += 1;
    },
  });

  current = replacement;
  refreshed.resolve({ token: 'stale-refresh' });
  assert.equal(await pending, false);
  assert.deepEqual(state.auth, { token: 'old' }, 'a stale refresh must not overwrite the old state');
  assert.equal(pollCalls, 0);
  assert.equal(writes, 0);
  assert.equal(state.polling, false);
});

test('a replaced poll state cannot write a late Xbox response or notify', async () => {
  const state = createState('100');
  const replacement = createState('200');
  let current = state;
  const response = deferred();
  const pollStarted = deferred();
  let writes = 0;
  let notifications = 0;

  const pending = runXboxPoll({
    state,
    getCurrentState: () => current,
    ensureSession: () => ({ token: 'fresh' }),
    pollOnce: () => {
      pollStarted.resolve();
      return response.promise;
    },
    writeState: () => {
      writes += 1;
    },
    notifyUnlock: async () => {
      notifications += 1;
    },
  });

  await pollStarted.promise;
  current = replacement;
  response.resolve({ snapshot: { late: true }, newUnlocked: ['one'] });
  assert.equal(await pending, false);
  assert.deepEqual(state.snapshot, { before: true });
  assert.equal(writes, 0);
  assert.equal(notifications, 0);
});

test('a title switch during a notification prevents remaining stale notifications', async () => {
  const state = createState('100');
  const replacement = createState('200');
  let current = state;
  const firstNotification = deferred();
  const notificationStarted = deferred();
  const ids = [];
  const writes = [];

  const pending = runXboxPoll({
    state,
    getCurrentState: () => current,
    ensureSession: () => ({ token: 'fresh' }),
    pollOnce: () => ({ snapshot: { after: true }, newUnlocked: ['first', 'second'] }),
    writeState: (appid, snapshot) => writes.push({ appid, snapshot }),
    beforeNotifications: (newUnlocked) => assert.deepEqual(newUnlocked, ['first', 'second']),
    notifyUnlock: async (id) => {
      ids.push(id);
      if (id === 'first') {
        notificationStarted.resolve();
        await firstNotification.promise;
      }
    },
  });

  await notificationStarted.promise;
  current = replacement;
  firstNotification.resolve();
  assert.equal(await pending, false);
  assert.deepEqual(ids, ['first']);
  assert.equal(writes.length, 1, 'the result was committed while this title was still current');
  assert.deepEqual(state.snapshot, { after: true });
});

test('a failed active poll reports its error and releases the single-flight lock', async () => {
  const state = createState();
  let current = state;
  const errors = [];

  assert.equal(
    await runXboxPoll({
      state,
      getCurrentState: () => current,
      ensureSession: () => ({ token: 'fresh' }),
      pollOnce: () => {
        throw new Error('network failed');
      },
      writeState: () => {},
      onError: (error) => errors.push(error.message),
    }),
    false
  );
  assert.deepEqual(errors, ['network failed']);
  assert.equal(state.polling, false);
});

test('only the matching Xbox game exit stops an active poll', () => {
  const state = createState('100');
  const replacement = createState('200');
  assert.equal(matchesActiveXboxPoll(state, { appid: '100', source: 'Xbox PC' }, (value) => String(value)), true);
  assert.equal(matchesActiveXboxPoll(replacement, { appid: '100', source: 'Xbox PC' }, (value) => String(value)), false);
  assert.equal(matchesActiveXboxPoll(replacement, { appid: '200', source: 'Steam' }, (value) => String(value)), false);
  assert.equal(matchesActiveXboxPoll(replacement, { appid: '200', source: 'Xbox PC' }, (value) => String(value)), true);
  assert.equal(matchesActiveXboxPoll(replacement, undefined, (value) => String(value)), true, 'shutdown still stops any active poll');
});

test('a game another source runs is matched by the exit of that same game, not by the Xbox title id', () => {
  const state = { ...createState('2079757188'), game: { appid: '2483190', source: 'OnlineFix' } };
  assert.equal(matchesActiveXboxPoll(state, { appid: '2483190', source: 'OnlineFix' }, String), true);
  assert.equal(matchesActiveXboxPoll(state, { appid: '2079757188', source: 'Steam' }, String), false);
  assert.equal(matchesActiveXboxPoll(state, { appid: '914710', source: 'GBE Fork' }, String), false);
});

const XBOX_TITLES = { 2079757188: 'Forza Horizon 6', 1717113201: 'Forza Horizon 5', 1659804324: 'Halo Infinite' };
const titleDeps = (titles = XBOX_TITLES) => ({
  normalizeTitleId: (value) => (/^\d+$/.test(String(value ?? '')) ? String(value) : ''),
  listTitles: () => Object.keys(titles),
  titleName: (titleId) => titles[titleId] || '',
  sameTitleAppid,
});

test('the Xbox title behind a running game is found for any source, by the name the library merges on', () => {
  // Issue #231: Forza Horizon 6 runs as an OnlineFix Steam appid while its unlocks live on the Xbox account.
  assert.equal(xboxTitleForGame({ appid: '2483190', name: 'Forza Horizon 6', source: 'OnlineFix' }, titleDeps()), '2079757188');
  assert.equal(xboxTitleForGame({ appid: '1551360', name: 'Forza Horizon 5', source: 'GBE Fork' }, titleDeps()), '1717113201');
  assert.equal(xboxTitleForGame({ appid: '1659804324', name: 'Halo Infinite', source: 'Xbox PC' }, titleDeps()), '1659804324');
});

test('no Xbox title is polled for a game the account does not hold, or one two titles could be', () => {
  assert.equal(xboxTitleForGame({ appid: '1868140', name: 'DAVE THE DIVER', source: 'TENOKE' }, titleDeps()), null);
  assert.equal(xboxTitleForGame({ appid: '2483190', name: '', source: 'OnlineFix' }, titleDeps()), null);
  assert.equal(xboxTitleForGame(null, titleDeps()), null);
  const twins = { 1: 'Forza Horizon 6', 2: 'Forza Horizon 6' };
  assert.equal(xboxTitleForGame({ appid: '2483190', name: 'Forza Horizon 6', source: 'OnlineFix' }, titleDeps(twins)), null);
  const broken = { ...titleDeps(), listTitles: () => { throw new Error('unreadable cache'); } };
  assert.equal(xboxTitleForGame({ appid: '2483190', name: 'Forza Horizon 6', source: 'OnlineFix' }, broken), null);
});

test('the poll waits the interval after a success and backs off after failures, up to a ceiling', () => {
  assert.equal(nextPollDelay({ failures: 0 }), XBOX_POLL_INTERVAL_MS);
  assert.equal(nextPollDelay({ failures: 1, lastError: new Error('x') }), XBOX_POLL_INTERVAL_MS * 2);
  assert.equal(nextPollDelay({ failures: 3, lastError: new Error('x') }), XBOX_POLL_INTERVAL_MS * 8);
  assert.equal(nextPollDelay({ failures: 30, lastError: new Error('x') }), XBOX_POLL_MAX_BACKOFF_MS);
});

test('a rate limit waits at least as long as the service asks', () => {
  const limited = Object.assign(new Error('xbox-network-http-429'), { status: 429, retryAfterMs: 5 * 60000 });
  assert.equal(nextPollDelay({ failures: 1, lastError: limited }), 5 * 60000);
  const unspecified = Object.assign(new Error('xbox-network-http-429'), { status: 429 });
  assert.ok(nextPollDelay({ failures: 1, lastError: unspecified }) >= 2 * 60000, 'a 429 without Retry-After still slows down hard');
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

function countingPoll(state, outcomes = []) {
  const calls = [];
  const poll = async () => {
    calls.push(Date.now());
    const outcome = outcomes.shift();
    if (outcome instanceof Error) {
      state.failures = (state.failures || 0) + 1;
      state.lastError = outcome;
    } else {
      state.failures = 0;
      state.lastError = null;
    }
  };
  return { poll, calls };
}

test('a running game is polled at once, then every interval, and not after it stops', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const state = createState();
  const { poll, calls } = countingPoll(state);

  startPollLoop(state, poll);
  await flush();
  assert.equal(calls.length, 1, 'polled as soon as the game starts');

  t.mock.timers.tick(XBOX_POLL_INTERVAL_MS - 1);
  await flush();
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls.length, 2);
  t.mock.timers.tick(XBOX_POLL_INTERVAL_MS);
  await flush();
  assert.equal(calls.length, 3);

  stopPollLoop(state);
  t.mock.timers.tick(XBOX_POLL_MAX_BACKOFF_MS * 4);
  await flush();
  assert.equal(calls.length, 3, 'nothing polls once the game is gone');
});

test('failed polls space out, and a success brings the normal interval back', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const state = createState();
  const { poll, calls } = countingPoll(state, [new Error('down'), new Error('down'), undefined, undefined]);

  startPollLoop(state, poll);
  await flush();
  assert.equal(calls.length, 1);
  t.mock.timers.tick(XBOX_POLL_INTERVAL_MS);
  await flush();
  assert.equal(calls.length, 1, 'one failure doubles the wait');
  t.mock.timers.tick(XBOX_POLL_INTERVAL_MS);
  await flush();
  assert.equal(calls.length, 2);
  t.mock.timers.tick(XBOX_POLL_INTERVAL_MS * 4 - 1);
  await flush();
  assert.equal(calls.length, 2, 'two failures wait four intervals');
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls.length, 3);
  t.mock.timers.tick(XBOX_POLL_INTERVAL_MS);
  await flush();
  assert.equal(calls.length, 4, 'back to the normal interval after a success');
  stopPollLoop(state);
});

test('a game that closes is polled once more, after a short delay, and then never again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const state = createState();
  const { poll, calls } = countingPoll(state);
  let done = 0;

  startPollLoop(state, poll);
  await flush();
  t.mock.timers.tick(XBOX_POLL_INTERVAL_MS / 2);
  finishPollLoop(state, poll, () => {
    done += 1;
  });
  t.mock.timers.tick(XBOX_EXIT_POLL_DELAY_MS - 1);
  await flush();
  assert.equal(calls.length, 1, 'the regular tick is gone and the last poll waits for the service to catch up');
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(done, 1);
  t.mock.timers.tick(XBOX_POLL_MAX_BACKOFF_MS * 4);
  await flush();
  assert.equal(calls.length, 2);
});

test('the last poll of a closed game respects a back-off in progress, and a new game cancels it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const state = createState();
  const limited = Object.assign(new Error('xbox-network-http-429'), { status: 429, retryAfterMs: 5 * 60000 });
  const { poll, calls } = countingPoll(state, [limited]);

  startPollLoop(state, poll);
  await flush();
  finishPollLoop(state, poll);
  t.mock.timers.tick(5 * 60000 - 1);
  await flush();
  assert.equal(calls.length, 1, 'still rate limited');
  stopPollLoop(state);
  t.mock.timers.tick(XBOX_POLL_MAX_BACKOFF_MS * 4);
  await flush();
  assert.equal(calls.length, 1, 'stopping cancels the pending last poll');
});

test('runXboxPoll counts consecutive failures for the back-off and clears them on success', async () => {
  const state = createState();
  const failing = { status: 503 };
  const run = (pollOnce) =>
    runXboxPoll({ state, getCurrentState: () => state, ensureSession: () => ({}), pollOnce, writeState: () => {} });
  await run(() => {
    throw Object.assign(new Error('busy'), failing);
  });
  await run(() => {
    throw Object.assign(new Error('busy'), failing);
  });
  assert.equal(state.failures, 2);
  assert.equal(state.lastError.status, 503);
  await run(() => ({ snapshot: {}, newUnlocked: [] }));
  assert.equal(state.failures, 0);
  assert.equal(state.lastError, null);
});
