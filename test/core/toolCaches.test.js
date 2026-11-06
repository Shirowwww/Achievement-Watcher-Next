'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const { TOOL_CACHE_DIRS, toolCacheDir } = require(path.join(appDir, 'util', 'toolCaches.js'));

function sources(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'test') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/*
  The installers, the cache cleaner, the backup, the migration and the Watchdog must agree on each
  folder: a second spelling once differed by case ('Cache'), which only Linux tells apart. The
  folder names below are distinct from the tool keys, so a bare literal of one is a spelling.
*/
test('only toolCaches.js spells the tool cache folders', () => {
  const joined = new RegExp(`['"\`](?:${Object.values(TOOL_CACHE_DIRS).join('|')})(?:/[^'"\`]*)?['"\`]`, 'i');
  const bare = /['"`](?:gse_fork|gse_emu_config|api_check_bypass|gog_universelan)['"`]/i;
  const offenders = [...sources(appDir), ...sources(path.join(root, 'watchdog'))]
    .filter((file) => path.basename(file) !== 'toolCaches.js')
    .filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return joined.test(text) || bare.test(text);
    })
    .map((file) => path.relative(root, file));
  assert.deepEqual(offenders, []);
});

test('a tool folder sits under the user data folder, and an unknown tool is refused', () => {
  assert.equal(toolCacheDir(path.join('U', 'data'), 'gbeFork'), path.join('U', 'data', 'cache', 'gse_fork'));
  assert.throws(() => toolCacheDir('U', 'gbe_fork'), /unknown tool cache/);
});
