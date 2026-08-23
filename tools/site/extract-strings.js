'use strict';

/*
  Every translatable string of the two hand built pages, in one list.

  The English copy lives in the markup rather than in a dictionary, which is what keeps the pages
  readable with scripting off. The cost is that a translator has no file to start from, so this
  script produces one: it reads the pages, plus the fallbacks the page scripts pass to awI18n.t(),
  and prints key to English as JSON.

    node tools/site/extract-strings.js > docs/assets/i18n/fr.json
    node tools/site/extract-strings.js --check

  --check compares every translation listed in docs/assets/i18n/languages.json against the current
  markup and fails on a key that no longer exists. A missing key is only reported: the page falls
  back to its own English, so a partial translation is a valid state.
*/

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'node-html-parser'));

const root = path.join(__dirname, '..', '..');
const I18N_DIR = path.join(root, 'docs', 'assets', 'i18n');

const PAGES = [
  path.join(root, 'docs', 'index.html'),
  path.join(root, 'docs', 'gallery', 'index.html'),
  path.join(root, 'docs', 'gallery', 'themes', 'index.html'),
];
const SCRIPTS = [path.join(root, 'docs', 'assets', 'js', 'site.js'), path.join(root, 'docs', 'assets', 'js', 'gallery.js')];

// Inline tags a translated value may reuse; anything else in the source is flattened to its text so
// a translator is never handed a wall of markup to preserve.
const INLINE_RE = /^<(?:code|kbd|b|i|em|strong|a|span|br)\b/i;

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function englishOf(node) {
  const html = collapse(node.innerHTML);
  // Keep the markup only when the whole value is one inline run; a block element inside means the
  // key is on the wrong node, which is worth seeing rather than silently copying.
  if (html.includes('<') && INLINE_RE.test(html.replace(/^[^<]*/, ''))) return html;
  return collapse(node.text);
}

function fromPages() {
  const strings = new Map();

  for (const file of PAGES) {
    if (!fs.existsSync(file)) continue;
    const document = parse(fs.readFileSync(file, 'utf8'));

    for (const node of document.querySelectorAll('[data-i18n]')) {
      const key = node.getAttribute('data-i18n');
      if (key && !strings.has(key)) strings.set(key, englishOf(node));
    }

    for (const node of document.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of node.getAttribute('data-i18n-attr').split(',')) {
        const [attribute, key] = pair.split(':').map((part) => collapse(part));
        if (!attribute || !key || strings.has(key)) continue;
        strings.set(key, collapse(node.getAttribute(attribute)));
      }
    }
  }

  return strings;
}

// awI18n.t('key', 'English') and t('key', 'English') inside the page scripts.
function fromScripts() {
  const strings = new Map();
  const call = /\bt\(\s*'([a-zA-Z0-9_.]+)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;

  for (const file of SCRIPTS) {
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    let match = call.exec(source);
    while (match) {
      if (!strings.has(match[1])) strings.set(match[1], match[2].replace(/\\'/g, "'"));
      match = call.exec(source);
    }
  }

  return strings;
}

function allStrings() {
  const strings = fromPages();
  for (const [key, value] of fromScripts()) if (!strings.has(key)) strings.set(key, value);
  return strings;
}

function languages() {
  const file = path.join(I18N_DIR, 'languages.json');
  if (!fs.existsSync(file)) return { list: [], problems: ['docs/assets/i18n/languages.json is missing'] };

  let list;
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { list: [], problems: ['docs/assets/i18n/languages.json is not valid JSON'] };
  }
  if (!Array.isArray(list)) return { list: [], problems: ['docs/assets/i18n/languages.json must be an array'] };

  const problems = [];
  for (const entry of list) {
    if (!entry || typeof entry.code !== 'string' || typeof entry.name !== 'string' || !entry.code || !entry.name) {
      problems.push('languages.json entries need a code and a name');
      continue;
    }
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(entry.code)) problems.push(`languages.json: "${entry.code}" is not a language tag`);
    if (entry.code === 'en') problems.push('languages.json must not list English: it is the markup itself');
  }
  return { list, problems };
}

function check() {
  const strings = allStrings();
  const { list, problems } = languages();

  for (const entry of list) {
    if (!entry || !entry.code) continue;
    const file = path.join(I18N_DIR, `${entry.code}.json`);
    if (!fs.existsSync(file)) {
      problems.push(`${entry.code}: languages.json lists it, but assets/i18n/${entry.code}.json does not exist`);
      continue;
    }

    let translated;
    try {
      translated = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      problems.push(`${entry.code}: assets/i18n/${entry.code}.json is not valid JSON`);
      continue;
    }

    const stale = Object.keys(translated).filter((key) => !strings.has(key));
    const missing = [...strings.keys()].filter((key) => typeof translated[key] !== 'string' || !translated[key]);

    // A key that no longer exists is a real error: it means the markup moved on and the file was
    // not revisited. A key not yet translated only falls back to English, so it is reported.
    for (const key of stale) problems.push(`${entry.code}: "${key}" is not a key of the site any more`);
    if (missing.length) console.log(`${entry.code}: ${missing.length} of ${strings.size} keys still fall back to English`);
  }

  if (problems.length) {
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`site strings: ${strings.size} keys, ${list.length} translation${list.length === 1 ? '' : 's'}`);
}

if (require.main !== module) {
  // Exported so test/site/pages.test.js can assert the translations against the same key list.
  module.exports = { allStrings, languages };
} else if (process.argv.includes('--check')) {
  check();
} else {
  const strings = allStrings();
  const out = {};
  for (const [key, value] of [...strings.entries()].sort((a, b) => a[0].localeCompare(b[0]))) out[key] = value;
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}
