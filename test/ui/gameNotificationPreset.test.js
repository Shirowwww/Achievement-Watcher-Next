'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));
const document = htmlParser.parse(fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8'));
const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
const initSource = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} must exist`);
  const next = source.indexOf('\n}\n', start);
  return source.slice(start, next + 3);
}

test('notification presets live in the existing per-game panel', () => {
  const panel = document.querySelector('#game-config');
  const tab = panel.querySelector('#game-config-tabs [data-gc-view="notifications"]');
  assert.ok(tab, 'the existing game panel has a notification tab');
  assert.ok(panel.querySelector('.content[data-view="notifications"] #game-notifications'));
  assert.equal(document.querySelectorAll('#game-notifications').length, 1, 'there is no parallel settings surface');
});

test('the game notification surface is locale- and theme-driven', () => {
  const view = document.querySelector('#game-config .content[data-view="notifications"]');
  assert.equal(view.text.trim(), '', 'the HTML carries no visible fallback language');

  const labels = functionBody(appSource, 'function applyGameConfigTabLabels()');
  assert.doesNotMatch(labels, /t\('game-notification-/, 'notification labels do not embed English/French fallbacks');
  assert.match(labels, /localeText\('dialogs\.game-notification-preset-title'\)/);
  assert.match(labels, /localeText\('dialogs\.game-notification-use-global'\)/);
  assert.match(labels, /'aria-label': repositionLabel/, 'the icon-only placement action is named in the active locale');

  const localeDir = path.join(appDir, 'locale', 'lang');
  const localeFiles = fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'));
  assert.equal(localeFiles.length, 28);
  for (const name of localeFiles) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDir, name), 'utf8'));
    assert.ok(locale.dialogs['game-notification-preset-title'], `${name} localizes the preset heading`);
    assert.ok(locale.dialogs['game-notification-use-global'], `${name} localizes the global choice`);
  }

  const start = cssSource.indexOf('.game-notifications {');
  const end = cssSource.indexOf('.game-health {', start);
  const notificationCss = cssSource.slice(start, end);
  assert.doesNotMatch(notificationCss, /#[0-9a-f]{3,8}\b|rgba?\(|\b(?:black|white)\b/i, 'the panel uses semantic theme tokens only');
  assert.match(notificationCss, /\.game-notification-field > span,[\s\S]*?height: 20px;[\s\S]*?line-height: 20px;/);
  assert.match(notificationCss, /#game-notification-reposition \{[\s\S]*?width: 20px;[\s\S]*?height: 20px;/);
});

test('preset, position, sound and scale all expose a global fallback', () => {
  for (const id of [
    '#game-notification-preset',
    '#game-notification-position',
    '#game-notification-sound',
    '#game-notification-scale',
  ]) {
    const select = document.querySelector(id);
    assert.ok(select, `${id} exists`);
    assert.equal(select.querySelector('option').getAttribute('value'), '', `${id} inherits globally by default`);
  }
  assert.ok(document.querySelector('#game-notification-sound option[value="__none__"]'), 'one game can explicitly mute its popup');
  assert.ok(document.querySelector('#game-notification-sound option[value="__random__"]'), 'one game can request a random sound');
  assert.ok(document.querySelector('#game-notification-reposition'), 'custom placement is available in the game panel itself');

  const loader = functionBody(appSource, 'async function loadGameNotificationSettings(appid)');
  assert.match(loader, /invoke\('list-presets'\)/, 'the existing preset library populates the menu');
  assert.match(loader, /invoke\('list-sounds'\)/, 'the existing sound library populates the menu');
  assert.match(loader, /invoke\('game-preset:get'/, 'the game override is loaded separately');
  assert.match(loader, /names\.includes\(raw\)/, 'a deleted preset is not left selected');
  assert.match(loader, /#option_overlayPosition option/, 'position choices come from the global control');
  assert.match(loader, /#option_overlayScale option/, 'scale choices come from the global control');

  const handler = appSource.slice(appSource.indexOf("$('#game-notifications').on('change', 'select'"));
  const body = handler.slice(0, handler.indexOf('\n    });'));
  assert.match(body, /invoke\('game-preset:set', \{ appid, settings \}\)/, 'changes persist together through the shared main-process store');
  const panelSettings = functionBody(appSource, 'function gameNotificationSettingsFromPanel()');
  assert.match(panelSettings, /preset:[\s\S]*position:[\s\S]*sound:[\s\S]*scale:/);
  assert.match(panelSettings, /gameNotificationPreset\.normalizeSettings\(settings\)/);
});

test('the per-game section exposes the same five notification tests', () => {
  const buttons = document.querySelectorAll('#game-notification-tests [data-notification-kind]');
  assert.deepEqual(
    buttons.map((button) => button.getAttribute('data-notification-kind')),
    ['toast', 'rare', 'progress', 'playtime', 'platinum']
  );
  assert.match(appSource, /settings\.notification\.test\.achievement/);
  assert.match(appSource, /settings\.notification\.test\.platinum/);
});

test('all game tests reuse the existing tester with the selection currently in the panel', () => {
  const preview = functionBody(appSource, 'async function testGameNotification(appid, kind, button)');
  assert.match(preview, /settings = gameNotificationSettingsFromPanel\(\)/, 'every unsaved UI value wins for an immediate preview');
  assert.match(preview, /testAchievementWatcherNotification\([\s\S]*settings,[\s\S]*game,[\s\S]*kind/);
  assert.doesNotMatch(preview, /manualUnlock|achievementReset|\.achievement\s*=/, 'tests do not mutate achievement state');

  assert.match(
    settingsSource,
    /testAchievementWatcherNotification = function \(mode, button, notificationOverrides, game, kind = 'toast'\)/,
    'the old entry point is extended instead of duplicated'
  );
  assert.match(settingsSource, /fireNotificationTest\(notificationKind, button, transport, notificationOverrides, game\)/);
  assert.match(settingsSource, /const position = overrides\.position \|\|/);
  assert.match(settingsSource, /Object\.prototype\.hasOwnProperty\.call\(overrides, 'sound'\)/);
  assert.match(settingsSource, /const overrideScale = Number\(overrides\.scale\)/);
  assert.match(
    settingsSource,
    /const globalSound = settingsReady[\s\S]*cfgOverlay\.randomSound === true[\s\S]*cfgOverlay\.notificationSound/,
    'inheritance uses the loaded global sound even before the Settings form has been opened'
  );
  assert.match(settingsSource, /const globalPosition = settingsReady[\s\S]*cfgOverlay\.notificationPosition/);
  assert.match(settingsSource, /const globalScale = settingsReady[\s\S]*cfgOverlay\.notificationScale/);
  assert.match(
    settingsSource,
    /const configuredVolume = Number\(cfgOverlay\.notificationVolume\)[\s\S]*const globalVolume = Math\.max\([\s\S]*settingsReady && Number\.isFinite\(controlVolume\)/,
    'the game preview keeps the configured global volume before Settings is opened'
  );
  assert.match(settingsSource, /volume: globalVolume/);
});

test('custom placement reuses the draggable witness and stays scoped to its game', () => {
  const handler = appSource.slice(appSource.indexOf("$('#game-notification-reposition').on('click'"));
  const body = handler.slice(0, handler.indexOf("\n    ipcRenderer.on('game-preset:custom-position'"));
  assert.match(body, /#game-notification-position'\)\.val\('custom'\)/);
  assert.match(body, /invoke\('game-preset:set', \{ appid, settings \}\)/, 'custom mode is persisted before placement starts');
  assert.match(body, /repositionAchievementWatcherNotification\(saved, game, appid\)/);

  assert.match(settingsSource, /function spawnNotificationReposition\(notificationOverrides, game, gameAppid = ''\)/);
  assert.match(settingsSource, /data\.repositionGameAppid = String\(gameAppid \|\| ''\)/);
  assert.match(settingsSource, /data\.gamePositionAppid = String\(gameAppid \|\| ''\)/);
  assert.match(initSource, /gamePreset\.setSettings\(gameAppid, settings\)/, 'dragging writes the per-game store');
  assert.match(initSource, /writeOverlayBounds\(\{ notif: customPosition \}\)/, 'the same witness still supports global placement');
  assert.match(initSource, /customPosition: gameSettings\.customPosition \|\| null/, 'live unlocks carry the cached game anchor');
});

test('the classic renderer scripts do not redeclare the preset alias helper', () => {
  assert.match(appSource, /const notificationPreset = require\([^\n]*util\/notificationPreset\.js/);
  assert.match(appSource, /const gameNotificationPreset = require\([^\n]*util\/gamePreset\.js/);
  assert.match(appSource, /notificationPreset\.legacyPresetAlias\(raw\)/);
  assert.doesNotMatch(appSource, /const \{ legacyPresetAlias \}/);
});

test('live unlocks resolve the per-game override from memory', () => {
  const enqueue = functionBody(initSource, 'async function enqueueNotificationFromArgs(args)');
  assert.match(enqueue, /const gameSettings = gamePreset\.getSettings\(args\.appid\)/);
  assert.match(enqueue, /game: gameSettings\.preset/);
  assert.match(enqueue, /position: gameSettings\.position \|\| ov\.notificationPosition/);
  assert.match(enqueue, /scale: gameSettings\.scale \|\| ov\.notificationScale/);
  assert.match(enqueue, /gameSettings\.sound === gamePreset\.SOUND_NONE/);
  assert.match(enqueue, /gameSettings\.sound === gamePreset\.SOUND_RANDOM/);

  const lookup = functionBody(initSource, 'function findNotificationPresetFolder(name)');
  assert.match(lookup, /notificationPresetFolders \|\| refreshNotificationPresetFolders\(\)/);
  assert.doesNotMatch(lookup, /fs\./, 'a warm unlock does not touch the filesystem');
  assert.match(initSource, /if \(out\.ok\) invalidateNotificationPresetFolders\(\)/, 'preset imports invalidate the folder index');
  assert.match(initSource, /gamePreset\.renamePreset\(from, to\)/, 'renames keep per-game choices attached');
  assert.match(initSource, /gamePreset\.removePreset\(safe\)/, 'deletions clear stale per-game choices');
});
