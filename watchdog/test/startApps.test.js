'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const startApps = require('../util/startApps.js');

test('isValidAUMID accepts both packaged and desktop app ids', () => {
  assert.equal(startApps.isValidAUMID('Microsoft.XboxGamingOverlay_8wekyb3d8bbwe!App'), true);
  // AW's own identity: the old check required the packaged "family!app" shape and rejected
  // this desktop-style id on every start (issue #8).
  assert.equal(startApps.isValidAUMID('io.github.shirowwww.achievement.watcher'), true);
});

test('isValidAUMID rejects what Windows itself rejects', () => {
  assert.equal(startApps.isValidAUMID('bad id_with-space!App'), false);
  assert.equal(startApps.isValidAUMID('x'.repeat(129)), false);
  assert.equal(startApps.isValidAUMID(''), false);
  assert.equal(startApps.isValidAUMID(null), false);
});

test('isPackagedAUMID separates MSIX identities from desktop ones', () => {
  // Only a packaged identity may load http(s) toast images; a desktop id needs local files.
  assert.equal(startApps.isPackagedAUMID('Microsoft.XboxGamingOverlay_8wekyb3d8bbwe!App'), true);
  assert.equal(startApps.isPackagedAUMID('io.github.shirowwww.achievement.watcher'), false);
  assert.equal(startApps.isPackagedAUMID('Microsoft.XboxGamingOverlay'), false);
});

test('hasAumid does an exact Start Menu lookup and never throws', async () => {
  assert.equal(await startApps.hasAumid(''), false);
  assert.equal(await startApps.hasAumid(null), false);

  // A pre-fetched list keeps this offline and deterministic; the same call without one shells out
  // to Get-StartApps once for every candidate at start-up.
  const known = ['io.github.shirowwww.achievement.watcher', 'microsoft.xboxgamingoverlay_8wekyb3d8bbwe!app'];
  assert.equal(await startApps.hasAumid('io.github.shirowwww.achievement.watcher', known), true);
  assert.equal(await startApps.hasAumid('Microsoft.XboxGamingOverlay_8wekyb3d8bbwe!App', known), true, 'lookup is case-insensitive');
  assert.equal(await startApps.hasAumid('Microsoft.XboxApp_8wekyb3d8bbwe!Microsoft.XboxApp', known), false);

  assert.equal(typeof (await startApps.hasAumid('Definitely.Not.A.Real.App_12345678!App')), 'boolean');
  assert.ok(Array.isArray(await startApps.listAumids()));
});

// A shortcut's id sits in its property store as UTF-16, after a length that may leave it on an odd
// byte. The fixtures put one id on each alignment, beside unrelated bytes.
test('hasShortcutAumid finds an id in a Start Menu shortcut on either byte alignment', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-startmenu-'));
  try {
    const shortcut = (id, pad) =>
      Buffer.concat([Buffer.alloc(76 + pad, 1), Buffer.from([0x28, 0, 0, 0]), Buffer.from(`${id}\0`, 'utf16le'), Buffer.alloc(9, 2)]);
    fs.mkdirSync(path.join(root, 'Sub'));
    fs.writeFileSync(path.join(root, 'AW.lnk'), shortcut('io.github.shirowwww.achievement.watcher', 0));
    fs.writeFileSync(path.join(root, 'Sub', 'Other.lnk'), shortcut('Com.Example.Odd', 1));
    fs.writeFileSync(path.join(root, 'notes.txt'), Buffer.from('Some.Text.Id\0', 'utf16le'));

    assert.equal(await startApps.hasShortcutAumid('io.github.shirowwww.achievement.watcher', [root]), true);
    assert.equal(await startApps.hasShortcutAumid('IO.GitHub.Shirowwww.Achievement.Watcher', [root]), true, 'ids compare case-insensitively');
    assert.equal(await startApps.hasShortcutAumid('com.example.odd', [root]), true, 'an id on an odd byte is found');
    assert.equal(await startApps.hasShortcutAumid('io.github.shirowwww', [root]), false, 'a prefix is not the id');
    assert.equal(await startApps.hasShortcutAumid('achievement.watcher', [root]), false, 'a suffix is not the id');
    assert.equal(await startApps.hasShortcutAumid('Some.Text.Id', [root]), false, 'only .lnk files count');
    assert.equal(await startApps.hasShortcutAumid('', [root]), false);
    assert.equal(await startApps.hasShortcutAumid('anything', [path.join(root, 'missing')]), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
