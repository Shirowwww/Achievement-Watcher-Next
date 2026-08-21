'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));
const settings = require(path.join(appDir, 'settings.js'));
const libraryLayout = require(path.join(appDir, 'util', 'libraryLayout.js'));
const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');

test('library layout state defaults safely and retains the portrait preference from older configs', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-layout-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  settings.setUserDataPath(userData);

  const log = console.log;
  let config;
  try {
    console.log = () => {};
    config = settings.load();
  } finally {
    console.log = log;
  }

  assert.equal(config.achievement.libraryLayout, 'default');
  assert.equal(config.achievement.thumbnailPortrait, false);

  config.achievement.libraryLayout = 'details';
  await settings.save(config);
  let loaded = settings.load();
  assert.equal(loaded.achievement.libraryLayout, 'details');
  assert.equal(loaded.achievement.thumbnailPortrait, false);

  delete loaded.achievement.libraryLayout;
  loaded.achievement.thumbnailPortrait = true;
  await settings.save(loaded);
  loaded = settings.load();
  assert.equal(loaded.achievement.libraryLayout, 'portrait');
  assert.equal(loaded.achievement.thumbnailPortrait, true);
});

test('only supported layouts enter renderer state', () => {
  assert.deepEqual(libraryLayout.MODES, ['default', 'portrait', 'compact', 'portrait-compact', 'list', 'details']);
  for (const mode of libraryLayout.MODES) assert.equal(libraryLayout.normalize(mode), mode);
  assert.equal(libraryLayout.isPortrait('portrait-compact'), true);
  assert.equal(libraryLayout.normalize('mosaic'), 'default');
  assert.equal(libraryLayout.normalize('mosaic', true), 'portrait');
});

test('the settings control exposes all layouts without adding a positional settings row', () => {
  const document = htmlParser.parse(html);
  const generalRows = document.querySelectorAll('#options-ui > ul > li');
  const control = document.querySelector('#option_libraryLayout');
  const toolbarControl = document.querySelector('#library-layout-select');
  const searchBar = document.querySelector('#search-bar');
  assert.ok(control);
  assert.ok(toolbarControl);
  assert.equal(searchBar.querySelector('#library-layout-select'), toolbarControl);
  assert.equal(document.querySelector('#sort-box #library-layout-select'), null);
  assert.ok(
    searchBar.innerHTML.indexOf('library-layout-select') < searchBar.innerHTML.indexOf('add-game-manually'),
    'the view menu should sit to the left of Add game'
  );
  assert.equal(generalRows[1].querySelector('#option_libraryLayout'), control);
  for (const select of [control, toolbarControl]) {
    assert.deepEqual(
      select.querySelectorAll('option').map((option) => option.getAttribute('value')),
      libraryLayout.MODES
    );
  }
});

