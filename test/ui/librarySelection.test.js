'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const selection = require(path.join(__dirname, '..', '..', 'app', 'util', 'librarySelection.js'));

const order = ['a', 'b', 'c', 'd', 'e'];

test('Ctrl+click adds a tile, a second Ctrl+click on it removes it', () => {
  let picked = selection.select(new Set(), 'b', { toggle: true });
  picked = selection.select(picked, 'd', { toggle: true });
  assert.deepEqual([...picked], ['b', 'd']);
  assert.deepEqual([...selection.select(picked, 'b', { toggle: true })], ['d']);
});

test('Shift+click selects every tile between the anchor and the clicked one, either direction', () => {
  assert.deepEqual([...selection.select(new Set(['b']), 'd', { range: true, anchor: 'b', order })].sort(), ['b', 'c', 'd']);
  assert.deepEqual([...selection.select(new Set(), 'a', { range: true, anchor: 'c', order })].sort(), ['a', 'b', 'c']);
});

test('Shift+click with no anchor on screen picks the clicked tile only', () => {
  assert.deepEqual([...selection.select(new Set(), 'c', { range: true, anchor: 'gone', order })], ['c']);
});

test('the selection never mutates the set it was given', () => {
  const before = new Set(['a']);
  selection.select(before, 'b', { toggle: true });
  assert.deepEqual([...before], ['a']);
});

test('tiles filtered out since they were picked are not acted on', () => {
  assert.deepEqual(selection.visibleSelection(new Set(['a', 'x', 'c']), order), ['a', 'c']);
});

test('Ctrl, Cmd or Shift held makes a click a selection click', () => {
  assert.equal(selection.isSelectionClick({ ctrlKey: true }), true);
  assert.equal(selection.isSelectionClick({ metaKey: true }), true);
  assert.equal(selection.isSelectionClick({ shiftKey: true }), true);
  assert.equal(selection.isSelectionClick({}), false);
  assert.equal(selection.isSelectionClick(null), false);
});

/*
  Seen on screen (2026-11-16): a Ctrl+click on the middle of a cover landed on the play button the
  hover shows there and launched the game instead of selecting it. Every control inside a tile
  that acts on its own has to let a selection click through to the tile.
*/
test('the play and tools buttons of a tile step aside for a selection click', () => {
  const fs = require('node:fs');
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');
  for (const control of ['.play-button', '.config-button']) {
    const at = app.indexOf(`.on('click.awLibrary', '.game-box ${control}'`);
    assert.ok(at > 0, `${control} has its library click handler`);
    const body = app.slice(at, app.indexOf('})', at));
    assert.match(body, /librarySelection\.isSelectionClick\(e\)\) return;/, `${control} lets Ctrl/Shift+click reach the tile`);
    assert.ok(body.indexOf('isSelectionClick') < body.indexOf('stopPropagation'), `${control} checks before stopping the click`);
  }
});
