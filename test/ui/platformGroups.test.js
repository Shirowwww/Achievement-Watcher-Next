'use strict';

// The platform filter and the stats panel group games by platform (#228: three "Steam" rows).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { platformGroupOf } = require(path.join(__dirname, '..', '..', 'app', 'util', 'platformGroups.js'));

test('a label is never shared by two keys', () => {
  const kinds = ['steam', 'steam-owned', 'empty', 'ubisoft-empty', 'playstation-empty', 'xbox-empty', 'gog', 'epic', 'ubisoft', 'ea', 'socialclub',
    'playstation', 'xbox', 'retroachievements', 'pcport', 'something-new', ''];
  const sources = ['', 'RPCS3 Emulator', 'ShadPS4 Emulator', 'KytyPS5 Emulator', 'Xenia Emulator', 'Xbox 360 Recomp'];
  const keysByLabel = new Map();
  for (const kind of kinds) {
    for (const source of sources) {
      const group = platformGroupOf(kind, source);
      if (!keysByLabel.has(group.label)) keysByLabel.set(group.label, new Set());
      keysByLabel.get(group.label).add(group.key);
    }
  }
  for (const [label, keys] of keysByLabel) assert.equal(keys.size, 1, `${label}: ${[...keys].join(', ')}`);
});

test('a game without achievements joins its own platform, or PC when it has none', () => {
  assert.equal(platformGroupOf('ubisoft-empty', '').key, 'ubisoft');
  assert.equal(platformGroupOf('xbox-empty', '').key, 'xbox');
  assert.equal(platformGroupOf('playstation-empty', '').key, 'playstation');
  assert.deepEqual(platformGroupOf('empty', 'Unconfigured'), { key: 'pc', label: 'PC', img: 'Unconfigured' });
});

test('owned and emulated Steam games share one Steam row, and consoles split by console', () => {
  assert.equal(platformGroupOf('steam-owned', 'Steam (owned)').key, 'steam');
  assert.equal(platformGroupOf('steam', 'GBE Fork').key, 'steam');
  assert.equal(platformGroupOf('playstation', 'ShadPS4 Emulator').key, 'playstation-4');
  assert.equal(platformGroupOf('xbox', 'Xenia Emulator').label, 'Xbox 360');
});
