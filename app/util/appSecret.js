'use strict';

/*
  The key everything locally encrypted is encrypted with: 256 random bits, generated once per
  installation and stored through Electron's safeStorage, which ties it to the account that created
  it: Windows DPAPI, or on Linux the desktop keyring (GNOME Keyring, KWallet).

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
    const stored = fs.readFileSync(secretFile(userDataPath));
    const decrypted = store.decryptString(stored);
    if (!isSecret(decrypted)) return '';
    const secret = decrypted.trim().toLowerCase();
    moveToKeyring(userDataPath, store, stored, secret);
    return secret;
  } catch {
    return '';
  }
}

function writeKeyFile(userDataPath, store, secret) {
  const file = secretFile(userDataPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Temp file then rename: half a key file is a key nobody can read, and it would take the
  // emulator password and the Xbox session with it.
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, store.encryptString(secret));
  fs.renameSync(temporary, file);
}

/*
  Linux only. With no keyring running, Chromium seals data under a fixed password ("v10" prefix),
  which it can still open once a keyring is there. A key first stored that way is sealed again
  under the keyring (gnome-libsecret, kwallet) the first time one answers, so it does not stay
  merely obfuscated for the life of the installation.
*/
function moveToKeyring(userDataPath, store, stored, secret, platform = process.platform) {
  // Windows output starts with "v10" too, for an unrelated reason: never touch it there.
  if (platform !== 'linux' || typeof store.getSelectedStorageBackend !== 'function') return;
  try {
    const backend = store.getSelectedStorageBackend();
    if (backend === 'basic_text' || backend === 'unknown' || stored.subarray(0, 3).toString('latin1') !== 'v10') return;
    writeKeyFile(userDataPath, store, secret);
  } catch {
    /* the obfuscated copy keeps working; this is retried next launch */
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
  /*
    A key file that is there but did not open this time is not a first run. Replacing it used to
    orphan everything it protected - the Epic sign-in, the Xbox session and the emulator password all
    stopped decrypting after one launch where the read failed (2026-09-17). Staying on the legacy
    format for this run loses nothing, and the key is read again next launch.
  */
  if (fs.existsSync(secretFile(userDataPath))) return '';
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    writeKeyFile(userDataPath, store, secret);
  } catch {
    return ''; // could not persist it: staying on the legacy format beats writing what we cannot re-read
  }
  return secret;
}

module.exports = { SECRET_FILE, ensureSecret, isSecret, loadSecret, moveToKeyring, secretFile };
