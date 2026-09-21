'use strict';

/*
  The recompiled Xbox 360 watcher finds its games through the shared parser. Checked here: which
  folders are searched, that a first sight is silent, that a new unlock toasts with its real name,
  and that the moment the runtime deletes its list before renaming the new one in costs nothing.
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-x360watch-'));
process.env.AW_USER_DATA = path.join(temp, 'userData');
require('../util/userData.js').resetCache();

const watcher = require('../console/x360RecompWatch.js');
const { discover, watchSpec, handleChange } = watcher._internal;

const TITLE = '5752084B';
const FILETIME = '134337554689438302';
const toml = (ids) => ids.map((id) => `[unlocked.${id}]\nfiletime = ${FILETIME}\n`).join('\n');

// Marketplace art already cached, so no test reaches the network.
function cacheArt(titleId) {
  for (const file of ['boxartlg.jpg', 'background.jpg', 'tile.png']) write(path.join(process.env.AW_USER_DATA, 'icon_cache', 'x360recomp', titleId, 'art', file), 'img');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('the user folders and Documents are searched, a disabled folder is not', () => {
  const library = path.join(temp, 'Games');
  const disabled = path.join(temp, 'Disabled');
  const docs = path.join(temp, 'Documents');
  write(path.join(library, 'LEGO', 'content', 'achievements', `${TITLE}.toml`), toml([1]));
  write(path.join(disabled, 'Other', 'achievements', '11111111.toml'), toml([1]));
  write(path.join(docs, 'dantes_inferno', 'achievements', '454108CF.toml'), toml([1]));
  const config = write(path.join(temp, 'userdir.db'), JSON.stringify([{ path: library, enabled: true }, { path: disabled, enabled: false }]));

  const targets = discover(config, [docs]);
  assert.deepEqual(targets.map((t) => t.appid).sort(), ['x360-454108CF', `x360-${TITLE}`]);

  const spec = watchSpec(targets.find((t) => t.appid === `x360-${TITLE}`));
  assert.equal(spec.dir, path.join(library, 'LEGO', 'content', 'achievements'));
  assert.ok(spec.matches(`${TITLE}.toml`));
  assert.ok(!spec.matches(`${TITLE}.toml.tmp`), 'the runtime temp file is not the list');
});

test('a first sight is silent, a new unlock toasts, the runtime rewrite is ignored and a reset starts over', async () => {
  const file = write(path.join(temp, 'Live', 'achievements', `${TITLE}.toml`), toml([1]));
  const record = { appid: `x360-${TITLE}`, data: { type: 'x360recomp', format: 'toml', titleId: TITLE, file, folder: 'Live' } };
  // Cached schema: no network in a test.
  write(
    path.join(process.env.AW_USER_DATA, 'steam_cache', 'x360recomp', `${TITLE}.json`),
    JSON.stringify({
      fetchedAt: Date.now(),
      name: 'LEGO Dimensions',
      achievements: [1, 2].map((id) => ({ achievement_id: id, gamerscore: 25, localizations: [{ locale: { identifier: 'en_US' }, name: `Name ${id}`, description: 'd' }] })),
    })
  );
  // Icons already cached, so nothing is fetched either.
  for (const id of [1, 2]) write(path.join(process.env.AW_USER_DATA, 'icon_cache', 'x360recomp', TITLE, `${id}.png`), 'png');
  cacheArt(TITLE);

  const sent = [];
  const ctx = {
    options: {
      achievement: { lang: 'english' },
      notification: { notify: true, rumble: false },
      notification_transport: {},
      notification_toast: {},
    },
    notify: async (event) => sent.push(event),
  };

  await handleChange(record, '', ctx);
  assert.equal(sent.length, 0, 'the first sight only records the baseline');

  fs.writeFileSync(file, toml([1, 2]));
  await handleChange(record, file, ctx);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].achievementDisplayName, 'Name 2');
  assert.equal(sent[0].gameDisplayName, 'LEGO Dimensions');
  assert.equal(sent[0].source, 'Xbox 360 Recomp');

  // The runtime's own delete-then-rename: the list is back before the watcher looks again.
  fs.rmSync(file);
  const transient = handleChange(record, '', ctx);
  setTimeout(() => fs.writeFileSync(file, toml([1, 2])), 100);
  await transient;
  await handleChange(record, file, ctx);
  assert.equal(sent.length, 1, 'the gap between delete and rename did not reset the baseline');

  // A reset deletes the list for good: the baseline starts over, so earning one again toasts again.
  fs.rmSync(file);
  await handleChange(record, '', ctx);
  fs.writeFileSync(file, toml([1]));
  await handleChange(record, file, ctx);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].achievementDisplayName, 'Name 1', 'an achievement earned before the reset toasts again');
});

test('a list that appears after startup toasts its recent unlocks only', async () => {
  const recent = Math.floor(Date.now() / 1000) - 60;
  const filetime = (unix) => String((BigInt(unix) + 11644473600n) * 10000000n);
  const docs = path.join(temp, 'LateDocuments');
  const file = write(
    path.join(docs, 'late_game', 'achievements', '22222222.toml'),
    `[unlocked.1]\nfiletime = ${filetime(1600000000)}\n\n[unlocked.2]\nfiletime = ${filetime(recent)}\n`
  );
  write(
    path.join(process.env.AW_USER_DATA, 'steam_cache', 'x360recomp', '22222222.json'),
    JSON.stringify({ fetchedAt: Date.now(), name: 'Late', achievements: [5, 6].map((id) => ({ achievement_id: id, localizations: [] })).concat([1, 2].map((id) => ({ achievement_id: id, localizations: [{ locale: { identifier: 'en_US' }, name: `Late ${id}` }] }))) })
  );
  cacheArt('22222222');
  const sent = [];
  const ctx = {
    options: { achievement: { lang: 'english' }, notification: { notify: true }, notification_transport: {}, notification_toast: {} },
    notify: async (event) => sent.push(event),
  };
  const found = () => [{ appid: 'x360-22222222', data: { type: 'x360recomp', format: 'toml', titleId: '22222222', file, folder: 'late_game' } }];
  try {
    await watcher._internal.rediscover(ctx, found);
    assert.deepEqual(sent.map((event) => event.achievementDisplayName), ['Late 2'], 'years-old unlocks join the baseline silently');
    await watcher._internal.rediscover(ctx, found);
    assert.equal(sent.length, 1, 'a game already watched is not picked up twice');
  } finally {
    watcher.stop();
  }
});

test('only a path that can be an unlock list wakes discovery up', () => {
  const { LIST_PATH_RE } = watcher._internal;
  const hits = [
    'C:\\Jeux\\LEGO\\content\\achievements',
    'C:\\Jeux\\LEGO\\content\\achievements\\5752084B.toml',
    'C:\\Users\\x\\Documents\\eot\\Achievements\\415608B2\\a.tsv',
    'C:\\G\\GearGame\\SaveData\\Achievements.json',
  ];
  const misses = ['C:\\Jeux\\Game\\saves\\slot1.sav', 'C:\\Jeux\\myachievementsmod\\x.txt', 'C:\\Jeux\\Game\\achievements.log'];
  for (const name of hits) assert.ok(LIST_PATH_RE.test(name), name);
  for (const name of misses) assert.ok(!LIST_PATH_RE.test(name), name);
});
