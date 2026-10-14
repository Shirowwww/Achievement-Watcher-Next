'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { tidyUserDataStores } = require('../../app/util/storeHousekeeping.js');
const { pruneGeneratedOutputs } = require('../../app/parser/genEmuConfig.js');

// No profile here has banners to re-encode (artworkRecompress.test.js covers that).
const options = { log: { log() {} }, nativeImage: { createFromPath: () => assert.fail('no artwork to decode') } };
const ino = (file) => fs.statSync(file, { bigint: true }).ino;
const blob = (seed) => Buffer.alloc(64 * 1024, seed);

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-housekeeping-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A generator output as gse_fork_tools leaves it: steam_settings beside its own emulator copy.
function generatorOutput(root, appid) {
  const output = path.join(root, '2026_02_16', 'generate_emu_config', '_OUTPUT', appid);
  write(path.join(output, 'steam_settings', 'achievements.json'), '[{"name":"ACH_1"}]');
  write(path.join(output, 'steam_api64.dll'), blob('d'));
  write(path.join(output, 'steam_api64.7z'), blob('z'));
  write(path.join(output, 'steam_misc', 'app_info', 'app_product_info.json'), '{}');
  return output;
}

function age(dir, ms) {
  const when = new Date(Date.now() - ms);
  fs.utimesSync(dir, when, when);
}

test('restore points and imported theme pictures share copies; blur copies stay separate', async (t) => {
  const userData = scratch(t);
  const dllA = write(path.join(userData, 'backups', 'gbe', 'Game - GBE backup - 1', 'steam_api64.dll'), blob('g'));
  const dllB = write(path.join(userData, 'backups', 'gbe', 'Game - GBE backup - 2', 'steam_api64.dll'), blob('g'));
  const themes = path.join(userData, 'theme-images');
  const bg = write(path.join(themes, 'bg-wall.png'), blob('w'));
  const card = write(path.join(themes, 'card-wall (1).png'), blob('w'));
  const blurBg = write(path.join(themes, 'bg-bg-wall-blur-8.png'), blob('b'));
  const blurCard = write(path.join(themes, 'card-card-wall-blur-8.png'), blob('b'));

  const result = await tidyUserDataStores(userData, options);

  assert.equal(result.backups.linked, 1);
  assert.equal(ino(dllA), ino(dllB));
  assert.equal(result.themes.linked, 1);
  assert.equal(ino(bg), ino(card));
  // Regenerated in place by the blur step: sharing them would let one layer rewrite another's.
  assert.notEqual(ino(blurBg), ino(blurCard));
});

test('a generator output keeps only steam_settings once it is old enough to be finished', (t) => {
  const cacheDir = scratch(t);
  const finished = generatorOutput(cacheDir, '1222670');
  const running = generatorOutput(cacheDir, '2149010');
  age(finished, 2 * 60 * 60 * 1000);

  assert.equal(pruneGeneratedOutputs(cacheDir), 1);

  assert.deepEqual(fs.readdirSync(finished), ['steam_settings']);
  assert.ok(fs.existsSync(path.join(finished, 'steam_settings', 'achievements.json')), 'the progress-counter fallbacks read this file');
  assert.deepEqual(fs.readdirSync(running).sort(), ['steam_api64.7z', 'steam_api64.dll', 'steam_misc', 'steam_settings'], 'a run may still be writing it');
});

test('an output without steam_settings is not the generator\'s and is left alone', (t) => {
  const cacheDir = scratch(t);
  const stray = path.join(cacheDir, 'tag', 'generate_emu_config', '_OUTPUT', '42');
  write(path.join(stray, 'steam_api64.dll'), blob('s'));
  age(stray, 2 * 60 * 60 * 1000);

  assert.equal(pruneGeneratedOutputs(cacheDir), 0);
  assert.deepEqual(fs.readdirSync(stray), ['steam_api64.dll']);
});

test('a profile with none of these stores is a no-op', async (t) => {
  const result = await tidyUserDataStores(scratch(t), options);
  assert.equal(result.backups.linked + result.themes.linked + result.outputs + result.artwork.files, 0);
});
