'use strict';

/*
  The XLiveLessNess watcher finds its games through the same shared parser the library uses, from the
  folders the user added. What is checked here is the wiring the parser cannot cover: which folders
  are considered, and that an install whose profile tree does not exist yet is still watched - the
  first unlock is exactly the moment that tree appears.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const xllnWatch = require(path.join(__dirname, '..', 'console', 'xllnWatch.js'));
const { makeGameFolder, unlockRecord, SAMPLE_TITLE_ID_HEX } = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'xlln.js'));

const { discover, watchRootFor, watchedFolders, iconPathOf } = xllnWatch._internal;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xllnwatch-'));
// The per-user storage root is one of the places the watcher looks. Point it at the fixture, so a
// real XLiveLessNess folder on the machine running this cannot answer for a fixture title.
const realLocalAppData = process.env.LOCALAPPDATA;
process.env.LOCALAPPDATA = path.join(temp, 'LocalAppData');

try {
  const library = path.join(temp, 'Games');
  fs.mkdirSync(library, { recursive: true });
  const game = makeGameFolder(library, 'Sample Game', { unlocks: [unlockRecord(1, 1577836800)] });
  const disabledLibrary = path.join(temp, 'Disabled');
  fs.mkdirSync(disabledLibrary, { recursive: true });
  makeGameFolder(disabledLibrary, 'Other Game', { titleId: '55555555' });

  const configFile = path.join(temp, 'userdir.db');
  fs.writeFileSync(
    configFile,
    JSON.stringify([
      { path: library, enabled: true, notify: true },
      { path: disabledLibrary, enabled: false, notify: true },
    ])
  );

  assert.deepStrictEqual(watchedFolders(configFile), [library], 'a folder switched off is not watched');
  assert.deepStrictEqual(watchedFolders(path.join(temp, 'absent.db')), [], 'a missing folder list is empty, never an error');

  const targets = discover(configFile);
  assert.strictEqual(targets.length, 1, 'only the enabled library is searched');
  assert.strictEqual(targets[0].titleId, SAMPLE_TITLE_ID_HEX);

  const root = watchRootFor(targets[0]);
  assert.strictEqual(root, path.join(game, 'XLiveLessNess', 'profile', 'title', SAMPLE_TITLE_ID_HEX), 'the title folder is watched when it exists');

  /*
    A game that has never unlocked anything has no profile tree at all, so there is no root to watch
    yet. attach() covers that case by watching the game folder itself until the runtime creates one;
    what is asserted here is that the answer is honestly empty rather than a plausible wrong folder.
  */
  const fresh = makeGameFolder(library, 'Fresh Game', { titleId: '66666666' });
  assert.strictEqual(watchRootFor({ titleId: '66666666', gameDir: fresh }), '', 'an install with no profile yet has no root to watch');

  // Once the tree exists, the title's own folder is the one watched.
  const created = path.join(fresh, 'XLiveLessNess', 'profile', 'title', '66666666');
  fs.mkdirSync(created, { recursive: true });
  assert.strictEqual(watchRootFor({ titleId: '66666666', gameDir: fresh }), created);

  assert.strictEqual(iconPathOf({ icon: 'file:///C:/cache/xlln/ABC/1.png' }), path.normalize('C:/cache/xlln/ABC/1.png'));
  assert.strictEqual(iconPathOf({ icon: 'https://example.invalid/1.png' }), '', 'only local files are passed to the toast');
  assert.strictEqual(iconPathOf({}), '');

  console.log('PASS: the XLiveLessNess watcher covers the folders the library scans, profile tree or not');
} finally {
  if (realLocalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = realLocalAppData;
  try {
    fs.rmSync(temp, { recursive: true, force: true });
  } catch {
    /* the OS will reclaim it */
  }
}
