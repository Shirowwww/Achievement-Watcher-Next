'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Opening a game paints its artwork onto <body>; going back clears it. The artwork arrives from
// an async fetch-icon call, so a late reply can land after the page changed and repaint the
// library with the wrong background - the guard is the header's data-appid, cleared on the way out
// so a stale reply can tell. Both halves are pinned: either alone silently stops working.

const appDir = path.join(__dirname, '..', '..', 'app');
const appJs = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const gameJs = fs.readFileSync(path.join(appDir, 'ui', 'game.js'), 'utf8');

test('a late artwork fetch checks it is still the open game before painting the backdrop', () => {
  const start = appJs.indexOf("ipcRenderer.invoke('fetch-icon', game.img.background");
  assert.ok(start !== -1, 'the background fetch must still be here');
  const paintAt = appJs.indexOf('paintBackdrop(cssUrl(localPath))', start);
  assert.ok(paintAt !== -1, 'the fetched picture must still be painted here');
  const block = appJs.slice(start, appJs.indexOf('});', paintAt));

  const guard = block.indexOf("attr('data-appid')");
  const paint = block.indexOf('paintBackdrop(');
  assert.ok(guard !== -1, 'the callback must compare the open appid');
  assert.ok(guard < paint, 'the check must run before the backdrop is painted');
  assert.match(block.slice(guard, paint), /return;/, 'a stale reply must bail out, not fall through');
});

test('leaving a game clears the open-game marker immediately', () => {
  const handler = gameJs.slice(gameJs.indexOf("$('#btn-previous').click("));
  const clear = handler.indexOf("removeAttr('data-appid')");
  assert.ok(clear !== -1, 'the back button must clear the open-game marker');

  // It has to happen before the fade-out, not inside its callback: the whole point is to invalidate
  // an in-flight fetch as early as possible, and the animation chain runs ~800ms later.
  const fade = handler.indexOf('fadeOut');
  assert.ok(clear < fade, 'the marker must be cleared before the fade-out chain starts');
});

/*
  Issue #61 came from darkening twice: a tint baked into the stylized file, then a veil on top, and
  the screen came out black. Now nothing is darkened before the page: the stylizer only blurs, and
  every picture, whatever its source, is painted under the one veil app.css defines.
*/
test('every game page picture is painted under the same single veil', () => {
  const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');
  assert.match(css, /--game-backdrop-veil:/, 'app.css must define the veil');

  const paints = [...appJs.matchAll(/paintBackdrop\(/g)];
  assert.equal(paints.length, 2, 'the default picture and the fetched one must both go through paintBackdrop');
  assert.match(appJs, /const paintBackdrop = \(url\) => \$\('body'\)\.fadeIn\(\)\.attr\('style', `--game-backdrop-image: \$\{url\}`\);/);
  assert.match(css, /background: var\(--game-backdrop-veil\), var\(--game-backdrop-image\)/, 'the layer must draw the veil over the picture');
  assert.doesNotMatch(appJs, /rgba\(0, 0, 0, 0\.74\)/, 'no second, source-specific veil');

  const init = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
  const stylize = init.slice(init.indexOf("ipcMain.on('stylize-background-for-appid'"));
  assert.doesNotMatch(stylize.slice(0, stylize.indexOf('writeFileSync')), /fill-opacity|composite\(/, 'the stylizer must not tint the picture');
});

// Every source in one order, so a page never looks different only because of where the game came
// from: Steam's hero, SteamGridDB's (Dolphin Up has no library hero), the source's own background
// unless it is Steam's blue-tinted page one, the cover (a Ubisoft title, Sovereign Tower), and that
// blue page background last.
test('every game page tries a hero first, whatever its source, and the blue Steam page last', () => {
  assert.match(appJs, /return ipcRenderer\.invoke\('fetch-icon', 'library_hero\.jpg', appid\)\.catch\(\(\) => null\);/, 'a failed hero download falls through');
  assert.match(appJs, /const coverArt = \(\) => fetchArt\(game\.img\.header\)\.then\(\(art\) => art \|\| fetchArt\(game\.img\.portrait\)\);/);
  assert.match(appJs, /const steamPage = isSteamPageBackground\(game\.img\.background\);/);
  assert.match(
    appJs,
    /const background = customBackground\n\s*\? Promise\.resolve\(customBackground\)\n\s*: bandHeroArt\(game, game\.appid\)\n\s*\.catch\(\(\) => null\)\n\s*\.then\(\(hero\) => hero \|\| \(steamPage \? null : ownBackground\(\)\)\)\n\s*\.then\(\(art\) => art \|\| coverArt\(\)\)\n\s*\.then\(\(art\) => art \|\| \(steamPage \? ownBackground\(\) : null\)\);/
  );
  assert.match(appJs, /if \(!localPath \|\| String\(/, 'nothing found keeps the generic picture');
});

test('every source that hands over raw artwork marks it for the veil', () => {
  const parser = (file) => fs.readFileSync(path.join(appDir, 'parser', file), 'utf8');

  // A launcher's own cached image, and Ubisoft's own art for a game with no Steam release.
  assert.match(parser('uplay.js'), /background: null,\n\s+icon: null,\n\s+overlay: true,/);
  assert.match(parser('ubisoftOfficial.js'), /let img = \{ header: null, background: null, portrait: null, icon: null, overlay: true \};/);

  // Ubisoft's catalogue boxart, and a SteamGridDB hero wherever the scan borrows one (the scan's
  // own fill lives in util/artFallback.js): each site sets the flag beside the background it wrote.
  const achievements = parser('achievements.js') + fs.readFileSync(path.join(appDir, 'util', 'artFallback.js'), 'utf8');
  const borrowed = [...achievements.matchAll(/^\s*if \([^\n]*\.background\) \{\n(\s*(?:game\.)?(?:img|art)\.background = [^\n]+\n\s*(?:game\.)?(?:img|art)\.overlay = true;)/gm)];
  assert.equal(borrowed.length, 3, 'each borrowed background must set the flag beside it');

  // Steam's own page background is pre-darkened and must stay unveiled.
  assert.doesNotMatch(parser('steam.js'), /overlay: true/);
});

test('every way back to the library goes through the back button', () => {
  // The clear lives in the #btn-previous handler, so a second exit path would bypass it. Escape,
  // the mouse Back button, the controller, a refresh and the settings panel all trigger that button
  // today; this fails if someone instead shows the library directly.
  const own = [...gameJs.matchAll(/\$\('#home'\)\.fadeIn/g)];
  assert.equal(own.length, 1, 'game.js must reveal the library in exactly one place');
  assert.ok(own[0].index > gameJs.indexOf("$('#btn-previous').click("), 'that one place must be the back-button handler');

  for (const file of ['ui/refresh.js', 'ui/settings.js', 'ui/controller.js']) {
    const source = fs.readFileSync(path.join(appDir, file), 'utf8');
    const stray = source.match(/\$\('#home'\)\.fadeIn/);
    assert.equal(stray, null, `${file} must trigger #btn-previous rather than showing the library itself`);
  }
});
