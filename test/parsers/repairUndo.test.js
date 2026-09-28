'use strict';

/*
  A repair on an OnlineFix game (Little Nightmares III) created a steam_settings folder nothing
  reads. The next diagnosis then validated that folder as if it were a Goldberg setup, and removing
  AW Next's configuration only took out one INI, leaving the schema, icons and appid file behind.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const goldberg = require('../../app/parser/goldberg.js');
const awManagedConfig = require('../../app/util/awManagedConfig.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-repair-undo-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function onlineFixGame(name) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'OnlineFix64.dll'), Buffer.alloc(64, 1));
  fs.writeFileSync(path.join(dir, 'OnlineFix.ini'), '[Main]\n');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), Buffer.alloc(64, 2));
  return dir;
}

const schema = { achievement: { list: [{ name: 'A', displayName: 'A', description: '', hidden: 0 }] } };

test('a folder the repair creates is marked, and removing AW config deletes all of it', async () => {
  const dir = onlineFixGame('created');
  const steamSettings = path.join(dir, 'steam_settings');
  await goldberg.repair({ steamSettings, appid: '1392860', schema, writeDlc: false });
  assert.ok(awManagedConfig.isCreatedByAw(steamSettings));
  assert.equal(awManagedConfig.inspect(steamSettings).managed, true);

  const plan = awManagedConfig.strip(steamSettings, { dryRun: true });
  assert.deepEqual(plan.removed, [{ file: steamSettings, removed: 'folder' }]);
  assert.ok(fs.existsSync(steamSettings), 'a dry run touches nothing');

  awManagedConfig.strip(steamSettings);
  assert.ok(!fs.existsSync(steamSettings));
  assert.ok(fs.existsSync(path.join(dir, 'OnlineFix64.dll')), 'the loader is untouched');
});

test('a repair into an existing folder does not claim it', async () => {
  const dir = onlineFixGame('existing');
  const steamSettings = path.join(dir, 'steam_settings');
  fs.mkdirSync(steamSettings);
  fs.writeFileSync(path.join(steamSettings, 'configs.user.ini'), '[user::general]\naccount_steamid=123\n');
  await goldberg.repair({ steamSettings, appid: '1392860', schema, writeDlc: false });
  assert.equal(awManagedConfig.isCreatedByAw(steamSettings), false);
  awManagedConfig.strip(steamSettings);
  assert.ok(fs.existsSync(path.join(steamSettings, 'configs.user.ini')), 'somebody else\'s file survives');
});

test('the diagnosis of an OnlineFix game with a steam_settings stays on the loader', async () => {
  const dir = onlineFixGame('diagnose');
  const steamSettings = path.join(dir, 'steam_settings');
  await goldberg.repair({ steamSettings, appid: '1392860', schema, writeDlc: false });

  const report = goldberg.diagnose({ gameDir: dir, appid: '1392860', schema });
  assert.equal(report.loader, 'OnlineFix');
  assert.equal(report.ok, true);
  assert.deepEqual(report.issues.map((i) => i.code), ['SERVED_BY_LOADER', 'UNUSED_STEAM_SETTINGS']);
  assert.equal(report.issues[1].data.awCreated, true);
});
