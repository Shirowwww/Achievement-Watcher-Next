'use strict';

/*
  The Watchdog's copy of app/util/aes.js - the two processes ship separate dependency trees and
  neither may require across that boundary, but the Xbox auth file is written by one and read by
  the other, so the formats must stay identical:

    legacy  "<iv>:<data>"           AES-256-CBC under LEGACY_KEY, the constant below
    v2      "v2:<iv>:<tag>:<data>"  AES-256-GCM under the installation key

  LEGACY_KEY is published in a public repository and therefore protects nothing. The installation
  key is random, per machine, and kept under Windows DPAPI by the app (app/util/appSecret.js); the
  app passes it to this process in AW_SECRET when it spawns it. A Watchdog started by hand has no
  key, reads the legacy format, and treats a v2 file as "not signed in" rather than crashing.
*/

const crypto = require('crypto');

const LEGACY_KEY = 'xfW!+Bn3E@Luu#^vj3$7wZRqRgACQeCu'; // 32 characters = AES-256; public, see above
const IV_LENGTH = 16; // AES block size, used by the legacy CBC format
const GCM_IV_LENGTH = 12; // what AES-GCM is specified for
const V2_PREFIX = 'v2';

function installationKey() {
  const secret = String(process.env.AW_SECRET || '').trim();
  return /^[0-9a-f]{64}$/i.test(secret) ? Buffer.from(secret, 'hex') : null;
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
