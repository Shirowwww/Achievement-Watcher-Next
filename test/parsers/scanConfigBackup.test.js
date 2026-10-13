'use strict';

/*
  The scan's runtime config block rewrote configs.user.ini and configs.main.ini with no backup, and
  the repair that followed backed up the already-rewritten files: a VOICES38 release lost its own
  account name for good. Each writer now keeps the original it is about to change.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const goldberg = require('../../app/parser/goldberg.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-scan-backup-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function settingsDir(name, files) {
  const dir = path.join(tmp, name, 'steam_settings');
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
}

test('a rewritten config keeps its original in the backup folder', () => {
  const original = '[user::general]\naccount_name=voices38\nlanguage=english\naccount_steamid=76561197960285355\n';
  const steamSettings = settingsDir('release', { 'configs.user.ini': original, 'configs.app.ini': '[app::dlcs]\nunlock_all=0\n' });
  const backupDir = goldberg.backupDirFor(steamSettings);

  goldberg.writeUserConfig({ steamSettings, accountName: 'Shirow', language: 'french', backupDir });
  goldberg.writeMainConfig({ steamSettings, backupDir });
  goldberg.writeDlcConfig({ steamSettings, dlcs: [{ appid: 1, name: 'DLC' }], backupDir });

  assert.equal(fs.readFileSync(path.join(backupDir, 'configs.user.ini'), 'utf8'), original, 'the release identity is kept');
  assert.ok(fs.existsSync(path.join(backupDir, 'configs.app.ini')), 'the DLC config is kept');
  assert.ok(!fs.existsSync(path.join(backupDir, 'configs.main.ini')), 'a file that did not exist has nothing to keep');
  assert.match(fs.readFileSync(path.join(steamSettings, 'configs.user.ini'), 'utf8'), /account_name=Shirow/);
});

test('a write that changes nothing leaves no backup behind', () => {
  const steamSettings = settingsDir('settled', {});
  goldberg.writeMainConfig({ steamSettings });
  const backupDir = goldberg.backupDirFor(steamSettings);
  goldberg.writeMainConfig({ steamSettings, backupDir });
  assert.ok(!fs.existsSync(backupDir), 'no empty backup folder per scan');
});

test('the scan passes one backup folder to every runtime config write', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');
  const block = src.slice(src.indexOf('const runtimeConfigAllowed'), src.indexOf('const hasSteamAchievementSchema'));
  for (const writer of ['writeDlcConfig', 'writeMainConfig', 'writeUserConfig']) {
    const call = block.slice(block.indexOf(`goldberg.${writer}(`), block.indexOf(`goldberg.${writer}(`) + 400);
    assert.match(call, /backupDir/, `${writer} must receive the backup folder`);
  }
});
