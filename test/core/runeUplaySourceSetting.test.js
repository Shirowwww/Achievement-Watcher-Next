'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');

const settings = require('../../app/settings.js');

function loadSources(sourceLines) {
  const userData = makeTempDir('aw-rune-source-');
  fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'cfg', 'options.ini'), `[achievement]\nlang=english\n[achievement_source]\n${sourceLines}\n`, 'utf8');
  settings.setUserDataPath(userData);
  return settings.load().achievement_source;
}

// RUNE's Ubisoft emulator used to follow the LumaPlay switch. Splitting them must not turn RUNE
// back on for someone who had switched LumaPlay off, nor off for anyone else.
test('a profile from before the split keeps RUNE where LumaPlay was', () => {
  assert.equal(loadSources('lumaPlay=false').runeUplay, false);
  assert.equal(loadSources('lumaPlay=true').runeUplay, true);
  assert.equal(loadSources('').runeUplay, true);
});

test('RUNE and LumaPlay are switched apart once RUNE has its own value', () => {
  const sources = loadSources('lumaPlay=false\nruneUplay=true');
  assert.equal(sources.lumaPlay, false);
  assert.equal(sources.runeUplay, true);
});

test('the scan and the Watchdog read RUNE from its own switch', () => {
  const root = path.join(__dirname, '..', '..');
  const parser = fs.readFileSync(path.join(root, 'app', 'parser', 'achievements.js'), 'utf8');
  assert.match(parser, /if \(!scope && source\.runeUplay\) \{[\s\S]*?runeUplay\.scan\(/);
  assert.match(parser, /if \(source\.runeUplay && runeUplay\.resolveAchievementsRoot\(dir\.path\)\)/);
  const lumaBlock = parser.slice(parser.indexOf('if (!scope && source.lumaPlay) {'), parser.indexOf('if (!scope && source.runeUplay) {'));
  assert.doesNotMatch(lumaBlock, /runeUplay\.scan/, 'switching LumaPlay off must leave RUNE games alone');
  const watcher = fs.readFileSync(path.join(root, 'watchdog', 'console', 'runeUplayWatch.js'), 'utf8');
  assert.match(watcher, /achievement_source\.runeUplay === false\) return;/);
  const watchdogSettings = fs.readFileSync(path.join(root, 'watchdog', 'settings.js'), 'utf8');
  assert.match(watchdogSettings, /options\.achievement_source\.runeUplay = options\.achievement_source\.lumaPlay;/);
});
