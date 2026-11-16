'use strict';

/*
  Two marks sit on an achievement's title: the trophy of the platinum itself (or of its PlayStation
  tier) and the "Needed for the platinum" mark of an achievement the platinum waits for. The second
  was a smaller trophy in the same platinum colour, after the name, and read as the first in another
  place. The user's call (2026-11-16): same place, before the name, another glyph, neutral colour.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');

test('the "needed for the platinum" mark is not a trophy and comes before the name', () => {
  const markAt = appSource.indexOf('ach-platinum-need');
  assert.ok(markAt > 0, 'the mark is still drawn');
  const mark = appSource.slice(appSource.lastIndexOf('<i ', markAt), appSource.indexOf('</i>', markAt));
  assert.doesNotMatch(mark, /fa-trophy/, 'a trophy glyph reads as the platinum itself');
  const title = appSource.slice(appSource.indexOf('<div class="title">', markAt - 2000), markAt + 400);
  assert.ok(title.indexOf('ach-platinum-need') < title.indexOf('escapeHtml(achievement.displayName)'), 'the mark sits before the name, where the trophy is');
});

test('the mark is drawn in a neutral colour, not the platinum one', () => {
  const rule = css.slice(css.indexOf('.ach-platinum-need {'), css.indexOf('}', css.indexOf('.ach-platinum-need {')));
  assert.doesNotMatch(rule, /--trophy-platinum/);
});
