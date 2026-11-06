'use strict';

/*
  Text written outside the locale loader's DOM walk repaints on one event, named in loader.js and
  spelled again by every listener (some files cannot require the loader). A listener with a typo
  would never repaint and raise nothing, and a jQuery .trigger would never reach the native listeners.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');

function appScripts(dir = appDir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    // dist holds whatever build was made last, not the sources under test.
    if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name === 'dist') return [];
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return appScripts(target);
    return entry.name.endsWith('.js') ? [target] : [];
  });
}

test('every locale listener uses the event the loader fires, and nothing triggers it through jQuery', () => {
  const loader = fs.readFileSync(path.join(appDir, 'locale', 'loader.js'), 'utf8');
  const declared = /const LOCALE_CHANGED = '([^']+)';/.exec(loader);
  assert.ok(declared, 'loader.js no longer names its event');
  assert.match(loader, /document\.dispatchEvent\(new Event\(LOCALE_CHANGED\)\)/, 'loader.js no longer fires it');

  const wrong = [];
  let listeners = 0;
  for (const file of appScripts()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/addEventListener\(\s*'(locale[^']*)'/g)) {
      listeners++;
      if (match[1] !== declared[1]) wrong.push(`${path.relative(appDir, file)}: ${match[1]}`);
    }
    if (/\.trigger\(\s*'locale/.test(source) || /\.on\(\s*'locale/.test(source)) wrong.push(`${path.relative(appDir, file)}: jQuery locale event`);
  }
  assert.ok(listeners >= 5, `expected the repaint listeners, found ${listeners}`);
  assert.deepEqual(wrong, []);
});
