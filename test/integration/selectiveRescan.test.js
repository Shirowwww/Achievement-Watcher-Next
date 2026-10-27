'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'app', 'view', 'app.html'), 'utf8');
const settingsUi = fs.readFileSync(path.join(root, 'app', 'ui', 'settings.js'), 'utf8');
const appUi = fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8');
const parser = fs.readFileSync(path.join(root, 'app', 'parser', 'achievements.js'), 'utf8');

// The user asked for the selected-folder card to go: Refresh already rescans every source, and the
// card read as a second, unclear way to do the same thing. The scoped scan below stays available.
test('the Folders tab no longer offers a selected-folder rescan card', () => {
  for (const id of ['folder-rescan', 'folder-rescan-list', 'folder-rescan-run']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(settingsUi, /folderRescanBusy|selectedFolderRescanScope/);
  const css = fs.readFileSync(path.join(root, 'app', 'resources', 'css', 'app.css'), 'utf8');
  assert.doesNotMatch(css, /folder-rescan/);
});

test('a selected rescan limits discovery while preserving unrelated tiles and keeps a distinct cache key', () => {
  assert.match(parser, /async function discover\(source, steamAccFilter, scope = null\)/);
  assert.match(parser, /scope: scanScope\.cacheValue\(scanScope\.normalizeScanScope\(option\.scanScope\)\)/);
  assert.match(parser, /if \(scope\) \{[\s\S]*scope\.libraryDirs[\s\S]*return roots;/);
  assert.match(appUi, /const previousGames = activeScanScope \|\| preserveExistingOnFailure \? gameList\.slice\(\) : \[\]/);
  assert.match(appUi, /!gameTouchesScanScope\(game, activeScanScope\)/);
});
