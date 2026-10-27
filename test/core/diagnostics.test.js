'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const diag = require('../../app/util/diagnostics.js');

test('the settings snapshot keeps what explains a bug and drops anything identifying', () => {
  const snapshot = diag.settingsSnapshot({
    general: { username: 'Jane', theme: 'default', closeToTray: true },
    overlay: { hotkey: 'Ctrl+Shift+O', notificationPreset: 'Steam Deck', notificationScale: 1 },
    notification_transport: { mode: 'toast' },
    notification_advanced: { iconPrefetch: false },
    souvenir: { dir: 'C:\\Users\\Jane\\Pictures' },
    action: { target: 'C:\\tools\\run.bat', hide: true },
    steam: { apiKey: 'ABCDEF' },
    emulator: { gbeLabel: 'C:\\Games\\x' },
  });
  assert.deepEqual(snapshot.general, { theme: 'default', closeToTray: true });
  assert.deepEqual(snapshot.overlay, { hotkey: 'Ctrl+Shift+O', notificationPreset: 'Steam Deck', notificationScale: 1 });
  assert.equal(snapshot.notification_transport.mode, 'toast');
  assert.equal(snapshot.notification_advanced.iconPrefetch, false);
  assert.deepEqual(snapshot.souvenir, {});
  assert.deepEqual(snapshot.action, { target: 'set', hide: true });
  assert.equal(snapshot.steam, undefined, 'the [steam] section is never read');
  assert.equal(snapshot.emulator.gbeLabel, '[hidden]', 'a path-shaped value is hidden whatever its key');
  assert.ok(!JSON.stringify(snapshot).includes('Jane'));
});

test('the network probe reports each host and reads Steam clock from GetServerInfo', async () => {
  let clock = 0;
  const fetchImpl = async (url) => {
    clock += 10;
    if (url.includes('GetServerInfo')) return { ok: true, status: 200, json: async () => ({ servertime: 1700000000 }) };
    if (url.includes('steamhunters')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    return { ok: false, status: 403, body: { cancel: async () => {} } };
  };
  const results = await diag.probeNetwork({ fetchImpl, now: () => clock });
  assert.equal(results.length, diag.NETWORK_TARGETS.length);
  const api = results.find((r) => r.name === 'steam-api');
  assert.equal(api.serverTime, 1700000000);
  assert.equal(api.ok, true);
  assert.deepEqual(
    (({ ok, status, error }) => ({ ok, status, error }))(results.find((r) => r.name === 'steamhunters')),
    { ok: false, status: 0, error: 'ENOTFOUND' }
  );
  assert.equal(results.find((r) => r.name === 'steamgriddb').status, 403);
});

test('the clock section gives the offset and the drift from Steam', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const report = diag.clockReport({ now, steamServerTime: now.getTime() / 1000 - 125, timeZone: 'Europe/Paris' });
  assert.equal(report.utc, '2026-10-27T12:00:00.000Z');
  assert.equal(report.timeZone, 'Europe/Paris');
  assert.match(report.utcOffset, /^[+-]\d{2}:\d{2}$/);
  assert.equal(report.steamSkewSeconds, 125);
  assert.equal(diag.clockReport({ now }).steamSkewSeconds, 'not measured');
});

test('the install location is a kind, never a path', () => {
  const env = { ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\jane\\AppData\\Local' };
  assert.equal(diag.installLocation('C:\\Program Files\\AW\\AW.exe', env), 'program-files');
  assert.equal(diag.installLocation('c:\\users\\jane\\appdata\\local\\Programs\\AW\\AW.exe', env), 'per-user');
  assert.equal(diag.installLocation('/tmp/.mount_AW/aw', { APPIMAGE: '/home/jane/AW.AppImage' }), 'appimage');
  const report = diag.installReport({ execPath: 'D:\\AW\\AW.exe', env: { ELECTRON_RUN_AS_NODE: '1' } });
  assert.equal(report.location, 'other');
  assert.equal(report.electronRunAsNodeSet, true);
  assert.ok(!JSON.stringify(report).includes('D:'));
});

test('Windows toast switches are read for every app and for this one', () => {
  const values = {
    'Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications:ToastEnabled': 1,
    'Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\com.aw:Enabled': 0,
  };
  const readInteger = (hive, key, name) => (`${key}:${name}` in values ? values[`${key}:${name}`] : null);
  assert.deepEqual(diag.windowsNotificationReport({ readInteger, aumid: 'com.aw' }), { toastsForAllApps: 'on', toastsForThisApp: 'off' });
  assert.equal(diag.windowsNotificationReport({}), null);
});

test('the storage section lists data files without opening credentials and flags a damaged store', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-diag-'));
  try {
    fs.mkdirSync(path.join(root, 'cfg'));
    fs.mkdirSync(path.join(root, 'steam_cache', 'schema'), { recursive: true });
    fs.writeFileSync(path.join(root, 'cfg', 'good.json'), '{"a":1}');
    fs.writeFileSync(path.join(root, 'cfg', 'broken.json'), '{"a":');
    fs.writeFileSync(path.join(root, 'cfg', 'psn-auth.json'), '{"token":"secret-value"}');
    fs.writeFileSync(path.join(root, 'cfg', 'options.ini'), '[general]');
    fs.writeFileSync(path.join(root, 'steam_cache', 'schema', '480.json'), '{}');

    const report = diag.storageReport({ userData: root });
    const byName = Object.fromEntries(report.cfg.map((entry) => [entry.name, entry]));
    assert.equal(byName['good.json'].parses, true);
    assert.equal(byName['broken.json'].parses, false);
    assert.deepEqual(byName['psn-auth.json'], { name: 'psn-auth.json', bytes: 24 });
    assert.equal(byName['options.ini'].parses, undefined);
    assert.deepEqual(report.steamCacheEntries, { schema: 1 });
    assert.ok(Number.isFinite(report.freeBytes));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the formatted text has one header per section and skips empty ones', () => {
  const text = diag.formatDiagnostics({ clock: { utc: 'x' }, displays: [{ index: 0 }], none: null });
  assert.equal(text, '[clock]\n  utc: x\n\n[displays]\n  {"index":0}\n');
});
