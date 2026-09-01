'use strict';

/*
  The app is a resident tray daemon, so the window stays open for hours with one long-lived copy of
  the settings, and saving from Settings writes that whole copy back. Meanwhile the main process
  writes "skip this version" and the update postpone on its own, and never told the renderer. The
  next save of any unrelated setting therefore wrote the renderer's stale values back over them, and
  a skipped version came back on the following check.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const settings = require('../../app/settings.js');

function withConfig(contents) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-settings-owned-'));
  fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'cfg', 'options.ini'), contents, 'utf8');
  settings.setUserDataPath(userData);
  return path.join(userData, 'cfg', 'options.ini');
}

const BASE = `[achievement]
lang=english
[general]
theme=dark
skippedVersion=3.11.0
updatePostponedVersion=3.11.0
updatePostponedUntil=1893456000000
[achievement_source]
legitSteam=2
`;

test('a save from Settings keeps what the main process wrote on its own', async () => {
  const file = withConfig(BASE);
  const stale = settings.load();

  // What the main process wrote after the renderer had already loaded its copy.
  const current = settings.load();
  current.general.skippedVersion = '3.12.0';
  await settings.save(current, { keepMainOwnedKeys: false });

  // The renderer now saves an unrelated change out of its stale copy.
  stale.general.theme = 'light';
  await settings.save(stale);

  const written = settings.load();
  assert.equal(written.general.theme, 'light', "the user's own change is saved");
  assert.equal(written.general.skippedVersion, '3.12.0', 'the skipped version is not reverted');
});

test('the main process can still change and clear those keys', async () => {
  withConfig(BASE);
  const config = settings.load();

  config.general.skippedVersion = '3.12.0';
  await settings.save(config, { keepMainOwnedKeys: false });
  assert.equal(settings.load().general.skippedVersion, '3.12.0');

  delete config.general.updatePostponedVersion;
  delete config.general.updatePostponedUntil;
  await settings.save(config, { keepMainOwnedKeys: false });
  // load() reads the absent keys back as their defaults: no version, no deadline.
  const cleared = settings.load();
  assert.equal(cleared.general.updatePostponedVersion, '');
  assert.equal(cleared.general.updatePostponedUntil, 0);
});

test('a key the main process cleared does not come back on the next Settings save', async () => {
  withConfig(BASE);
  const stale = settings.load();

  const current = settings.load();
  delete current.general.skippedVersion;
  await settings.save(current, { keepMainOwnedKeys: false });

  stale.general.theme = 'light';
  await settings.save(stale);
  // load() reads an absent skippedVersion back as its 'none' default.
  assert.equal(settings.load().general.skippedVersion, 'none', 'a cleared key stays cleared');
});

test('every preserved key is one the renderer has no control over', () => {
  assert.deepEqual(settings.MAIN_OWNED_GENERAL_KEYS, ['skippedVersion', 'updatePostponedVersion', 'updatePostponedUntil']);
});
