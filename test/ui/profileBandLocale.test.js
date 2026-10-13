'use strict';

/*
  The two buttons of the profile band (stats, fold) name themselves from the locale. They used to be
  named once at startup, so a language change left their tooltips in the previous language until a
  restart. The locale loader now repaints them with the rest of the out-of-DOM text.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..', 'app');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const loaderSource = fs.readFileSync(path.join(root, 'locale', 'loader.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is defined in app.js`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}

// A jQuery stand-in that records the attributes set on each selector.
function fakeDom({ compact }) {
  const attrs = {};
  const $ = (selector) => ({
    attr(values) {
      attrs[selector] = { ...attrs[selector], ...values };
      return this;
    },
    hasClass: (name) => selector === '#home' && name === 'profile-compact' && compact,
  });
  return { $, attrs };
}

function labelsIn(language, compact) {
  const strings = {
    english: { 'profile-stats-open': 'See the detailed breakdown', 'profile-banner-compact': 'Compact profile', 'profile-banner-expand': 'Show the full profile' },
    french: { 'profile-stats-open': 'Voir le détail', 'profile-banner-compact': 'Profil compact', 'profile-banner-expand': 'Afficher le profil complet' },
  }[language];
  const { $, attrs } = fakeDom({ compact });
  const t = (key) => strings[key];
  const refresh = new Function('$', 't', `${extractFunction(appSource, 'refreshProfileBandLabels')}\nreturn refreshProfileBandLabels;`)($, t);
  refresh();
  return attrs;
}

test('a language change renames both profile band buttons', () => {
  const english = labelsIn('english', false);
  const french = labelsIn('french', false);

  assert.equal(english['#profile-stats-open'].title, 'See the detailed breakdown');
  assert.equal(french['#profile-stats-open'].title, 'Voir le détail');
  assert.equal(french['#profile-stats-open']['aria-label'], 'Voir le détail');
  assert.equal(english['#profile-compact-toggle'].title, 'Compact profile');
  assert.equal(french['#profile-compact-toggle']['aria-label'], 'Profil compact');
});

test('the fold button keeps describing what a click does after the repaint', () => {
  const folded = labelsIn('french', true);

  assert.equal(folded['#profile-compact-toggle'].title, 'Afficher le profil complet');
});

test('the locale loader repaints the profile band with the other out-of-DOM text', () => {
  assert.match(loaderSource, /\(\) => window\.refreshProfileBandLabels\(\),/);
  assert.match(appSource, /window\.refreshProfileBandLabels = refreshProfileBandLabels;/);
  assert.match(extractFunction(appSource, 'applyProfileCompact'), /refreshProfileBandLabels\(\);/);
});
