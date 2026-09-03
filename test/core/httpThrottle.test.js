'use strict';

/*
  The gate exists because of issue #55: a 192-game library asked Steam's hosts faster than they
  allow, and the refusals came back as "this game has no achievements". These tests describe the
  pacing policy with an injected clock, so nothing here waits on real time.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createRequestGate, parseRetryAfter, isThrottleStatus } = require('../../app/util/httpThrottle.js');

// A clock the gate's sleep() advances, so a described wait is a measurable one.
function fakeClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += Math.max(0, ms);
    },
    advance: (ms) => {
      time += ms;
    },
    read: () => time,
  };
}

function ok(status = 200, headers = {}) {
  return { status, headers: { get: (name) => headers[String(name).toLowerCase()] ?? null } };
}

test('Retry-After is read as seconds or as an HTTP date, and anything else is "no answer"', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  assert.equal(parseRetryAfter('30', now), 30000);
  assert.equal(parseRetryAfter('0', now), 0);
  assert.equal(parseRetryAfter('Thu, 01 Jan 2026 00:00:45 GMT', now), 45000);
  // A date already in the past is a wait of zero, not a negative one.
  assert.equal(parseRetryAfter('Thu, 01 Jan 2026 00:00:00 GMT', now + 5000), 0);
  for (const value of [null, undefined, '', '   ', 'soon', '-5']) {
    assert.equal(parseRetryAfter(value, now), null, `${JSON.stringify(value)} says nothing`);
  }
});

test('only a temporary refusal is worth waiting out', () => {
  for (const status of [429, 502, 503, 504]) assert.equal(isThrottleStatus(status), true, `${status} is temporary`);
  for (const status of [200, 204, 301, 400, 403, 404, 500]) {
    assert.equal(isThrottleStatus(status), false, `${status} is a final answer`);
  }
});

test('two starts are never closer together than minIntervalMs', async () => {
  const clock = fakeClock();
  const starts = [];
  const gate = createRequestGate({ concurrency: 1, minIntervalMs: 100, now: clock.now, sleep: clock.sleep });

  const task = async () => {
    starts.push(clock.read());
    return ok();
  };

  await Promise.all([gate.run(task), gate.run(task), gate.run(task), gate.run(task)]);

  assert.deepEqual(starts, [0, 100, 200, 300]);
});

test('never more than `concurrency` requests are in flight', async () => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let live = 0;
  let peak = 0;
  // Real time, no spacing: the point here is the slot count, not the clock.
  const gate = createRequestGate({ concurrency: 2, minIntervalMs: 0 });

  const task = async () => {
    live += 1;
    peak = Math.max(peak, live);
    await held;
    live -= 1;
    return ok();
  };

  const all = Promise.all([gate.run(task), gate.run(task), gate.run(task), gate.run(task)]);
  // Every task that could start has started by now; the other two are still queued.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(live, 2, 'only two ran');
  assert.equal(gate.stats().waiting, 2, 'the other two are queued, not dropped');
  release();
  await all;
  assert.equal(peak, 2, `at most two in flight, saw ${peak}`);
});

test('a 429 is retried after the delay the host asked for', async () => {
  const clock = fakeClock();
  const attemptsAt = [];
  const gate = createRequestGate({ concurrency: 1, attempts: 3, backoffMs: 1000, now: clock.now, sleep: clock.sleep });

  const answer = await gate.run(async (attempt) => {
    attemptsAt.push(clock.read());
    return attempt < 3 ? ok(429, { 'retry-after': '7' }) : ok(200);
  });

  assert.equal(answer.status, 200);
  assert.deepEqual(attemptsAt, [0, 7000, 14000], 'each retry waits the 7s the header asked for');
});

test('without a Retry-After the wait doubles, and is capped', async () => {
  const clock = fakeClock();
  const attemptsAt = [];
  const gate = createRequestGate({
    concurrency: 1,
    attempts: 4,
    backoffMs: 1000,
    maxBackoffMs: 2500,
    now: clock.now,
    sleep: clock.sleep,
  });

  const answer = await gate.run(async () => {
    attemptsAt.push(clock.read());
    return ok(429);
  });

  // 1000, then 2000, then 4000 clamped to 2500. The last refusal is handed back rather than retried.
  assert.deepEqual(attemptsAt, [0, 1000, 3000, 5500]);
  assert.equal(answer.status, 429, 'the caller still sees the refusal and can say "unknown"');
});

test('a Retry-After longer than the cap is capped, not obeyed', async () => {
  const clock = fakeClock();
  const attemptsAt = [];
  // The budget is generous here so the cap is what the test is about; a caller with a real per-game
  // budget gives up instead, which the give-up tests below cover.
  const gate = createRequestGate({
    concurrency: 1,
    attempts: 2,
    maxBackoffMs: 30000,
    maxWaitMs: 60000,
    now: clock.now,
    sleep: clock.sleep,
  });

  await gate.run(async () => {
    attemptsAt.push(clock.read());
    return ok(503, { 'retry-after': '3600' });
  });

  assert.deepEqual(attemptsAt, [0, 30000], 'an hour-long header is not waited out');
});

test('one refusal pauses the host for every request behind it', async () => {
  const clock = fakeClock();
  const gate = createRequestGate({ concurrency: 2, attempts: 1, backoffMs: 5000, now: clock.now, sleep: clock.sleep });

  // The first request is refused; the second must wait out the pause it earned, even though it
  // never saw a 429 itself.
  const refused = gate.run(async () => ok(429));
  await refused;
  let secondRanAt = -1;
  await gate.run(async () => {
    secondRanAt = clock.read();
    return ok(200);
  });

  assert.equal(secondRanAt, 5000, 'the pause is a fact about the host, not about one request');
});

test('reset drops a cooldown a manual refresh must not sit out', async () => {
  const clock = fakeClock();
  const gate = createRequestGate({ concurrency: 1, attempts: 1, backoffMs: 60000, maxBackoffMs: 60000, now: clock.now, sleep: clock.sleep });

  await gate.run(async () => ok(429));
  assert.equal(gate.stats().pausedForMs, 60000);
  gate.reset();
  assert.equal(gate.stats().pausedForMs, 0);

  let ranAt = -1;
  await gate.run(async () => {
    ranAt = clock.read();
    return ok(200);
  });
  assert.equal(ranAt, 0, 'nothing was waited out');
});

test('a task that answers with data, not a Response, is paced but never retried', async () => {
  const clock = fakeClock();
  let calls = 0;
  const gate = createRequestGate({ concurrency: 1, attempts: 3, now: clock.now, sleep: clock.sleep });

  const answer = await gate.run(async () => {
    calls += 1;
    return { achievements: [] };
  });

  assert.equal(calls, 1);
  assert.deepEqual(answer, { achievements: [] });
});

test('a throwing task releases its slot', async () => {
  const clock = fakeClock();
  const gate = createRequestGate({ concurrency: 1, now: clock.now, sleep: clock.sleep });

  await assert.rejects(gate.run(async () => {
    throw new Error('ENOTFOUND');
  }));
  assert.equal(gate.stats().inFlight, 0, 'a failure must not leak the only slot');

  // Proof the gate still works afterwards.
  assert.equal((await gate.run(async () => ok(200))).status, 200);
});

test('a request that cannot start inside its budget is never sent', async () => {
  const clock = fakeClock();
  let calls = 0;
  // One slot, 10s apart: the second request would start at 10000, past its 5s budget.
  const gate = createRequestGate({ concurrency: 1, minIntervalMs: 10000, maxWaitMs: 5000, now: clock.now, sleep: clock.sleep });

  const task = async () => {
    calls += 1;
    return ok();
  };

  const [first, second] = await Promise.all([gate.run(task), gate.run(task)]);

  assert.equal(first.status, 200);
  assert.equal(second, null, 'null means the task was never run');
  assert.equal(calls, 1, 'and it really was not sent');
});

test('a pause longer than the budget makes the request give up instead of stalling a scan', async () => {
  const clock = fakeClock();
  const gate = createRequestGate({
    concurrency: 1,
    attempts: 1,
    backoffMs: 60000,
    maxBackoffMs: 60000,
    maxWaitMs: 8000,
    now: clock.now,
    sleep: clock.sleep,
  });

  await gate.run(async () => ok(429));
  const before = clock.read();
  assert.equal(await gate.run(async () => ok(200)), null, 'a 60s pause is not worth a 30s game budget');
  assert.equal(clock.read(), before, 'and nothing was waited out to find that out');
});

test('the per-call budget overrides the gate default', async () => {
  const clock = fakeClock();
  const gate = createRequestGate({ concurrency: 1, minIntervalMs: 3000, maxWaitMs: 1000, now: clock.now, sleep: clock.sleep });

  const first = await gate.run(async () => ok());
  assert.equal(first.status, 200);
  assert.equal(await gate.run(async () => ok()), null, 'the default budget is too small for the spacing');
  assert.equal((await gate.run(async () => ok(), { maxWaitMs: 30000 })).status, 200, 'a caller may wait longer');
});

test('a refusal is handed back even when the retry it earned ran out of budget', async () => {
  const clock = fakeClock();
  let calls = 0;
  const gate = createRequestGate({
    concurrency: 1,
    attempts: 3,
    backoffMs: 20000,
    maxBackoffMs: 20000,
    maxWaitMs: 5000,
    now: clock.now,
    sleep: clock.sleep,
  });

  const answer = await gate.run(async () => {
    calls += 1;
    return ok(429);
  });

  assert.equal(calls, 1, 'the retry was too expensive to make');
  assert.equal(answer.status, 429, 'but "refused" is a truer answer than "not attempted"');
});
