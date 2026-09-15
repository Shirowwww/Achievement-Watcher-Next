'use strict';

/*
  Taking AW Next's own configuration back out of a game folder.

  Versions up to 3.10.6 wrote it during an ordinary scan and never backed it up, so restoring is not
  available to anyone affected - the only way back is to recognise our lines and drop those. That
  makes the failure mode "delete something a human wrote", which is why every test here is about what
  survives, not about what goes.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const awManagedConfig = require('../../app/util/awManagedConfig.js');

function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-managed-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}
const read = (dir, name) => (fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name), 'utf8') : null);

const AW_APP = ['[app::dlcs]', '; Managed by AW Next - enable all DLCs for this game.', 'unlock_all=1', '1234=Deluxe Pack', ''].join('\n');
const AW_MAIN = ['[main::general]', 'new_app_ticket=1', 'gc_token=1', '', '[main::stats]', 'stat_achievement_progress_functionality=1', 'save_only_higher_stat_achievement_progress=1', ''].join('\n');

test('a folder AW never wrote to reports nothing and is left alone', () => {
  const dir = folder({ 'configs.user.ini': ['[user::general]', 'account_name=CharlieX', 'language=english', ''].join('\n') });
  // account_name/language alone are not proof: every repack writes them too.
  assert.equal(awManagedConfig.inspect(dir).managed, false);
});

test('the DLC section goes only when it carries the AW marker', () => {
  const mine = folder({ 'configs.app.ini': AW_APP });
  assert.equal(awManagedConfig.inspect(mine).managed, true);
  awManagedConfig.strip(mine);
  assert.equal(read(mine, 'configs.app.ini'), null, 'nothing else was in the file, so the file goes');

  const theirs = folder({ 'configs.app.ini': ['[app::dlcs]', 'unlock_all=1', '999=Repack DLC', ''].join('\n') });
  const before = read(theirs, 'configs.app.ini');
  assert.equal(awManagedConfig.inspect(theirs).managed, false);
  assert.equal(awManagedConfig.strip(theirs).changed, false);
  assert.equal(read(theirs, 'configs.app.ini'), before, 'a DLC section written by someone else is untouchable');
});

test('a DLC section AW wrote goes without taking the rest of the file with it', () => {
  const dir = folder({ 'configs.app.ini': `[app::general]\nsomething=1\n\n${AW_APP}` });
  awManagedConfig.strip(dir);
  const left = read(dir, 'configs.app.ini');
  assert.match(left, /\[app::general\]/);
  assert.match(left, /something=1/);
  assert.doesNotMatch(left, /app::dlcs/);
});

test('main-config keys go only at the value AW writes', () => {
  const dir = folder({ 'configs.main.ini': AW_MAIN });
  awManagedConfig.strip(dir);
  assert.equal(read(dir, 'configs.main.ini'), null);

  // Same keys, a value the user chose. Not ours, so not ours to remove.
  const tuned = folder({ 'configs.main.ini': ['[main::general]', 'new_app_ticket=0', 'gc_token=0', ''].join('\n') });
  assert.equal(awManagedConfig.strip(tuned).changed, false);
  assert.match(read(tuned, 'configs.main.ini'), /new_app_ticket=0/);
});

test('a main config mixing AW keys with the user own keeps the user ones', () => {
  const dir = folder({ 'configs.main.ini': ['[main::general]', 'new_app_ticket=1', 'listen_port=47584', 'gc_token=1', ''].join('\n') });
  awManagedConfig.strip(dir);
  const left = read(dir, 'configs.main.ini');
  assert.match(left, /listen_port=47584/);
  assert.doesNotMatch(left, /new_app_ticket/);
  assert.doesNotMatch(left, /gc_token/);
});

test('a user config AW created from nothing is removed, one with a steamid is not', () => {
  // The reported case: the file was deliberately absent, AW created it, the user wants it gone.
  const created = folder({ 'configs.user.ini': ['[user::general]', 'account_name=pipie', 'language=english', ''].join('\n') });
  awManagedConfig.strip(created);
  assert.equal(read(created, 'configs.user.ini'), null);

  // account_steamid is often the only thing keeping a save chain working. Never collateral.
  const withId = folder({
    'configs.user.ini': ['[user::general]', 'account_name=pipie', 'language=english', 'account_steamid=76561198000000000', ''].join('\n'),
  });
  awManagedConfig.strip(withId);
  const left = read(withId, 'configs.user.ini');
  assert.match(left, /account_steamid=76561198000000000/);
  assert.doesNotMatch(left, /account_name/);
});

test('identity removal can be declined while the DLC config still goes', () => {
  const dir = folder({ 'configs.app.ini': AW_APP, 'configs.user.ini': ['[user::general]', 'account_name=pipie', ''].join('\n') });
  awManagedConfig.strip(dir, { includeIdentity: false });
  assert.equal(read(dir, 'configs.app.ini'), null);
  assert.match(read(dir, 'configs.user.ini'), /account_name=pipie/);
});

test('a dry run reports the same plan it would apply, and writes nothing', () => {
  const files = { 'configs.app.ini': AW_APP, 'configs.main.ini': AW_MAIN };
  const dry = folder(files);
  const before = Object.keys(files).map((name) => read(dry, name));
  const plan = awManagedConfig.strip(dry, { dryRun: true });
  assert.equal(plan.changed, true);
  assert.deepEqual(
    Object.keys(files).map((name) => read(dry, name)),
    before,
    'a dry run must not touch the disk'
  );

  const wet = folder(files);
  const applied = awManagedConfig.strip(wet);
  assert.deepEqual(
    applied.removed.map((r) => path.basename(r.file)),
    plan.removed.map((r) => path.basename(r.file)),
    'the dialog must show what actually happens'
  );
});

test('an unreadable or absent folder is not an error', () => {
  const missing = path.join(os.tmpdir(), 'aw-managed-does-not-exist-' + Date.now());
  assert.equal(awManagedConfig.inspect(missing).managed, false);
  assert.equal(awManagedConfig.strip(missing).changed, false);
  assert.equal(awManagedConfig.inspect(null).managed, false);
});

test('a backup records whether the folder was already AW-managed', () => {
  const goldberg = require('../../app/parser/goldberg.js');
  const game = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-managed-game-'));
  fs.writeFileSync(path.join(game, 'steam_api64.dll'), 'x');
  const settings = path.join(game, 'steam_settings');
  fs.mkdirSync(settings);
  fs.writeFileSync(path.join(settings, 'achievements.json'), '[]');

  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-managed-dest-'));
  const clean = goldberg.backupSetup({ gameDir: game, destinationRoot: dest });
  assert.equal(clean.pristine, true);
  assert.equal(clean.manifest.pristine, true);

  fs.writeFileSync(path.join(settings, 'configs.app.ini'), AW_APP);
  const tainted = goldberg.backupSetup({ gameDir: game, destinationRoot: dest });
  assert.equal(tainted.pristine, false, 'a backup taken after AW wrote must not pass for an original');
  assert.deepEqual(tainted.manifest.awManagedFiles, [{ file: 'configs.app.ini', reason: 'dlc-section' }]);
});
