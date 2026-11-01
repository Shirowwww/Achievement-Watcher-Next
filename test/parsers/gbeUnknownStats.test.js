'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const gameHealth = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));

const MAIN = '[main::general]\nnew_app_ticket=1\ngc_token=1\n';

function install({ main = MAIN, stats = null } = {}) {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-stats-'));
  const steamSettings = path.join(gameDir, 'steam_settings');
  fs.mkdirSync(steamSettings);
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'dll');
  fs.writeFileSync(path.join(steamSettings, 'achievements.json'), '[{"name":"A"}]');
  if (main != null) fs.writeFileSync(path.join(steamSettings, 'configs.main.ini'), main);
  if (stats != null) fs.writeFileSync(path.join(steamSettings, 'stats.json'), JSON.stringify(stats));
  return { gameDir, steamSettings };
}

const codes = (report) => report.issues.map((issue) => issue.code);
const diagnose = (gameDir) => goldberg.diagnose({ gameDir, appid: '3486530', schema: { achievement: { list: [{ name: 'A' }] } } });

// #161: a game missing from games-infos-datas gets no stats.json, and GBE then refuses every
// SetStat, so a "do X 100 times" counter never moves and its achievement never unlocks.
test('a setup with no declared stat that still rejects unknown ones is flagged', () => {
  const { gameDir } = install();
  assert.ok(codes(diagnose(gameDir)).includes('UNKNOWN_STATS_REJECTED'));
});

test('an empty stats.json counts as no declared stat', () => {
  const { gameDir } = install({ stats: [] });
  assert.ok(codes(diagnose(gameDir)).includes('UNKNOWN_STATS_REJECTED'));
});

test('declared stats or allow_unknown_stats=1 settle it', () => {
  const declared = install({ stats: [{ name: 'scrap', type: 'int', default: '0', global: '0' }] });
  assert.ok(!codes(diagnose(declared.gameDir)).includes('UNKNOWN_STATS_REJECTED'));
  const allowed = install({ main: `${MAIN}[main::stats]\nallow_unknown_stats=1\n` });
  assert.ok(!codes(diagnose(allowed.gameDir)).includes('UNKNOWN_STATS_REJECTED'));
});

test('the main config repair lets the game keep the stats it writes', () => {
  const { gameDir, steamSettings } = install();
  goldberg.writeMainConfig({ steamSettings });
  assert.match(fs.readFileSync(path.join(steamSettings, 'configs.main.ini'), 'utf8'), /\[main::stats\][\s\S]*^allow_unknown_stats=1$/m);
  assert.ok(!codes(diagnose(gameDir)).includes('UNKNOWN_STATS_REJECTED'));
});

test('Game Health offers the repair for it', () => {
  assert.ok(gameHealth.REPAIRABLE_GOLDBERG_CODES.has('UNKNOWN_STATS_REJECTED'));
});
