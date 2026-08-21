'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');

test('known local games paint before fresh discovery and are replaced by appid', () => {
  const knownRead = source.indexOf('const knownGames =');
  const knownPaint = source.indexOf('for (const game of knownGames) renderGame(game, { fresh: false');
  const freshScan = source.indexOf('.makeList(', knownPaint);
  assert.ok(knownRead > 0 && knownPaint > knownRead && freshScan > knownPaint);
  assert.match(source.slice(knownRead, freshScan), /existingElement\.closest\('li'\).*replaceWith\(item\)/s);
  assert.match(source.slice(freshScan), /currentAppids[\s\S]*gameElements\.delete\(appid\)/);
});

test('library artwork is scheduled through viewport work instead of one timer per tile', () => {
  const coverStart = source.indexOf('function scheduleLibraryCover');
  const coverEnd = source.indexOf('function refreshLibraryCovers', coverStart);
  const cover = source.slice(coverStart, coverEnd);
  const renderStart = source.indexOf('const renderGame =');
  const renderEnd = source.indexOf('if (knownGames.length > 0)', renderStart);
  const render = source.slice(renderStart, renderEnd);
  assert.match(render, /scheduleLibraryCover\(game, headerEl, portrait\)/);
  assert.match(cover, /libraryArtwork\.schedule\(headerEl\[0\]/);
  assert.doesNotMatch(`${cover}\n${render}`, /setTimeout\(/);
  assert.doesNotMatch(`${cover}\n${render}`, /loading\.gif/);
});
