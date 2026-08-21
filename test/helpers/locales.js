'use strict';

/*
  The bundled-language list, in one place.

  Several suites assert "and all of them were checked" by comparing a directory listing against a
  literal count. Eight copies of that literal meant adding a language was eight unrelated edits,
  and a suite that quietly stopped covering the newest locale looked exactly like one that passed.
  BUNDLED_LOCALE_COUNT is the only number now; everything else asks for the list.
*/

const fs = require('node:fs');
const path = require('node:path');

const LANG_DIR = path.join(__dirname, '..', '..', 'app', 'locale', 'lang');

// Keep in step with app/locale/lang and the "Bundled languages" list in app/locale/README.md.
const BUNDLED_LOCALE_COUNT = 28;

function localeFiles() {
  return fs
    .readdirSync(LANG_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function bundledLocales() {
  return localeFiles().map((name) => name.replace(/\.json$/, ''));
}

function readLocale(file) {
  return JSON.parse(fs.readFileSync(path.join(LANG_DIR, file.endsWith('.json') ? file : `${file}.json`), 'utf8'));
}

module.exports = { LANG_DIR, BUNDLED_LOCALE_COUNT, localeFiles, bundledLocales, readLocale };
