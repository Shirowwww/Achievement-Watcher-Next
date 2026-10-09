'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const LINUX_ONLY = { skip: process.platform !== 'linux' && 'Linux-only' };

// procSnapshot.js reads /proc: the Linux counterpart of processSnapshot.js, which these tests do not touch.
function load() {
  return { snapshot: require('../util/procSnapshot.js'), tasklist: require('../util/tasklist.js') };
}

test('the /proc snapshot is available and lists the current process', LINUX_ONLY, () => {
  const { snapshot } = load();
  assert.equal(snapshot.isAvailable(), true);

  const self = snapshot.listSync().find((entry) => entry.pid === process.pid);
  assert.ok(self, 'the running test process must appear in the snapshot');
  assert.equal(typeof self.process, 'string');
  assert.notEqual(self.process, '');
  assert.ok(self.pid > 0);
});

test('every row carries a non-empty name and a positive pid', LINUX_ONLY, () => {
  const { snapshot } = load();
  const rows = snapshot.listSync();
  assert.ok(rows.length > 0, 'expected at least one process');
  for (const entry of rows) {
    assert.equal(typeof entry.process, 'string');
    assert.notEqual(entry.process, '');
    assert.ok(Number.isInteger(entry.pid) && entry.pid > 0, `bad pid ${entry.pid}`);
  }
});

test('a process path resolves for the current process and is empty for a dead one', LINUX_ONLY, () => {
  const { snapshot } = load();
  assert.equal(snapshot.getProcessPath(process.pid), process.execPath);
  // An unreachable pid must degrade to '' rather than throw: the playtime monitor treats it as unresolvable.
  assert.equal(snapshot.getProcessPath(0x7ffffff0), '');
  assert.equal(snapshot.getProcessPath(-1), '');
  assert.equal(snapshot.getProcessPath(undefined), '');
});

test('tasklist.isProcessRunning answers by process name and by pid', LINUX_ONLY, async () => {
  const { tasklist } = load();
  const self = path.basename(process.execPath);
  assert.equal(await tasklist.isProcessRunning(self), true);
  assert.equal(await tasklist.isProcessRunning(process.pid), true);
  assert.equal(await tasklist.isProcessRunning('aw-no-such-binary'), false);
  assert.equal(await tasklist.isProcessRunning(''), false);
});
