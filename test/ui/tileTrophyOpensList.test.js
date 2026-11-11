'use strict';

// Issue #183: since the game page opens on its overview, the tile's trophy button must still lead
// straight to the achievements list instead of doing what a click anywhere on the tile does.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');

test('the trophy handler is bound before the tile click, so it runs first and asks for the list', () => {
  const trophy = app.indexOf(".on('click.awLibrary', '.game-box .achievement-button'");
  const tile = app.indexOf(".on('click.awLibrary', '.game-box', function");
  assert.ok(trophy > 0, 'the trophy button has its own handler');
  assert.ok(trophy < tile, 'it is bound before the tile handler');
  assert.match(app.slice(trophy, tile), /pendingListOpen = String\(\$\(this\)\.closest\('\.game-box'\)\.attr\('data-appid'\)\)/);
  assert.doesNotMatch(app.slice(trophy, tile), /stopPropagation/, 'the click still reaches the tile, which opens the game');
});

test('a tile click that finds no game drops the trophy request, so a later open is not sent to the list', () => {
  const bail = app.slice(app.indexOf('if (!game) {', app.indexOf('onGameBoxClick: function')));
  assert.match(bail.slice(0, bail.indexOf('return;')), /pendingListOpen = null;/);
});

test('the game page opens on the list when the trophy asked for that game, once', () => {
  const body = app.slice(app.indexOf('function showGameOverview('), app.indexOf('function updateGamePage('));
  assert.match(body, /const listWanted = takeListOpen\(game\.appid\);/);
  assert.match(body, /if \(listWanted \|\| \(pendingAchievementFocus[\s\S]*?\)\) setGameView\('list', \{ animate: false \}\);/);

  const take = app.slice(app.indexOf('function takeListOpen('), app.indexOf('function openGameFromLibrary('));
  // eslint-disable-next-line no-new-func
  const takeListOpen = new Function('state', `let pendingListOpen = state.value; ${take.replace(/^function takeListOpen/, 'function f')}; const r = f(state.appid); state.value = pendingListOpen; return r;`);
  const state = { value: '480', appid: 480 };
  assert.equal(takeListOpen(state), true, 'the requested game opens on its list');
  assert.equal(takeListOpen(state), false, 'the request is used once');
  assert.equal(takeListOpen({ value: '480', appid: 570 }), false, 'another game ignores it');
});
