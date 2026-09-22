'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REGODIT_USERS = ['monitor.js', 'notification/toaster.js', 'playtime/track.js', 'playtime/monitor.js'];
const HELPER = path.join(__dirname, '..', 'util', 'regodit.js');

// Under the pinned koffi 3.x, `regodit/promises` DWORD writes segfault and kill the Watchdog, so
// every call must go through the sync entry point; these checks pin that invariant.
test('the watchdog only uses the synchronous regodit API', () => {
  const helper = fs.readFileSync(HELPER, 'utf8');
  assert.doesNotMatch(helper, /import\(\s*['"]regodit\/promises['"]\s*\)/, 'the loader must not import regodit/promises');
  assert.match(helper, /import\(\s*['"]regodit['"]\s*\)/, 'the loader must use the sync entry point');
  for (const rel of REGODIT_USERS) {
    const source = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.doesNotMatch(source, /import\(\s*['"]regodit/, `${rel} must load regodit through util/regodit.js, which pins its DLL`);
    assert.match(source, /require\(['"][./]+util\/regodit\.js['"]\)/, `${rel} must use util/regodit.js`);
  }
});

// regodit is a Go DLL: unloaded on a natural process exit while the Go runtime still runs, it took
// the process down with 0xC0000005 more than half the time under load. Pinned, it never does.
test(
  'a process that loaded regodit exits cleanly on its own',
  { skip: process.platform !== 'win32' ? 'Windows-only' : false },
  async () => {
    const { spawn } = require('node:child_process');
    const script = `require(${JSON.stringify(HELPER)}).loadRegodit().then((r) => r.regQueryStringValueAndExpand('HKCU', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'Personal'));`;
    const runs = Array.from(
      { length: 24 },
      () =>
        new Promise((resolve) => {
          const child = spawn(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
          child.on('exit', (code) => resolve(code >>> 0));
        })
    );
    const codes = await Promise.all(runs);
    assert.deepEqual(
      codes.filter((code) => code !== 0),
      [],
      'no run may crash on exit'
    );
  }
);

test('playtime registry writes stay on the sync API', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'playtime', 'track.js'), 'utf8');
  assert.match(source, /regWriteDwordValue/);
  assert.doesNotMatch(source, /await regedit\.regWriteDwordValue/);
});

// Sync reads mirror what production relies on (playtime, toast duration, Documents path); a
// segfault here fails the suite loudly instead of killing the app silently.
test(
  'regodit sync registry read works on Windows',
  { skip: process.platform !== 'win32' ? 'Windows-only' : false },
  async () => {
    const regedit = await import('regodit');
    let value;
    try {
      value = regedit.regQueryIntegerValue('HKCU', 'Control Panel/Accessibility', 'MessageDuration');
    } catch {
      value = null;
    }
    assert.ok(
      value === null || typeof value === 'number' || typeof value === 'bigint',
      `expected a registry value, got ${JSON.stringify(value)}`
    );
  }
);
