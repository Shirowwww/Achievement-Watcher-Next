'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const intlFormat = require(path.join(appDir, 'util', 'intlFormat.js'));
const steamLanguages = require(path.join(appDir, 'locale', 'steam.json'));
const langDir = path.join(appDir, 'locale', 'lang');

function bundledLocales() {
  return fs
    .readdirSync(langDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace('.json', ''))
    .sort();
}

test('the BCP-47 table matches the iso tag steam.json already records for every bundled locale', () => {
  // intlFormat cannot read steam.json - the overlay window is sandboxed - so the pairs are spelled
  // out there and reconciled here. A newly bundled language would fail this before it could ship with
  // dates and numbers formatted for the wrong region.
  for (const id of bundledLocales()) {
    const entry = steamLanguages.find((language) => language.api === id);
    assert.ok(entry, `steam.json must describe ${id}`);
    assert.equal(intlFormat.BCP47[id], entry.iso, `${id}: BCP-47 tag must match steam.json`);
  }
  assert.deepEqual(Object.keys(intlFormat.BCP47).sort(), bundledLocales(), 'the table covers exactly the bundled locales');
});

test('an unknown language keeps the platform default instead of becoming English', () => {
  assert.equal(intlFormat.toBcp47('english'), 'en-US');
  assert.equal(intlFormat.toBcp47('ms-MY'), 'ms-MY');
  assert.equal(intlFormat.toBcp47('not a tag'), undefined);
  assert.equal(intlFormat.toBcp47(''), undefined);
});

test('numbers and percentages follow the language, not the machine', () => {
  assert.equal(intlFormat.formatNumber(1234567, 'english'), '1,234,567');
  assert.equal(intlFormat.formatNumber(1234567, 'german'), '1.234.567');
  assert.equal(intlFormat.formatPercent(42, 'english'), '42%');
  assert.match(intlFormat.formatPercent(42.5, 'french', { maximumFractionDigits: 1 }), /42,5/);
  // A percentage arrives already expressed in percent; it must not be divided twice.
  assert.equal(intlFormat.formatPercent(100, 'english'), '100%');
  assert.equal(intlFormat.formatNumber('nonsense', 'english'), '');
});

test('dates accept both unix seconds and millisecond stamps, and refuse the rest', () => {
  const ms = Date.UTC(2026, 7, 21, 12, 0, 0);
  assert.equal(intlFormat.formatDate(ms, 'english'), intlFormat.formatDate(ms / 1000, 'english'));
  assert.ok(intlFormat.formatDate(ms, 'english'));
  assert.equal(intlFormat.formatDate(0, 'english'), '');
  assert.equal(intlFormat.formatDate(null, 'english'), '');
  assert.equal(intlFormat.formatDate(-5, 'english'), '');
});

test('relative time picks the largest whole unit and truncates towards zero', () => {
  const now = Date.UTC(2026, 7, 21, 12, 0, 0);
  const at = (deltaMs) => intlFormat.formatRelativeTime(now + deltaMs, 'english', { now });
  assert.equal(at(-3 * 86400000), '3 days ago');
  assert.equal(at(-86400000), 'yesterday');
  // 47 hours is one whole day, not two: rounding up would claim a check that never happened.
  assert.equal(at(-47 * 3600000), 'yesterday');
  assert.equal(at(-30000), '30 seconds ago');
  assert.equal(at(2 * 3600000), 'in 2 hours');
  assert.equal(intlFormat.formatRelativeTime(0, 'english', { now }), '');
});

test('durations are phrased by Intl for every bundled locale, with no leading zero unit', () => {
  assert.equal(intlFormat.formatDuration(2400, 'english', { units: ['hours', 'minutes'] }), '40 minutes');
  assert.equal(intlFormat.formatDuration(3 * 3600 + 20 * 60, 'english', { units: ['hours', 'minutes'] }), '3 hours, 20 minutes');
  assert.equal(intlFormat.formatDuration(0, 'english'), '');

  /*
    The reason this moved off humanize-duration: its language list does not carry the tags the app
    derives for Simplified Chinese or Brazilian Portuguese, and its `fallbacks` option turned that
    into silent English. Every bundled locale must now produce text of its own.
  */
  const english = intlFormat.formatDuration(3 * 3600 + 20 * 60, 'english', { units: ['hours', 'minutes'] });
  for (const id of bundledLocales()) {
    const value = intlFormat.formatDuration(3 * 3600 + 20 * 60, id, { units: ['hours', 'minutes'] });
    assert.ok(value, `${id}: a duration must render`);
    if (id !== 'english') assert.notEqual(value, english, `${id}: a duration must not fall back to English`);
  }
});

test('lists are joined the way the language joins them', () => {
  assert.equal(intlFormat.formatList(['Steam', 'GOG', 'Epic'], 'english'), 'Steam, GOG, and Epic');
  assert.match(intlFormat.formatList(['Steam', 'GOG', 'Epic'], 'french'), / et Epic$/);
  assert.equal(intlFormat.formatList([], 'english'), '');
});

test('the overlay reuses the same tables instead of keeping its own', () => {
  const overlayUi = require(path.join(appDir, 'util', 'overlayUi.js'));
  assert.equal(overlayUi.toBcp47('french'), intlFormat.toBcp47('french'));
  const source = fs.readFileSync(path.join(appDir, 'util', 'overlayUi.js'), 'utf8');
  assert.doesNotMatch(source, /const BCP47 = \{/, 'the locale table must live in intlFormat.js alone');
  // The overlay window is sandboxed, so it needs the script tag rather than a require().
  const overlayHtml = fs.readFileSync(path.join(appDir, 'view', 'overlay.html'), 'utf8');
  const intlAt = overlayHtml.indexOf('../util/intlFormat.js');
  const overlayAt = overlayHtml.indexOf('../util/overlayUi.js');
  assert.ok(intlAt > 0 && intlAt < overlayAt, 'intlFormat.js must be loaded before overlayUi.js');
});
