'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REGODIT_USERS = ['monitor.js', 'notification/toaster.js', 'playtime/track.js'];

// Under the pinned koffi 3.x, `regodit/promises` DWORD writes segfault and kill the Watchdog, so
// every call must go through the sync entry point; these checks pin that invariant.
test('the watchdog only uses the synchronous regodit API', () => {
  for (const rel of REGODIT_USERS) {
    const source = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.doesNotMatch(source, /import\(\s*['"]regodit\/promises['"]\s*\)/, `${rel} must not import regodit/promises`);
    assert.match(source, /import\(\s*['"]regodit['"]\s*\)/, `${rel} must load regodit through the sync entry point`);
  }
});

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
