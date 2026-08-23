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

test('a late artwork fetch checks it is still the open game before painting body', () => {
  const start = appJs.indexOf("ipcRenderer.invoke('fetch-icon', game.img.background");
  assert.ok(start !== -1, 'the background fetch must still be here');
  const block = appJs.slice(start, appJs.indexOf('});', appJs.indexOf('$(\'body\').fadeIn().css(\'background\', cssUrl(localPath))', start)));

  const guard = block.indexOf("attr('data-appid')");
  const paint = block.indexOf("$('body')");
  assert.ok(guard !== -1, 'the callback must compare the open appid');
  assert.ok(guard < paint, 'the check must run before body is repainted');
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
