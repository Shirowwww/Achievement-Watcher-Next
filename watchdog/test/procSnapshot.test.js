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

test('the launch appid comes from SteamAppId, then SteamGameId, and never from a shortcut id', () => {
  const { launchAppid } = require('../util/procSnapshot.js');
  assert.equal(launchAppid({ SteamAppId: '400', SteamGameId: '400' }), '400');
  assert.equal(launchAppid({ SteamGameId: '1245620' }), '1245620');
  assert.equal(launchAppid({ SteamAppId: '0', SteamGameId: '0' }), '');
  // A non-Steam shortcut: 0 for the app, a 64-bit game id or a top-bit shortcut id for the game.
  assert.equal(launchAppid({ SteamAppId: '0', SteamGameId: '13930580426376314880' }), '');
  assert.equal(launchAppid({ SteamAppId: '3243439216' }), '');
  // umu-launcher's GAMEID=umu-default leaves "default".
  assert.equal(launchAppid({ SteamAppId: 'default', SteamGameId: 'default' }), '');
  assert.equal(launchAppid({ SteamAppId: ' 0400 ' }), '400');
  assert.equal(launchAppid({}), '');
});

/*
  Live processes for the Linux-only cases: a copy of Node under a long name, so the
  executable link, argv[0] and the 15-character comm all disagree in length.
*/
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

function startSleeper(name, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-proc-'));
  const binary = path.join(dir, name);
  // A copy of Node, not of /bin/sleep: Ubuntu 26.04's coreutils exits at once when copied and renamed.
  fs.copyFileSync(process.execPath, binary);
  fs.chmodSync(binary, 0o755);
  const child = spawn(binary, ['-e', 'setTimeout(() => {}, 30000)'], { env: { PATH: process.env.PATH, ...env }, stdio: 'ignore' });
  const stop = () => {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { child, binary, stop };
}

async function waitForStart(pid) {
  for (let i = 0; i < 50; i++) {
    try {
      if (fs.readlinkSync(`/proc/${pid}/exe`) !== process.execPath) return;
    } catch {
      /* not there yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('a native process keeps its full name past the 15 characters comm holds', LINUX_ONLY, async (t) => {
  const { snapshot } = load();
  const sleeper = startSleeper('AWTestGameWithALongName.x86_64');
  t.after(sleeper.stop);
  await waitForStart(sleeper.child.pid);
  assert.equal(fs.readFileSync(`/proc/${sleeper.child.pid}/comm`, 'utf8').trim(), 'AWTestGameWithA');
  const row = snapshot.listSync().find((entry) => entry.pid === sleeper.child.pid);
  assert.equal(row && row.process, 'AWTestGameWithALongName.x86_64');
});

test('a binary replaced while it runs keeps its name and path, without " (deleted)"', LINUX_ONLY, async (t) => {
  const { snapshot } = load();
  const sleeper = startSleeper('UpdatedGame.x86_64');
  t.after(sleeper.stop);
  await waitForStart(sleeper.child.pid);
  fs.unlinkSync(sleeper.binary);
  assert.match(fs.readlinkSync(`/proc/${sleeper.child.pid}/exe`), / \(deleted\)$/);
  const row = snapshot.listSync().find((entry) => entry.pid === sleeper.child.pid);
  assert.equal(row && row.process, 'UpdatedGame.x86_64');
  assert.equal(snapshot.getProcessPath(sleeper.child.pid), sleeper.binary);
});

test('the appid a process was launched for is read from its environment', LINUX_ONLY, async (t) => {
  const { snapshot, tasklist } = load();
  const launched = startSleeper('LaunchedGame', { SteamAppId: '400', SteamGameId: '400' });
  const other = startSleeper('OtherProgram');
  t.after(launched.stop);
  t.after(other.stop);
  await waitForStart(launched.child.pid);
  await waitForStart(other.child.pid);
  assert.equal(snapshot.getLaunchAppid(launched.child.pid), '400');
  assert.equal(tasklist.getLaunchAppid(launched.child.pid), '400');
  assert.equal(snapshot.getLaunchAppid(other.child.pid), '');
  assert.equal(snapshot.getLaunchAppid(-1), '');
  const pids = snapshot.pidsWithLaunchAppid('400');
  assert.ok(pids.includes(launched.child.pid));
  assert.ok(!pids.includes(other.child.pid));
  assert.deepEqual(snapshot.pidsWithLaunchAppid(''), []);
});

test('tasklist.isProcessRunning answers by process name and by pid', LINUX_ONLY, async () => {
  const { tasklist } = load();
  const self = path.basename(process.execPath);
  assert.equal(await tasklist.isProcessRunning(self), true);
  assert.equal(await tasklist.isProcessRunning(process.pid), true);
  assert.equal(await tasklist.isProcessRunning('aw-no-such-binary'), false);
  assert.equal(await tasklist.isProcessRunning(''), false);
});
