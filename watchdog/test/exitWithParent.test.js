'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { exitWithParent } = require('../util/exitWithParent.js');

function fakeProcess({ ipc = true } = {}) {
  const proc = new EventEmitter();
  if (ipc) proc.send = () => true;
  return proc;
}

test('exits once the app closes the ipc channel', () => {
  const proc = fakeProcess();
  const calls = [];
  const armed = exitWithParent(proc, { onExit: () => calls.push('cleanup'), exit: () => calls.push('exit') });

  assert.equal(armed, true);
  assert.deepEqual(calls, []);
  proc.emit('disconnect');
  assert.deepEqual(calls, ['cleanup', 'exit']);
});

test('still exits when the cleanup throws', () => {
  const proc = fakeProcess();
  const calls = [];
  exitWithParent(proc, {
    onExit: () => {
      throw new Error('worker already gone');
    },
    exit: () => calls.push('exit'),
  });

  proc.emit('disconnect');
  assert.deepEqual(calls, ['exit']);
});

test('leaves a standalone run without an ipc channel alone', () => {
  const proc = fakeProcess({ ipc: false });
  const armed = exitWithParent(proc, { exit: () => assert.fail('must not exit') });

  assert.equal(armed, false);
  assert.equal(proc.listenerCount('disconnect'), 0);
});
