'use strict';

// Modules the Watchdog loads at startup from the app side must stay small: no scan, no network library.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const app = (rel) => path.join(__dirname, '..', '..', 'app', rel);

test('the shared Watchdog modules load without the scan, Steam or the Xbox auth library', () => {
  const before = new Set(Object.keys(require.cache));
  for (const rel of ['parser/xboxPcCore.js', 'parser/socialclubNames.js', 'parser/sse.js', 'util/rldBlob.js', 'parser/emuSave.js', 'parser/emuSaveRoots.js', 'util/notificationPreset.js', 'util/sourceIdentity.js']) {
    require(app(rel));
  }
  const loaded = Object.keys(require.cache).filter((file) => !before.has(file));
  // Whole file names for the scan modules: ff7.js loads ff7-achievements.json, which is not achievements.js.
  for (const heavy of ['steam.js', 'achievements.js']) {
    assert.ok(!loaded.some((file) => path.basename(file) === heavy), `${heavy} must not load with the shared modules`);
  }
  for (const heavy of ['xboxlive-auth', 'fast-glob', 'electron']) {
    assert.ok(!loaded.some((file) => file.includes(heavy)), `${heavy} must not load with the shared modules`);
  }
});

test('an RLD blob is exactly 10 hex digits, and a Time needs a letter to rule out a timestamp', () => {
  const { RLD_BLOB_RE, isUnambiguousRldBlob, decodeRldBlob } = require(app('util/rldBlob.js'));
  assert.ok(RLD_BLOB_RE.test('0100000000'));
  assert.ok(!RLD_BLOB_RE.test('01000000'), '8 digits is not what RLD writes');
  assert.equal(isUnambiguousRldBlob('1700000000'), false, 'all digits could be a decimal timestamp');
  assert.equal(isUnambiguousRldBlob('d01a156600'), true);
  assert.equal(decodeRldBlob('d01a156600'), 0x66151ad0);
});

test('a 12-digit numeric folder is not a SocialClub profile on either side', () => {
  const { isProfileFolderName, gameFolderName } = require(app('parser/socialclubNames.js'));
  assert.equal(isProfileFolderName('0F74F4C4'), true);
  assert.equal(isProfileFolderName('123456789012'), false);
  assert.equal(gameFolderName('D:\\saves', 'D:\\saves\\123456789012\\x.ini'), '123456789012');
});

test('the SSE reader keeps locked entries, which the Watchdog now sees like the library', () => {
  const sse = require(app('parser/sse.js'));
  const buffer = Buffer.alloc(4 + 24 * 2);
  buffer.writeInt32LE(2, 0);
  buffer.writeInt32LE(1, 4 + 20);
  buffer.writeInt32LE(0, 4 + 24 + 20);
  assert.deepEqual(sse.parse(buffer).map((row) => row.Achieved), [1, 0]);
});
