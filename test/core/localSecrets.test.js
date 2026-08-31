'use strict';

/*
  app/util/aes.js used to encrypt everything under a passphrase published in this repository, which
  made it obfuscation rather than encryption. It now prefers a random per-installation key that
  safeStorage keeps under Windows DPAPI (app/util/appSecret.js), while still reading anything
  written under the old constant so nobody has to re-enter a password or sign in again.

  These run under plain `node`, where no installation key exists - which is itself the fallback
  path that has to keep working (the Watchdog started by hand, a dev run with no keyring).
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const aes = require('../../app/util/aes.js');
const watchdogAes = require('../../watchdog/util/aes.js');
const appSecret = require('../../app/util/appSecret.js');

// safeStorage as Electron presents it, backed by a key this test holds - stands in for DPAPI.
function fakeSafeStorage(available = true) {
  const key = crypto.createHash('sha256').update('test-dpapi').digest();
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => {
      const iv = Buffer.alloc(16, 7);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      return Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    },
    decryptString: (buffer) => {
      const iv = Buffer.alloc(16, 7);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      return Buffer.concat([decipher.update(buffer), decipher.final()]).toString('utf8');
    },
  };
}

test('the installation key is generated once and read back', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-secret-'));
  const store = fakeSafeStorage();

  const first = appSecret.ensureSecret(userData, store);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(appSecret.ensureSecret(userData, store), first, 'a second call must not rotate the key');
  assert.equal(appSecret.loadSecret(userData, store), first);
  // It is on disk encrypted, never in the clear.
  const raw = fs.readFileSync(appSecret.secretFile(userData));
  assert.equal(raw.includes(Buffer.from(first, 'utf8')), false);
});

test('no safeStorage means no key, so callers stay on the format they can read back', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-secret-none-'));
  assert.equal(appSecret.ensureSecret(userData, fakeSafeStorage(false)), '');
  assert.equal(appSecret.ensureSecret(userData, null), '');
  assert.equal(fs.existsSync(appSecret.secretFile(userData)), false);
});

test('a value encrypted with the installation key round-trips, and needs that key', () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const original = process.env.AW_SECRET;
  process.env.AW_SECRET = secret;
  try {
    const blob = watchdogAes.encrypt('hunter2');
    assert.match(blob, /^v2:/);
    assert.equal(watchdogAes.decrypt(blob), 'hunter2');

    // The published constant cannot open it.
    delete process.env.AW_SECRET;
    assert.throws(() => watchdogAes.decrypt(blob));

    // Nor can a different installation's key.
    process.env.AW_SECRET = crypto.randomBytes(32).toString('hex');
    assert.throws(() => watchdogAes.decrypt(blob));
  } finally {
    if (original === undefined) delete process.env.AW_SECRET;
    else process.env.AW_SECRET = original;
  }
});

test('values written under the old constant are still readable, and the two copies agree', () => {
  // No AW_SECRET in this process, so both modules produce the legacy format.
  const legacy = aes.encrypt('previously saved password');
  assert.equal(legacy.startsWith('v2:'), false);
  assert.equal(aes.decrypt(legacy), 'previously saved password');
  // The Watchdog reads what the app wrote and vice versa - the Xbox auth file crosses that boundary.
  assert.equal(watchdogAes.decrypt(legacy), 'previously saved password');
  assert.equal(aes.decrypt(watchdogAes.encrypt('written by the watchdog')), 'written by the watchdog');
});
