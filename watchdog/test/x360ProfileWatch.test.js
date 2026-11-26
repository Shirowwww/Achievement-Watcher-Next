'use strict';

/*
  A console profile is copied over again after playing on the Xbox 360: what was earned since is
  announced once, a game played for the first time included, and what was already there stays quiet.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-x360profilewatch-'));
process.env.AW_USER_DATA = path.join(temp, 'userdata');
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));

const { buildGpd, buildStfs } = require('../../test/helpers/x360Profile.js');
const { discover, seed, handleChange, baselineKey } = require('../console/x360ProfileWatch.js')._internal;

const day = new Date('2015-07-26T09:08:30Z');
const game = (title, earned) =>
  buildGpd({
    title,
    achievements: [1, 2, 3].map((id) => ({ id, name: `${title} ${id}`, gamerscore: 5 * id, earnedAt: earned.includes(id) ? day : null })),
  });

function profileWith(games) {
  return buildStfs(games.map(([name, data], i) => ({ name, data, blocks: [i + 1] })));
}

const ctx = (calls) => ({
  options: {
    achievement: { lang: 'english' },
    achievement_source: { xenia: true },
    notification: { notify: true, rumble: false },
    notification_transport: { mode: 'toast', websocket: false, winRT: true, balloon: false },
    notification_toast: { customToastAudio: '0', groupToast: false },
  },
  notify: async (payload) => calls.push(payload),
});

test('a re-copied profile announces only what was earned since, new games included', async () => {
  const root = path.join(temp, 'copied');
  const file = path.join(root, 'FFFE07D1', '00010000', 'E00001234ABCDEF0');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, profileWith([['4D5307E6.gpd', game('Racing', [1])]]));
  const config = path.join(temp, 'userdir.db');
  fs.writeFileSync(config, JSON.stringify([{ path: root, enabled: true }]));

  assert.deepEqual(discover(config), [file]);
  seed(file);

  fs.writeFileSync(file, profileWith([
    ['4D5307E6.gpd', game('Racing', [1, 3])],
    ['545408BA.gpd', game('Wrestling', [2])],
  ]));
  const calls = [];
  await handleChange(file, ctx(calls));
  assert.deepEqual(
    calls.map((c) => [c.source, c.appid, c.achievementDisplayName]),
    [
      ['Xbox 360 Profile', '4D5307E6', 'Racing 3'],
      ['Xbox 360 Profile', '545408BA', 'Wrestling 2'],
    ]
  );

  const again = [];
  await handleChange(file, ctx(again));
  assert.deepEqual(again, [], 'the same copy read twice announces nothing');
});

// The Watchdog can start while an FTP copy is still writing the file: nothing to seed from yet.
test('a profile unreadable when watching began is baselined, not announced, once it is whole', async () => {
  const root = path.join(temp, 'half-copied');
  const file = path.join(root, 'E00001234ABCDEF1');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(file, Buffer.alloc(0x100));
  seed(file);

  fs.writeFileSync(file, profileWith([['4D5307E6.gpd', game('Racing', [1, 2])]]));
  const calls = [];
  await handleChange(file, ctx(calls));
  assert.deepEqual(calls, []);
});

test('two copies of one profile in two folders keep baselines of their own', () => {
  const a = baselineKey(path.join(temp, 'a', 'E00001234ABCDEF0'), '4D5307E6');
  const b = baselineKey(path.join(temp, 'b', 'E00001234ABCDEF0'), '4D5307E6');
  assert.notEqual(a, b);
  assert.ok(!a.includes('E00001234ABCDEF0'), 'the profile id stays out of the key');
});
