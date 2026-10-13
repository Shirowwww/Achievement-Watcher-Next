'use strict';

/*
  The key everything locally encrypted is encrypted with: 256 random bits, generated once per
  installation and stored through Electron's safeStorage, which ties it to the account that created
  it: Windows DPAPI, or on Linux the desktop's secret service (GNOME Keyring, KWallet, the portal).

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

/*
  Linux never uses safeStorage's synchronous calls: they go through libsecret on the main thread and
  block the whole app while the desktop shows a keyring prompt (a fresh GNOME autologin asks for a new
  keyring password), whereas the asynchronous ones can answer without any prompt (the Secret portal).
  The app resolves the key with ensureSecretAsync() and hands it here; until then the key is ''.
*/
let asyncOnly = false;
let providedSecret = '';
function useAsyncKeyring(secret = '') {
  asyncOnly = true;
  providedSecret = isSecret(secret) ? String(secret).trim().toLowerCase() : '';
}
function isAsyncKeyring() {
  return asyncOnly;
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
  if (asyncOnly) return providedSecret;
  const store = usableSafeStorage(safeStorage);
  if (!store || !userDataPath) return '';
  try {
    const decrypted = store.decryptString(fs.readFileSync(secretFile(userDataPath)));
    return isSecret(decrypted) ? decrypted.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

// Temp file then rename: half a key file is a key nobody can read, and it would take the emulator
// password and the Xbox session with it.
function writeKeyFile(userDataPath, sealed) {
  const file = secretFile(userDataPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, sealed);
  fs.renameSync(temporary, file);
}

/*
  The stored key, generating and persisting one on first use. Returns '' when safeStorage cannot
  hold it, which callers must read as "keep using the legacy format" rather than as an error: a key
  that only lives in memory would make every file it wrote unreadable on the next launch.
*/
function ensureSecret(userDataPath, safeStorage) {
  if (asyncOnly) return providedSecret;
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
    writeKeyFile(userDataPath, store.encryptString(secret));
  } catch {
    return ''; // could not persist it: staying on the legacy format beats writing what we cannot re-read
  }
  return secret;
}

// ensureSecret() over the asynchronous safeStorage calls, with the same rules. A key sealed under a
// weaker provider than the one now available (shouldReEncrypt) is sealed again under the new one.
async function ensureSecretAsync(userDataPath, safeStorage) {
  try {
    if (!userDataPath || !safeStorage || !(await safeStorage.isAsyncEncryptionAvailable())) return '';
    const file = secretFile(userDataPath);
    if (fs.existsSync(file)) {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(fs.readFileSync(file));
      if (!isSecret(result)) return '';
      const secret = result.trim().toLowerCase();
      if (shouldReEncrypt) writeKeyFile(userDataPath, await safeStorage.encryptStringAsync(secret));
      return secret;
    }
    const secret = crypto.randomBytes(32).toString('hex');
    writeKeyFile(userDataPath, await safeStorage.encryptStringAsync(secret));
    return secret;
  } catch {
    return '';
  }
}

/*
  Linux: Chromium seals with a fixed, public password ("v10") when no secret service would answer
  without a prompt, so such a key is only obfuscated; a keyring or the portal give "v11" and above.
  It is sealed again under the real one as soon as that answers (shouldReEncrypt above).
*/
function isObfuscatedOnly(userDataPath) {
  try {
    const fd = fs.openSync(secretFile(userDataPath), 'r');
    const prefix = Buffer.alloc(3);
    fs.readSync(fd, prefix, 0, 3, 0);
    fs.closeSync(fd);
    return prefix.toString('latin1') === 'v10';
  } catch {
    return true;
  }
}

module.exports = { SECRET_FILE, ensureSecret, ensureSecretAsync, isObfuscatedOnly, isAsyncKeyring, isSecret, loadSecret, secretFile, useAsyncKeyring };
