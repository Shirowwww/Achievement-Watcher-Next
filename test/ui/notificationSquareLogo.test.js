'use strict';

/*
  The square thumbnail of a notification card.

  Three cards showed what happens when this is left to the preset: a poster cropped through the
  middle of its own logo, a 32x32 clienticon stretched into a 68px box, and an empty square where
  the artwork had never been downloaded. All three reached the screen through the SAME entry point
  the Settings preview uses, which is the point these tests pin: the resolution belongs to
  enqueueNotification(), not to one of the two callers, or a preview keeps showing something no
  real notification would look like.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const init = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
const settingsUi = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
const watchdog = fs.readFileSync(path.join(__dirname, '..', '..', 'watchdog', 'watchdog.js'), 'utf8');

function sliceFunction(source, signature, end = '\n}') {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} must exist`);
  const body = source.slice(start);
  return body.slice(0, body.indexOf(end));
}

test('every notification and every preview goes through the same square-logo pass', () => {
  const enqueue = sliceFunction(init, 'function enqueueNotification(data) {');
  assert.match(enqueue, /withSquareGameLogo\(/, 'the shared entry point must resolve the logo');
  // The renderer's preview path and the Watchdog CLI path both end here, so neither can skip it.
  assert.match(init, /ipcMain\.on\('spawn-overlay-notification', \(event, data\) => \{\s*enqueueNotification\(/);
  const fromArgs = sliceFunction(init, 'async function enqueueNotificationFromArgs(args) {');
  assert.match(fromArgs, /enqueueNotification\(\{/, 'the unlock path enqueues rather than rendering directly');
  assert.match(fromArgs, /appid: args\.appid == null \? '' : String\(args\.appid\)/, 'the appid must reach the logo pass');
});

test('an achievement icon is left alone, game artwork is not', () => {
  const fn = sliceFunction(init, 'async function withSquareGameLogo(data) {');
  assert.match(fn, /if \(primary && achievementIcon && primary === achievementIcon\) return payload;/);
  // Poster and header are tried after the primary thumbnail, in that order.
  assert.match(fn, /const candidates = \[primary, payload\.gameIconPath[\s\S]{0,120}payload\.imagePath/);
});

test('the fallback walks every candidate instead of giving up on the first', () => {
  const fn = sliceFunction(init, 'async function resolveSquareGameLogo(appid, gameName, candidates) {');
  // Garry's Mod: the first candidate is a 32x32 clienticon, which cannot be cut into anything -
  // the loop has to continue to the poster rather than keeping it.
  assert.match(fn, /for \(const candidate of Array\.isArray\(candidates\) \? candidates : \[candidates\]\)/);
  assert.match(fn, /const square = localSquare\(local\);\s*if \(square\) return square;/);
  // A candidate that is not already a file - a URL, or a fetch-icon token such as a bare Steam
  // content hash - is resolved through the shared resolver before it is judged, and an unpaintable
  // one never reaches the preset: an empty square is worse than a hidden thumbnail.
  assert.match(fn, /paintableIconPath\(value\) \|\|\s*paintableIconPath\(\s*await Promise\.race\(\[\s*fetchSteamIcon\(value, appid\)/);
  assert.match(fn, /return firstPaintable;/);
});

test('a thumbnail is a local file that still exists, never a URL or a deleted cover', () => {
  const fn = sliceFunction(init, 'function paintableIconPath(candidate) {');
  assert.match(fn, /if \(!value \|\| \/\^https\?:\\\/\\\/\/i\.test\(value\)\) return '';/);
  assert.match(fn, /fs\.existsSync\(value\) \? value : ''/);
});

test('the preview borrows a game whose cover carries a digest suffix', () => {
  const handler = sliceFunction(init, "ipcMain.handle('notification-sample-art'", '\n});');
  // covers/<appid>-<digest>.<ext> is the normal spelling once a pick has been re-downloaded. Keying
  // on the full basename hid those files, so a library full of covers answered "no artwork".
  assert.match(handler, /replace\(\/-\[a-f0-9\]\+\$\/i, ''\)/);
});

test('a preview names the game it previews, so the same logo is resolved', () => {
  assert.match(settingsUi, /appid: \(game && game\.appid\) \|\| ''/, 'the preview payload must carry the appid');
});

test('the monitor asks for the logo when the game starts, not when the card is due', () => {
  // This is what gives a Windows-notification-only user a square logo: the monitor never fetches
  // artwork itself, it only reads what the app has already written to the shared cache.
  assert.match(watchdog, /requestArtworkPrefetch\(game\);/);
  const request = sliceFunction(watchdog, 'function requestArtworkPrefetch(game) {');
  assert.match(request, /artworkPrefetch: \{ appid: String\(game\.steamappid \|\| game\.appid \|\| ''\), name: String\(game\.name \|\| ''\) \}/);
  assert.match(init, /else if \(msg && msg\.artworkPrefetch\) prefetchSquareGameLogo\(msg\.artworkPrefetch\);/);
  const prefetch = sliceFunction(init, 'async function prefetchSquareGameLogo(request) {');
  assert.match(prefetch, /fetchSteamGridDbIcon\(name, appid\)/);
  assert.match(prefetch, /fetchSteamIcon\(icon\.url, appid\)/, 'the file itself must be cached, not just its URL');
  assert.match(prefetch, /squareLogoPrefetched\.has\(key\)/, 'one lookup per game per session');
});

test('notifications keep the order they were raised in', () => {
  const enqueue = sliceFunction(init, 'function enqueueNotification(data) {');
  // A cached logo returns instantly and an uncached one does not: without the chain, the second
  // notification would overtake the first.
  assert.match(enqueue, /squareLogoChain = squareLogoChain/);
  assert.match(enqueue, /enqueueResolvedNotification\(payload\)/, 'a failed lookup must still show the notification');
});

test('the achievement page header asks for the same logo instead of taking the clienticon', () => {
  const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
  const header = appSource.slice(appSource.indexOf('const headerIconSources ='), appSource.indexOf("$('#achievement .wrapper > .header .title span').text(game.name)"));
  assert.match(header, /invoke\('resolve-square-logo'/, 'the header must go through the shared resolver');
  assert.doesNotMatch(header, /invoke\('fetch-icon'/, 'resolving artwork a second way is what made the two disagree');
  // Every artwork the game has is offered, so a game with no clienticon still gets a logo.
  assert.match(header, /\[game\.img\.icon, game\.img\.logo, game\.img\.portrait, game\.img\.header\]/);
  // A slow lookup must not paint the icon of a page the user has already left.
  assert.match(header, /data-appid'\)\) !== String\(game\.appid\)\) return;/);
});

test('the Health panel test reuses the resolver rather than resolving artwork its own way', () => {
  const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
  const branch = appSource.slice(appSource.indexOf('gameHealth.ACTION.TEST_NOTIFICATION'));
  const body = branch.slice(0, branch.indexOf('\n  if (action ==='));
  assert.match(body, /invoke\('resolve-square-logo'/, 'the preview thumbnail comes from the shared resolver');
  // The hero slot is a different question - a wide, uncropped header - and keeps its own resolution.
  assert.match(body, /resolveArt\(art\.header \|\| art\.background/);
  assert.match(body, /fileURLToPath\(square\)/, 'the overlay needs a filesystem path, not a file:// URL');
});

test('the resolver is exposed once, and answers with nothing rather than something unpaintable', () => {
  const handler = sliceFunction(init, "ipcMain.handle('resolve-square-logo'", '\n});');
  assert.match(handler, /resolveSquareGameLogo\(/);
  assert.match(handler, /iconResultToFileUrl\(square\)\) \|\| ''/, 'a non-local answer must come back as empty, not as a broken URL');
});

test('the borrowed sample carries a square logo, for the toast test as much as the popup', () => {
  const handler = sliceFunction(init, "ipcMain.handle('notification-sample-art'", '\n});');
  // This one object feeds both transports' tests: the overlay preview payload and the Watchdog's
  // toast test. Resolving it here is what stops either of them framing a raw 2:3 cover.
  assert.match(handler, /resolveSquareGameLogo\(appid, pick\.name \|\| '', \[cover, image\]\)/);
});

test('a schema token resolves to real artwork instead of falling through', () => {
  const steamParser = fs.readFileSync(path.join(appDir, 'parser', 'steam.js'), 'utf8');
  const fn = sliceFunction(steamParser, 'async function resolveWorkingIconUrl(appID, url) {');
  /*
    Schemas store "header.jpg", "library_600x900.jpg" and bare content hashes, not URLs. Downloading
    those as-is cannot work, and the caller got its own token back - which read as "no artwork" and
    sent the square-logo chain on to the only absolute URL such a schema has: the store page
    background. That is why an appid with a perfectly good header and portrait ended up with a flat
    blue gradient in its icon box.
  */
  assert.match(fn, /if \(!url\.startsWith\('http'\)\) \{/);
  assert.match(fn, /findWorkingLink\(appID, url\.split\('\/'\)\.pop\(\)/);
  // A local file must never be turned into a CDN probe.
  assert.match(fn, /if \(path\.isAbsolute\(url\) \|\| fs\.existsSync\(url\)\) return url;/);
});

test('the store page background is never offered as a logo', () => {
  const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
  const header = appSource.slice(appSource.indexOf('const headerIconSources ='), appSource.indexOf("$('#achievement .wrapper > .header .title span').text(game.name)"));
  // Steam's storepagebackground is a blurred decorative wash; a square cut out of it is a flat
  // gradient that reads as an empty box.
  assert.doesNotMatch(header, /game\.img\.background/);
  const branch = appSource.slice(appSource.indexOf('gameHealth.ACTION.TEST_NOTIFICATION'));
  const sources = branch.slice(branch.indexOf("invoke('resolve-square-logo'"), branch.indexOf('resolveArt(art.header'));
  assert.doesNotMatch(sources, /art\.background/);
});
