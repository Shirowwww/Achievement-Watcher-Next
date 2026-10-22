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
  assert.deepEqual(sent[0].completion, { unlocked: 2, total: 2 }, 'both of the list are earned');

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
    'C:\\Jeux\\Unleashed\\save\\ACH-DATA',
    'C:\\Jeux\\reNut\\renut.cfg',
    'C:\\Jeux\\LostOdyssey\\profile\\achievements.ini',
    'C:\\Jeux\\LostOdyssey\\profiles\\alice\\achievements.ini',
    'C:\\Jeux\\Game\\profiles\\alice\\achievements.json',
    'C:\\Jeux\\LostOdyssey\\game-path.txt',
    'C:\\Users\\x\\AppData\\Roaming\\MarathonRecomp\\save\\SonicNextAchievementData.bin',
    'C:\\Jeux\\OpenJam\\mods\\retro\\saves.path',
    'C:\\Jeux\\Gears2\\gow2.toml',
    'C:\\Jeux\\Gears2\\gow2_game_path.txt',
  ];
  const misses = [
    'C:\\Jeux\\Game\\saves\\slot1.sav',
    'C:\\Jeux\\myachievementsmod\\x.txt',
    'C:\\Jeux\\Game\\achievements.log',
    'C:\\Jeux\\Game\\save\\ACH-DATA.bak',
    'C:\\Jeux\\Game\\mods\\achievements.ini',
    'C:\\Jeux\\Game\\profiles\\alice\\settings.ini',
    'C:\\Jeux\\Game\\saves.path.bak',
    'C:\\Jeux\\Game\\settings.toml',
    'C:\\Jeux\\Game\\achievements\\progress.dat',
    'C:\\Jeux\\Game\\achievements\\5752084B.toml.tmp',
  ];
  for (const name of hits) assert.ok(LIST_PATH_RE.test(name), name);
  for (const name of misses) assert.ok(!LIST_PATH_RE.test(name), name);
});

// A schema, its icons and its art already cached, so nothing reaches the network.
function cacheTitle(titleId, ids) {
  write(
    path.join(process.env.AW_USER_DATA, 'steam_cache', 'x360recomp', `${titleId}.json`),
    JSON.stringify({
      fetchedAt: Date.now(),
      name: `Game ${titleId}`,
      achievements: ids.map((id) => ({ achievement_id: id, gamerscore: 10, localizations: [{ locale: { identifier: 'en_US' }, name: `Name ${id}`, description: 'd' }] })),
    })
  );
  write(path.join(process.env.AW_USER_DATA, 'steam_cache', 'x360recomp', `title-${titleId}.json`), JSON.stringify({ name: `Game ${titleId}`, marketName: '' }));
  for (const id of ids) write(path.join(process.env.AW_USER_DATA, 'icon_cache', 'x360recomp', titleId, `${id}.png`), 'png');
  cacheArt(titleId);
}

const ctxFor = (sent) => ({
  options: { achievement: { lang: 'english' }, notification: { notify: true }, notification_transport: {}, notification_toast: {} },
  notify: async (event) => sent.push(event),
});

test('a known port waits for its list from the nearest folder that exists, then toasts its first unlock', async () => {
  const docs = path.join(temp, 'PendingDocuments');
  fs.mkdirSync(docs, { recursive: true });
  const file = path.join(docs, 'pend_game', 'achievements', '33333333.toml');
  cacheTitle('33333333', [1, 2]);
  const waiting = { appid: 'x360-33333333', data: { type: 'x360recomp', format: 'toml', titleId: '33333333', file, folder: 'pend_game', pending: true, pendingRoot: docs } };
  const sent = [];
  try {
    await watcher._internal.rediscover(ctxFor(sent), () => [waiting], { full: true });
    const [spec] = watcher._internal.watchSpecs(waiting);
    assert.equal(spec.dir, docs, 'the folder that exists, not the missing one');
    assert.equal(spec.waitingFor, path.dirname(file));
    assert.equal(watcher._internal.watched.get('x360-33333333').waiting, true);
    assert.equal(sent.length, 0);

    const filetime = (unix) => String((BigInt(unix) + 11644473600n) * 10000000n);
    write(file, `[unlocked.1]\nfiletime = ${filetime(1600000000)}\n\n[unlocked.2]\nfiletime = ${filetime(Math.floor(Date.now() / 1000) - 30)}\n`);
    // Even the Documents-only pass replaces a title still waiting for its list.
    await watcher._internal.rediscover(ctxFor(sent), () => [{ ...waiting, data: { ...waiting.data, pending: false } }]);
    assert.deepEqual(sent.map((event) => event.achievementDisplayName), ['Name 2'], 'the first unlock toasts, an imported old one does not');
    assert.equal(watcher._internal.watched.get('x360-33333333').waiting, false);
  } finally {
    watcher.stop();
  }
});

