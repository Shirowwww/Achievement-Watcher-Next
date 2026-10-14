'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const yaml = require('../../app/node_modules/js-yaml');
const { minimatch } = require('../../app/node_modules/minimatch');

/*
  electron-builder.yml leaves file classes out of app.asar that Node never loads (TypeScript sources,
  bundler builds, docs). A rule that goes stale when a package changes its layout fails silently at
  runtime, the way the old koffi prune did, so every runtime dependency's entry point is checked
  against the exclusions here.
*/

const appRoot = path.join(__dirname, '..', '..', 'app');
const config = yaml.load(fs.readFileSync(path.join(appRoot, 'electron-builder.yml'), 'utf8'));
const exclusions = config.files.filter((rule) => rule.startsWith('!')).map((rule) => rule.slice(1));
const excludedBy = (relative) => exclusions.find((pattern) => minimatch(relative, pattern, { dot: true }));
const relativeToApp = (file) => path.relative(appRoot, file).split(path.sep).join('/');

test('no exclusion removes the file a runtime dependency loads', () => {
  const { dependencies } = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  let checked = 0;
  for (const name of Object.keys(dependencies)) {
    let entry;
    try {
      entry = require.resolve(name, { paths: [appRoot] });
    } catch {
      continue; // import-only packages: their entry is checked below when one matters
    }
    const relative = relativeToApp(entry);
    assert.equal(excludedBy(relative), undefined, `${name} loads ${relative}, which electron-builder.yml leaves out`);
    checked++;
  }
  assert.ok(checked > 20, `only ${checked} dependencies resolved`);
});

test('the files the pruned packages need at runtime stay in the package', () => {
  const required = [
    'node_modules/moment/moment.js',
    'node_modules/moment/locale/fr.js',
    'node_modules/xml2js/lib/xml2js.js',
    'node_modules/node-html-parser/dist/index.cjs',
    'node_modules/node-html-parser/dist/index.mjs',
    'node_modules/node-unrar-js/dist/index.js',
    'node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js',
  ];
  for (const relative of required) {
    assert.ok(fs.existsSync(path.join(appRoot, relative)), `${relative} no longer exists: re-check the rule that names its package`);
    assert.equal(excludedBy(relative), undefined, `${relative} is left out by ${excludedBy(relative)}`);
  }
});

test('license files survive the documentation rule, whatever their extension', () => {
  for (const relative of ['node_modules/some-pkg/LICENSE.md', 'node_modules/some-pkg/LICENSE', 'node_modules/some-pkg/license.txt']) {
    assert.equal(excludedBy(relative), undefined, relative);
  }
  assert.ok(excludedBy('node_modules/some-pkg/README.md'));
  assert.ok(excludedBy('node_modules/some-pkg/lib/index.d.ts'));
});
