'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const settings = require('../settings.js');
const { PROGRESS_STEPS, normalizeProgressStep, reachesProgressMilestone } = require('../util/progressMilestone.js');

test('step 0 keeps every progress update, as before', () => {
  assert.equal(reachesProgressMilestone(1, 2, 50, 0), true);
  assert.equal(reachesProgressMilestone(0, 1, 1000, 0), true);
});

test('a step shows only the updates that cross a new multiple of it', () => {
  // 50-kill counter at 10%: one popup every 5 kills.
  const shown = [];
  for (let current = 1; current < 50; current++) if (reachesProgressMilestone(current - 1, current, 50, 10)) shown.push(current);
  assert.deepEqual(shown, [5, 10, 15, 20, 25, 30, 35, 40, 45]);
  // A jump over several milestones is still one popup.
  assert.equal(reachesProgressMilestone(3, 27, 50, 10), true);
  assert.equal(reachesProgressMilestone(26, 27, 50, 25), false);
  assert.equal(reachesProgressMilestone(24, 25, 100, 25), true);
});

test('float counters and exact boundaries do not drift past a milestone', () => {
  assert.equal(reachesProgressMilestone(6.99, 7, 70, 10), true);
  assert.equal(reachesProgressMilestone(0.3, 0.6, 3, 10), true);
  assert.equal(reachesProgressMilestone(0.6, 0.61, 3, 10), false);
});

test('a counter without a usable goal is never silenced', () => {
  assert.equal(reachesProgressMilestone(1, 2, 0, 25), true);
  assert.equal(reachesProgressMilestone(1, 2, undefined, 25), true);
});

test('saved steps are normalized, INI strings included', () => {
  assert.deepEqual(PROGRESS_STEPS, [0, 10, 25, 50]);
  assert.equal(normalizeProgressStep('25'), 25);
  for (const value of [undefined, '', '33', -10, 'abc']) assert.equal(normalizeProgressStep(value), 0);
});

test('the Watchdog reads the step from the notification section', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-progress-step-'));
  const file = path.join(dir, 'options.ini');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(file, '[achievement]\nlang = english\n\n[notification]\nprogressStep = 10\n', 'utf8');
  assert.equal((await settings.load(file)).notification.progressStep, 10);

  fs.writeFileSync(file, '[achievement]\nlang = english\n\n[notification]\nprogressStep = 7\n', 'utf8');
  assert.equal((await settings.load(file)).notification.progressStep, 0);
});
