'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Two achievements written in one save: the first notify is awaited (an overlay report can take
// seconds), so a clock read inside the loop aged the second unlock past timeTreshold and it was
// dropped as "Outatime". Every unlock in one save must be judged against the moment it was read.
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'watchdog', 'watchdog.js'), 'utf8');

test('unlock ages are measured from the save read, taken before any notify', () => {
  const readAt = source.indexOf('const readAt = moment();');
  assert.ok(readAt > 0, 'the read time must be captured once');
  assert.ok(readAt > source.indexOf('await parseWithRetry(parseSave'), 'after the save is parsed, so no unlock in it is in the future');
  assert.ok(readAt < source.indexOf('await notify('), 'before the first awaited notify');
});

test('no unlock in the scan loop is aged against a fresh clock', () => {
  const loop = source.slice(source.indexOf('for (let i in achievements)'), source.indexOf("debug.warn('Outatime:'"));
  assert.ok(loop.length > 0);
  assert.doesNotMatch(loop, /moment\(\)\.(diff|unix)\(/);
  assert.match(loop, /let elapsedTime = readAt\.diff\(/);
});
