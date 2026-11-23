'use strict';

/*
  #194: Game Health's "Rewrite the achievement data" rewrote a complete, freshly generated GBE
  schema in the old format (plain strings, icongray, "1", images/), downloaded a second copy of
  every icon, and wrote INI files beside it. It is now schema only, keeps a valid schema's format,
  and applies the progress and stat definitions the reference has (Gears of War E-Day: five
  statvalue definitions missing behind matching ids and counts).
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const gbeSchema = require('../../app/parser/gbeSchema.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-schema-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const steamUrl = (hash) => `https://cdn.steamstatic.com/steamcommunity/public/images/apps/3751260/${hash}.jpg`;

// The AW schema for the same game, in the user's language, with Steam's icon urls.
const awSchema = (list) => ({ achievement: { total: list.length, list } });
const awEntry = (name, extra = {}) => ({ name, displayName: `${name} title`, description: `${name} text`, hidden: 0, icon: steamUrl(`${name}-on`), icongray: steamUrl(`${name}-off`), ...extra });

// What gbe_fork_tools writes: language objects, icon_gray, integer hidden, img/.
function generatedEntry(name) {
  return {
    name,
    hidden: 1,
    displayName: { english: `${name} EN`, polish: `${name} PL`, token: '#ACH_TOKEN' },
    description: { english: `${name} desc EN`, polish: `${name} desc PL` },
    icon: `img/${name}-on.jpg`,
    icon_gray: `img/${name}-off.jpg`,
  };
}

function settingsWith(name, entries, { icons = true, stats = null } = {}) {
  const dir = path.join(tmp, name, 'steam_settings');
  fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'achievements.json'), JSON.stringify(entries, null, 2));
  if (stats) fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify(stats, null, 2));
  if (icons) {
    for (const entry of entries) {
      fs.writeFileSync(path.join(dir, entry.icon), 'on');
      fs.writeFileSync(path.join(dir, entry.icon_gray), 'off');
    }
  }
  return dir;
}

const read = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

test('a complete multilingual schema is left byte for byte as it is', async () => {
  const entries = [generatedEntry('ACH_Selfish'), generatedEntry('ACH_Other')];
  const dir = settingsWith('complete', entries);
  const before = fs.readFileSync(path.join(dir, 'achievements.json'));
  let downloads = 0;
  const summary = await gbeSchema.rewrite({
    steamSettings: dir,
    schema: awSchema([awEntry('ACH_Selfish'), awEntry('ACH_Other')]),
    language: 'polish',
    downloadIcon: async () => {
      downloads++;
      return null;
    },
  });
  assert.ok(fs.readFileSync(path.join(dir, 'achievements.json')).equals(before), 'achievements.json is untouched');
  assert.equal(summary.schema.kept, true);
  assert.equal(summary.schema.changed, false);
  assert.equal(downloads, 0, 'every icon is already in img/');
  assert.equal(fs.existsSync(path.join(dir, 'images')), false, 'no duplicate images/ folder');
  assert.equal(summary.backupDir, null, 'nothing changed, nothing to back up');
  for (const file of ['configs.app.ini', 'configs.main.ini', 'configs.user.ini', 'steam_appid.txt', 'supported_languages.txt']) {
    assert.equal(fs.existsSync(path.join(dir, file)), false, `${file} is never written by the schema rewrite`);
  }
});

test('a missing achievement is added in the schema own format and icon folder', async () => {
  const dir = settingsWith('partial', [generatedEntry('ACH_A')]);
  const fetched = [];
  const summary = await gbeSchema.rewrite({
    steamSettings: dir,
    schema: awSchema([awEntry('ACH_A'), awEntry('ACH_B', { hidden: 1 })]),
    language: 'polish',
    downloadIcon: async (url, folder) => {
      fetched.push(url);
      const file = path.join(folder, path.basename(url));
      fs.writeFileSync(file, 'icon');
      return file;
    },
  });
  const written = read(dir, 'achievements.json');
  assert.deepEqual(written[0], generatedEntry('ACH_A'), 'the existing entry keeps every language and token');
  const added = written[1];
  assert.equal(added.name, 'ACH_B');
  assert.deepEqual(added.displayName, { polish: 'ACH_B title' }, 'a language object, keyed by the language AW fetched');
  assert.equal(added.hidden, 1, 'integer hidden, like its neighbours');
  assert.equal(added.icon, 'img/ACH_B-on.jpg');
  assert.equal(added.icon_gray, 'img/ACH_B-off.jpg');
  assert.equal(Object.prototype.hasOwnProperty.call(added, 'icongray'), false);
  assert.equal(fetched.length, 2, 'only the two new icons are downloaded');
  assert.ok(fs.existsSync(path.join(dir, 'img', 'ACH_B-on.jpg')));
  assert.equal(fs.existsSync(path.join(dir, 'images')), false);
  assert.deepEqual(summary.schema.added, ['ACH_B']);
});

test('a missing icon is fetched under the exact name the schema gives it', async () => {
  const dir = settingsWith('renamed-icon', [generatedEntry('ACH_A')]);
  fs.rmSync(path.join(dir, 'img', 'ACH_A-off.jpg'));
  await gbeSchema.rewrite({
    steamSettings: dir,
    schema: awSchema([awEntry('ACH_A', { icongray: steamUrl('0123abcd') })]),
    downloadIcon: async (url, folder) => {
      const file = path.join(folder, path.basename(url));
      fs.writeFileSync(file, 'gray');
      return file;
    },
  });
  assert.equal(fs.readFileSync(path.join(dir, 'img', 'ACH_A-off.jpg'), 'utf8'), 'gray');
  assert.equal(fs.existsSync(path.join(dir, 'img', '0123abcd.jpg')), false);
});

test("an icon the schema takes from a file on this PC (the Bully mod's art) is copied, with no download", async () => {
  const art = path.join(tmp, 'mod-art');
  fs.mkdirSync(art, { recursive: true });
  const local = path.join(art, 'ach_icon_0.png');
  fs.writeFileSync(local, 'mod art');
  const dir = path.join(tmp, 'local-icons', 'steam_settings');
  fs.mkdirSync(dir, { recursive: true });
  const summary = await gbeSchema.rewrite({
    steamSettings: dir,
    schema: awSchema([awEntry('BA_AfterHours', { icon: local.replace(/\\/g, '/'), icongray: local.replace(/\\/g, '/') })]),
  });
  const [entry] = read(dir, 'achievements.json');
  assert.equal(entry.icon, 'images/ach_icon_0.png');
  assert.equal(fs.readFileSync(path.join(dir, 'images', 'ach_icon_0.png'), 'utf8'), 'mod art', 'the file the schema names exists');
  assert.ok(summary.created.includes('images/ach_icon_0.png'), 'and is listed as created, so an undo removes it');
});

test('a fresh GBE schema is written in the format GBE reads natively', async () => {
  const dir = path.join(tmp, 'fresh', 'steam_settings');
  fs.mkdirSync(dir, { recursive: true });
  const summary = await gbeSchema.rewrite({ steamSettings: dir, schema: awSchema([awEntry('ACH_A', { hidden: 1 })]), emulator: 'gbe' });
  const [entry] = read(dir, 'achievements.json');
  assert.equal(entry.hidden, 1);
  assert.equal(entry.icon_gray, 'images/ACH_A-off.jpg');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'icongray'), false);
  assert.deepEqual(summary.created, ['achievements.json']);
  assert.deepEqual(read(summary.backupDir, gbeSchema.CREATED_LIST), ['achievements.json'], 'the created file is recorded beside the backups');
});

test('classic Goldberg keeps the spelling it reads', async () => {
  const dir = path.join(tmp, 'classic', 'steam_settings');
  fs.mkdirSync(dir, { recursive: true });
  await gbeSchema.rewrite({ steamSettings: dir, schema: awSchema([awEntry('ACH_A')]), emulator: 'goldberg' });
  const [entry] = read(dir, 'achievements.json');
  assert.equal(entry.icongray, 'images/ACH_A-off.jpg');
  assert.equal(entry.hidden, '0');
});

test('outdated progress and missing stats come from the reference, even with matching ids (#194)', async () => {
  const names = ['Whom_The_Bell_Tolls', 'Field_Service', 'Already_Tied'];
  const entries = names.map(generatedEntry);
  entries[2].progress = { min_val: 0, max_val: 10, value: { operation: 'statvalue', operand1: 'Already_Tied_Stat' } };
  const dir = settingsWith('drift', entries, { stats: [{ name: 'Already_Tied_Stat', type: 'int', default: '0', global: '7' }] });
  const progress = (name, max) => ({ name, progress: { min_val: 0, max_val: max, value: { operation: 'statvalue', operand1: `${name}_Stat` } } });
  const reference = {
    origin: 'generate_emu_config',
    progress: [progress('Whom_The_Bell_Tolls', 21), progress('Field_Service', 101), progress('Already_Tied', 10)],
    stats: ['Whom_The_Bell_Tolls_Stat', 'Field_Service_Stat', 'Already_Tied_Stat'].map((name) => ({ name, type: 'int', default: '0', global: '0' })),
  };

  const before = gbeSchema.drift({ entries, stats: read(dir, 'stats.json'), schemaList: [], reference });
  assert.deepEqual(before.missing, ['Whom_The_Bell_Tolls', 'Field_Service']);
  assert.deepEqual(before.undeclared.sort(), ['Field_Service_Stat', 'Whom_The_Bell_Tolls_Stat']);

  const summary = await gbeSchema.rewrite({ steamSettings: dir, schema: awSchema(names.map((n) => awEntry(n))), reference });
  const written = read(dir, 'achievements.json');
  assert.equal(written[0].progress.max_val, 21);
  assert.equal(written[1].progress.value.operand1, 'Field_Service_Stat');
  assert.deepEqual(written[0].displayName, generatedEntry(names[0]).displayName, 'the rest of the entry is kept');
  const stats = read(dir, 'stats.json');
  assert.deepEqual(stats.map((s) => s.name).sort(), reference.stats.map((s) => s.name).sort());
  assert.equal(stats.find((s) => s.name === 'Already_Tied_Stat').global, '7', 'a declared stat keeps its value');
  assert.deepEqual(summary.schema.progress.added, ['Whom_The_Bell_Tolls', 'Field_Service']);

  const after = gbeSchema.drift({ entries: written, stats, schemaList: [], reference });
  assert.deepEqual([...after.missing, ...after.changed, ...after.undeclared], []);
  // Both files existed: both copies are kept, and nothing was created.
  assert.ok(fs.existsSync(path.join(summary.backupDir, 'achievements.json')));
  assert.ok(fs.existsSync(path.join(summary.backupDir, 'stats.json')));
  assert.equal(fs.existsSync(path.join(summary.backupDir, gbeSchema.CREATED_LIST)), false);
});

test('a definition that differs from the reference is outdated, and updated', async () => {
  const entry = { ...generatedEntry('ACH_C'), progress: { min_val: 0, max_val: 5, value: { operation: 'statvalue', operand1: 'old_stat' } } };
  const reference = { progress: [{ name: 'ACH_C', progress: { min_val: 0, max_val: 50, value: { operation: 'statvalue', operand1: 'new_stat' } } }], stats: [] };
  assert.deepEqual(gbeSchema.drift({ entries: [entry], stats: [{ name: 'old_stat' }], reference }).changed, ['ACH_C']);
  const { entries, summary } = gbeSchema.planSchema({ existing: [entry], schemaList: [awEntry('ACH_C')], reference });
  assert.equal(entries[0].progress.value.operand1, 'new_stat');
  assert.deepEqual(summary.progress.updated, ['ACH_C']);
});

test('a counter Steam lists but the file does not tie is reported as untied', () => {
  const result = gbeSchema.drift({ entries: [generatedEntry('ACH_D')], schemaList: [{ name: 'ACH_D', counter: { min: 0, max: 9 } }] });
  assert.deepEqual(result.untied, ['ACH_D']);
});

test('a broken schema is rebuilt but keeps the counter links it had', () => {
  const existing = [{ name: '', displayName: 'x' }, { name: 'ACH_E', progress: { max_val: 3, value: { operation: 'statvalue', operand1: 'e' } } }];
  const { entries, summary } = gbeSchema.planSchema({ existing, schemaList: [awEntry('ACH_E')] });
  assert.equal(summary.kept, false);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].progress.value.operand1, 'e');
});
