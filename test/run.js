'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function discoverTests(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return discoverTests(target);
      return entry.isFile() && entry.name.endsWith('.test.js') ? [target] : [];
    })
    .sort((left, right) => left.localeCompare(right, 'en'));
}

/*
  Only the files that read or write the real Windows registry can race each other; everything else
  runs in its own child process with its own temp directory, so the whole rest of the tree is safe
  to run in parallel. Listing the exceptions by name instead of serialising all 400 files turns a
  long serial walk into a short parallel one.
*/
const SERIAL_TESTS = new Set(['reg.test.js', 'backgroundFootprint.test.js', 'regoditSafety.test.js', 'playtimeTrack.test.js']);

// Browser tests each start a real Chromium, so they get a smaller share than the pure-Node files.
const CPUS = Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
const PARALLEL = Math.max(2, Math.min(CPUS - 1, 8));

// Watchdog tests resolve regodit/koffi from watchdog/node_modules, so they run as a second process
// with that cwd - cwd=app would resolve the wrong node_modules. Both suites run here because `npm
// test` in app/ is the one command the release checklist calls.
const SUITES = [
  { name: 'app', dir: __dirname, cwd: path.join(__dirname, '..', 'app') },
  { name: 'watchdog', dir: path.join(__dirname, '..', 'watchdog', 'test'), cwd: path.join(__dirname, '..', 'watchdog') },
];

// Windows holds handles on a freshly written tree; see helpers/tempRemovalRetry.js for why the
// suite cannot rely on rm's zero-retry default once several test processes run at once.
const PRELOAD = `--require ${JSON.stringify(path.join(__dirname, 'helpers', 'tempRemovalRetry.js'))}`;

function runGroup(label, files, concurrency, cwd) {
  if (files.length === 0) return true;
  console.log(`\n--- ${label} (${files.length} files, concurrency ${concurrency}) ---`);
  const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${concurrency}`, ...process.argv.slice(2), ...files], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} ${PRELOAD}`.trim() },
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

let failed = false;
for (const suite of SUITES) {
  const files = discoverTests(suite.dir);
  if (files.length === 0) throw new Error(`No tests found below ${suite.dir}`);

  console.log(`\n=== ${suite.name} suite (${files.length} files) ===`);
  const serial = files.filter((file) => SERIAL_TESTS.has(path.basename(file)));
  const parallel = files.filter((file) => !SERIAL_TESTS.has(path.basename(file)));

  if (!runGroup(`${suite.name} parallel`, parallel, PARALLEL, suite.cwd)) failed = true;
  if (!runGroup(`${suite.name} serial`, serial, 1, suite.cwd)) failed = true;
}

process.exitCode = failed ? 1 : 0;
