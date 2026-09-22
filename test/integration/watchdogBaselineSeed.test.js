'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Boot-seed only makes sense for an appid folder that was already sitting on disk when the watch
// started: it is what stops an already-completed game from popping every achievement at once the
// first time its save is rewritten. A folder that appears mid-session is a live first run instead,
// however many achievements its first write happens to carry, and must notify every one of them - the
// two cases used to be indistinguishable (both look like "no persisted baseline, several unlocked").
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'watchdog', 'watchdog.js'), 'utf8');

test('each watched root snapshots its existing subfolders before the watcher starts', () => {
  const watchFn = source.slice(source.indexOf('watch: function (i, dir, options) {'));
  const body = watchFn.slice(0, watchFn.indexOf('self.watcher[i] = watch('));
  assert.ok(body.includes('preexistingChildren'), 'a snapshot must be taken before the watcher can fire any event');
  assert.ok(body.includes('fs.readdirSync(dir'), 'the snapshot must read the root as it is right now, not a cached listing');
});

test('boot-seed is gated on the appid folder having pre-existed the watch', () => {
  assert.ok(
    source.includes('const isNewAppidFolder = !preexistingChildren.has(immediateChildDirOf(dir, filePath.dir).toLowerCase());'),
    'each event must resolve its own appid folder against the startup snapshot'
  );
  assert.ok(
    source.includes('const seedOnly = (!Array.isArray(cache) || cache.length === 0) && preUnlocked.length > 1 && !liveFirstRun;'),
    'a freshly-appeared appid folder must never be silently seeded'
  );
});

test('a new folder whose first write carries many unlocks is a copied save and still seeds', () => {
  assert.ok(source.includes('const liveFirstRun = isNewAppidFolder && preUnlocked.length <= NEW_FOLDER_NOTIFY_MAX;'));
  assert.match(source, /const NEW_FOLDER_NOTIFY_MAX = \d+;/);
});

test('UniverseLAN saves are keyed by GOG product id and go through the GOG to Steam mapping', () => {
  assert.ok(source.includes("const isUniverseLanRoot = path.resolve(dir).toLowerCase() === path.resolve(process.env['LOCALAPPDATA'] || '', 'UniverseLAN').toLowerCase();"));
  assert.ok(source.includes("if (dir.includes('NemirtingasGalaxyEmu') || (isUniverseLanRoot && !options.appid)) {"));
});
