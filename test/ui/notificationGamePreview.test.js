'use strict';

// A notification test fired from a game's Health panel must preview THAT game. The trap: the
// overlay has two entry points with different payload shapes - enqueueNotificationFromArgs() (the
// Watchdog CLI path) normalises `gameDisplayName`, but enqueueNotification() (the renderer's test
// path) does not, since the window forwards a fixed field list - an unread field is silently ignored.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const settingsUi = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
const init = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');

// The exact fields createNotificationWindow() forwards to the notification page.
function windowFields() {
  const send = init.slice(init.indexOf("notif.webContents.send('show-notification', {"));
  const body = send.slice(0, send.indexOf('\n    });'));
  return new Set([...body.matchAll(/^\s{6}([A-Za-z][\w]*):/gm)].map((m) => m[1]));
}

// The payload the renderer builds for a preview.
function overlayTestDataBody() {
  const fn = settingsUi.slice(settingsUi.indexOf('function overlayTestData('));
  return fn.slice(0, fn.indexOf('\n    }\n'));
}

test('every field the preview payload sets is one the notification window actually reads', () => {
  const fields = windowFields();
  const body = overlayTestDataBody();
  const returned = body.slice(body.indexOf('return Object.assign('));

  const handledElsewhere = new Set([
    // Consumed under an alias by createNotificationWindow (`data.icon`, `data.image`, …) or handled
    // by enqueueNotification/processNotificationQueue before the window exists.
    'test',
    'preset',
    'image',
    'icon',
    'gameIcon',
    'soundPath',
    'notifyId',
    'volume', // read for the sound gain, outside the send() payload
    // Read by enqueueNotification()'s square-logo pass, before the window exists: `appid` names the
    // game to look a community logo up for, and `achievementIconPath` is how that pass tells an
    // achievement icon (already square, left alone) from game artwork (reworked into a square).
    'appid',
    'achievementIconPath',
    // Read where the popup is placed, not where it is drawn: gamePositionAppid names the game whose
    // saved anchor applies, customPosition is the anchor a preview is being dragged to.
    'gamePositionAppid',
    'customPosition',
  ]);
  const unread = [...returned.matchAll(/^\s{10}([A-Za-z][\w]*):/gm)]
    .map((m) => m[1])
    .filter((name) => !fields.has(name) && !handledElsewhere.has(name));

  assert.deepEqual(unread, [], `these preview fields are never read by the notification window: ${unread.join(', ')}`);
});

test('the preview names the game somewhere the overlay actually renders', () => {
  const body = overlayTestDataBody();
  // `displayName` carries the achievement title on this path, so a real unlock never prints the
  // game name: the description is the only slot a preview can use to say which game it is.
  assert.match(body, /texts\[kindName\]\.description = game\.name/, 'the game must be named in a rendered slot');
  assert.match(body, /texts\.playtime\.displayName = game\.name/, 'playtime keeps the game in its title');
  // The dead field must not come back.
  assert.doesNotMatch(body, /gameDisplayName:/, 'gameDisplayName is not read on the renderer path');
});

test('the preview shows the game artwork rather than the placeholder badge', () => {
  const body = overlayTestDataBody();
  assert.match(body, /const gameIcon = \(game && game\.icon\) \|\|/, 'the game icon wins when one is supplied');
  assert.match(body, /iconPath: kind === 'playtime' \|\| game \? gameIcon : achievementIcon/, 'a game preview must not keep the generic badge');
  assert.match(body, /image: \(game && game\.image\) \|\| ''/, 'the header art feeds imagePath/headerPath');
});

test('both transports receive the game, and the Health panel supplies it', () => {
  // Windows toast: through the websocket protocol.
  assert.match(settingsUi, /function runNotificationTest\(cmd, btn, game\)/);
  assert.match(settingsUi, /ws\.send\(JSON\.stringify\(game \? \{ cmd, game \} : \{ cmd \}\)\)/, 'the toast test carries the game');
  // Overlay: through the payload builder.
  assert.match(settingsUi, /overlayTestData\(kind, notificationOverrides, null, game\)/, 'the overlay test carries the game');
  // And the shared entry point threads it from the Health panel.
  assert.match(settingsUi, /window\.testAchievementWatcherNotification = function \(mode, button, notificationOverrides, game, kind = 'toast'\)/);
  // The Health panel button, the per-game Notifications tab and the Settings rows all go through
  // testGameNotification(), so the game reaches the payload from one place.
  assert.match(appSource, /async function testGameNotification\(appid, kind, button\)/);
  assert.match(appSource, /const game = await notificationPreviewGame\(appid\);[\s\S]{0,200}testAchievementWatcherNotification\(/, 'the shared entry point passes the resolved game');
});

test('the artwork is resolved before it is sent, never passed as a raw token', () => {
  /*
    game.img holds fetch-icon TOKENS, not URLs: `icon` is a bare Steam content hash
    ("3714884d0e78…") and `header` a fragment ("header.jpg", "<hash>/header.jpg"). Handing those to
    a notification produces no artwork at all - the failure is silent, the popup simply shows the
    placeholder. Every other view in the app resolves them through the fetch-icon IPC first.
  */
  const start = appSource.indexOf('async function notificationPreviewGame(appid) {');
  assert.notEqual(start, -1, 'the shared preview builder must exist');
  const body = appSource.slice(start, appSource.indexOf('\n}', start));

  assert.match(body, /invoke\('fetch-icon', token, artAppid\)/, 'tokens must go through fetch-icon');
  assert.match(body, /fileURLToPath\(resolved\)/, 'the overlay needs a filesystem path, not a file:// URL');

  // What it hands back must be the RESOLVED values, not the raw img fields.
  const returned = body.slice(body.indexOf('return {'));
  assert.match(returned, /icon,/, 'the resolved icon is sent');
  assert.match(returned, /image };/, 'the resolved header is sent');
  assert.doesNotMatch(returned, /art\.icon|art\.header|art\.background|art\.logo/, 'no raw token may reach the payload');

  // A failed resolution must degrade to the built-in sample rather than sending a broken path.
  assert.match(body, /return ''/, 'an unresolved token becomes empty, letting the sample stand in');
});

test('the watchdog side keeps the sample when no game is supplied', () => {
  const watchdog = fs.readFileSync(path.join(__dirname, '..', '..', 'watchdog', 'notification-test.js'), 'utf8');
  assert.match(watchdog, /function testMessageAndOptions\(kind, options, game = null\)/);
  // Every sample constant must remain reachable as a fallback.
  for (const fallback of ['TEST_APPID', 'TEST_GAME', 'TEST_GAME_ICON', 'TEST_HEADER', 'TEST_ACHIEVEMENT_ICON']) {
    assert.ok(new RegExp(`\\|\\| ${fallback}`).test(watchdog), `${fallback} must stay the fallback`);
  }
  assert.match(watchdog, /module\.exports\.toast = \(game\) => runTest\('toast', \{ game \}\)/, 'the exported tests accept a game');

  const websocket = fs.readFileSync(path.join(__dirname, '..', '..', 'watchdog', 'websocket.js'), 'utf8');
  assert.match(websocket, /run\(req\.game && typeof req\.game === 'object' \? req\.game : null\)/, 'the protocol forwards it, and only an object');
});
