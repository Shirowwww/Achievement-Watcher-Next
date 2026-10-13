'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { crc32 } = require('crc');
const { buildSchemaIndex, findSchemaAchievement, buildPreviousAchievementIndex, seedPreviewNames } = require('../util/achievementIndex.js');

test('schema index keeps the first case-insensitive name match, like Array.find', () => {
  const first = { name: 'Achievement_One' };
  const later = { name: 'ACHIEVEMENT_ONE' };
  const index = buildSchemaIndex([first, later], { includeCrc: true });

  assert.strictEqual(findSchemaAchievement(index, { name: 'ACHIEVEMENT_ONE' }), first);
});

test('schema index resolves CRC records without changing their first-match order', () => {
  const first = { name: 'Alpha' };
  const later = { name: 'Beta' };
  const index = buildSchemaIndex([first, later], { includeCrc: true });
  const crc = `${crc32('Alpha').toString(16)}:${crc32('Beta').toString(16)}`;

  assert.strictEqual(findSchemaAchievement(index, { crc }), first);
});

test('schema index skips the unused CRC table on normal save formats', () => {
  const index = buildSchemaIndex([{ name: 'Alpha' }]);

  assert.equal(index.crcEntries.length, 0);
});

test('previous-state index preserves first duplicate and counts unlocked entries', () => {
  const first = { name: 'A', Achieved: 0 };
  const later = { name: 'A', Achieved: 1 };
  const unlocked = { name: 'B', Achieved: 1 };
  const index = buildPreviousAchievementIndex([first, later, unlocked]);

  assert.strictEqual(index.byName.get('A'), first);
  assert.equal(index.unlockedCount, 2);
});

// SmartSteamEmu's stats.bin names nothing: its records are keyed by crc32, and their parsed name is
// the record index. The latest unlocks of a first observation must be named as the schema names them.
test('seed preview names the latest unlocks by their schema name, CRC records included', () => {
  const index = buildSchemaIndex([{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }], { includeCrc: true });
  const unlocked = [
    { name: '0', crc: crc32('Alpha').toString(16).padStart(8, '0'), UnlockTime: 10 },
    { name: '1', crc: crc32('Beta').toString(16).padStart(8, '0'), UnlockTime: 30 },
    { name: 'gamma', UnlockTime: 20 },
  ];

  assert.deepEqual([...seedPreviewNames(unlocked, index, 2)], ['BETA', 'GAMMA']);
});
