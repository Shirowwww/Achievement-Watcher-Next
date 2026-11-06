'use strict';

/*
  node-watch warns, through util.deprecate, about any callback declared with one parameter. The
  options watcher and the GOG watcher had one, so every session log since 2026-10-28 carried the
  warning. The wrapper hands each callback both arguments.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// A fresh process each time: util.deprecate warns only once per process.
function stderrOfOneParameterWatch(moduleId) {
  const script = [
    "const fs = require('fs'), os = require('os'), path = require('path');",
    `const watch = require(${JSON.stringify(moduleId)});`,
    "const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-watch-arity-'));",
    // A file, like options.ini: a folder's callback is only checked after an asynchronous probe.
    "const file = path.join(dir, 'options.ini');",
    "fs.writeFileSync(file, '');",
    'const w = watch(file, function (evt) { return evt; });',
    'w.close();',
    'fs.rmSync(dir, { recursive: true, force: true });',
  ].join('\n');
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stderr;
}

test('a watch given only a path still gets node-watch defaults', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const watch = require('../util/nodeWatch.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-watch-path-only-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // node-watch fills in the options only when it is called with fewer than two arguments.
  const watcher = watch(dir);
  watcher.close();
});

test('a one-parameter callback does not make node-watch print its deprecation warning', () => {
  // The bare package does warn: otherwise this test could not fail.
  assert.match(stderrOfOneParameterWatch('node-watch'), /node-watch/);
  assert.doesNotMatch(stderrOfOneParameterWatch(path.join(__dirname, '..', 'util', 'nodeWatch.js')), /node-watch/);
});
