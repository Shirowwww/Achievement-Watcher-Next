'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { pendingInstallerVersion, pruneInstalledPendingUpdate } = require('../../app/util/updateCacheHousekeeping.js');

function cacheWithPending(fileName) {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-updater-cache-'));
  const pendingDir = path.join(cacheDir, 'pending');
  fs.mkdirSync(pendingDir);
  fs.writeFileSync(path.join(cacheDir, 'installer.exe'), 'base');
  if (fileName) {
    fs.writeFileSync(path.join(pendingDir, fileName), 'installer');
    fs.writeFileSync(path.join(pendingDir, 'update-info.json'), JSON.stringify({ fileName, sha512: 'x', isAdminRightsRequired: false }));
  }
  return { cacheDir, pendingDir };
}

test('the version is read from the artifact name electron-builder writes', () => {
  assert.equal(pendingInstallerVersion('Achievement.Watcher.Setup.3.10.9.exe'), '3.10.9');
  assert.equal(pendingInstallerVersion('Achievement.Watcher.Setup.3.11.0-beta.2.exe'), '3.11.0-beta.2');
  assert.equal(pendingInstallerVersion('Achievement.Watcher.Portable.3.10.9.zip'), null);
  assert.equal(pendingInstallerVersion('installer.exe'), null);
  assert.equal(pendingInstallerVersion(undefined), null);
});

test('an installer already installed is removed, and the differential base next to it is kept', async () => {
  const { cacheDir, pendingDir } = cacheWithPending('Achievement.Watcher.Setup.3.10.9.exe');
  const result = await pruneInstalledPendingUpdate(pendingDir, '3.10.9');
  assert.deepEqual(result, { removed: true, version: '3.10.9', reason: 'installed' });
  assert.equal(fs.existsSync(pendingDir), false);
  assert.equal(fs.existsSync(path.join(cacheDir, 'installer.exe')), true, 'installer.exe is the base of the next differential download');
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

test('an older pending installer is removed too', async () => {
  const { cacheDir, pendingDir } = cacheWithPending('Achievement.Watcher.Setup.3.10.8.exe');
  assert.equal((await pruneInstalledPendingUpdate(pendingDir, '3.10.9')).removed, true);
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

test('a downloaded update that is not installed yet is never touched', async () => {
  // A download held back while a game runs waits in pending/ for the game to end.
  const { cacheDir, pendingDir } = cacheWithPending('Achievement.Watcher.Setup.3.11.0.exe');
  const result = await pruneInstalledPendingUpdate(pendingDir, '3.10.9');
  assert.deepEqual(result, { removed: false, version: '3.11.0', reason: 'not-installed-yet' });
  assert.equal(fs.existsSync(path.join(pendingDir, 'Achievement.Watcher.Setup.3.11.0.exe')), true);
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

test('a missing or unreadable record leaves the folder alone', async () => {
  const empty = cacheWithPending(null);
  assert.deepEqual(await pruneInstalledPendingUpdate(empty.pendingDir, '3.10.9'), { removed: false, reason: 'no-pending' });
  assert.equal(fs.existsSync(empty.pendingDir), true);
  fs.rmSync(empty.cacheDir, { recursive: true, force: true });

  const odd = cacheWithPending('something-else.exe');
  assert.deepEqual(await pruneInstalledPendingUpdate(odd.pendingDir, '3.10.9'), { removed: false, reason: 'unknown-version' });
  assert.equal(fs.existsSync(odd.pendingDir), true);
  fs.rmSync(odd.cacheDir, { recursive: true, force: true });

  assert.deepEqual(await pruneInstalledPendingUpdate(path.join(os.tmpdir(), 'aw-no-such-cache', 'pending'), '3.10.9'), {
    removed: false,
    reason: 'no-pending',
  });
});
