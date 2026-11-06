'use strict';

// The app and the Watchdog write their logs through this one logger (the Watchdog loads it from the app).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const Logger = require('../../app/util/logger');

function withLog(prefix, name, source, check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(dir, name);
  try {
    fs.writeFileSync(file, source);
    check(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('the app logger redacts legacy settings dumps while retaining other diagnostics', () => {
  const source = [
    '[2026-08-13T08:00:00.001Z INFO] Before',
    "[2026-08-13T08:00:00.002Z] [Object: null prototype] { steam: { apiKey: 'legacy-secret' },",
    "  emulator: { loginPassword: 'encrypted-password' }, account: 'identifier' }",
    '[2026-08-13T08:00:00.003Z INFO] After',
    '',
  ].join('\n');
  withLog('aw-app-log-privacy-', 'renderer.log', source, (file) => {
    const originalSize = fs.statSync(file).size;
    assert.strictEqual(Logger.redactLegacySettingsDumps(file), 1);
    const redacted = fs.readFileSync(file, 'utf8');
    assert.strictEqual(fs.statSync(file).size, originalSize);
    assert.doesNotMatch(redacted, /legacy-secret|encrypted-password|identifier|loginPassword|apiKey/);
    assert.match(redacted, /legacy settings dump redacted/);
    assert.match(redacted, /Before/);
    assert.match(redacted, /After/);
    assert.strictEqual(Logger.redactLegacySettingsDumps(file), 0);
  });
});

test('a Watchdog settings dump is redacted without deleting surrounding diagnostics', () => {
  const source = [
    '===== session 2026-08-13T08:00:00.000Z pid=123 =====',
    '[2026-08-13T08:00:00.001Z INFO] Loading Options ...',
    "[2026-08-13T08:00:00.002Z INFO] [Object: null prototype] { steam: { apiKey: 'legacy-secret' },",
    "  emulator: { loginPassword: 'encrypted-password' }, account: 'identifier' }",
    '[2026-08-13T08:00:00.003Z INFO] Watchdog started',
    "[2026-08-13T08:00:00.004Z INFO] { harmless: 'structured diagnostic' }",
    '[2026-08-13T08:00:00.005Z INFO] Ready',
    '',
  ].join('\n');
  withLog('aw-log-privacy-', 'notification.log', source, (file) => {
    const originalSize = fs.statSync(file).size;
    assert.strictEqual(Logger.redactLegacySettingsDumps(file), 1);
    const redacted = fs.readFileSync(file, 'utf8');
    assert.strictEqual(fs.statSync(file).size, originalSize, 'in-place redaction must preserve file length');
    assert.doesNotMatch(redacted, /legacy-secret|encrypted-password|identifier|loginPassword|apiKey/);
    assert.match(redacted, /legacy settings dump redacted/);
    assert.match(redacted, /Loading Options/);
    assert.match(redacted, /Watchdog started/);
    assert.match(redacted, /harmless: 'structured diagnostic'/);
    assert.match(redacted, /Ready/);
    assert.strictEqual(Logger.redactLegacySettingsDumps(file), 0, 'redaction must be idempotent');
  });
});

test('a Steam web session token is redacted like the other secrets', () => {
  const source = [
    '===== session 2026-08-23T08:00:00.000Z pid=123 =====',
    '[2026-08-23T08:00:00.001Z INFO] Loading Options ...',
    "[2026-08-23T08:00:00.002Z INFO] { steam: { webapi_token: 'secret-steam' } }",
    '[2026-08-23T08:00:00.003Z INFO] Watchdog started',
    '',
  ].join('\n');
  withLog('aw-log-privacy-steam-', 'notification.log', source, (file) => {
    assert.strictEqual(Logger.redactLegacySettingsDumps(file), 1);
    const redacted = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(redacted, /secret-steam|webapi_token/);
    assert.match(redacted, /Loading Options/);
    assert.match(redacted, /Watchdog started/);
  });
});
