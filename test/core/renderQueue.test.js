'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRenderQueue } = require('../../app/util/renderQueue.js');

// A task that finishes when told to, recording when it started.
function gate(log, name) {
  let open;
  const done = new Promise((resolve) => (open = resolve));
  return { task: () => (log.push(name), done.then(() => name)), open };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('never more renders at once than the limit', async () => {
  const queue = createRenderQueue({ limit: 3 });
  const log = [];
  const gates = ['a', 'b', 'c', 'd', 'e'].map((name) => gate(log, name));
  const results = gates.map((g, index) => queue.run(`k${index}`, g.task));
  await tick();
  assert.deepEqual(log, ['a', 'b', 'c']);
  assert.equal(queue.running(), 3);
  gates[1].open();
  await tick();
  assert.deepEqual(log, ['a', 'b', 'c', 'd']);
  gates.forEach((g) => g.open());
  assert.deepEqual(await Promise.all(results), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(queue.running(), 0);
});

test('asks from the screen go before those made ahead', async () => {
  const queue = createRenderQueue({ limit: 1 });
  const log = [];
  const first = gate(log, 'first');
  const done = [queue.run('first', first.task)];
  for (const name of ['warm1', 'warm2']) done.push(queue.run(name, gate(log, name).task, { ahead: true }));
  const shown = gate(log, 'shown');
  done.push(queue.run('shown', shown.task));
  first.open();
  await tick();
  assert.deepEqual(log, ['first', 'shown']);
});

test('the same key is drawn once, and moved up when asked from the screen', async () => {
  const queue = createRenderQueue({ limit: 1 });
  const log = [];
  const first = gate(log, 'first');
  queue.run('first', first.task);
  const other = gate(log, 'other');
  queue.run('other', other.task, { ahead: true });
  const warm = gate(log, 'arcade');
  const ahead = queue.run('arcade', warm.task, { ahead: true });
  const seen = queue.run('arcade', () => assert.fail('drawn twice'));
  assert.equal(seen, ahead);
  first.open();
  await tick();
  assert.deepEqual(log, ['first', 'arcade']);
  warm.open();
  other.open();
  assert.equal(await seen, 'arcade');
});

test('a failed render rejects its own ask and the queue goes on', async () => {
  const queue = createRenderQueue({ limit: 1 });
  await assert.rejects(
    queue.run('bad', () => {
      throw new Error('load timeout');
    }),
    /load timeout/
  );
  assert.equal(await queue.run('bad', () => 'again'), 'again');
  assert.equal(await queue.run(null, () => 'unkeyed'), 'unkeyed');
});
