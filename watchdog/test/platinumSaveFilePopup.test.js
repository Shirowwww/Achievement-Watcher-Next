'use strict';

// The 100% popup of a save-file game is built inline in watchdog.js, so its fields are checked on
// the source (#204: no screenshot, and the last unlock's icon instead of the game's).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'watchdog.js'), 'utf8');
const start = source.indexOf("debug.log(`Platinum (100%): ${game.name}`);");
const block = source.slice(start, source.indexOf('\n            }\n', start));

test('the save-file 100% popup is found', () => {
  assert.ok(start > 0 && block.includes("notificationType: 'platinum'"));
});

test('the save-file 100% popup shows the game icon ahead of the last unlock icon', () => {
  assert.match(block, /icon: \(realPlatinum && realPlatinum\.icon\) \|\| platinumGameIcon \|\| platinumIcon \|\| undefined/);
});

test('the save-file 100% popup takes a screenshot souvenir like an unlock', () => {
  assert.match(block, /souvenir: self\.options\.souvenir \|\| null/);
});
