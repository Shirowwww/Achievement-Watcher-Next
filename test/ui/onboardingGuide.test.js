'use strict';

// The markup contract of the first-run guide: what onboarding.js looks up must exist, and every
// string it reads must be a real English key (the other 27 locales are held to the same keys by
// test/core/locales.test.js). A typo in a key name otherwise ships as blank UI.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));
const document = htmlParser.parse(fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8'));
const source = fs.readFileSync(path.join(appDir, 'ui', 'onboarding.js'), 'utf8');
const english = JSON.parse(fs.readFileSync(path.join(appDir, 'locale', 'lang', 'english.json'), 'utf8'));

// Keys localizedText() fills in from the Settings translations instead of the onboarding block.
const DERIVED = ['theme', 'themeHint', 'preset', 'presetHint', 'manualSource', 'notificationAuto', 'sourceText'];

test('every onboarding string the script reads exists in english.json', () => {
  const used = new Set([...source.matchAll(/(?<![\w./])t\.([A-Za-z]+)\b/g)].map((match) => match[1]));
  used.delete('steps');
  const missing = [...used].filter((key) => !DERIVED.includes(key) && !(key in english.onboarding));
  assert.deepEqual(missing, [], `missing onboarding keys: ${missing.join(', ')}`);
});

test('every id the script fills with text is in the markup', () => {
  const ids = new Set([...source.matchAll(/\$\('#(onboard[\w-]*|onboarding[\w-]*)'\)/g)].map((match) => match[1]));
  const absent = [...ids].filter((id) => !document.querySelector(`#${id}`));
  assert.deepEqual(absent, [], `ids missing from app.html: ${absent.join(', ')}`);
});

test('the guide has one nav button, one label and one panel per step, and a dismiss on each footer', () => {
  const steps = document.querySelectorAll('#onboarding .onboarding-step');
  assert.equal(steps.length, 6);
  assert.equal(english.onboarding.steps.length, steps.length);
  assert.equal(document.querySelectorAll('#onboarding .onboarding-steps button').length, steps.length);
  for (const id of ['onboarding-prev', 'onboarding-next', 'onboarding-skip', 'onboarding-close']) {
    assert.ok(document.querySelector(`#${id}`), `#${id}`);
  }
});

test('language and interface mode share the first step, so one gate guards both', () => {
  const first = document.querySelector('#onboarding-step-0');
  assert.ok(first.querySelector('#onboard-language'));
  assert.ok(first.querySelector('.onboarding-mode-choice'));
});

test('the technical controls are folded, not removed', () => {
  const sources = document.querySelector('#onboard-sources-details');
  assert.equal(sources.tagName, 'DETAILS');
  assert.equal(sources.getAttribute('open'), undefined, 'folded until opened');
  assert.ok(sources.querySelectorAll('select').length >= 19, 'every Settings source switch is still inside');
  assert.ok(document.querySelector('#onboard-more-details #onboard-auto-fix'));
  // The accounts stay out in the open: signing in is the one thing worth seeing at a glance.
  assert.ok(!sources.querySelector('#onboard-steam-connect'));
});

test('the radio cards use a roving tabindex so Tab leaves the group in one stop', () => {
  assert.match(source, /tabindex: stop \? '0' : '-1'/);
  assert.match(source, /ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1/);
});

test('the notification test button is a visible labelled button, not an icon with a tooltip', () => {
  const button = document.querySelector('#onboard-notification-test');
  assert.ok(button.querySelector('span'));
  const rules = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');
  assert.doesNotMatch(rules, /onboarding-notification-field \.onboarding-test-button span \{[^}]*clip-path/);
});
