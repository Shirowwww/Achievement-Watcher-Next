'use strict';

const assert = require('node:assert/strict');
// app.js and the ui/*.js scripts share one global scope, so the renderer's source is all of them.
const { rendererSource } = require('../helpers/rendererSource.js');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

test('the final onboarding step keeps its seven non-source choices', () => {
  const html = fs.readFileSync(path.join(root, 'app', 'view', 'app.html'), 'utf8');
  // Found by its own content, not by a step index: inserting a step ahead of it (the Simple /
  // Advanced choice did exactly that) must not silently point this at a different section.
  const step = html.split(/<section class="onboarding-step[^"]*" id="onboarding-step-\d+"/).find((part) => part.includes('id="onboard-theme"')) || '';
  const body = step.slice(0, step.indexOf('</section>'));
  assert.equal((body.match(/<select\b/g) || []).length, 7);
  assert.doesNotMatch(body, /onboard-src-|onboard-legit-steam/, 'sources belong to their own complete step');
  for (const id of ['onboard-theme', 'onboard-notification-mode', 'onboard-notification-preset', 'onboard-playtime']) {
    assert.match(body, new RegExp(`id="${id}"`));
  }
});

test('onboarding exposes every source switch from Settings', () => {
  const html = fs.readFileSync(path.join(root, 'app', 'view', 'app.html'), 'utf8');
  const settingsBlock = html.match(/<ul id="options-source">[\s\S]*?<\/ul>/)?.[0] || '';
  const settingsSources = [...settingsBlock.matchAll(/id="option_([^"]+)"/g)].map((match) => match[1]).sort();
  const onboardingSources = [...html.matchAll(/id="onboard-src-([^"-]+)"/g)].map((match) => match[1]).sort();

  assert.ok(settingsSources.length > 9, 'the test must cover the complete current source list');
  assert.deepEqual(onboardingSources, settingsSources, 'a Settings source is missing from onboarding');

  const onboarding = fs.readFileSync(path.join(root, 'app', 'ui', 'onboarding.js'), 'utf8');
  const sourceRows = onboarding.match(/const SOURCE_ROWS = \[[\s\S]*?\n  \];/)?.[0] || '';
  const wiredSources = [...sourceRows.matchAll(/key: '([^']+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(wiredSources, settingsSources, 'a visible source is not loaded and saved');
});

test('fresh profiles enable playtime and a notification preview uses one transport', () => {
  const settings = fs.readFileSync(path.join(root, 'app', 'settings.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'app', 'ui', 'settings.js'), 'utf8');
  assert.match(settings, /playtime:\s*true/);
  assert.match(ui, /if \(mode === 'toast'\) await runNotificationTest/);
  assert.doesNotMatch(ui, /mode === 'toast' \|\| mode === 'both'\) runNotificationTest/);
  assert.match(ui, /setNotificationTestBusy\(btn, true\)/);
});

test('automatic scanning is reviewable and never injects Desktop or whole-drive roots', () => {
  const achievements = fs.readFileSync(path.join(root, 'app', 'parser', 'achievements.js'), 'utf8');
  const userDirs = fs.readFileSync(path.join(root, 'app', 'parser', 'userDir.js'), 'utf8');
  const rootBlock = achievements.match(/async function goldbergScanRoots[\s\S]*?return roots;\n}/)?.[0] || '';
  assert.doesNotMatch(rootBlock, /libraryDirs\.find/);
  assert.doesNotMatch(rootBlock, /Desktop/);
  assert.doesNotMatch(userDirs, /listDrive\s*\(/);
  assert.match(userDirs, /discoverLibraryRoots\(\)/);
});

test('artwork fallbacks fill missing assets without replacing existing ones', () => {
  const parser = fs.readFileSync(path.join(root, 'app', 'parser', 'achievements.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'app', 'electron', 'init.js'), 'utf8');
  assert.match(parser, /game\.img\.header = game\.img\.header \|\| fallback\.landscape/);
  assert.match(parser, /game\.img\.logo = game\.img\.logo \|\| fallback\.logo/);
  // Where an artwork answer is kept, and for how long, is one module both processes read.
  const cache = fs.readFileSync(path.join(root, 'app', 'util', 'sgdbAssetCache.js'), 'utf8');
  assert.match(cache, /steamgriddb_assets/);
  assert.match(main, /sgdbAssetCache\.readCached\(/);
  assert.match(parser, /sgdbAssetCache\.readCached\(/, 'the window reads it without a round trip per game');
  // The strict matcher decides, never the first search result - now once per name variant tried.
  assert.match(main, /pickSteamGridDbGame\(searchData\?\.data, variant\)/);
  assert.doesNotMatch(main, /if \(list\.length === 1\) return list\[0\]/);
});

test('the alternate-cover picker resolves and shows the actual current cover', () => {
  const app = rendererSource();
  assert.match(app, /const overrideUrl = coverOverrideFor\(appid, pickerOrientation\);/);
  assert.match(app, /const currentUrl = overrideUrl \|\| defaultUrl;/);
  assert.match(app, /const currentTilePromise = currentUrl/);
  // The resolution itself is shared with the icon picker, so both galleries treat a schema token
  // the same way instead of one of them drawing it raw.
  assert.match(app, /const resolvePreview = \(url\) => resolvePickerPreview\(url, coverCacheAppid\);/);
  assert.match(app, /ipcRenderer\.invoke\('fetch-icon', preview, cacheAppid\)/);
  assert.match(app, /game\.steamappid \|\| game\.appid/);
  // Resolved rather than drawn straight: a schema token such as "library_600x900.jpg" is not a
  // browser-ready URL, and the Current tile used to sit empty while the providers loaded.
  assert.match(app, /addResolvedTile\(currentUrl, t\('currentCover'/);

  /*
    A provider tile whose picture will not load is dropped - an empty box promises art that is not
    there. Current and Default are not a provider listing though: they are the cover on screen, and
    their value is usually a fetch-icon token, so offline (or once the CDN stops answering that
    token) dropping them left no way back to the cover the game already had. The picture the library
    tile is painted with stands in instead.
  */
  assert.match(app, /const preview = \(await resolvePreview\(url\)\) \|\| paintedCover\(\);/);
  assert.match(app, /const paintedCover = \(\) => cssUrlValue\(/, 'reading a painted background belongs beside cssUrl(), not open-coded here');
});

test('streaming scans retain a skeleton tail until the list actually completes', () => {
  const app = rendererSource();
  assert.match(app, /const MIN_STREAMING_SKELETON_TILES = 6/);
  assert.match(app, /if \(!skeletonStreamActive\) return;\s*const budget = skeletonBudget\(MIN_STREAMING_SKELETON_TILES\)/);
  // The tail is capped by the games still to arrive, so it runs down to nothing instead of
  // shimmering past the last one (behaviour covered by browser/skeletonTiles.browser.test.js).
  assert.match(app, /function skeletonBudget\(cap\)[\s\S]*?skeletonExpected - skeletonRendered/);
  assert.match(app, /function clearSkeletonTiles\(\) \{\s*skeletonStreamActive = false/);
});

test('manual game creation is a compact search-adjacent action with explicit optional fields', () => {
  const html = fs.readFileSync(path.join(root, 'app', 'view', 'app.html'), 'utf8');
  const search = html.match(/<div id="search-bar">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
  assert.match(search, /id="add-game-manually"[\s\S]*?<div class="wrapper">/);
  assert.match(search, /<i class="fas fa-plus"/);
  assert.match(search, /<span class="sr-only">Add game manually<\/span>/);
  assert.match(html, /id="manual-game-name-label">Game name/);
  assert.match(html, /id="manual-game-appid-label">Steam AppID \(optional\)/);
});

test('folder provenance never reuses an add-folder action as the manual-source badge', () => {
  const settingsUi = fs.readFileSync(path.join(root, 'app', 'ui', 'settings.js'), 'utf8');
  const onboarding = fs.readFileSync(path.join(root, 'app', 'ui', 'onboarding.js'), 'utf8');
  const metadata = settingsUi.match(/function applyFolderRowMetadata[\s\S]*?function folderEntryFromRow/)?.[0] || '';
  assert.match(metadata, /manual-source/);
  assert.doesNotMatch(metadata, /addLibraryDir|addCustomDir/);
  assert.doesNotMatch(metadata, /origin\.append/);
  assert.doesNotMatch(metadata, /options\.detector \|\| detectedLabel/);
  assert.match(onboarding, /folder-origin \$\{automatic \? 'auto' : 'manual'\}/);
  assert.doesNotMatch(onboarding, /origin\.append/);
  assert.doesNotMatch(onboarding, /entry\.detector \|\| t\.smartFind/);
});

test('initial config generation is gated to games without an existing fix', () => {
  const parser = fs.readFileSync(path.join(root, 'app', 'parser', 'achievements.js'), 'utf8');
  const settingsUi = fs.readFileSync(path.join(root, 'app', 'ui', 'settings.js'), 'utf8');
  const app = rendererSource();
  assert.match(parser, /onlyIfUnconfigured:\s*true/);
  assert.match(settingsUi, /emulatorFixEligibility\.inspect/);
  assert.match(app, /initialGbeEligibility\.eligible/);
});

test('manual games keep guarded per-game tools and the common uninstall flow', () => {
  const app = rendererSource();
  assert.match(app, /const isManualGame = !!ctxGame\?\.manual \|\| gameSource === 'Manual'/);
  assert.match(app, /allowManual: isManualGame/);
  assert.match(app, /if \(!isConsoleSystem\)/);
  assert.match(app, /if \(!isManualGame\) emulatorMenu\.append/);
  assert.match(app, /if \(!isManualGame\) appendCrackFixItem\(\)/);
  assert.match(app, /if \(app\.config\?\.general\?\.uninstallContextMenu !== false\)/);
  assert.match(app, /if \(isManualGame && isConsoleSystem\)[\s\S]*?PCGamingWiki/);
  assert.match(app, /if \(isManualGame \|\| isUbisoftSource\)[\s\S]*?PlaytimeTracking\.reset/);
});

test('zero-achievement games render a localized unavailable state instead of zero percent', () => {
  const app = rendererSource();
  assert.match(app, /const hasAchievements = Number\(game\.achievement\.total\) > 0/);
  assert.match(app, /const progressLabel = !hasAchievements/);
  assert.match(app, /progressBar\$\{!hasAchievements \? ' unavailable' : ''\}/);
  assert.doesNotMatch(app, /game\.manual && game\.achievement\.total === 0/);
});

test('achievement-less games open the normal detail view and only the play button launches them', () => {
  const app = rendererSource();
  assert.doesNotMatch(app, /if \(selected && !gameHasAchievements\(selected\)\)/);
  assert.match(app, /on\('click\.awLibrary', '\.game-box',[\s\S]*?self\.onGameBoxClick\(\$\(this\), gameList\)/);
  assert.match(app, /on\('click\.awLibrary', '\.game-box \.play-button',[\s\S]*?self\.onPlayButtonClick/);
  assert.match(app, /const title = game\.manual[\s\S]*?achievements-not-available/);
  assert.match(app, /path\.isAbsolute\(localPath\) \? pathToFileURL\(localPath\)\.href/);
  assert.match(app, /quarantineBrokenBypass/);
  assert.match(app, /ipcRenderer\.invoke\('launch-game-via-shell'/);
});
