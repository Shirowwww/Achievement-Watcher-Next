'use strict';

/*
  #194: the rewrite must use the generator Settings names (Advanced steam_settings) when a Steam
  sign-in is saved, and the diagnosis must catch definitions that differ behind matching ids.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-schema-ref-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
process.env.APPDATA = path.join(tmp, 'appdata');

const schemaReference = require('../../app/parser/schemaReference.js');
const gameHealthRepair = require('../../app/util/gameHealthRepair.js');
const goldberg = require('../../app/parser/goldberg.js');

const tied = (name, stat, max) => ({ name, progress: { min_val: 0, max_val: max, value: { operation: 'statvalue', operand1: stat } } });

function fakeGenerator({ signedIn = true, achievements = [], stats = [] } = {}) {
  const calls = [];
  return {
    calls,
    ensureGenerateEmuConfig: async () => ({ dir: tmp, exe: 'x' }),
    hasSavedSignIn: () => signedIn,
    generate: async (options) => {
      calls.push(options);
      const workDir = fs.mkdtempSync(path.join(tmp, 'run-'));
      const steamSettings = path.join(workDir, 'steam_settings');
      fs.mkdirSync(steamSettings);
      fs.writeFileSync(path.join(steamSettings, 'achievements.json'), JSON.stringify(achievements));
      fs.writeFileSync(path.join(steamSettings, 'stats.json'), JSON.stringify(stats));
      return { steamSettings, workDir };
    },
  };
}

test('Advanced steam_settings with a saved sign-in takes the generator definitions and caches them', async () => {
  const cacheDir = path.join(tmp, 'cache-a');
  const genEmu = fakeGenerator({ achievements: [tied('A', 'a_stat', 5)], stats: [{ name: 'a_stat', type: 'int', default: '0' }] });
  const community = async () => ({ progress: [tied('A', 'wrong', 1)], stats: [] });
  const reference = await schemaReference.load({ appid: '3010850', cacheDir, advanced: true, genEmu, fetchCommunityStats: community });
  assert.equal(reference.origin, 'generate_emu_config');
  assert.equal(reference.progress[0].progress.value.operand1, 'a_stat');
  assert.deepEqual(genEmu.calls[0].login, {}, 'the saved sign-in, never an anonymous run');
  assert.deepEqual(schemaReference.cached({ appid: '3010850', cacheDir }).origin, 'generate_emu_config', 'kept for the next diagnosis');
});

test('without a saved sign-in the generator is not run and the public list is used', async () => {
  const genEmu = fakeGenerator({ signedIn: false });
  const reference = await schemaReference.load({ appid: '480', cacheDir: path.join(tmp, 'cache-b'), advanced: true, genEmu, fetchCommunityStats: async () => ({ progress: [tied('A', 's', 2)], stats: [] }) });
  assert.equal(genEmu.calls.length, 0);
  assert.equal(reference.origin, 'games-infos-datas');
});

test('Basic steam_settings never runs the generator', async () => {
  const genEmu = fakeGenerator();
  await schemaReference.load({ appid: '480', cacheDir: path.join(tmp, 'cache-c'), advanced: false, genEmu, fetchCommunityStats: async () => ({ progress: [], stats: [] }) });
  assert.equal(genEmu.calls.length, 0);
});

test('a saved generator sign-in is found without starting the tool', () => {
  const root = path.join(tmp, 'tools');
  const toolDir = path.join(root, 'release-1', 'generate_emu_config');
  fs.mkdirSync(toolDir, { recursive: true });
  assert.equal(schemaReference.generatorSignedIn(root), false);
  fs.writeFileSync(path.join(toolDir, 'refresh_tokens.json'), '{"user":"token"}');
  assert.equal(schemaReference.generatorSignedIn(root), true);
  assert.equal(schemaReference.generatorSignedIn(path.join(tmp, 'missing')), false);
});

test('the schema rewrite plan names only the schema files and the folder the schema already uses', () => {
  const steamSettings = path.join(tmp, 'plan', 'steam_settings');
  fs.mkdirSync(steamSettings, { recursive: true });
  fs.writeFileSync(path.join(steamSettings, 'achievements.json'), JSON.stringify([{ name: 'A', icon: 'img/a.jpg', icon_gray: 'img/b.jpg' }]));
  const plan = gameHealthRepair.planSchemaRewrite({ steamSettings, downloadIcons: true, advanced: true });
  assert.deepEqual(plan.writes, ['achievements.json', 'stats.json', 'img/']);
  assert.equal(plan.source, 'generator');
});

test('Game Health warns about definitions missing behind matching ids and counts', () => {
  const gameDir = path.join(tmp, 'gears');
  const steamSettings = path.join(gameDir, 'steam_settings');
  fs.mkdirSync(steamSettings, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), Buffer.alloc(32, 1));
  fs.writeFileSync(path.join(steamSettings, 'achievements.json'), JSON.stringify([{ name: 'Seriously', displayName: 'S', description: 's' }]));
  const schema = { achievement: { list: [{ name: 'Seriously' }] } };
  const plain = goldberg.diagnose({ gameDir, appid: '3010850', schema, savesRoots: [] });
  assert.ok(!plain.issues.some((i) => i.code === 'PROGRESS_OUTDATED'), 'nothing to compare with, nothing said');

  const reference = { origin: 'generate_emu_config', progress: [tied('Seriously', 'Seriously_Stat', 24)], stats: [{ name: 'Seriously_Stat' }] };
  const issue = goldberg.diagnose({ gameDir, appid: '3010850', schema, savesRoots: [], reference }).issues.find((i) => i.code === 'PROGRESS_OUTDATED');
  assert.equal(issue && issue.level, 'warning');
  assert.deepEqual(issue.data.missing, ['Seriously']);
  assert.deepEqual(issue.data.undeclared, ['Seriously_Stat']);

  // A Steam counter alone is enough once the rewrite can ask the generator.
  const counted = { achievement: { list: [{ name: 'Seriously', counter: { min: 0, max: 24 } }] } };
  assert.ok(!goldberg.diagnose({ gameDir, appid: '3010850', schema: counted, savesRoots: [] }).issues.some((i) => i.code === 'PROGRESS_OUTDATED'));
  assert.ok(goldberg.diagnose({ gameDir, appid: '3010850', schema: counted, savesRoots: [], canGenerate: true }).issues.some((i) => i.code === 'PROGRESS_OUTDATED'));
});
