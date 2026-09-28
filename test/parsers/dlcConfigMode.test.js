'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));

test('both unlock_all=1 and an explicit id list are valid DLC setups', () => {
  assert.equal(goldberg.dlcConfigMode('[app::dlcs]\nunlock_all=1\n'), 'unlock-all');
  assert.equal(goldberg.dlcConfigMode('[app::dlcs]\nunlock_all=0\n1234=Deluxe\n'), 'explicit');
  assert.equal(goldberg.dlcConfigMode('[app::dlcs]\n1234=Deluxe\n'), 'explicit');
  assert.equal(goldberg.dlcConfigMode('[app::dlcs]\nunlock_all=0\n'), 'none');
  assert.equal(goldberg.dlcConfigMode('[app::paths]\n1234=x\n'), 'none', 'ids outside [app::dlcs] do not count');
  assert.equal(goldberg.dlcConfigMode(''), 'none');
});

function settingsWith(appIni) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-dlc-mode-'));
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'dll');
  const steamSettings = path.join(dir, 'steam_settings');
  fs.mkdirSync(steamSettings);
  fs.writeFileSync(path.join(steamSettings, 'configs.app.ini'), appIni);
  return { dir, steamSettings };
}

test('Game Health does not flag an explicit DLC list with unlock_all=0', (t) => {
  const { dir } = settingsWith('[app::dlcs]\nunlock_all=0\n1234=Deluxe\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = goldberg.diagnose({ gameDir: dir, appid: '480', schema: { achievement: { list: [] } } });
  assert.ok(!report.issues.some((i) => i.code === 'BAD_DLC_CONFIG'));
});

test('Game Health still flags a DLC section that grants nothing', (t) => {
  const { dir } = settingsWith('[app::dlcs]\nunlock_all=0\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = goldberg.diagnose({ gameDir: dir, appid: '480', schema: { achievement: { list: [] } } });
  assert.ok(report.issues.some((i) => i.code === 'BAD_DLC_CONFIG'));
});

test('a repair keeps a curated unlock_all=0 list instead of forcing unlock_all=1', (t) => {
  const { dir, steamSettings } = settingsWith('[app::dlcs]\nunlock_all=0\n1234=Deluxe\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = goldberg.writeDlcConfig({ steamSettings, dlcs: [{ appid: 5678, name: 'Extra' }] });
  const text = fs.readFileSync(path.join(steamSettings, 'configs.app.ini'), 'utf8');
  assert.equal(result.unlockAll, false);
  assert.match(text, /^unlock_all=0$/m);
  assert.match(text, /^1234=Deluxe$/m);
  assert.match(text, /^5678=Extra$/m);

  goldberg.writeDlcConfig({ steamSettings, forceUnlockAll: true });
  assert.match(fs.readFileSync(path.join(steamSettings, 'configs.app.ini'), 'utf8'), /^unlock_all=1$/m);
});
