'use strict';

/*
  A repair that fails over a read-only file has to roll back and say so. The journal copies that file
  with copyFileSync, which carries the read-only attribute along, and Electron's own Node (24.22.2)
  refuses fs.rmSync on a folder holding such a copy, where the Node that runs this suite does not.
  The rollback then threw while cleaning up, err.rollback stayed null and Game Health's "Repair
  failed" box lost its "Nothing was left changed" line. The scenario runs under Electron as Node too,
  since that is the runtime that showed it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const { removeTreeForce } = require(path.join(appDir, 'util', 'replaceFile.js'));
const electron = path.join(appDir, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

const SCENARIO = `
const fs = require('fs');
const os = require('os');
const path = require('path');
const journal = require(process.argv[1]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ro-journal-'));
const settings = path.join(root, 'steam_settings');
fs.mkdirSync(settings);
const file = path.join(settings, 'achievements.json');
fs.writeFileSync(file, '[]');
fs.chmodSync(file, 0o444);
const handle = journal.begin({ userDataPath: path.join(root, 'profile'), appid: '1', label: 'repair-data', roots: journal.gbeRoots({ settingsDirs: [settings] }) });
let outcome;
let thrown = null;
try {
  outcome = journal.rollback(handle);
} catch (err) {
  thrown = err.code || err.message;
}
const left = fs.existsSync(handle.dir);
process.stdout.write(JSON.stringify({ thrown, outcome: outcome || null, left }));
require(process.argv[2]).removeTreeForce(root);
`;

// test/run.js preloads its helpers through NODE_OPTIONS; the child is a plain runtime, so it goes.
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runScenario(execPath, env) {
  const result = spawnSync(execPath, ['-e', SCENARIO, path.join(appDir, 'util', 'repairJournal.js'), path.join(appDir, 'util', 'replaceFile.js')], { env, encoding: 'utf8', timeout: 30000 });
  assert.ok(result.stdout, `the scenario printed nothing: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function checkScenario(report) {
  assert.equal(report.thrown, null, 'the rollback must not throw over a read-only copy');
  assert.ok(report.outcome, 'the rollback reports what it did');
  assert.deepEqual(report.outcome.skipped, []);
  assert.equal(report.left, false, 'the journal entry of a rolled-back repair is removed');
}

test('removeTreeForce removes a folder holding a read-only file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ro-tree-'));
  const file = path.join(root, 'nested', 'copy.json');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, '{}');
  fs.chmodSync(file, 0o444);
  removeTreeForce(root);
  assert.equal(fs.existsSync(root), false);
  removeTreeForce(root); // a folder already gone is not an error
});

test('a rollback over a read-only file completes under this Node', () => {
  checkScenario(runScenario(process.execPath, childEnv()));
});

test('a rollback over a read-only file completes under Electron as Node', { skip: !fs.existsSync(electron) && 'no Electron binary in app/node_modules' }, () => {
  checkScenario(runScenario(electron, childEnv({ ELECTRON_RUN_AS_NODE: '1' })));
});
