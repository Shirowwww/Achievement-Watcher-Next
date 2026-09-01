'use strict';

/*
  The heartbeat proves the monitor's event loop turns, and nothing more. A watcher that failed to
  start left the app supervising a process reporting itself perfectly healthy while tracking less
  than it should, with the reason visible only in the monitor's own log.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const health = require('../util/subsystemHealth.js');

test('only what is broken is reported, with its reason', (t) => {
  t.after(() => health.reset());
  health.reset();

  assert.deepEqual(health.failed(), [], 'nothing has reported yet');

  health.report('rpcs3', true);
  health.report('xenia', false, new Error('userdir.db is unreadable'));
  health.report('gog', false, 'gameplay.db is locked');

  assert.deepEqual(health.failed(), [
    { name: 'gog', detail: 'gameplay.db is locked' },
    { name: 'xenia', detail: 'userdir.db is unreadable' },
  ]);
});

test('a subsystem that recovers stops being reported', (t) => {
  t.after(() => health.reset());
  health.reset();

  health.report('ea', false, 'log folder missing');
  assert.equal(health.failed().length, 1);
  health.report('ea', true);
  assert.deepEqual(health.failed(), []);
});

// The set is compared between beats to decide whether to log, so an unchanged set must compare equal.
test('the report is stable between beats', (t) => {
  t.after(() => health.reset());
  health.reset();
  health.report('xlln', false, 'boom');
  health.report('gog', false, 'boom');
  assert.deepEqual(health.failed(), health.failed());
  assert.deepEqual(
    health.failed().map((entry) => entry.name),
    ['gog', 'xlln'],
    'sorted, so two identical sets never look different'
  );
});

test('a nameless report is ignored rather than filed under an empty key', (t) => {
  t.after(() => health.reset());
  health.reset();
  health.report('', false, 'x');
  health.report(null, false, 'x');
  assert.deepEqual(health.snapshot(), []);
});

// Seven near-identical try/catch blocks are how a fix lands in only one of them.
test('every console watcher starts from the one table, and reports its health', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'watchdog.js'), 'utf8');
  const table = source.slice(source.indexOf('const CONSOLE_WATCHERS = ['), source.indexOf('];', source.indexOf('const CONSOLE_WATCHERS = [')));
  for (const name of ['shadps4', 'rpcs3', 'ea', 'xenia', 'xlln', 'gog', 'ubisoft']) {
    assert.match(table, new RegExp(`name: '${name}'`), `${name} must start from the shared table`);
  }
  assert.match(source, /for \(const entry of CONSOLE_WATCHERS\)/);
  assert.match(source, /subsystemHealth\.report\(entry\.name, false, err\)/, 'a watcher that cannot start has to say so');
  assert.doesNotMatch(source, /await shadps4Watch\.start\(/, 'no watcher keeps a start block of its own');
  assert.match(source, /failed\.length \? \{ failed \} : \{\}/, 'the heartbeat carries the failures to the app');
});