test('the library toolbar switches and persists the shared layout state', () => {
  assert.match(appSource, /#library-layout-select[\s\S]*?change\.awLibraryLayout/);
  assert.match(appSource, /self\.config\.achievement\.libraryLayout = nextMode/);
  assert.match(appSource, /self\.config\.achievement\.thumbnailPortrait = libraryLayout\.isPortrait\(nextMode\)/);
  assert.match(appSource, /settings\.save\(self\.config\)/);
  assert.match(appSource, /function refreshLibraryCovers[\s\S]*?scheduleLibraryCover/);
  assert.match(css, /#game-list\.view-list > ul,[\s\S]*?justify-items: stretch/);
  assert.match(css, /#game-list\.view-list \.achievement-button[\s\S]*?right: 40px/);
  assert.match(css, /#game-list\.view-list \.config-button[\s\S]*?right: 8px/);
  assert.match(css, /--library-row-max: 1260px/);
  assert.match(css, /#game-list\.view-list \{[\s\S]*?--library-cover-width: 140px;[\s\S]*?--library-cover-height: 65\.5px/);
  assert.match(css, /#game-list\.view-details \{[\s\S]*?--library-cover-width: 250px;[\s\S]*?--library-cover-height: 117px/);
});

test('all layouts reuse one game card and details handle missing unlocks', () => {
  assert.equal((appSource.match(/class="game-box"/g) || []).length, 1, 'real games should have one shared card template');
  assert.match(appSource, /class="library-details\$\{hasAchievements \? '' : ' no-achievements'\}"/);
  assert.match(appSource, /library-recent-unlock\$\{latestUnlock \? '' : ' is-empty'\}/);
  // Tile labels read straight from the locale tree: an English literal beside them would ship as
  // English in all 28 languages the first time a key went missing.
  assert.match(appSource, /achievementDate: localeText\('latestAchievementEarned'\)/);
  assert.match(appSource, /library-recent-unlock[\s\S]*?<i class="fas fa-medal"/);
  assert.match(appSource, /localeText\('noneUnlocked'\)/);
  assert.match(appSource, /const recentUnlockText = !hasAchievements[\s\S]*?\? progressLabel/);
  assert.match(appSource, /const neverPlayedText = localeText\('neverPlayed'\)/);
  assert.match(appSource, /PlaytimeTracking\.readSync\(game\.appid\)/);
  assert.match(appSource, /class="library-playtime\$\{playtimeText/);
  assert.match(appSource, /library-last-played\$\{lastPlayedTime \? '' : ' is-empty'\}/);
  assert.match(appSource, /library-achievement-summary" data-label="\$\{escapeHtml\(tileLabels\.achievements\)\}/);
  assert.match(appSource, /library-last-played[\s\S]*?data-label="\$\{escapeHtml\(tileLabels\.lastPlayed\)\}/);
  // Relative times come from Intl.RelativeTimeFormat, which phrases and pluralizes them per
  // language, so no wording for them lives in the locale files.
  assert.match(appSource, /function libraryRelativeTime[\s\S]*?intlFormat\.formatRelativeTime\(seconds, lang\)/);
  assert.match(appSource, /function startLibraryTextScroll[\s\S]*?text\.scrollWidth - container\.clientWidth/);
  assert.match(appSource, /prefers-reduced-motion: reduce/);
  assert.match(appSource, /mouseenter\.awLibrary', '\.library-scroll-text'[\s\S]*?startLibraryTextScroll/);
  assert.match(appSource, /class="title library-scroll-text"/);
  assert.match(appSource, /class="progress-value library-scroll-text"/);
  assert.match(appSource, /library-recent-name library-scroll-text/);
  assert.match(appSource, /library-playtime[\s\S]*?class="library-scroll-text"/);
  assert.match(css, /#game-list \.library-scroll-content[\s\S]*?min-width: max-content/);
  assert.match(css, /library-recent-unlock\.is-empty \.library-recent-name/);
  assert.doesNotMatch(css, /no-achievements \.library-recent-unlock\s*\{[\s\S]*?display:\s*none/);
  assert.doesNotMatch(css, /view-details \.library-details\.no-achievements\s*\{[\s\S]*?grid-template-columns/);
  assert.match(css, /#game-list\.view-details \.library-details > span::before[\s\S]*?content: attr\(data-label\)/);

  for (const mode of ['compact', 'portrait-compact', 'list', 'details']) {
    assert.match(css, new RegExp(`#game-list\\.view-${mode}`), `${mode} needs a CSS-only layout`);
  }
  assert.match(css, /--library-grid-min/);
  assert.match(css, /--library-card-width/);
  assert.doesNotMatch(appSource, /game-box-(?:compact|list|details)/);
});

test('library artwork recovers both orientations in view and falls back through every available image', () => {
  assert.match(appSource, /\[img\.portrait, img\.header, img\.landscape, img\.background, img\.icon\]/);
  assert.match(appSource, /\[img\.header, img\.landscape, img\.background, img\.portrait, img\.icon\]/);
  const recovery = appSource.slice(appSource.indexOf('async function recoverLibraryCover'), appSource.indexOf('function scheduleLibraryCover'));
  assert.ok(recovery.indexOf('get-steam-cdn-covers') < recovery.indexOf('get-steamgriddb-cover'));
  assert.match(mainSource, /ipcMain\.handle\('get-steam-cdn-covers'/);
  assert.match(mainSource, /fetchSteamGridDbCover\(gameName, steamAppid = '', orientation = 'portrait'\)/);
  assert.match(appSource, /image\.portrait = recovered/);
  assert.match(appSource, /image\.header = recovered/);
  assert.match(css, /\.header\.portrait-fallback[\s\S]*?background-size: cover/);
  assert.match(appSource, /function setLibraryArtworkFeedback/);
  assert.match(appSource, /artwork-caches-cleared/);
  assert.match(appSource, /function previewReady|const previewReady/);
  assert.match(appSource, /Promise\.all\(steamUrls\.map/);
  assert.match(appSource, /get-cover-options-steamdb/);
  assert.match(appSource, /coverStore\.persist\(String\(appid\), url/);
  assert.match(appSource, /fastNetworkUnavailable/);
  assert.match(appSource, /artwork-fetch-failed/);
  assert.match(appSource, /artwork-not-found/);
  assert.match(appSource, /retry-artwork/);
  assert.match(appSource, /cover-picker-fetch-failed/);
  assert.match(appSource, /aw-cover-picker-retry/);
  assert.match(css, /library-artwork-feedback/);
  assert.match(css, /library-artwork-retry/);
  assert.match(css, /#game-list\.view-compact \.library-artwork-feedback/);
  assert.match(mainSource, /function resetArtworkLookupCaches/);
  assert.match(mainSource, /steamdbCoversQueue = Promise\.resolve\(\)/);
  assert.match(mainSource, /steamCdnCoversCache\.clear\(\)/);
  assert.match(mainSource, /steamgriddbCoversInFlight\.clear\(\)/);
  assert.match(mainSource, /STEAM_CLIENT_LOGIN_TIMEOUT_MS/);
  assert.match(mainSource, /network unavailable - skipping repeated Steam lookups/);
  assert.match(mainSource, /resetSteamTransportCircuit\(\)/);
  assert.match(fs.readFileSync(path.join(appDir, 'parser', 'steam.js'), 'utf8'), /STEAM_APP_LIST_TIMEOUT_MS = 8000/);
  assert.match(settingsSource, /app\.onStart\(\{ forceAchievementRecheck: true, preserveExistingOnFailure: true \}\)/);
});

test('list progress keeps a dedicated non-overlapping column', () => {
  const rule = css.slice(css.indexOf('#game-list.view-list .game-box .info {'), css.indexOf('#game-list.view-list .game-box .info .title'));
  const progress = css.slice(css.indexOf('#game-list.view-list .game-box .info .progressBar'), css.indexOf('#game-list.view-list .library-details'));
  assert.match(rule, /minmax\(220px, 270px\)/);
  assert.match(progress, /width: 100%/);
  assert.match(progress, /margin-left: 0/);
  assert.doesNotMatch(progress, /margin-left:\s*-/);
});

test('every locale names every library layout', () => {
  const localeDir = path.join(appDir, 'locale', 'lang');
  for (const file of fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    const setting = locale.settings && locale.settings.general && locale.settings.general.thumbnail;
    assert.ok(String(setting && setting.name).trim(), `${file}: missing library view name`);
    assert.ok(String(setting && setting.description).trim(), `${file}: missing library view description`);
    assert.ok(String(locale.achievements).trim(), `${file}: missing achievement label`);
    assert.ok(String(locale.noneUnlocked).trim(), `${file}: missing no-unlock label`);
    assert.ok(String(locale.latestAchievementEarned).trim(), `${file}: missing latest-achievement label`);
    assert.ok(String(locale.neverPlayed).trim(), `${file}: missing never-played label`);
    assert.ok(String(locale.sort && locale.sort.tooltip && locale.sort.tooltip.time).trim(), `${file}: missing achievement-date label`);
    assert.ok(String(locale.sort && locale.sort.tooltip && locale.sort.tooltip.played).trim(), `${file}: missing last-played label`);
    assert.ok(String(locale.settings && locale.settings.notification && locale.settings.notification.test.playtime).trim(), `${file}: missing playtime label`);
    assert.ok(String(locale.dialogs && locale.dialogs['achievements-not-available']).trim(), `${file}: missing no-achievement label`);
    for (const key of ['artwork-fetch-failed', 'artwork-not-found', 'retry-artwork', 'cover-picker-fetch-failed']) {
      assert.ok(String(locale[key]).trim(), `${file}: missing ${key}`);
    }
    for (const key of ['portrait', 'landscape', 'compact', 'portraitCompact', 'list', 'details']) {
      assert.ok(String(setting && setting.value && setting.value[key]).trim(), `${file}: missing ${key} label`);
    }
  }
});
