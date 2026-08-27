'use strict';

/*
  Local and user-chosen game icons (issue #38).

  The reporter's two screenshots were the same failure twice: a page of achievement rows stuck on
  their spinner, and a notification card with a broken thumbnail, on a machine that cannot reach
  Steam's CDN - while the game's own achievement_images folder held every picture. So there are two
  contracts here. Local artwork must be preferred wherever it exists, and a user must be able to
  choose an icon by hand, through the same gallery the cover picker uses, with that choice reaching
  every surface rather than just the page it was made on.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8');
const init = fs.readFileSync(path.join(root, 'app', 'electron', 'init.js'), 'utf8');
const watchdog = fs.readFileSync(path.join(root, 'watchdog', 'watchdog.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app', 'resources', 'css', 'app.css'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'app', 'electron-builder.yml'), 'utf8');

function sliceFunction(source, signature, end = '\n}') {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} must exist`);
  const body = source.slice(start);
  return body.slice(0, body.indexOf(end));
}

test('achievement rows try the game\'s own images before asking the CDN for them', () => {
  const preload = appSource.slice(appSource.indexOf('const localIconIndex = localIcons.readIndex(game);'), appSource.indexOf('if (typeof window.restoreAchievementSorts'));
  assert.notEqual(preload.length, 0, 'the icon preload pass must build a local index');
  const localFirst = preload.indexOf('if (local && (await setAchievementImage(selector, [local]))) return;');
  const download = preload.indexOf("cachedIcon(hash)");
  assert.ok(localFirst !== -1 && download !== -1, 'both paths must exist');
  assert.ok(localFirst < download, 'a local image must short-circuit the download, not follow it');
  // And when the download is what answers, the local file is still the fallback behind it.
  assert.match(preload, /setAchievementImage\(selector, \[downloaded, local\]\)/);
});

test('a row is left on its placeholder rather than painted with an image that did not decode', () => {
  const fn = sliceFunction(appSource, 'function setAchievementImage(selector, candidates) {');
  assert.match(fn, /img\.onerror = \(\) => attempt\(index \+ 1\)/, 'a broken candidate must fall through to the next');
  assert.match(fn, /if \(index >= list\.length\) return resolve\(false\)/, 'the caller has to be able to tell nothing was painted');
});

test('the square logo carries a right-click menu with the same four actions the cover has', () => {
  const fn = sliceFunction(appSource, 'function bindGameHeaderIconMenu(game) {', '\n}\n');
  assert.match(fn, /contextmenu\.awGameIcon/, 'namespaced, so the previous game\'s handler goes with it');
  assert.match(fn, /\.off\('contextmenu\.awGameIcon'\)/, 'the element is shared across game pages');
  assert.match(fn, /openIconPicker\(game, appid, iconCacheAppid, exePath\)/);
  assert.match(fn, /chooseLocalGameIcon\(game, appid\)/);
  assert.match(fn, /invoke\('forget-square-logo'/, 'Re-download must forget the cached answer, not just the pick');
  assert.match(fn, /if \(gameIconOverrideFor\(appid\)\)[\s\S]*?reset-icon-to-default/, 'reset is offered only when there is something to reset');
});

test('the icon picker is the cover picker\'s gallery, with icon sources and a manual way out', () => {
  const fn = sliceFunction(appSource, 'function openIconPicker(game, appid, iconCacheAppid, exePath) {', '\n}\n');
  assert.match(fn, /className = 'aw-prompt aw-cover-picker aw-icon-picker'/, 'the dialog chrome is shared, not rebuilt');
  assert.match(fn, /resolvePickerPreview\(previewUrl, iconCacheAppid\)/, 'and so is the preview resolution');
  assert.match(fn, /browseBtn\.onclick = \(\) => \{\s*if \(chooseLocalGameIcon\(game, appid\)\) done\(\);/);
  // Local sources are painted before anything is asked of the network, so the gallery is usable
  // offline - which is the state the issue reports.
  const local = fn.indexOf('localGameIconUrls(game)');
  const remote = fn.indexOf("invoke('get-icon-options'");
  assert.ok(local !== -1 && remote !== -1 && local < remote, 'the game folder must be offered before the network sources');
  assert.match(fn, /iconSourceGameFolder/);
  assert.match(fn, /iconSourceExecutable/);
  assert.match(fn, /'SteamGridDB'/);
  assert.match(fn, /'SteamDB'/);
});

test('every source in the gallery is an icon, never a library cover', () => {
  // The first build offered the game's raw schema artwork, which is a 2:3 grid and a 2:1 header -
  // the gallery filled up with covers, and none of them was what the square box would paint.
  const picker = sliceFunction(appSource, 'function openIconPicker(game, appid, iconCacheAppid, exePath) {', '\n}\n');
  assert.doesNotMatch(picker, /addProviderTile\(source, 'Steam'\)/, 'raw schema tokens must not be offered');
  assert.match(picker, /for \(const url of Array\.isArray\(opts\.steam\) \? opts\.steam : \[\]\)/, 'the host hands over squares instead');

  const squares = sliceFunction(init, 'async function squareIconCandidates(appid, sources) {');
  assert.match(squares, /makeSquareLogo\(local, appid/, 'anything that is not square is cut');
  // A clienticon is 32x32: below makeSquareLogo's usable side, and yet the game's real icon.
  assert.match(squares, /isSquareRatio\(size\.width, size\.height\)/, 'an already-square source is kept whatever its size');
});

test('SteamDB is scraped once for both its covers and its icons', () => {
  const assets = sliceFunction(init, 'async function fetchSteamDbAssets(appid, ');
  assert.match(assets, /steamdbCover\.coversFromHtml\(id, assets \|\| full\)/);
  assert.match(assets, /steamdbCover\.iconsFromHtml\(id, full\)/, 'the icon hashes are outside the assets table');
  assert.match(assets, /JSON\.stringify\(\{ appid: id, urls, icons \}/, 'one cache entry holds both');
  // A page visited by an older build cached covers alone; an icon caller has to notice and re-scrape.
  assert.match(assets, /!needIcons \|\| Array\.isArray\(cached\.icons\)/);
  assert.match(init, /ipcMain\.handle\('get-icon-options-steamdb'/);
});

test('the executable tile is the icon inside the PE, or no tile at all', () => {
  const fn = sliceFunction(init, 'async function fetchExecutableIcon(exePath, appid) {');
  // app.getFileIcon() answers with the generic application glyph for a file that has no icon, so
  // every game was offered the same blue window picture.
  assert.doesNotMatch(fn, /getFileIcon/, 'the shell must not be asked - it never says "no icon"');
  assert.match(fn, /require\('\.\.\/util\/exeIcon\.js'\)/);
  assert.match(fn, /if \(!icon\) return null;/, 'an executable without an RT_GROUP_ICON gets no tile');
  // It is on the default path now, so a 100 MB executable must not be re-read on every card.
  assert.match(fn, /cached\.mtimeMs >= exe\.mtimeMs/, 'an already-extracted icon is reused until the game is patched');
});

test('the executable icon is the default logo, ahead of any artwork that has to be cut', () => {
  const fn = sliceFunction(init, 'async function resolveSquareGameLogo(appid, gameName, candidates, ');
  const highRes = fn.indexOf('const highResExecutableIcon =');
  const community = fn.indexOf('fetchSteamGridDbIcon(gameName, appid)');
  const executable = fn.indexOf('const usableExecutableIcon =');
  const artwork = fn.indexOf('let firstPaintable');
  assert.ok(highRes !== -1 && community !== -1 && executable !== -1 && artwork !== -1, 'all four links must exist');
  // At 256px the exe is carrying the picture Windows paints for the game; nothing looked up beats it.
  assert.ok(highRes < community, 'a real 256px game icon wins outright');
  assert.ok(community < executable, 'a legacy stamp does not, so the icon set still gets its go first');
  assert.ok(executable < artwork, 'but a header cut into a square never does');
  // A 32x32 entry blown up into a 68px slot is the blurry stamp this whole resolver exists to avoid.
  assert.match(fn, /executableIconAtLeast\(MIN_EXECUTABLE_ICON_SIDE\)/);
  assert.match(fn, /executableIconAtLeast\(PREFERRED_EXECUTABLE_ICON_SIDE\)/);

  // The Watchdog paints Windows toasts on its own and must order its chain the same way.
  assert.match(
    watchdog,
    /highResExecutableIcon\(id\)[\s\S]*?steamSquareLogo\(id, game\.name\) \|\|\s*executableIcon\(id\)[\s\S]*?steamLibraryImage\(id\)/
  );
  // It has no PE reader, so it reads the file the app extracted when the game started.
  assert.match(init, /if \(executable\) await fetchExecutableIcon\(executable, appid\);/);
});

test('a schema token is stored as the file it resolved to, never as the token itself', () => {
  const fn = sliceFunction(appSource, 'function openIconPicker(game, appid, iconCacheAppid, exePath) {', '\n}\n');
  // "library_600x900.jpg" and a bare content hash mean nothing outside fetch-icon; storing one
  // would leave the header painting a path that resolves to nothing.
  assert.match(fn, /const applyValue = \/\^https\?:\/i\.test\(key\) \? key : preview;/);
});

test('the original icon is a tile in the gallery, not only an entry in the context menu', () => {
  const fn = sliceFunction(appSource, 'const addDefaultTile = async (run) => {', '\n  };');
  assert.match(fn, /ignoreOverride: true/, 'the tile has to preview what it restores, not the current pick');
  assert.match(fn, /resetGameIcon\(game, appid\)/, 'and clicking it clears the override rather than storing one');
  // Labelled for what it is: with nothing overridden the default already IS what is on screen.
  assert.match(fn, /overridden \? t\('defaultCover'[\s\S]*?: t\('currentCover'/);
  const resolver = sliceFunction(init, 'async function resolveSquareGameLogo(appid, gameName, candidates, ');
  assert.match(resolver, /if \(!ignoreOverride\) \{/, 'the host must be able to answer without the pick');
});

test('a chosen icon is resolved for every surface, not only the page it was chosen on', () => {
  const fn = sliceFunction(init, 'async function resolveSquareGameLogo(appid, gameName, candidates, ');
  const override = fn.indexOf("require('../util/gameIconStore.js')");
  const community = fn.indexOf('fetchSteamGridDbIcon(gameName, appid)');
  assert.ok(override !== -1 && community !== -1, 'both sources must be present');
  assert.ok(override < community, 'a decision outranks a lookup');
  // The Watchdog paints Windows toasts without going through that resolver, so it reads the same
  // file itself rather than being left with the artwork chain alone.
  assert.match(watchdog, /customGameIcon\(game\.appid\) \|\|/);
  const artwork = fs.readFileSync(path.join(root, 'watchdog', 'util', 'steamArtwork.js'), 'utf8');
  assert.match(artwork, /path\.join\(root, 'cfg', 'gameIcons\.db'\)/);
});

test('notification cards fall back to the game folder when nothing else answers', () => {
  const fn = sliceFunction(init, 'async function resolveSquareGameLogo(appid, gameName, candidates, ');
  assert.match(fn, /localIcons\.gameIconCandidates\(\{ binary: configuredExecutable\(appid, libraryAppid\) \}\)/);
  const watchdogIcon = sliceFunction(watchdog, 'function notificationAchievementIcon(game, achievement, achieved) {');
  assert.match(watchdogIcon, /localIcons\.achievementIconFor\(/);
  assert.match(watchdog, /icon: notificationAchievementIcon\(game, ach, true\)/);
  assert.match(watchdog, /icon: notificationAchievementIcon\(game, ach, false\)/);
});

test('the Watchdog reaches the shared module the packaged way, and the build ships it', () => {
  assert.match(watchdog, /require\(sharedAppModulePath\('util\/localIcons\.js'\)\)/);
  // Anything loaded that way has to be outside app.asar, or the packaged Watchdog cannot read it.
  assert.match(builder, /asarUnpack:[\s\S]*?- util\/localIcons\.js/);
});

test('Re-download forgets both halves of what was cached about a logo', () => {
  const handler = sliceFunction(init, "ipcMain.handle('forget-square-logo'", '\n});');
  assert.match(handler, /steamgriddbIconsDir/, 'a cached SteamGridDB miss lasts 30 days and must go too');
  assert.match(handler, /-logo\\\.png\$/, 'and so must the squares already cut from local artwork');
});

test('icon tiles are square and show the whole logo instead of cropping it', () => {
  assert.match(css, /\.aw-cover-picker-tile\.aw-square \{[\s\S]*?aspect-ratio: 1 \/ 1;[\s\S]*?background-size: contain;/);
  assert.match(css, /#achievement \.wrapper > \.header \.title \.icon \{[\s\S]*?cursor: context-menu;/);
});
