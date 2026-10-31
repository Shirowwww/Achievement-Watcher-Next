'use strict';

// Steps a player writes under a long achievement (Knight's Honor: 30 unique weapons) and ticks off
// by hand: what is stored, what the bar counts, and the file that shares a game's steps.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');

const steps = require('../../app/parser/achievementSteps.js');

const game = {
  appid: '570940',
  name: 'DARK SOULS: REMASTERED',
  achievement: {
    list: [
      { name: 'ACH_10', displayName: "Knight's Honor", Achieved: 0 },
      { name: 'ACH_11', displayName: 'Wisdom of a Sage', Achieved: 1 },
    ],
  },
};

function edited(map, name, edit) {
  return steps.applyEdit(map, game.appid, name, edit);
}

test('steps are added, ticked, renamed and removed under one achievement', () => {
  let { map, changed } = edited({}, 'ACH_10', { op: 'add', text: '  Chaos Blade ' });
  assert.equal(changed, true);
  ({ map } = edited(map, 'ACH_10', { op: 'add', text: 'Golem Axe' }));
  const [first, second] = steps.stepsOf(map, game.appid, 'ACH_10');
  assert.deepEqual([first.text, first.done, second.text], ['Chaos Blade', false, 'Golem Axe']);
  assert.notEqual(first.id, second.id);

  ({ map } = edited(map, 'ACH_10', { op: 'toggle', id: first.id, done: true }));
  ({ map } = edited(map, 'ACH_10', { op: 'rename', id: second.id, text: 'Golem Axe (Anor Londo)' }));
  assert.deepEqual(
    steps.stepsOf(map, game.appid, 'ACH_10').map((step) => [step.text, step.done]),
    [
      ['Chaos Blade', true],
      ['Golem Axe (Anor Londo)', false],
    ]
  );

  ({ map } = edited(map, 'ACH_10', { op: 'remove', id: first.id }));
  ({ map } = edited(map, 'ACH_10', { op: 'remove', id: second.id }));
  assert.deepEqual(map, {}, 'an achievement with no step left leaves nothing behind');
});

test('an empty or blank step is refused, and a long one is cut', () => {
  assert.equal(edited({}, 'ACH_10', { op: 'add', text: '   ' }).changed, false);
  assert.equal(edited({}, 'ACH_10', { op: 'add', text: null }).changed, false);
  const { map } = edited({}, 'ACH_10', { op: 'add', text: `a\u0000b\n${'x'.repeat(500)}` });
  const [step] = steps.stepsOf(map, game.appid, 'ACH_10');
  assert.equal(step.text.length, steps.MAX_TEXT_LENGTH);
  assert.ok(step.text.startsWith('ab x'), 'control characters go, a line break becomes a space');
});

test('an unknown step or operation changes nothing', () => {
  const { map } = edited({}, 'ACH_10', { op: 'add', text: 'Chaos Blade' });
  assert.equal(edited(map, 'ACH_10', { op: 'toggle', id: 'nope', done: true }).changed, false);
  assert.equal(edited(map, 'ACH_10', { op: 'explode' }).changed, false);
  assert.equal(edited(map, '', { op: 'add', text: 'x' }).changed, false);
});

test('the bar counts ticked steps, and an unlocked achievement counts them all', () => {
  const list = [
    { id: 'a', text: 'A', done: true },
    { id: 'b', text: 'B', done: false },
    { id: 'c', text: 'C', done: false },
  ];
  assert.deepEqual(steps.progressOf(list, false), { done: 1, total: 3 });
  assert.deepEqual(steps.progressOf(list, true), { done: 3, total: 3 });
  assert.deepEqual(steps.progressOf([], false), { done: 0, total: 0 });
});

test('the sidecar survives a round trip, and a damaged one reads as empty', () => {
  const dir = makeTempDir('aw-steps-');
  const file = path.join(dir, 'cfg', 'achievement-steps.json');
  const { map } = edited({}, 'ACH_10', { op: 'add', text: 'Chaos Blade' });
  steps.writeMap(file, map);
  assert.deepEqual(steps.readMap(file), map);

  fs.writeFileSync(file, '{ not json');
  assert.deepEqual(steps.readMap(file), {});
  assert.deepEqual(steps.readMap(path.join(dir, 'missing.json')), {});
});

