'use strict';

// The guides exist in English at the root of docs/ and as a full copy in each language folder. The
// languages are listed in several places that cannot read each other (the layout's data files, the
// home page's language picker, the app's link table, the page script that rewrites guide links, the
// Jekyll defaults), so this is the one place that notices when they stop agreeing.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const DOCS = path.join(root, 'docs');
const yaml = require(path.join(root, 'app', 'node_modules', 'js-yaml'));
const site = require(path.join(root, 'tools', 'site', 'languages.js'));
const links = require(path.join(root, 'app', 'util', 'links.js'));

const config = yaml.load(fs.readFileSync(path.join(DOCS, '_config.yml'), 'utf8'));
const codes = site.languages();

function keysOf(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object' ? keysOf(child, `${prefix}${key}.`) : [`${prefix}${key}`]
  );
}

test('every language is listed the same way in the layout data, the picker, the app and the Jekyll defaults', () => {
  assert.ok(codes.length >= 9, 'the translated languages are gone');

  const picker = JSON.parse(fs.readFileSync(path.join(DOCS, 'assets', 'i18n', 'languages.json'), 'utf8')).map((entry) => entry.code);
  assert.deepEqual([...picker].sort(), codes, 'docs/assets/i18n/languages.json and docs/_data/ui/ list different languages');

  const appFolders = [...new Set(Object.values(links.DOC_LANGUAGES))].sort();
  assert.deepEqual(appFolders, codes, 'app/util/links.js DOC_LANGUAGES points at a folder that is not a language, or misses one');

  const scoped = config.defaults
    .filter((entry) => codes.includes(entry.scope.path))
    .map((entry) => entry.scope.path)
    .sort();
  assert.deepEqual(scoped, codes, 'docs/_config.yml needs one defaults entry per language folder');
  for (const code of codes) {
    const values = config.defaults.find((entry) => entry.scope.path === code).values;
    assert.equal(values.lang, code);
    assert.match(values.locale, /^[a-z]{2}_[A-Z]{2}$/);
  }
});

test('every language file says the same things as the English one', () => {
  const english = site.uiStrings('en');
  const wanted = keysOf(english).sort();
  const guides = site.translatedGuides().filter((stem) => stem !== 'README');
  for (const stem of guides) assert.ok(english.labels[stem], `docs/_data/ui/en.yml has no label for ${stem}`);

  for (const code of codes) {
    const ui = site.uiStrings(code);
    assert.deepEqual(keysOf(ui).sort(), wanted, `docs/_data/ui/${code}.yml has other keys than en.yml`);
    for (const key of keysOf(ui)) {
      const value = key.split('.').reduce((node, part) => node[part], ui);
      assert.ok(typeof value === 'string' && value.trim(), `docs/_data/ui/${code}.yml: ${key} is empty`);
    }
    assert.ok(ui.js.searchMany.includes('{n}'), `${code}: searchMany lost its {n}`);
    assert.ok(!new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`).test(JSON.stringify(ui)), `${code}: an em or en dash`);
  }
});

test('the guides kept in English are the same set everywhere', () => {
  const groups = site.guideGroups();
  const kept = groups
    .flatMap((group) => group.items.filter((item) => group.translated === false || item.translated === false).map((item) => item.file))
    .sort();

  const script = fs.readFileSync(path.join(DOCS, 'assets', 'js', 'i18n.js'), 'utf8');
  const listed = /ENGLISH_ONLY_GUIDES = \[([^\]]*)\]/.exec(script);
  assert.ok(listed, 'docs/assets/js/i18n.js lost its ENGLISH_ONLY_GUIDES list');
  const inScript = [...listed[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(inScript, kept, 'docs/assets/js/i18n.js and docs/_data/guides.yml disagree about which guides stay English');

  // The app: every guide it links to has a copy, except the two it knows are English.
  const translated = new Set(site.translatedGuides());
  const untranslatedKeys = Object.entries(links.DOCS).filter(([, slug]) => !translated.has(slug)).map(([key]) => key).sort();
  assert.deepEqual(untranslatedKeys, ['architecture', 'goldbergGbe'], 'a DOCS slug has no translated copy');
  for (const key of ['architecture', 'goldbergGbe']) {
    assert.equal(links.docs(key, 'french'), links.docs(key), `${key} is English only, so every language gets the English page`);
  }
});

test('a translated page is only offered where it exists', () => {
  assert.equal(links.docs('faq', 'french'), `${links.SITE}/fr/faq.html`);
  assert.equal(links.docs('home', 'schinese'), `${links.SITE}/zh-cn/README.html`);
  assert.equal(links.docs('troubleshooting', 'latam'), `${links.SITE}/es/troubleshooting.html`);
  assert.equal(links.docs('troubleshooting', 'tchinese'), links.docs('troubleshooting'), 'no copy for Traditional Chinese: English');
  assert.equal(links.docs('troubleshooting', 'english'), links.docs('troubleshooting'));
  assert.equal(links.docs('troubleshooting', 'constructor'), links.docs('troubleshooting'), 'a prototype key is not a language');
  assert.equal(links.resolve('faq', 'german'), `${links.SITE}/de/faq.html`);
  assert.equal(links.resolve('community.discord', 'german'), links.community.discord);
  assert.equal(links.resolve('nope', 'german'), undefined);
});

test('each language has every translated guide, built to the English structure', () => {
  for (const code of codes) {
    const { problems } = require(path.join(root, 'tools', 'site', 'translation-check.js'));
    assert.deepEqual(problems(code), [], `docs/${code}/ departs from the English guides; run node tools/site/translation-check.js ${code}`);
  }
});

test('the search index of each language is current', () => {
  const searchTool = require(path.join(root, 'tools', 'site', 'search-index.js'));
  for (const code of codes) {
    const file = searchTool.outFor(code);
    assert.ok(fs.existsSync(file), `docs/data/search-${code}.json is missing; run node tools/site/search-index.js`);
    assert.equal(fs.readFileSync(file, 'utf8'), searchTool.content(code), `docs/data/search-${code}.json is stale; run node tools/site/search-index.js`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.pages.length, site.translatedGuides().length);
  }
});

test('the layout switches language and tells search engines about the copies', () => {
  const layout = fs.readFileSync(path.join(DOCS, '_layouts', 'default.html'), 'utf8');
  const header = fs.readFileSync(path.join(DOCS, '_includes', 'site-header.html'), 'utf8');
  const head = fs.readFileSync(path.join(DOCS, '_includes', 'head-custom.html'), 'utf8');
  assert.match(layout, /site\.data\.ui\[lang\]/);
  assert.match(layout, /id="aw-strings"/);
  assert.match(header, /class="aw-lang"/);
  assert.match(head, /hreflang="x-default"/);
  // No wording of its own: a translated page must not say "Home" in English.
  assert.doesNotMatch(layout.replace(/\{%-?\s*comment[\s\S]*?endcomment\s*-?%\}/g, ''), />(Home|Guides|Skip to content|On this page|All guides)</);
  assert.doesNotMatch(header, />(Home|Guides|Presets|Themes|Download)</);
});

test('the release notes of every language follow the English ones', () => {
  const notes = require(path.join(root, 'tools', 'site', 'release-notes.js'));
  assert.deepEqual(notes.problems(), [], 'run node tools/site/release-notes.js, then translate the new version into the other languages');
});
