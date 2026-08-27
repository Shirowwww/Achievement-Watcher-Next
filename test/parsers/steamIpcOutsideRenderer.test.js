'use strict';

/*
  app/parser/steam.js is required from the renderer AND from the main process, and only the renderer
  has `ipcRenderer`. Every direct `ipcRenderer.invoke` in it therefore threw the same bare
  "TypeError: Cannot read properties of undefined (reading 'invoke')" whenever a lookup ran on the
  other side - swallowed into "Could not load Steam data [<appid>]", once per game, so a whole scan's
  metadata came back empty with no indication of why.

  util/ipcInvoke.js exists for exactly this: it answers null off the renderer instead of throwing.
  These are the two halves of the contract - nothing reaches for ipcRenderer, and every call site
  survives the null.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const file = path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js');
const source = fs.readFileSync(file, 'utf8');
// Comments explain the rule; only real code may not break it.
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

test('the Steam parser never reaches for ipcRenderer directly', () => {
  const offenders = code.split('\n').filter((line) => line.includes('ipcRenderer'));
  assert.deepEqual(offenders, [], 'these run in the main process too, where ipcRenderer is undefined');
});

test('a null answer is handled everywhere a channel is asked something', () => {
  // The two that dereference their answer immediately, and are the ones that used to throw.
  assert.match(code, /updatedImgs = \(await ipcInvoke\('get-steam-data', \{ appid: data\.appid, type: 'common' \}\)\) \|\| \{\}/);
  assert.match(code, /groupsResult = \(await ipcInvoke\([^)]*'steamgroups'[^)]*\)\) \|\| \{ ok: false, groups: \[\] \}/);
  // And the one whose answer is CACHED: writing a null there would record "nothing unlocked" for a
  // question that was never asked, which no later scan would go back and correct.
  assert.match(code, /if \(!result\) throw 'Steam user stats could not be fetched'/);
});

test('the schema-only fetch falls back to the direct endpoint rather than to nothing', () => {
  // Off the renderer there is no channel at all, so the browser-free endpoint is the whole answer;
  // an empty answer FROM the channel is still an answer and must not cost a second round trip.
  assert.match(code, /if \(ipcAvailable\(\)\) \{/);
  assert.match(code, /if \(result\) return Array\.isArray\(result\.achievements\) \? result\.achievements : \[\];/);
  assert.match(code, /return getGameAchievementsFromWebAPI\(cfg\);/);
});
