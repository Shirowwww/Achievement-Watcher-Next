'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { safeEnv, SECRET_KEYS } = require('../util/safeEnv.js');

test('the installation key never reaches a spawned program', () => {
  const previous = process.env.AW_SECRET;
  process.env.AW_SECRET = 'installation-key';
  try {
    const env = safeEnv({ AW_APPID: '480' });
    assert.strictEqual(env.AW_SECRET, undefined);
    assert.strictEqual(env.AW_APPID, '480');
    assert.ok(env.PATH || env.Path, 'the rest of the environment is still handed over');
  } finally {
    if (previous === undefined) delete process.env.AW_SECRET;
    else process.env.AW_SECRET = previous;
  }
});

test('an explicit value still wins over the inherited one', () => {
  const previous = process.env.AW_GAME;
  process.env.AW_GAME = 'inherited';
  try {
    assert.strictEqual(safeEnv({ AW_GAME: 'explicit' }).AW_GAME, 'explicit');
  } finally {
    if (previous === undefined) delete process.env.AW_GAME;
    else process.env.AW_GAME = previous;
  }
});

// The Action target is a program the user picks, so a spread of process.env there hands it the key.
// Every spawn in this process has to build its environment through safeEnv instead.
test('no Watchdog spawn spreads the raw environment', () => {
  const root = path.join(__dirname, '..');
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'test' || entry.name === '_wip_') continue;
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(target);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      if (target === path.join(root, 'util', 'safeEnv.js')) continue;
      if (/\.\.\.process\.env/.test(fs.readFileSync(target, 'utf8'))) offenders.push(path.relative(root, target));
    }
  };

  walk(root);
  assert.deepStrictEqual(offenders, [], `use safeEnv() instead of spreading process.env in: ${offenders.join(', ')}`);
  assert.ok(SECRET_KEYS.includes('AW_SECRET'));
});
