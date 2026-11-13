'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { achievementGroups, hasDlc, baseProgress } = require('../../app/util/achievementGroups.js');
const filter = require('../../app/util/libraryFilter.js');

const ach = (Achieved, category) => ({ Achieved, ...(category ? { category } : {}) });
const game = (list, extra = {}) => ({ achievement: { list, unlocked: list.filter((a) => a.Achieved).length, total: list.length }, ...extra });

test('achievements split into the base game first, then each DLC in the order the list meets it', () => {
  const list = [ach(true, 'Second Wind'), ach(true), ach(false), ach(false, 'Old Bones'), ach(true, 'Second Wind')];

  assert.deepEqual(achievementGroups(list), [
    { key: '', unlocked: 1, total: 2 },
    { key: 'Second Wind', unlocked: 2, total: 2 },
    { key: 'Old Bones', unlocked: 0, total: 1 },
  ]);
  assert.equal(hasDlc(achievementGroups(list)), true);
  assert.deepEqual(baseProgress(list), { unlocked: 1, total: 2 });
});

test('a game without DLC is all base game, and a group can come from elsewhere than the list', () => {
  const list = [ach(true), ach(false), null];
  assert.equal(hasDlc(achievementGroups(list)), false);
  assert.deepEqual(baseProgress(list), { unlocked: 1, total: 2 });
  assert.deepEqual(achievementGroups([ach(true)], () => '  Pack  '), [{ key: 'Pack', unlocked: 1, total: 1 }]);
  assert.deepEqual(baseProgress(undefined), { unlocked: 0, total: 0 });
});

test('the progress filters keep the games they say, and none keeps a game without achievements', () => {
  const games = {
    none: game([]),
    fresh: game([ach(false), ach(false)]),
    started: game([ach(true), ach(false), ach(false)]),
    almost: game([ach(true), ach(true), ach(true), ach(true), ach(false)]),
    done: game([ach(true), ach(true)]),
    baseOnly: game([ach(true), ach(true), ach(false, 'DLC')]),
  };
  const kept = (mode) => Object.keys(games).filter((name) => filter.matchesProgress(games[name], mode));

  assert.deepEqual(kept('all'), Object.keys(games));
  assert.deepEqual(kept('not-started'), ['fresh']);
  assert.deepEqual(kept('in-progress'), ['started', 'almost', 'baseOnly']);
  assert.deepEqual(kept('almost'), ['almost']);
  assert.deepEqual(kept('complete'), ['done']);
  assert.deepEqual(kept('complete-base'), ['done', 'baseOnly']);
  assert.deepEqual(kept('nonsense'), Object.keys(games), 'an unknown value filters nothing');
});

test('"100% base game" splits the list as the achievement page does, groups from elsewhere included', () => {
  const linked = game([{ name: 'A', Achieved: true }, { name: 'B', Achieved: true }, { name: 'DLC1', Achieved: false }]);
  const categoryOf = (g, achievement) => (achievement.name.startsWith('DLC') ? 'Linked pack' : '');

  assert.equal(filter.matchesProgress(linked, 'complete-base'), false, 'without the groups, the DLC trophy counts as base game');
  assert.equal(filter.matchesFilters(linked, { progress: 'complete-base', categoryOf }), true);
});

test('a total lower than the list never makes a game complete', () => {
  const stale = { achievement: { list: [ach(true), ach(false)], unlocked: 1, total: 0 } };
  assert.equal(filter.matchesProgress(stale, 'complete'), false);
  assert.equal(filter.matchesProgress(stale, 'in-progress'), true);
});

test('the platform filter compares the key it is given, and a malformed one keeps every game', () => {
  const platformOf = (g) => g.platform;
  const gog = game([ach(true)], { platform: 'gog' });
  const steam = game([ach(false)], { platform: 'steam' });

  assert.equal(filter.matchesFilters(gog, { platform: 'gog', platformOf }), true);
  assert.equal(filter.matchesFilters(steam, { platform: 'gog', platformOf }), false);
  assert.equal(filter.matchesFilters(steam, { platform: '../x', platformOf }), true);
  assert.equal(filter.matchesFilters(steam, { progress: 'complete', platform: 'steam', platformOf }), false);
});

// A perfect game's tile wears a platinum halo; Settings counts its DLC, or the base game alone, or nothing.
test('a perfect game is the whole list by default, the base game alone on request, and nothing when off', () => {
  const allDone = game([ach(true), ach(true, 'Second Wind')]);
  const baseDone = game([ach(true), ach(false, 'Second Wind')]);
  const started = game([ach(true), ach(false)]);
  const empty = game([]);

  for (const mode of ['all', undefined, 'nonsense']) {
    assert.equal(filter.isPerfect(allDone, mode), true, `${mode} keeps a game at 100%`);
    assert.equal(filter.isPerfect(baseDone, mode), false, `${mode} counts the DLC`);
  }
  assert.equal(filter.isPerfect(baseDone, 'base'), true);
  assert.equal(filter.isPerfect(allDone, 'base'), true);
  assert.equal(filter.isPerfect(started, 'base'), false);
  assert.equal(filter.isPerfect(empty, 'all'), false, 'a game without achievements is never perfect');
  assert.equal(filter.isPerfect(allDone, 'off'), false);
  assert.deepEqual(filter.PERFECT_MODES, ['all', 'base', 'off']);
  assert.equal(filter.normalizePerfectMode('base'), 'base');
  assert.equal(filter.normalizePerfectMode(42), 'all');
});
