'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

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
  Only files that touch the real Windows registry or rewrite a shipped asset in place can race each
  other; the rest run in parallel, each in its own process and temp directory.
  uplaySteamTable.test.js rewrites app/assets/uplay-steam.json, which every Uplay test reads.
*/
const SERIAL_TESTS = new Set([
  'reg.test.js',
  'backgroundFootprint.test.js',
  'regoditSafety.test.js',
  'playtimeTrack.test.js',
  'uplaySteamTable.test.js',
]);

/*
  The files are handed to node in this order and it starts them in that order, so a long file that
  begins last ends the run alone. These are the longest, slowest first; the other browser tests come
  next, then the rest. A name that is no longer here costs nothing.
*/
const LONGEST_FIRST = [
  'presetRenderer.browser.test.js',
  'notificationPaint.browser.test.js',
  'onboardingFlow.browser.test.js',
  'sanPreset.browser.test.js',
  'portableSaveLocations.test.js',
  'presetLayer.browser.test.js',
  'themeRender.browser.test.js',
  'obsBrowserSource.browser.test.js',
  'emulatorLayouts.test.js',
  'presetWorkspace.browser.test.js',
  'presetActions.browser.test.js',
  'exeDetect.test.js',
  'sortRenderer.browser.test.js',
  'genEmuIdleTimeout.test.js',
];

function startOrder(file) {
  const listed = LONGEST_FIRST.indexOf(path.basename(file));
  if (listed !== -1) return listed;
  return file.includes(`${path.sep}browser${path.sep}`) ? LONGEST_FIRST.length : LONGEST_FIRST.length + 1;
}

// Browser tests each start a real Chromium and spend most of their time waiting on a page, so more of
// them than cores can run at once; AW_TEST_CONCURRENCY overrides the default.
const CPUS = Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
const PARALLEL = Number(process.env.AW_TEST_CONCURRENCY) || Math.max(2, Math.min(CPUS - 1, 8));
// The Watchdog suite is short and runs beside the app suite's parallel group.
const WATCHDOG_PARALLEL = 4;

// Watchdog tests resolve regodit/koffi from watchdog/node_modules, so they run as a second process
// with that cwd - cwd=app would resolve the wrong node_modules. Both suites run here because `npm
// test` in app/ is the one command the release checklist calls.
const SUITES = [
  { name: 'app', dir: __dirname, cwd: path.join(__dirname, '..', 'app'), concurrency: PARALLEL },
  { name: 'watchdog', dir: path.join(__dirname, '..', 'watchdog', 'test'), cwd: path.join(__dirname, '..', 'watchdog'), concurrency: WATCHDOG_PARALLEL },
];

// Windows holds handles on a freshly written tree; see helpers/tempRemovalRetry.js for why the
// suite cannot rely on rm's zero-retry default once several test processes run at once.
const PRELOAD = `--require ${JSON.stringify(path.join(__dirname, 'helpers', 'tempRemovalRetry.js'))}`;

// helpers/runReport.js writes the failed files and the counts of each run next to the usual output.
const REPORTER = pathToFileURL(path.join(__dirname, 'helpers', 'runReport.js')).href;
const REPORT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-test-run-'));
let reportCount = 0;

// A file that fails under load and passes alone is reported as flaky, not failed (see CLAUDE.md for
// the known ones). AW_TEST_RERUN=0 turns the second chance off.
const RERUN_FAILED = process.env.AW_TEST_RERUN !== '0';
const SLOWEST_SHOWN = Number(process.env.AW_TEST_SLOWEST) || 8;

// Windows caps a command line at 32767 characters; the app suite outgrew it as absolute paths, so
// files are passed relative to the cwd and split into batches that stay well under the cap.
const MAX_ARGV_CHARS = 24000;

function batchFiles(files) {
  const batches = [[]];
  let length = 0;
  for (const file of files) {
    if (length + file.length + 3 > MAX_ARGV_CHARS && batches[batches.length - 1].length > 0) {
      batches.push([]);
      length = 0;
    }
    batches[batches.length - 1].push(file);
    length += file.length + 3;
  }
  return batches;
}

function readReport(file) {
  const report = { passed: 0, failedFiles: [], times: new Map() };
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return report;
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('fail ')) report.failedFiles.push(line.slice(5));
    else if (line.startsWith('counts ')) report.passed += Number(line.split(' ')[1]) || 0;
    else if (line.startsWith('time ')) {
      const [, ms, ...nameParts] = line.split(' ');
      const name = nameParts.join(' ');
      report.times.set(name, (report.times.get(name) || 0) + Number(ms));
    }
  }
  return report;
}

