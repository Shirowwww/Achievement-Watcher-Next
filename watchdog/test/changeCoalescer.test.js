'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createChangeCoalescer } = require('../util/changeCoalescer.js');

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('duplicate watcher events are serialized and collapse to the latest pending parse', async () => {
  const changes = createChangeCoalescer();
  const first = deferred();
  const calls = [];

  const running = changes.run('game', async () => {
    calls.push('first');
    await first.promise;
  });
  await Promise.resolve();
  changes.run('game', async () => calls.push('stale'));
  changes.run('game', async () => calls.push('latest'));
  assert.deepEqual(calls, ['first']);

  first.resolve();
  await running;
  assert.deepEqual(calls, ['first', 'latest']);
  assert.equal(changes.pendingCount(), 0);
});

test('different watched games can still refresh concurrently', async () => {
  const changes = createChangeCoalescer();
  const calls = [];
  await Promise.all([
    changes.run('one', async () => calls.push('one')),
    changes.run('two', async () => calls.push('two')),
  ]);
  assert.deepEqual(new Set(calls), new Set(['one', 'two']));
});
