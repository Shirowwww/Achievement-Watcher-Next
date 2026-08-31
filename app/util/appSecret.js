'use strict';

/*
  The key everything locally encrypted is encrypted with: 256 random bits, generated once per
  installation and stored under Windows DPAPI through Electron's safeStorage, which ties it to the
  Windows account that created it.

  What it replaces: a passphrase compiled into a public repository (util/aes.js). Anything
  "encrypted" with a key anybody can read is obfuscated, not encrypted - the emulator Steam
  password and the Xbox auth tokens could be decrypted by whoever obtained a copy of %APPDATA%.
  With a DPAPI-held key, those files are readable on that machine, by that account, and nowhere
  else.

  safeStorage is a main-process API and needs the app to be ready, so this is deliberately not
  available everywhere. Where it is not (the Watchdog is a plain Node process; a dev run on a
  machine with no keyring), util/aes.js keeps reading the legacy format instead of failing - the
  app hands the key to its own Watchdog child through the environment, see launchWatchdog().
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET_FILE = 'secret.key';

function secretFile(userDataPath) {
  return path.join(String(userDataPath || ''), 'cfg', SECRET_FILE);
}

function isSecret(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || '').trim());
}

// safeStorage as this module needs it, or null. Encryption can be unavailable even when the object
// exists (no keyring, called before the app is ready), and asking is itself allowed to throw.
function usableSafeStorage(safeStorage) {
  try {
    return safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage : null;
  } catch {
    return null;
  }
}

// The stored key, or '' when there is none to read (missing, unreadable, or written by another
// Windows account - DPAPI refuses those, which is the whole point).
function loadSecret(userDataPath, safeStorage) {
  const store = usableSafeStorage(safeStorage);
  if (!store || !userDataPath) return '';
  try {
    const decrypted = store.decryptString(fs.readFileSync(secretFile(userDataPath)));
    return isSecret(decrypted) ? decrypted.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

/*
  The stored key, generating and persisting one on first use. Returns '' when safeStorage cannot
  hold it, which callers must read as "keep using the legacy format" rather than as an error: a key
  that only lives in memory would make every file it wrote unreadable on the next launch.
*/
function ensureSecret(userDataPath, safeStorage) {
  const store = usableSafeStorage(safeStorage);
  if (!store || !userDataPath) return '';
  const existing = loadSecret(userDataPath, store);
  if (existing) return existing;
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    const file = secretFile(userDataPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Temp file then rename: half a key file is a key nobody can read, and it would take the
    // emulator password and the Xbox session with it.
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, store.encryptString(secret));
    fs.renameSync(temporary, file);
  } catch {
    return ''; // could not persist it: staying on the legacy format beats writing what we cannot re-read
  }
  return secret;
}

module.exports = { SECRET_FILE, ensureSecret, isSecret, loadSecret, secretFile };
