'use strict';

/*
  Linux resolves the installation key through safeStorage's asynchronous calls only: the synchronous
  ones block the whole app behind a keyring prompt. Its own file, because switching appSecret.js to
  that mode is for the life of the process.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appSecret = require('../../app/util/appSecret.js');

// The asynchronous half of safeStorage, backed by a key this test holds.
function fakeAsyncSafeStorage({ available = true, reEncrypt = false } = {}) {
  const key = crypto.createHash('sha256').update('test-portal').digest();
  const iv = Buffer.alloc(16, 3);
  const seal = (value) => {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  };
  const open = (buffer) => {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(buffer), decipher.final()]).toString('utf8');
  };
  const calls = { encrypt: 0 };
  return {
    calls,
    isEncryptionAvailable: () => assert.fail('the synchronous API must not be used'),
    isAsyncEncryptionAvailable: async () => available,
    encryptStringAsync: async (value) => {
      calls.encrypt += 1;
      return seal(value);
    },
    decryptStringAsync: async (buffer) => ({ result: open(buffer), shouldReEncrypt: reEncrypt }),
  };
}

test('the key is made once, read back, and sealed again when a stronger provider is available', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-secret-async-'));
  const store = fakeAsyncSafeStorage();
  const first = await appSecret.ensureSecretAsync(userData, store);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(await appSecret.ensureSecretAsync(userData, store), first);
  assert.equal(store.calls.encrypt, 1);

  const upgraded = fakeAsyncSafeStorage({ reEncrypt: true });
  assert.equal(await appSecret.ensureSecretAsync(userData, upgraded), first);
  assert.equal(upgraded.calls.encrypt, 1, 're-sealed under the new provider');
});

test('no asynchronous encryption, or a key file that will not open, means no key and the file kept', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-secret-async-none-'));
  assert.equal(await appSecret.ensureSecretAsync(userData, fakeAsyncSafeStorage({ available: false })), '');
  assert.equal(fs.existsSync(appSecret.secretFile(userData)), false);

  fs.mkdirSync(path.dirname(appSecret.secretFile(userData)), { recursive: true });
  fs.writeFileSync(appSecret.secretFile(userData), 'sealed by another account');
  assert.equal(await appSecret.ensureSecretAsync(userData, fakeAsyncSafeStorage()), '');
  assert.equal(fs.readFileSync(appSecret.secretFile(userData), 'utf8'), 'sealed by another account');
});

test('a key sealed under the fixed "v10" password counts as obfuscated only', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-secret-prefix-'));
  assert.equal(appSecret.isObfuscatedOnly(userData), true, 'no key at all protects nothing either');
  fs.mkdirSync(path.dirname(appSecret.secretFile(userData)), { recursive: true });
  fs.writeFileSync(appSecret.secretFile(userData), Buffer.from('v10sealed'));
  assert.equal(appSecret.isObfuscatedOnly(userData), true);
  fs.writeFileSync(appSecret.secretFile(userData), Buffer.from('v11sealed'));
  assert.equal(appSecret.isObfuscatedOnly(userData), false);
});

test('in asynchronous mode the synchronous entry points only return the key handed over', () => {
  const untouchable = { isEncryptionAvailable: () => assert.fail('safeStorage was asked synchronously') };
  appSecret.useAsyncKeyring();
  assert.equal(appSecret.ensureSecret('/nowhere', untouchable), '');
  const secret = crypto.randomBytes(32).toString('hex');
  appSecret.useAsyncKeyring(secret);
  assert.equal(appSecret.ensureSecret('/nowhere', untouchable), secret);
  assert.equal(appSecret.loadSecret('/nowhere', untouchable), secret);
  assert.equal(appSecret.isAsyncKeyring(), true);
});
