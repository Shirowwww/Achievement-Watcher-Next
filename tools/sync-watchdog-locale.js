'use strict';

/*
  Regenerate watchdog/locale.json from app/locale/lang. The Watchdog runs as its own process and
  cannot load the renderer's locale files, so the small `watchdog` section of every bundled locale
  is mirrored next to it - a hand-maintained copy drifts the moment someone adds a language and
  forgets the second file.

    node tools/sync-watchdog-locale.js           rewrite watchdog/locale.json
    node tools/sync-watchdog-locale.js --check   report drift and exit 1, write nothing

  test/integration/watchdogLocale.test.js runs the --check half, so `npm test` fails on drift.
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'app', 'locale', 'lang');
const TARGET = path.join(ROOT, 'watchdog', 'locale.json');

function build() {
  const out = {};
  const files = fs
    .readdirSync(LANG_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
  for (const file of files) {
    const locale = JSON.parse(fs.readFileSync(path.join(LANG_DIR, file), 'utf8'));
    out[file.replace(/\.json$/, '')] = locale.watchdog;
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

function current() {
  try {
    return fs.readFileSync(TARGET, 'utf8');
  } catch {
    return null;
  }
}

function inSync() {
  return current() === build();
}

function write() {
  fs.writeFileSync(TARGET, build());
  return TARGET;
}

function main() {
  if (process.argv.includes('--check')) {
    if (inSync()) {
      console.log('watchdog/locale.json is in sync with app/locale/lang.');
      return;
    }
    console.error('watchdog/locale.json is out of sync - run "node tools/sync-watchdog-locale.js".');
    process.exitCode = 1;
    return;
  }
  console.log(`wrote ${path.relative(ROOT, write()).split(path.sep).join('/')}`);
}

if (require.main === module) main();

module.exports = { build, inSync, write, TARGET };
