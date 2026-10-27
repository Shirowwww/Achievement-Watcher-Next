'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('../../app/node_modules/adm-zip');
const { exportLogs, suggestedArchiveName, isLogFile } = require('../../app/util/logArchive.js');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aw-${name}-`));
}

test('every log in the folder is snapshotted into one archive, with a manifest', () => {
  const logsDir = tempDir('logs');
  const out = path.join(tempDir('out'), 'nested', 'logs.zip');
  try {
    fs.writeFileSync(path.join(logsDir, 'parser.log'), 'parser line\n');
    fs.writeFileSync(path.join(logsDir, 'parser.log.1'), 'rotated line\n');
    fs.writeFileSync(path.join(logsDir, 'renderer.log'), 'renderer line\n');
    fs.writeFileSync(path.join(logsDir, 'userdir.db.corrupt-1700000000000'), '{broken');
    // Not a log: the archive is for diagnostics, not for whatever else happens to sit there.
    fs.writeFileSync(path.join(logsDir, 'notes.txt'), 'ignore me');
    fs.mkdirSync(path.join(logsDir, 'a-folder'));

    const summary = exportLogs({
      logsDir,
      destination: out,
      Zip: AdmZip,
      meta: { appVersion: '3.9.0', platform: 'win32', release: '10.0.26200', versions: { electron: '43.0.0' } },
    });

    assert.equal(summary.destination, out);
    assert.deepEqual(summary.files.map((f) => f.name).sort(), [
      'parser.log',
      'parser.log.1',
      'renderer.log',
      'userdir.db.corrupt-1700000000000',
    ]);
    assert.deepEqual(summary.skipped, []);
    assert.ok(fs.existsSync(out), 'the destination folder is created when missing');

    const entries = new AdmZip(out).getEntries().map((e) => e.entryName);
    assert.ok(entries.includes('parser.log'));
    assert.ok(entries.includes('about.txt'));
    assert.ok(!entries.includes('notes.txt'));
    assert.ok(!entries.some((e) => e.startsWith('a-folder')));

    const zip = new AdmZip(out);
    assert.equal(zip.readAsText('parser.log'), 'parser line\n');
    const about = zip.readAsText('about.txt');
    assert.match(about, /Achievement Watcher 3\.9\.0/);
    assert.match(about, /platform: win32 10\.0\.26200/);
    assert.match(about, /electron: 43\.0\.0/);
    assert.match(about, /parser\.log - 12 bytes/);
  } finally {
    fs.rmSync(logsDir, { recursive: true, force: true });
    fs.rmSync(path.dirname(path.dirname(out)), { recursive: true, force: true });
  }
});

// One unreadable log must not cost the user the other eleven - the whole point of the button is that
// it works while every one of those files is being written to.
test('a log that cannot be read is recorded, not fatal', () => {
  const logsDir = tempDir('logs-partial');
  const out = path.join(tempDir('out-partial'), 'logs.zip');
  try {
    fs.writeFileSync(path.join(logsDir, 'good.log'), 'ok\n');
    fs.writeFileSync(path.join(logsDir, 'locked.log'), 'held open\n');

    const summary = exportLogs({
      logsDir,
      destination: out,
      Zip: AdmZip,
      fs: {
        ...fs,
        readFileSync(file, ...rest) {
          if (path.basename(file) === 'locked.log') throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
          return fs.readFileSync(file, ...rest);
        },
      },
    });

    assert.deepEqual(summary.files.map((f) => f.name), ['good.log']);
    assert.equal(summary.skipped.length, 1);
    assert.equal(summary.skipped[0].name, 'locked.log');
    assert.match(summary.skipped[0].reason, /EBUSY/);
    assert.ok(fs.existsSync(out), 'the archive is still written');
  } finally {
    fs.rmSync(logsDir, { recursive: true, force: true });
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});

test('a missing log folder is reported instead of producing an empty archive', () => {
  assert.throws(
    () => exportLogs({ logsDir: path.join(os.tmpdir(), 'aw-no-such-logs-dir'), destination: 'x.zip', Zip: AdmZip }),
    /No log folder to export/
  );
});

test('the suggested file name sorts chronologically and names the build', () => {
  const name = suggestedArchiveName('3.9.0', new Date(Date.UTC(2026, 7, 18, 1, 2, 3)));
  assert.equal(name, 'AW-logs-3.9.0-2026-08-18-01-02-03.zip');
  assert.match(suggestedArchiveName(), /^AW-logs-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/);
});

// #127: the archive is made to be attached to a public issue.
test('the account name and credentials are masked in the archive, not on disk', () => {
  const logsDir = tempDir('logs-private');
  const out = path.join(tempDir('out-private'), 'logs.zip');
  const jwt = `eyJhbGciOiJFZERTQSJ9.${'eyJzdWIiOiI3NjU2MTE5'}.c2lnbmF0dXJlLXZhbHVl`;
  const original = [
    '[t INFO] Monitoring ach change in "C:\\Users\\Jane Doe\\AppData\\Roaming\\GSE Saves" ...',
    '[t INFO] saved E:\\Profiles\\Jane Doe\\Pictures\\shot.png',
    '[t INFO] wine prefix /home/jane/.wine/drive_c/users/Public/Documents',
    `[t WARN] GET https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?access_token=${jwt}&steamid=1 failed`,
    '[t WARN] GET https://retroachievements.org/API/API_GetUserProfile.php?u=jane&y=Ab3dEf6hIj9kLm2nOp5q failed',
    '[t INFO] { steam: { apiKey: \'0123456789ABCDEF0123456789ABCDEF\', webapi_token: \'opaque-token-value\' } }',
    '[t INFO] {"refresh_token":"opaque-refresh-value","loginPassword":"hunter22"}',
    '[t INFO] headers Authorization: Bearer 1a2b3c4d5e6f7a8b9c0d',
    '[t INFO] key ABCDEF0123456789ABCDEF0123456789 in a sentence',
  ].join('\n');
  try {
    fs.writeFileSync(path.join(logsDir, 'parser.log'), original);
    exportLogs({ logsDir, destination: out, Zip: AdmZip, usernames: ['Jane Doe', 'jane'] });

    const exported = new AdmZip(out).readAsText('parser.log');
    for (const secret of ['Jane Doe', '/home/jane', jwt, 'Ab3dEf6hIj9kLm2nOp5q', '0123456789ABCDEF', 'opaque-token-value', 'opaque-refresh-value', 'hunter22', '1a2b3c4d5e6f', 'ABCDEF0123456789']) {
      assert.ok(!exported.includes(secret), `${secret} reached the archive:\n${exported}`);
    }
    assert.match(exported, /C:\\Users\\\[username\]\\AppData\\Roaming\\GSE Saves/);
    assert.match(exported, /E:\\Profiles\\\[username\]\\Pictures/);
    assert.match(exported, /drive_c\/users\/Public\/Documents/, 'a shared folder is not an account');
    assert.match(exported, /GetOwnedGames\/v1\/\?access_token=\[redacted\]&steamid=1 failed/);
    assert.equal(fs.readFileSync(path.join(logsDir, 'parser.log'), 'utf8'), original, 'the log on disk is untouched');
    assert.match(new AdmZip(out).readAsText('about.txt'), /masked: the user name in paths, keys, tokens, Steam account ids/);
  } finally {
    fs.rmSync(logsDir, { recursive: true, force: true });
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});

test('a log that cannot be masked is left out rather than exported as it is', () => {
  const logsDir = tempDir('logs-unmaskable');
  const out = path.join(tempDir('out-unmaskable'), 'logs.zip');
  try {
    fs.writeFileSync(path.join(logsDir, 'parser.log'), 'C:\\Users\\Jane\\x\n');
    const summary = exportLogs({
      logsDir,
      destination: out,
      Zip: AdmZip,
      fs: { ...fs, readFileSync: () => ({ toString: () => { throw new Error('undecodable'); } }) },
    });
    assert.deepEqual(summary.files, []);
    assert.equal(summary.skipped[0].name, 'parser.log');
    assert.deepEqual(new AdmZip(out).getEntries().map((entry) => entry.entryName), ['about.txt']);
  } finally {
    fs.rmSync(logsDir, { recursive: true, force: true });
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});

test('generated reports go in beside the logs, masked, under a plain file name', () => {
  const logsDir = tempDir('logs-extras');
  const out = path.join(tempDir('out-extras'), 'logs.zip');
  try {
    fs.writeFileSync(path.join(logsDir, 'parser.log'), 'line\n');
    const summary = exportLogs({
      logsDir,
      destination: out,
      Zip: AdmZip,
      usernames: ['jane'],
      extras: [
        { name: 'diagnostics.txt', text: '[clock]\n  utc: x\n' },
        { name: '..\\..\\game_health.json', text: '{"gameDir":"C:\\\\Users\\\\jane\\\\Games"}' },
        { name: 'empty.txt' },
      ],
    });
    assert.deepEqual(summary.files.map((f) => f.name), ['parser.log', 'diagnostics.txt', 'game_health.json']);
    const zip = new AdmZip(out);
    assert.equal(zip.readAsText('diagnostics.txt'), '[clock]\n  utc: x\n');
    assert.ok(!zip.readAsText('game_health.json').includes('jane'));
    assert.match(zip.readAsText('about.txt'), /game_health\.json - \d+ bytes/);
  } finally {
    fs.rmSync(logsDir, { recursive: true, force: true });
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});

test('only diagnostic files are eligible', () => {
  assert.equal(isLogFile('parser.log'), true);
  assert.equal(isLogFile('parser.log.1'), true);
  assert.equal(isLogFile('userdir.db.corrupt-1700000000000'), true);
  assert.equal(isLogFile('options.ini'), false);
  assert.equal(isLogFile('gameIndex.json'), false);
});
