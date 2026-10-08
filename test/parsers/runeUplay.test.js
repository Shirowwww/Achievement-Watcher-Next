'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const runeUplay = require(path.join(appDir, 'parser', 'runeUplay.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rune-uplay-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const cfg = (entries) =>
  `"achievements"\n{\n${Object.entries(entries)
    .map(([id, body]) => `  "${id}"\n  {\n${Object.entries(body).map(([k, v]) => `    "${k}"  "${v}"`).join('\n')}\n  }`)
    .join('\n')}\n}\n`;

test('reads earned entries with their unix time', () => {
  const parsed = runeUplay.parseAchievementsCfg(cfg({ 1: { earned: '1', time: '1700000000' }, 2: { earned: 'true', earned_time: '1700000100' }, 3: { earned: 'yes', time: '1700000200000' } }));
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.snapshot, {
    1: { earned: true, earned_time: 1700000000 },
    2: { earned: true, earned_time: 1700000100 },
    3: { earned: true, earned_time: 1700000200 },
  });
});

test('an entry with earned 0 is locked and carries no time', () => {
  const parsed = runeUplay.parseAchievementsCfg(cfg({ 5: { earned: '0', time: '1700000000' } }));
  assert.deepEqual(parsed.snapshot, { 5: { earned: false, earned_time: 0 } });
});

test('an empty achievements block is valid and empty', () => {
  assert.deepEqual(runeUplay.parseAchievementsCfg('"achievements"\n{\n}\n'), { valid: true, reason: null, snapshot: {} });
});

test('comments, a BOM and backslash escapes are tolerated', () => {
  const text = '﻿// header\n"achievements"\n{\n  "007" // id\n  {\n    "earned" "1"\n    "time" "1700000000"\n    "note" "a \\"quoted\\" \\\\ value"\n  }\n}\n';
  const parsed = runeUplay.parseAchievementsCfg(text);
  assert.equal(parsed.valid, true);
  assert.deepEqual(Object.keys(parsed.snapshot), ['7'], 'leading zeros are dropped');
  const kv = runeUplay.parseKeyValues('"a" "x\\ty\\\\z\\"q"');
  assert.equal(kv.value.a, 'x\ty\\z"q');
});

test('non-numeric ids and non-object entries are skipped', () => {
  const parsed = runeUplay.parseAchievementsCfg('"achievements"\n{\n"abc"\n{\n"earned" "1"\n}\n"9" "1"\n"10"\n{\n"earned" "1"\n"time" "5"\n}\n}\n');
  assert.deepEqual(Object.keys(parsed.snapshot), ['10']);
});

test('malformed text never throws and reports why', () => {
  const cases = {
    unterminated: '"achievements"\n{\n"1"\n{\n"earned" "1',
    token: 'achievements { }',
    open: '"achievements"\n{\n"1"\n{\n"earned" "1"\n}\n',
    close: '"achievements"\n{\n}\n}\n',
    value: '"achievements"\n{\n"1"\n}\n',
    stray: '{ "a" "b" }',
  };
  for (const [name, text] of Object.entries(cases)) {
    const parsed = runeUplay.parseAchievementsCfg(text);
    assert.equal(parsed.valid, false, name);
    assert.deepEqual(parsed.snapshot, {}, name);
    assert.ok(parsed.reason, name);
  }
  assert.equal(runeUplay.parseAchievementsCfg('"other"\n{\n}\n').reason, 'missing-achievements-root');
  assert.equal(runeUplay.parseAchievementsCfg(undefined).valid, false);
});

test('depth and token caps hold', () => {
  const deep = '"a"\n{\n'.repeat(40) + '}\n'.repeat(40);
  assert.equal(runeUplay.parseKeyValues(deep).reason, 'max-depth');
  const wide = '"a" "b"\n'.repeat(60000);
  assert.equal(runeUplay.parseKeyValues(wide).reason, 'too-many-tokens');
});

test('a key named __proto__ is data, not a prototype write', () => {
  const parsed = runeUplay.parseKeyValues('"__proto__"\n{\n"polluted" "yes"\n}\n');
  assert.equal(parsed.ok, true);
  assert.equal({}.polluted, undefined);
});

test('an oversized or missing file is refused without reading it', () => {
  const big = path.join(tmp, 'big.cfg');
  fs.writeFileSync(big, Buffer.alloc(runeUplay.MAX_FILE_BYTES + 1, 0x20));
  assert.equal(runeUplay.readAchievementsFile(big).reason, 'too-large');
  assert.equal(runeUplay.readAchievementsFile(path.join(tmp, 'absent.cfg')).reason, 'missing');
  assert.equal(runeUplay.readAchievementsFile(tmp).reason, 'not-file');
});

function makeRoot(name) {
  const root = path.join(tmp, name, 'RUNE', 'Ubisoft Connect');
  const write = (user, product, entries) => {
    const dir = path.join(root, 'achievements', user, product);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'achievements.cfg'), cfg(entries));
    return path.join(dir, 'achievements.cfg');
  };
  return { root, write };
}

