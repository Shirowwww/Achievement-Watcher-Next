'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const forgetGame = require('../../app/util/forgetGame.js');
const awManagedConfig = require('../../app/util/awManagedConfig.js');

function write(file, text = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('every cache of the game goes, and nothing of another game', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-forget-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = path.join(root, 'steam_cache');
  write(path.join(cache, 'icon', '1392860', 'a.jpg'));
  write(path.join(cache, 'schema', 'english', '1392860.db'));
  write(path.join(cache, 'schema', 'french', '1392860.db'));
  write(path.join(cache, 'user', '274782616', '1392860.db'));
  write(path.join(cache, 'schema', 'english', '860510.db'));
  write(path.join(cache, 'icon', '860510', 'b.jpg'));

  const forgetPlan = forgetGame.plan({ userDataPath: root, appids: ['1392860', '1392860', ''] });
  assert.equal(forgetPlan.caches.length, 4);
  const result = forgetGame.run(forgetPlan);
  assert.equal(result.errors.length, 0);
  assert.ok(!fs.existsSync(path.join(cache, 'icon', '1392860')));
  assert.ok(!fs.existsSync(path.join(cache, 'schema', 'french', '1392860.db')));
  assert.ok(!fs.existsSync(path.join(cache, 'user', '274782616', '1392860.db')));
  assert.ok(fs.existsSync(path.join(cache, 'schema', 'english', '860510.db')), 'another game is untouched');
  assert.ok(fs.existsSync(path.join(cache, 'icon', '860510', 'b.jpg')));
});

test('an appid can never walk out of the cache folder', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-forget-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(path.join(root, 'steam_cache', 'icon', 'keep.txt'));
  const forgetPlan = forgetGame.plan({ userDataPath: root, appids: ['..', '../..', 'a/b'] });
  assert.deepEqual(forgetPlan.caches, []);
});

test('AW Next configuration in the game folder is removed, the crack is not', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-forget-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const created = path.join(root, 'game', 'steam_settings');
  write(path.join(created, 'achievements.json'), '[]');
  awManagedConfig.markCreated(created);
  const theirs = path.join(root, 'other', 'steam_settings');
  write(path.join(theirs, 'configs.user.ini'), '[user::general]\naccount_steamid=1\n');

  const forgetPlan = forgetGame.plan({ userDataPath: root, appids: ['1'], settingsDirs: [created, theirs] });
  assert.equal(forgetPlan.config.length, 1);
  forgetGame.run(forgetPlan);
  assert.ok(!fs.existsSync(created));
  assert.ok(fs.existsSync(path.join(theirs, 'configs.user.ini')));
});
