'use strict';

// The updated AppImage starts after the old process exits and without its file descriptors, which
// would otherwise keep the old version mounted.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { launchAfterExit } = require('../../app/util/appImageRelaunch.js');

const linuxOnly = { skip: process.platform !== 'linux' && 'Linux-only' };

async function waitForFile(file, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    if (Date.now() > deadline) throw new Error(`${file} never appeared`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return fs.readFileSync(file, 'utf8');
}

test('the new AppImage starts only after the old process exits, with no inherited descriptor', linuxOnly, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-relaunch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = path.join(dir, 'report');
  const fakeApp = path.join(dir, 'AW.AppImage');
  // `exec >` rather than `{ ...; } >`, which would park the old stdout on a spare descriptor.
  fs.writeFileSync(fakeApp, `#!/bin/bash\nprintf '%s\\n' "$@" > "${report}.args"\nexec > "${report}.tmp"\ndate +%s%3N\nls /proc/$$/fd\nmv "${report}.tmp" "${report}"\n`, { mode: 0o755 });

  const old = spawn('sleep', ['1']);
  const exitedAt = new Promise((resolve) => old.on('exit', () => resolve(Date.now())));
  // fd 3 stands for the AppImage runtime's pipe, open and inheritable in the process that relaunches.
  const spawnWithPipe = (cmd, args, options) => spawn(cmd, args, { ...options, stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });

  launchAfterExit(fakeApp, { pid: old.pid, args: ['--password-store=basic', 'two words'], spawnFn: spawnWithPipe });
  const [startedMs, ...fds] = (await waitForFile(report)).trim().split('\n');
  assert.deepEqual(fs.readFileSync(`${report}.args`, 'utf8').trim().split('\n'), ['--password-store=basic', 'two words']);

  // The old process is reaped a moment after it dies, hence the small allowance.
  assert.ok(Number(startedMs) >= (await exitedAt) - 100, 'the app started before the old process exited');
  // 255 is the fake app's own script, opened by the bash that runs it.
  const inherited = fds.filter((fd) => fd !== '255').sort();
  assert.deepEqual(inherited, ['0', '1', '2'], `the app received descriptors ${fds.join(',')}`);
});

test('the relaunch goes through bash with the AppImage and the pid to wait for', () => {
  const calls = [];
  const fakeSpawn = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return { unref() {} };
  };
  launchAfterExit('/home/p/AW 3.12.0.AppImage', { pid: 4242, args: ['--password-store=basic'], spawnFn: fakeSpawn });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, '/bin/bash');
  assert.deepEqual(calls[0].args.slice(2), ['/home/p/AW 3.12.0.AppImage', '4242', '--password-store=basic']);
  assert.equal(calls[0].options.detached, true);
});
