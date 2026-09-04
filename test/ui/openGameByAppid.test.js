'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const appJs = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');

// Not every appid is a Steam number: Ubisoft games are "UPLAY<id>" and XLiveLessNess titles are
// "xlln-<titleId>". Stripping non-digits to keep an interpolated selector safe turned those into a
// different id entirely, so a clicked toast opened nothing, or the Steam game owning the leftover
// digits. Both parsers below are the reason this cannot be relaxed back to a numeric assumption.
test('non-numeric appids are a real shape a tile can carry', () => {
  assert.match(fs.readFileSync(path.join(appDir, 'parser/uplay.js'), 'utf8'), /appid: `UPLAY\$\{/);
  assert.match(fs.readFileSync(path.join(appDir, 'parser/xlln.js'), 'utf8'), /appid: `xlln-\$\{/);
});

test('a tile is found by comparing its appid, never by interpolating one into a selector', () => {
  const interpolated = [...appJs.matchAll(/\[data-appid="\$\{[^}]*\}"\]/g)];
  assert.deepEqual(
    interpolated.map((match) => match[0]),
    [],
    'an interpolated data-appid selector is both an injection risk and wrong for non-numeric ids'
  );
  assert.doesNotMatch(appJs, /appid[^\n]*replace\(\/\[\^\d\]\/g/, 'appids must not be reduced to their digits');
  assert.match(appJs, /const wanted = String\(self\.args\.appid\);/);
  assert.match(appJs, /return String\(this\.dataset\.appid\) === wanted;/);
});