function runBatch(relativeFiles, concurrency, cwd) {
  const id = reportCount++;
  const reportFile = path.join(REPORT_DIR, `${id}.txt`);
  /*
    Each batch gets a small temp root of its own, two folders deep. userDir.diagnose reads the two
    folders above the one it is given, so a test folder straight under a real Temp (thousands of
    entries) cost 4 s per call. It also keeps the run's leftovers out of the real Temp.
  */
  const batchRoot = path.join(REPORT_DIR, 'tmp', String(id));
  const workDir = path.join(batchRoot, 'work');
  fs.mkdirSync(workDir, { recursive: true });
  const args = [
    '--test',
    `--test-concurrency=${concurrency}`,
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    `--test-reporter=${REPORTER}`,
    `--test-reporter-destination=${reportFile}`,
    ...process.argv.slice(2),
    ...relativeFiles,
  ];
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} ${PRELOAD}`.trim(), TEMP: workDir, TMP: workDir, TMPDIR: workDir };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', env });
    child.on('error', reject);
    child.on('close', (code) => {
      fs.rmSync(batchRoot, { recursive: true, force: true, maxRetries: 3 });
      resolve({ code, ...readReport(reportFile) });
    });
  });
}

// Runs the files in batches and answers { passed, failed: [{ file, cwd }], times }. A run that exits
// non-zero without naming a file (a crash before any test) is recorded under the group's own label.
async function runGroup(label, files, concurrency, cwd) {
  const outcome = { passed: 0, failed: [], times: new Map() };
  if (files.length === 0) return outcome;
  console.log(`\n--- ${label} (${files.length} files, concurrency ${concurrency}) ---`);
  for (const batch of batchFiles(files.map((file) => path.relative(cwd, file)))) {
    const result = await runBatch(batch, concurrency, cwd);
    outcome.passed += result.passed;
    for (const [file, ms] of result.times) outcome.times.set(file, ms);
    for (const file of result.failedFiles) outcome.failed.push({ file, cwd });
    if (result.code !== 0 && result.failedFiles.length === 0) outcome.failed.push({ file: `${label} (the run itself failed)`, cwd, unrunnable: true });
  }
  return outcome;
}

async function main() {
  const startedAt = Date.now();
  const plan = SUITES.map((suite) => {
    const files = discoverTests(suite.dir);
    if (files.length === 0) throw new Error(`No tests found below ${suite.dir}`);
    console.log(`\n=== ${suite.name} suite (${files.length} files) ===`);
    const serial = files.filter((file) => SERIAL_TESTS.has(path.basename(file)));
    const parallel = files.filter((file) => !SERIAL_TESTS.has(path.basename(file))).sort((left, right) => startOrder(left) - startOrder(right) || left.localeCompare(right, 'en'));
    return { ...suite, serial, parallel };
  });

  const results = [];
  // The parallel groups of both suites at once; the serial ones touch shared state and follow alone.
  results.push(...(await Promise.all(plan.map((suite) => runGroup(`${suite.name} parallel`, suite.parallel, suite.concurrency, suite.cwd)))));
  for (const suite of plan) results.push(await runGroup(`${suite.name} serial`, suite.serial, 1, suite.cwd));

  const passed = results.reduce((sum, result) => sum + result.passed, 0);
  const failedFirst = results.flatMap((result) => result.failed);
  const flaky = [];
  const failed = [];
  for (const entry of failedFirst) {
    if (!RERUN_FAILED || entry.unrunnable) {
      failed.push(entry);
      continue;
    }
    console.log(`\n--- ${path.basename(entry.file)} failed in the full run, once more alone ---`);
    const again = await runBatch([path.relative(entry.cwd, entry.file)], 1, entry.cwd);
    (again.code === 0 ? flaky : failed).push(entry);
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  // The files that took longest in the full run: where to look first when the suite slows down.
  const slowest = results.flatMap((result) => [...result.times]).sort((left, right) => right[1] - left[1]).slice(0, SLOWEST_SHOWN);
  console.log('\nslowest files:');
  for (const [file, ms] of slowest) console.log(`  ${(ms / 1000).toFixed(1).padStart(5)}s ${path.basename(file)}`);
  for (const entry of flaky) console.log(`flaky: ${path.basename(entry.file)} failed under load and passed alone`);
  for (const entry of failed) console.log(`FAILED: ${entry.file}`);
  console.log(`\n=== total: ${passed} passed, ${failed.length} files failed, ${flaky.length} flaky, ${seconds}s ===`);
  fs.rmSync(REPORT_DIR, { recursive: true, force: true });
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  fs.rmSync(REPORT_DIR, { recursive: true, force: true });
  process.exitCode = 1;
});
