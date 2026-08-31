'use strict';

/*
  Local encryption for the few secrets AW keeps on disk (the emulator Steam password, the Watchdog's
  Xbox auth file).

  Two formats live here on purpose:

    legacy  "<iv>:<data>"           AES-256-CBC under LEGACY_KEY, the constant below
    v2      "v2:<iv>:<tag>:<data>"  AES-256-GCM under the installation key (util/appSecret.js)

  LEGACY_KEY is published in a public repository, so it never protected anything: it obfuscated.
  Everything written from now on uses the installation key, which safeStorage keeps under Windows
  DPAPI, bound to the Windows account. The legacy path stays readable so nobody has to re-enter a
  password or sign in to Xbox again, and it is still what gets used where no installation key can
  exist (a Watchdog started outside the app, a dev run with no keyring) rather than writing
  something that cannot be read back.
*/

const crypto = require('crypto');

const LEGACY_KEY = 'xfW!+Bn3E@Luu#^vj3$7wZRqRgACQeCu'; // 32 characters = AES-256; public, see above
const IV_LENGTH = 16; // AES block size, used by the legacy CBC format
const GCM_IV_LENGTH = 12; // what AES-GCM is specified for
const V2_PREFIX = 'v2';

let resolvedKey; // undefined = not looked up yet, null = none available

function keyFromSecret(secret) {
  return /^[0-9a-f]{64}$/i.test(String(secret || '').trim()) ? Buffer.from(String(secret).trim(), 'hex') : null;
}

/*
  Where the installation key comes from, in the order a process can have one:
    - AW_SECRET, set by the app on the Watchdog child it spawns (see launchWatchdog);
    - safeStorage, in the Electron main process;
    - a sync IPC answer, in a renderer (which already runs with Node integration, so this hands it
      nothing it could not read for itself).
  Anything else - a test, a plain `node` run - gets null and stays on the legacy format.
*/
function installationKey() {
  if (resolvedKey !== undefined) return resolvedKey;
  resolvedKey = keyFromSecret(process.env.AW_SECRET);
  if (resolvedKey) return resolvedKey;
  try {
    const electron = require('electron');
    if (electron && electron.safeStorage && electron.app) {
      const appSecret = require('./appSecret.js');
      resolvedKey = keyFromSecret(appSecret.ensureSecret(electron.app.getPath('userData'), electron.safeStorage));
    } else if (electron && electron.ipcRenderer) {
      resolvedKey = keyFromSecret(electron.ipcRenderer.sendSync('get-app-secret'));
    }
  } catch {
    resolvedKey = null;
  }
  return resolvedKey;
}

function encryptLegacy(str) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(LEGACY_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(String(str), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptLegacy(str) {
  const split = String(str).split(':');
  const iv = Buffer.from(split.shift(), 'hex');
  const encrypted = Buffer.from(split.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(LEGACY_KEY), iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
}

module.exports = {
  LEGACY_KEY,
  // Test seam: forget the looked-up key so the next call resolves it again.
  resetKeyCache: function () {
    resolvedKey = undefined;
  },
  encrypt: function (str) {
    const key = installationKey();
    if (!key) return encryptLegacy(str);
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(str), 'utf8'), cipher.final()]);
    return `${V2_PREFIX}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
  },
  decrypt: function (str) {
    const value = String(str);
    if (!value.startsWith(`${V2_PREFIX}:`)) return decryptLegacy(value);
    const key = installationKey();
    if (!key) throw new Error('no installation key available to read this value');
    const [, ivHex, tagHex, dataHex] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString();
  },
};
