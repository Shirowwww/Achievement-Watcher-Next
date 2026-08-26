'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const workingSet = require('../util/workingSet.js');

// The trim is a silent optimisation: a wrong koffi signature, a bad sentinel - none of it throws, it
// just fails quietly. So this exercises the real Win32 call on the test process rather than the source.

test('the Win32 binding loads', () => {
  assert.equal(workingSet.isAvailable(), true);
});

test('trimming actually empties this process working set', () => {
  // Give the process something to lose first, so a no-op would be visible.
  const ballast = [];
  for (let i = 0; i < 400; i++) ballast.push(Buffer.alloc(64 * 1024, i % 256));
  const before = process.memoryUsage().rss;

  assert.equal(workingSet.trim(), 1, 'the process itself is always trimmed');

  const after = process.memoryUsage().rss;
  assert.ok(after < before, `working set did not shrink (${before} -> ${after})`);
  assert.equal(ballast.length, 400, 'the data must still be reachable, only its pages moved');
});

test('an unusable pid is skipped instead of throwing', () => {
  // pid 4 is System: it exists, and a normal user cannot open it for PROCESS_SET_QUOTA.
  assert.equal(workingSet.trim([4, 0, -1, 999999999, 'x']), 1, 'only this process should have been trimmed');
});
