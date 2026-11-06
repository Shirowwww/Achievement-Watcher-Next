'use strict';

/*
  Two decisions the Watchdog forces on the app side every time it grows a watcher: which source label
  its unlocks carry (the table in sourceIdentity.js must know it, or the badge, the rarity policy and
  the preset fall back silently) and which baseline file its unlock list lives in (the reset and the
  relock must reach it, or the next unlock is taken as already seen).
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { watchdogSources } = require('../helpers/watchdogShared.js');
const { isClassifiedSource } = require('../../app/util/sourceIdentity.js');
const { CONSOLE_PREFIXES, EXTRA_BASELINE_KINDS } = require('../../app/parser/achievementSaveExtras.js');

const watchdogDir = path.join(__dirname, '..', '..', 'watchdog');
const read = (file) => fs.readFileSync(file, 'utf8');

test('every literal source label the Watchdog emits is classified by sourceIdentity', () => {
  const unclassified = [];
  for (const file of watchdogSources()) {
    for (const match of read(file).matchAll(/\bsource:\s*'([^'\n]+)'/g)) {
      if (!isClassifiedSource(match[1])) unclassified.push(`${path.relative(watchdogDir, file)}: ${match[1]}`);
    }
  }
  assert.deepEqual(unclassified, [], 'add a row to SOURCE_ROWS in app/util/sourceIdentity.js, or emit a label it knows');
});

// A watcher whose baseline no reset or relock has to reach, with the reason.
const EXEMPT_BASELINE_PREFIXES = {
  ea: 'official platform: its unlocks live on the account, achievementResetTargets blocks a reset of it',
  gog: 'official platform: its unlocks live on the account, achievementResetTargets blocks a reset of it',
  ubisoft: 'official platform: its unlocks live on the account, achievementResetTargets blocks a reset of it',
  pcports: 'relock refuses "pc port"; a removed save file is the reset and the watcher clears its own baseline',
  recompports: 'relock refuses "pc port"; a removed save file is the reset and the watcher clears its own baseline',
};

function consoleWatcherPrefixes() {
  const dir = path.join(watchdogDir, 'console');
  const prefixes = new Map();
  for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.js'))) {
    for (const match of read(path.join(dir, name)).matchAll(/createBaselineCache\(\{\s*prefix:\s*'([^']*)'/g)) prefixes.set(match[1], name);
  }
  return prefixes;
}

test('every console watcher baseline prefix is reset by its sources, by an extra, or exempted with a reason', () => {
  const prefixes = consoleWatcherPrefixes();
  assert.ok(prefixes.size >= 14, 'the scan no longer finds the watchers');
  const reached = new Set([...Object.values(CONSOLE_PREFIXES), ...Object.values(EXTRA_BASELINE_KINDS)]);
  const undecided = [...prefixes].filter(([prefix]) => !reached.has(prefix) && !Object.hasOwn(EXEMPT_BASELINE_PREFIXES, prefix));
  assert.deepEqual(
    undecided.map(([prefix, file]) => `${file}: '${prefix}'`),
    [],
    'add it to CONSOLE_PREFIXES or the extras in achievementSaveExtras.js, or to the exemption list here with the reason'
  );
});

test('an exemption is dropped once its watcher is gone or reset elsewhere', () => {
  const prefixes = consoleWatcherPrefixes();
  const reached = new Set([...Object.values(CONSOLE_PREFIXES), ...Object.values(EXTRA_BASELINE_KINDS)]);
  for (const prefix of Object.keys(EXEMPT_BASELINE_PREFIXES)) {
    assert.ok(prefixes.has(prefix), `no watcher uses '${prefix}' any more`);
    assert.ok(!reached.has(prefix), `'${prefix}' is reset after all: remove its exemption`);
  }
});