test("a game's steps are exported as a list to share, without the ticks", () => {
  let { map } = edited({}, 'ACH_10', { op: 'add', text: 'Chaos Blade' });
  ({ map } = edited(map, 'ACH_10', { op: 'add', text: 'Golem Axe' }));
  const [first] = steps.stepsOf(map, game.appid, 'ACH_10');
  ({ map } = edited(map, 'ACH_10', { op: 'toggle', id: first.id, done: true }));

  const payload = steps.exportGame(map, game);

  assert.equal(payload.format, steps.FILE_FORMAT);
  assert.equal(payload.version, 1);
  assert.deepEqual(payload.game, { name: 'DARK SOULS: REMASTERED', appid: '570940' });
  assert.deepEqual(payload.achievements, [{ name: 'ACH_10', displayName: "Knight's Honor", steps: ['Chaos Blade', 'Golem Axe'] }]);
  assert.equal(steps.exportGame({}, game), null, 'nothing to export');
});

test('an import matches achievements by id, then by name, and keeps the steps already there', () => {
  const { map: existing } = edited({}, 'ACH_10', { op: 'add', text: 'chaos blade' });
  const [kept] = steps.stepsOf(existing, game.appid, 'ACH_10');
  const { map: ticked } = edited(existing, 'ACH_10', { op: 'toggle', id: kept.id, done: true });
  const payload = {
    format: steps.FILE_FORMAT,
    version: 1,
    achievements: [
      { name: 'OTHER_SOURCE_ID', displayName: "  knight's HONOR ", steps: ['Chaos Blade', 'Golem Axe'] },
      { name: 'ACH_11', displayName: 'Renamed elsewhere', steps: ['Read every scroll'] },
      { name: 'NOT_IN_THIS_GAME', displayName: 'Nowhere', steps: ['Ignored'] },
    ],
  };

  const result = steps.importGame(ticked, game, payload);

  assert.deepEqual([result.achievements, result.added], [2, 2]);
  assert.deepEqual(
    steps.stepsOf(result.map, game.appid, 'ACH_10').map((step) => [step.text, step.done]),
    [
      ['chaos blade', true],
      ['Golem Axe', false],
    ],
    'a step already there keeps its tick; a new one comes unticked'
  );
  assert.deepEqual(
    steps.stepsOf(result.map, game.appid, 'ACH_11').map((step) => step.text),
    ['Read every scroll']
  );
});

test('a file that is not a steps file, or holds nothing for this game, is refused', () => {
  assert.throws(() => steps.parseImportText('not json'), { code: 'NOT_STEPS_FILE' });
  assert.throws(() => steps.parseImportText(JSON.stringify({ format: 'something-else', achievements: [] })), { code: 'NOT_STEPS_FILE' });
  assert.throws(() => steps.parseImportText(JSON.stringify({ format: steps.FILE_FORMAT, version: 99, achievements: [] })), { code: 'NOT_STEPS_FILE' });
  assert.throws(() => steps.parseImportText('x'.repeat(steps.MAX_FILE_BYTES + 1)), { code: 'NOT_STEPS_FILE' });
  const unrelated = steps.parseImportText(JSON.stringify({ format: steps.FILE_FORMAT, version: 1, achievements: [{ name: 'X', displayName: 'Y', steps: ['Z'] }] }));
  assert.throws(() => steps.importGame({}, game, unrelated), { code: 'NO_MATCH' });
});

test('an imported file is bounded: odd entries are skipped, and steps stop at the limit', () => {
  const many = Array.from({ length: steps.MAX_STEPS + 50 }, (_, index) => `Step ${index}`);
  const payload = steps.parseImportText(
    JSON.stringify({
      format: steps.FILE_FORMAT,
      version: 1,
      achievements: [null, 'text', { name: 'ACH_10', steps: [42, { text: 'object' }, '', ...many] }],
    })
  );
  const result = steps.importGame({}, game, payload);
  const list = steps.stepsOf(result.map, game.appid, 'ACH_10');
  assert.equal(list.length, steps.MAX_STEPS);
  assert.equal(list[0].text, 'Step 0', 'only strings are steps');
});
