'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const snapshot = require('../util/processSnapshot.js');
const tasklist = require('../util/tasklist.js');

// The native process list replaces spawning `tasklist.exe` on the playtime monitor's 3s poll: these
// assert the shape the monitor relies on, not a specific machine's process table contents.

test('the native snapshot is available and lists the current process', () => {
  assert.equal(snapshot.isAvailable(), true);

  const processes = snapshot.listSync();
  assert.ok(processes.length > 0, 'expected at least one process');

  const self = processes.find((entry) => entry.pid === process.pid);
  assert.ok(self, 'the running test process must appear in the snapshot');
  assert.equal(typeof self.process, 'string');
  assert.equal(self.process.toLowerCase(), path.basename(process.execPath).toLowerCase());
});

test('every row carries a usable name and a positive pid', () => {
  for (const entry of snapshot.listSync()) {
    assert.equal(typeof entry.process, 'string');
    assert.notEqual(entry.process, '');
    assert.ok(Number.isInteger(entry.pid) && entry.pid >= 0, `bad pid ${entry.pid}`);
  }
});

test('a process path resolves for the current process and never throws for a dead one', () => {
  assert.equal(snapshot.getProcessPath(process.pid).toLowerCase(), process.execPath.toLowerCase());
  // Unreachable pids (exited, protected, malformed) must degrade to '' rather than throw: the
  // playtime monitor treats a missing path as "not resolvable" and carries on.
  assert.equal(snapshot.getProcessPath(0x7ffffff0), '');
  assert.equal(snapshot.getProcessPath(-1), '');
  assert.equal(snapshot.getProcessPath(undefined), '');
});

test('the system query lists the same processes as the ToolHelp snapshot', () => {
  const key = (entry) => `${entry.pid}:${entry.process}`;
  // Processes come and go between two reads, so compare against a read taken on either side.
  const before = new Set(snapshot.listToolHelpSync().map(key));
  const listed = snapshot.listSync().map(key);
  const after = new Set(snapshot.listToolHelpSync().map(key));
  for (const row of listed) assert.ok(before.has(row) || after.has(row), `unexpected row ${row}`);
  const seen = new Set(listed);
  for (const row of before) if (after.has(row)) assert.ok(seen.has(row), `missing row ${row}`);
});

test('a process started or ended between two polls is seen by the next one', async () => {
  const { spawn } = require('child_process');
  snapshot.listSync();
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' });
  try {
    await new Promise((resolve) => child.once('spawn', resolve));
    assert.ok(snapshot.listSync().some((entry) => entry.pid === child.pid), 'the new process must be listed');
  } finally {
    child.kill();
  }
  await new Promise((resolve) => child.once('exit', resolve));
  // The pid is freed once the last handle closes, which follows the exit closely but not at once.
  let gone = false;
  for (let i = 0; i < 50 && !gone; i++) {
    gone = !snapshot.listSync().some((entry) => entry.pid === child.pid);
    if (!gone) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(gone, 'the exited process must leave the list');
});

test('without the one-call list the snapshot still answers through ToolHelp', () => {
  // A child process: koffi registers struct names for the whole process, so the module cannot be
  // loaded a second time here.
  const { execFileSync } = require('child_process');
  const script = `
    const koffi = require('koffi');
    const load = koffi.load;
    koffi.load = (name, ...rest) => {
      if (String(name).toLowerCase() === 'ntdll.dll') throw new Error('simulated: ntdll unavailable');
      return load.call(koffi, name, ...rest);
    };
    const snapshot = require('./util/processSnapshot.js');
    process.stdout.write(JSON.stringify({ available: snapshot.isAvailable(), listed: snapshot.listSync().some((e) => e.pid === process.pid) }));
  `;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }));
  assert.deepEqual(out, { available: true, listed: true });
});

test('the last list is reused only while the pids, their order and the newest process all match', () => {
  const previous = { pids: [0, 4, 120, 4410], newestCreated: 1000n, at: 0 };
  const reuse = (pids, newestCreated, now = 1000) => snapshot.canReuseList(previous, Uint32Array.from(pids), newestCreated, now);

  assert.equal(reuse([0, 4, 120, 4410], 1000n), true);
  assert.equal(reuse([0, 4, 120], 1000n), false, 'a process ended');
  assert.equal(reuse([0, 4, 120, 4410, 5000], 1000n), false, 'a process started');
  assert.equal(reuse([0, 4, 4410, 120], 1000n), false, 'an ended pid was handed to a new process');
  // The newest process ended and a new one took its pid: same list, different creation time.
  assert.equal(reuse([0, 4, 120, 4410], 2000n), false);
  assert.equal(reuse([0, 4, 120, 4410], null), false, 'the newest process could not be queried');
  assert.equal(reuse([0, 4, 120, 4410], 1000n, 10 * 60 * 1000), false, 'a list too old is read again');
  assert.equal(snapshot.canReuseList(null, Uint32Array.from([0, 4]), 1000n, 0), false);
});

test('tasklist.list keeps the {process, pid} contract the monitor indexes on', async () => {
  const processes = await tasklist.list();
  assert.ok(processes.length > 0);
  assert.ok(processes.every((entry) => typeof entry.process === 'string' && Number.isInteger(entry.pid)));
  assert.ok(processes.some((entry) => entry.pid === process.pid));
});

test('tasklist.isProcessRunning answers by image name and by pid', async () => {
  const self = path.basename(process.execPath);
  assert.equal(await tasklist.isProcessRunning(self), true);
  assert.equal(await tasklist.isProcessRunning(process.pid), true);
  assert.equal(await tasklist.isProcessRunning('aw-no-such-binary.exe'), false);
  assert.equal(await tasklist.isProcessRunning(''), false);
});

test('the fast path is reported as live so a silent fallback is visible in the log', async () => {
  await tasklist.list();
  // If this ever fails on a supported machine the poll has quietly gone back to spawning
  // tasklist.exe, which costs ~440 ms every 3 s for the whole life of the tray daemon.
  assert.equal(tasklist.usingNativeSnapshot(), true);
});

test('the win-tasklist fallback agrees with the native path', async () => {
  const path2 = require('path');
  const snapshotModule = require('../util/processSnapshot.js');
  const listSync = snapshotModule.listSync;
  const self = path2.basename(process.execPath);

  // Force the fallback the way a machine where koffi cannot load kernel32 would.
  snapshotModule.listSync = () => {
    throw new Error('simulated koffi failure');
  };
  delete require.cache[require.resolve('../util/tasklist.js')];
  const fallback = require('../util/tasklist.js');
  try {
    const processes = await fallback.list();
    assert.ok(processes.some((entry) => entry.pid === process.pid));
    // Only observed once a call has actually fallen through, which is exactly when the playtime
    // monitor logs it (it seeds a snapshot before writing the line).
    assert.equal(fallback.usingNativeSnapshot(), false);
    // Regression guard: win-tasklist's own isProcessRunning() filters on `STATUS eq RUNNING`, which
    // answers false for an ordinary running process, so the fallback must not use it.
    assert.equal(await fallback.isProcessRunning(self), true);
    assert.equal(await fallback.isProcessRunning('aw-no-such-binary.exe'), false);
  } finally {
    snapshotModule.listSync = listSync;
    delete require.cache[require.resolve('../util/tasklist.js')];
  }
});