test("re:Blue's profiles are watched together, and resetting one keeps the others' unlocks", async () => {
  const titleId = '4D5307DF';
  const profiles = path.join(temp, 'reBlue', 'profiles');
  const mine = write(path.join(profiles, 'default', 'achievements', `${titleId}.toml`), toml([1]));
  const alice = write(path.join(profiles, 'alice', 'achievements', `${titleId}.toml`), toml([2]));
  cacheTitle(titleId, [1, 2, 3]);
  const record = { appid: `x360-${titleId}`, data: { type: 'x360recomp', format: 'toml', titleId, file: mine, profileFiles: [mine, alice], folder: 'reBlue' } };
  assert.deepEqual(
    watcher._internal.watchSpecs(record).map((spec) => spec.dir),
    [path.dirname(mine), path.dirname(alice)]
  );
  const sent = [];
  const ctx = ctxFor(sent);
  await handleChange(record, '', ctx);
  fs.writeFileSync(alice, toml([2, 3]));
  await handleChange(record, alice, ctx);
  assert.deepEqual(sent.map((event) => event.achievementDisplayName), ['Name 3']);

  fs.rmSync(mine);
  await handleChange(record, mine, ctx);
  fs.writeFileSync(mine, toml([1]));
  await handleChange(record, mine, ctx);
  assert.deepEqual(sent.map((event) => event.achievementDisplayName), ['Name 3', 'Name 1'], 'only the reset profile starts over');
});

test('an earned-ini list toasts its new unlock, and a profile that appears later is watched', async () => {
  const titleId = '4D5307FA';
  const root = path.join(temp, 'LostOdyssey');
  const header = '# Achievements earned: id=unix time\n';
  const main = write(path.join(root, 'profile', 'achievements.ini'), `${header}1=1600000000\n`);
  cacheTitle(titleId, [1, 2, 3]);
  const record = (profileFiles) => ({ appid: `x360-${titleId}`, data: { type: 'x360recomp', format: 'ini-earned', titleId, file: main, profileFiles, folder: 'LostOdyssey', pendingRoot: root } });
  const sent = [];
  try {
    await watcher._internal.rediscover(ctxFor(sent), () => [record([main])], { full: true });
    const before = watcher._internal.watched.get(`x360-${titleId}`).key;
    const alice = write(path.join(root, 'profiles', 'alice', 'achievements.ini'), `${header}2=${Math.floor(Date.now() / 1000) - 20}\n`);
    await watcher._internal.rediscover(ctxFor(sent), () => [record([main, alice])], { full: true });
    assert.notEqual(watcher._internal.watched.get(`x360-${titleId}`).key, before, 'the new profile folder is watched');
    assert.deepEqual(sent.map((event) => event.achievementDisplayName), ['Name 2'], 'its recent unlock toasts, the old one does not');
  } finally {
    watcher.stop();
  }
});

test('a profile copied in later joins the baseline with its old unlocks, only a recent one toasts', async () => {
  const titleId = '4D5307FB';
  const root = path.join(temp, 'CopiedProfile');
  const header = '# Achievements earned: id=unix time\n';
  const main = write(path.join(root, 'profile', 'achievements.ini'), `${header}1=1600000000\n`);
  cacheTitle(titleId, [1, 2, 3, 4]);
  const record = (profileFiles) => ({ appid: `x360-${titleId}`, data: { type: 'x360recomp', format: 'ini-earned', titleId, file: main, profileFiles, folder: 'CopiedProfile', pendingRoot: root } });
  const sent = [];
  try {
    await watcher._internal.rediscover(ctxFor(sent), () => [record([main])], { full: true });
    const recent = Math.floor(Date.now() / 1000) - 20;
    const alice = write(path.join(root, 'profiles', 'alice', 'achievements.ini'), `${header}2=1600000000\n3=1600000100\n4=${recent}\n`);
    await watcher._internal.rediscover(ctxFor(sent), () => [record([main, alice])], { full: true });
    assert.deepEqual(sent.map((event) => event.achievementDisplayName), ['Name 4'], 'unlocks from 2020 are not news');
  } finally {
    watcher.stop();
  }
});

test('a change inside a list already watched, or to a file never read, does not wake discovery', async () => {
  const { wakesDiscovery } = watcher._internal;
  const file = write(path.join(temp, 'Wake', 'achievements', '44444444.toml'), toml([1]));
  cacheTitle('44444444', [1]);
  const record = { appid: 'x360-44444444', data: { type: 'x360recomp', format: 'toml', titleId: '44444444', file, folder: 'Wake' } };
  try {
    await watcher._internal.rediscover(ctxFor([]), () => [record], { full: true });
    assert.equal(wakesDiscovery(file), false, 'its own watcher handles it');
    assert.equal(wakesDiscovery(path.join(temp, 'Wake', 'achievements', 'progress.dat')), false, 'not a list');
    assert.equal(wakesDiscovery(path.join(temp, 'Other', 'achievements', '55555555.toml')), true, 'a new list elsewhere');
  } finally {
    watcher.stop();
  }
});

test('the folders followed for new games are told apart the way the platform compares paths', (t) => {
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  t.after(() => Object.defineProperty(process, 'platform', realPlatform));
  const upper = path.join(temp, 'CaseRoot');
  const lower = path.join(temp, 'caseroot');
  fs.mkdirSync(upper, { recursive: true });
  fs.mkdirSync(lower, { recursive: true });
  const config = write(path.join(temp, 'caseroots.db'), JSON.stringify([upper, lower]));
  Object.defineProperty(process, 'platform', { value: 'linux' });
  assert.equal(watcher._internal.watchRoots(config).length, 2, 'Linux keeps Game and game apart');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  assert.equal(watcher._internal.watchRoots(config).length, 1, 'Windows does not');
});

