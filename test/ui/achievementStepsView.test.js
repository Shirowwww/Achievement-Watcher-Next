'use strict';

// The steps block under an achievement row: what it shows, and that a shared file cannot inject markup.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parse } = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'node-html-parser'));

const view = require('../../app/util/achievementStepsView.js');

const labels = { toggle: 'Steps', add: 'Add a step', remove: 'Remove this step', rename: 'Double-click to rename' };
const steps = [
  { id: 'a1', text: 'Chaos Blade', done: true },
  { id: 'b2', text: '<img src=x onerror=alert(1)>', done: false },
];

test('the block counts ticked steps and lists them, with a field to add one', () => {
  const root = parse(view.blockHtml({ steps, labels }));
  assert.equal(root.querySelector('.ach-steps-count').text, '1/2');
  assert.equal(root.querySelector('.ach-steps-toggle').getAttribute('aria-expanded'), 'false');
  assert.ok(root.querySelector('.ach-steps-list').hasAttribute('hidden'), 'closed until asked');
  assert.deepEqual(
    root.querySelectorAll('.ach-step').map((li) => [li.getAttribute('data-step'), li.querySelector('input').hasAttribute('checked')]),
    [
      ['a1', true],
      ['b2', false],
    ]
  );
  assert.equal(root.querySelector('.ach-step-new input').getAttribute('placeholder'), 'Add a step');
});

test("a step's text is shown as text, never as markup", () => {
  const html = view.blockHtml({ steps, labels, expanded: true });
  assert.equal(parse(html).querySelectorAll('img').length, 0);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('an achievement without steps offers to add some, an unlocked one shows them done and read only', () => {
  const empty = parse(view.blockHtml({ steps: [], labels }));
  assert.ok(empty.querySelector('.ach-steps').classList.contains('is-empty'));
  assert.equal(empty.querySelector('.ach-steps-count'), null);

  const unlocked = parse(view.blockHtml({ steps, labels, achieved: true }));
  assert.equal(unlocked.querySelector('.ach-steps-count').text, '2/2');
  assert.ok(unlocked.querySelectorAll('.ach-step input').every((input) => input.hasAttribute('checked') && input.hasAttribute('disabled')));
  assert.equal(unlocked.querySelector('.ach-step-new'), null);
  assert.equal(unlocked.querySelector('.ach-step-remove'), null);

  assert.equal(view.blockHtml({ steps: [], labels, achieved: true }), '', 'nothing left to plan');
});

test("the bar keeps the game's own counter, and shows the steps when there is none", () => {
  const counter = { current: 3, max: 10, percent: 30, hasProgress: true };
  assert.equal(view.barState(counter, steps, false), counter);
  assert.deepEqual(view.barState({ current: 0, max: 0, percent: 0, hasProgress: false }, steps, false), { current: 1, max: 2, percent: 50, hasProgress: true });
  const none = { current: 0, max: 0, percent: 0, hasProgress: false };
  assert.equal(view.barState(none, [], false), none);
});
