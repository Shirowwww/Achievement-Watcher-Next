'use strict';

// A watch that fails must close itself and log, never throw: an unhandled 'error' event kills the
// whole Watchdog, which is what a recursive watch of Documents did on Windows' "My Music" junction.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { guardWatcher } = require('../util/watchGuard.js');

test('an error on a guarded watcher is logged and closes it, instead of crashing the process', () => {
  const watcher = new EventEmitter();
  let closed = 0;
  watcher.close = () => {
    closed += 1;
  };
  const warnings = [];
  assert.equal(guardWatcher(watcher, "'C:/Documents/Ma musique'", { warn: (line) => warnings.push(line) }), watcher);
  assert.doesNotThrow(() => watcher.emit('error', Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })));
  assert.equal(closed, 1);
  assert.match(warnings[0], /Ma musique/);
});

test('every console watcher is guarded', () => {
  const dir = path.join(__dirname, '..', 'console');
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const watches = (source.match(/= watch\(/g) || []).length;
    const guarded = (source.match(/guardWatcher\(/g) || []).length;
    assert.ok(guarded >= watches, `${file}: ${watches} watch() call(s), ${guarded} guarded`);
  }
});
