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
});

test('the Watchdog watcher stops at the RUNE switch, whatever LumaPlay says', async () => {
  const runeUplayWatch = require('../../watchdog/console/runeUplayWatch.js');
  let pastGate = false;
  const options = {
    achievement_source: { runeUplay: false, lumaPlay: true },
    get notification() {
      pastGate = true;
      return { notify: false };
    },
  };
  await runeUplayWatch.start({ options, notify: () => {} }, []);
  runeUplayWatch.stop();
  assert.equal(pastGate, false);
});

test('the Watchdog moves the RUNE switch over from LumaPlay like the app', async () => {
  const dir = makeTempDir('aw-rune-watchdog-');
  const file = path.join(dir, 'options.ini');
  fs.writeFileSync(file, '[achievement]\nlang=english\n[achievement_source]\nlumaPlay=false\n', 'utf8');
  const sources = (await require('../../watchdog/settings.js').load(file)).achievement_source;
  assert.equal(sources.runeUplay, false);
});
