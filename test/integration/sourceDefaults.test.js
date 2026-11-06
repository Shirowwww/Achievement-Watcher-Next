'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const os = require('os');
const appSettings = require('../../app/settings.js');
const watchdogSettings = require('../../watchdog/settings.js');
const ini = require('../../app/util/ini.js');

// The app writes options.ini and the Watchdog reads it back: two loaders landing on different
// values for the same file is how a setting silently flips between a scan and a live notification.
test('the Watchdog loads a settings file exactly as the app does', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-source-defaults-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'options.ini');
  const text = '[achievement]\nlang = french\n\n[achievement_source]\nsteamEmu = maybe\nlumaPlay = false\n';
  fs.writeFileSync(file, text, 'utf8');
  assert.deepStrictEqual(await watchdogSettings.load(file), appSettings.normalize(ini.parse(text)));
});

test('a source switch that is not a boolean falls back to its default', () => {
  for (const [key, value] of Object.entries(appSettings.defaults().achievement_source)) {
    if (typeof value !== 'boolean') continue; // legitSteam and the official sources are levels
    const loaded = appSettings.normalize({ achievement_source: { [key]: 'maybe' } }).achievement_source;
    assert.equal(loaded[key], value, `achievement_source.${key}`);
  }
});

/*
  Starts a watcher with one source value and the master switch off, and says whether it got past its
  source gate: the gate reads the master switch only once the source is on, and the master switch
  off stops it before any discovery, so the probe touches no folder.
*/
async function passesSourceGate(file, key, value) {
  const watcher = require(path.join(__dirname, '..', '..', 'watchdog', 'console', `${file}.js`));
  let reached = false;
  const options = {
    achievement: { lang: 'english' },
    achievement_source: { [key]: value },
    get notification() {
      reached = true;
      return { notify: false };
    },
  };
  await watcher.start({ options, notify: () => {} });
  watcher.stop();
  return reached;
}

// A toggle the user flips has to reach the live notification path too, not just the library scan.
test('every live watcher honours its own source toggle', async () => {
  const watchers = {
    shadps4Watch: 'shadps4',
    rpcs3Watch: 'rpcs3',
    kytyps5Watch: 'kytyps5',
    xeniaWatch: 'xenia',
    xllnWatch: 'xlln',
    x360RecompWatch: 'x360recomp',
    ps3RecompWatch: 'ps3recomp',
    ps4RecompWatch: 'ps4recomp',
    markerpatchWatch: 'markerpatch',
    madnesspatchWatch: 'madnesspatch',
    pcportsWatch: 'pcports',
    recompPortsWatch: 'pcports',
    gogWatch: 'gogOfficial',
    ubisoftWatch: 'ubisoftOfficial',
    runeUplayWatch: 'runeUplay',
    eaWatch: 'ea',
    retroAchievementsWatch: 'retroAchievements',
  };
  for (const [file, key] of Object.entries(watchers)) {
    assert.equal(await passesSourceGate(file, key, false), false, `${file}.js must bail out when achievement_source.${key} is off`);
    assert.equal(await passesSourceGate(file, key, true), true, `${file}.js must start when achievement_source.${key} is on`);
  }
  // GOG's switch is a level; options.ini gives it back as a string.
  for (const level of [0, '0']) assert.equal(await passesSourceGate('gogWatch', 'gogOfficial', level), false, `gogOfficial ${level}`);
  for (const level of [1, 2, '2']) assert.equal(await passesSourceGate('gogWatch', 'gogOfficial', level), true, `gogOfficial ${level}`);
});

// A source that is switched off must cost nothing: not a slower scan, not a stale entry, nothing.
test('every source is asked for only when it is switched on', () => {
  const parser = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');
  // The discovery pass, and the per-folder reader it shares with the first-start guide.
  const body = (declaration) => {
    const from = parser.indexOf(`async function ${declaration}(`);
    assert.ok(from > 0, `${declaration} must be findable`);
    // Bounded by whatever is declared next, so the slice cannot silently reach past the function.
    const end = parser.indexOf(String.fromCharCode(10) + 'async function ', from + 1);
    return parser.slice(from, end > from ? end : undefined);
  };
  const discovery = ['discoverInScope', 'claimFolder', 'scanWatchedFolder'].map(body).join('\n');
  for (const key of Object.keys(appSettings.defaults().achievement_source)) {
    // The three-state sources read as a level, the rest as a switch; either way the block that
    // scans them sits behind its own setting.
    const gate = new RegExp(`source\\.${key}\\b\\s*(?:>\\s*0)?[\\s)]`);
    assert.match(discovery, gate, `achievement_source.${key} must gate its own scan`);
  }
});