test('discovery accepts both the RUNE root and its achievements folder, and ignores other folders', () => {
  const { root, write } = makeRoot('discover');
  write('user1', '5059', { 1: { earned: '1', time: '1700000000' } });
  fs.mkdirSync(path.join(root, 'achievements', 'user1', 'notes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'savegames', 'user1', '77'), { recursive: true });
  fs.writeFileSync(path.join(root, 'savegames', 'user1', '77', 'achievements.cfg'), cfg({}));

  for (const given of [root, path.join(root, 'achievements'), root.toUpperCase().replace(/^([A-Z]:)/, '$1')]) {
    const found = runeUplay.discoverFiles([given]);
    assert.equal(found.length, 1, given);
    assert.equal(found[0].uplayId, '5059');
    assert.equal(found[0].userId, 'user1');
  }
  assert.deepEqual(runeUplay.discoverFiles([path.join(tmp, 'discover')]), [], 'an unrelated folder is not a root');
  assert.deepEqual(runeUplay.discoverFiles([path.join(tmp, 'nowhere', 'RUNE', 'Ubisoft Connect')]), []);
});

test('scan lists one namespaced record per product and merges its users, earliest unlock winning', () => {
  const { root, write } = makeRoot('scan');
  write('userA', '5059', { 1: { earned: '1', time: '2000' }, 2: { earned: '0' } });
  write('userB', '5059', { 1: { earned: '1', time: '1000' }, 3: { earned: '1', time: '3000' } });
  write('userA', '6000', {});

  const records = runeUplay.scan([root]);
  assert.deepEqual(records.map((r) => r.appid).sort(), ['uplay-5059', 'uplay-6000']);
  const record = records.find((r) => r.appid === 'uplay-5059');
  assert.equal(record.source, 'RUNE Uplay');
  assert.equal(record.data.type, 'runeUplay');
  assert.equal(record.data.uplayId, '5059');
  assert.equal(record.data.files.length, 2);
  assert.deepEqual(runeUplay.getAchievements(record.data), {
    1: { earned: true, earned_time: 1000 },
    3: { earned: true, earned_time: 3000 },
  });
});

test('a folder reached as default root, added root and achievements child is listed once', () => {
  const { root, write } = makeRoot('twice');
  write('user1', '5059', { 1: { earned: '1', time: '1700000000' } });
  const extra = makeRoot('added');
  extra.write('user1', '5059', { 2: { earned: '1', time: '1700000500' } });
  extra.write('user1', '6001', {});

  const records = runeUplay.scan([root, path.join(root, 'achievements'), root.toLowerCase(), extra.root]);
  assert.deepEqual(records.map((r) => r.appid).sort(), ['uplay-5059', 'uplay-6001']);
  const shared = records.find((r) => r.appid === 'uplay-5059');
  assert.equal(shared.data.files.length, 2, 'one file per real folder, not per way of reaching it');
  assert.deepEqual(Object.keys(runeUplay.getAchievements(shared.data)).sort(), ['1', '2'], 'a game in both folders reads both');
});

test('the default roots follow the redirected Documents folder', () => {
  assert.deepEqual(runeUplay.defaultRoots([path.join(tmp, 'OneDrive', 'Documents')]), [path.join(tmp, 'OneDrive', 'Documents', 'RUNE', 'Ubisoft Connect')]);
});

test('ids are matched against the Ubisoft archive schema, and an absent archive lists the save ids', async () => {
  const AdmZip = require(path.join(appDir, 'node_modules', 'adm-zip'));
  const dataDir = path.join(tmp, 'userdata');
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
  const ubisoftOfficial = require(path.join(appDir, 'parser', 'ubisoftOfficial.js'));
  const game = require(path.join(appDir, 'parser', 'runeUplayGame.js'));
  ubisoftOfficial.setUserDataPath(dataDir);
  game.initDebug({ isDev: false, userDataPath: dataDir });

  const { root, write } = makeRoot('schema');
  write('user1', '999001', { 1: { earned: '1', time: '1700000000' }, 2: { earned: '0' } });
  const [record] = runeUplay.scan([root]);

  // No archive anywhere: the ids the save names, with the product's own name unknown.
  const bare = await game.getGameData(record, 'english');
  assert.deepEqual(bare.achievement.list.map((a) => a.name), ['1', '2']);
  assert.equal(bare.system, 'uplay');

  const zip = new AdmZip();
  zip.addFile('en-US_loc.txt', Buffer.from('1\tFirst\tDo the first thing\n2\tSecond\tDo the second thing\n'));
  const archives = path.join(dataDir, 'cache', 'ubisoftAchievements');
  fs.mkdirSync(archives, { recursive: true });
  fs.writeFileSync(path.join(archives, '999001_deadbeef'), zip.toBuffer());

  const full = await game.getGameData(record, 'english');
  assert.deepEqual(full.achievement.list.map((a) => [a.name, a.displayName]), [['1', 'First'], ['2', 'Second']]);
  const unlocked = runeUplay.getAchievements(record.data);
  for (const achievement of full.achievement.list) assert.equal(achievement.name in unlocked, achievement.name === '1');
});
