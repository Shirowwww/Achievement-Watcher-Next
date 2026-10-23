'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeWindowArgs } = require('../../app/util/windowArgs.js');

test('normalizes case-folded notification arguments from a second instance', () => {
  const args = normalizeWindowArgs({
    displayname: 'Unlocked title',
    gamedisplayname: 'Game title',
    notificationtype: 'platinum',
    progresscurrent: '4',
    progressmax: '10',
    raritypercent: '2.5',
    trophygrade: 'gold',
  });

  assert.equal(args.trophyGrade, 'gold', 'a trophy grade survives the hand-off too');

  assert.equal(args.displayName, 'Unlocked title');
  assert.equal(args.gameDisplayName, 'Game title');
  assert.equal(args.notificationType, 'platinum');
  assert.equal(args.progressCurrent, '4');
  assert.equal(args.progressMax, '10');
  assert.equal(args.rarityPercent, '2.5');
});

test('every camel-cased switch the Watchdog sends a popup survives the case-folded hand-off', () => {
  // A switch missing here is silently dropped on that path: the game's display was, so the popup
  // landed on the primary display instead of the one the game was on.
  const source = fs.readFileSync(path.join(__dirname, '../../watchdog/notification/toaster.js'), 'utf8');
  const sent = [...new Set([...source.matchAll(/--([a-zA-Z]+)=/g)].map((match) => match[1]))].filter((name) => /[A-Z]/.test(name));
  assert.ok(['gameDisplayAt', 'achievementHidden', 'paintReport'].every((name) => sent.includes(name)), 'the scan no longer finds the switches the Watchdog sends');
  for (const name of sent) {
    const args = normalizeWindowArgs({ [name.toLowerCase()]: 'value' });
    assert.equal(args[name], 'value', `--${name} is lost when Windows case-folds it`);
  }
});

test('keeps an explicitly camel-cased argument over a case-folded duplicate', () => {
  const args = normalizeWindowArgs({ displayName: 'Preferred title', displayname: 'Fallback title' });
  assert.equal(args.displayName, 'Preferred title');
});
