'use strict';

// These two pages are static files, so nothing would notice a broken link, a renamed screenshot,
// or a preset the picker offers that the site doesn't actually carry. That's what this checks,
// plus the one rule the translation overlay depends on - a key always means the same English string.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const { parse } = require(path.join(root, 'app', 'node_modules', 'node-html-parser'));
const DOCS = path.join(root, 'docs');

const PAGES = [
  { file: path.join(DOCS, 'index.html'), dir: DOCS },
  { file: path.join(DOCS, 'gallery', 'index.html'), dir: path.join(DOCS, 'gallery') },
];

function documentOf(page) {
  return parse(fs.readFileSync(page.file, 'utf8'));
}

/*
  Where a link written in a page ends up on disk. The site is served by Jekyll, so a guide is
  addressed as <name>.html and lives as <name>.md, and a folder is its index.html.
*/
function resolveTarget(dir, href) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || clean === './') return path.join(dir, 'index.html');

  const target = path.join(dir, clean);
  if (clean.endsWith('/')) return path.join(target, 'index.html');
  if (fs.existsSync(target)) return target;
  // A built page: docs/<name>.html comes from docs/<name>.md.
  if (clean.endsWith('.html')) return `${target.slice(0, -'.html'.length)}.md`;
  return target;
}

function localReferences(document) {
  const references = [];
  for (const node of document.querySelectorAll('[href], [src]')) {
    const value = node.getAttribute('href') || node.getAttribute('src');
    if (!value) continue;
    if (/^(?:https?:|mailto:|data:|#)/i.test(value)) continue;
    references.push(value);
  }
  return references;
}

test('every local link and asset on the site resolves to something that exists', () => {
  for (const page of PAGES) {
    const document = documentOf(page);
    const references = localReferences(document);
    assert.ok(references.length > 10, `${path.basename(page.dir)} must actually link to the site`);

    for (const reference of references) {
      const target = resolveTarget(page.dir, reference);
      assert.ok(fs.existsSync(target), `${path.relative(root, page.file)} points at "${reference}", which is not in docs/`);
    }
  }
});

test('the preset picker only offers presets the site carries', () => {
  const document = documentOf(PAGES[0]);
  const chips = document.querySelectorAll('[data-preset-tabs] [data-preset]');
  assert.ok(chips.length >= 9, 'every bundled preset should be offered');

  for (const chip of chips) {
    const slug = chip.getAttribute('data-preset');
    const entry = path.join(DOCS, 'assets', 'preset', slug, 'index.html');
    assert.ok(fs.existsSync(entry), `the picker offers "${slug}", which is not under docs/assets/preset (run tools/site/build-assets.js)`);
  }

  // The frame the page starts on has to be one of them.
  const initial = document.querySelector('[data-stage-frame]').getAttribute('src');
  assert.ok(fs.existsSync(path.join(DOCS, initial)), `the stage starts on ${initial}`);
});

test('each preset offered has a line saying what it is', () => {
  const document = documentOf(PAGES[0]);
  const notes = new Set(document.querySelectorAll('[data-preset-notes] [data-preset]').map((node) => node.getAttribute('data-preset')));
  for (const chip of document.querySelectorAll('[data-preset-tabs] [data-preset]')) {
    assert.ok(notes.has(chip.getAttribute('data-preset')), `no description for the "${chip.getAttribute('data-preset')}" preset`);
  }
});

test('a translation key always means the same English string', () => {
  const seen = new Map();

  for (const page of PAGES) {
    for (const node of documentOf(page).querySelectorAll('[data-i18n]')) {
      const key = node.getAttribute('data-i18n');
      const english = node.text.replace(/\s+/g, ' ').trim();
      if (!seen.has(key)) {
        seen.set(key, english);
        continue;
      }
      assert.equal(seen.get(key), english, `"${key}" is used for two different strings; one of them needs its own key`);
    }
  }

  assert.ok(seen.size > 100, 'the pages should be translatable, not partly hard coded');
});

/*
  Switching language restores the English snapshot of a node before writing the new one, and the
  snapshot is that node's own innerHTML. Nesting one translated element inside another would mean
  restoring the outer one throws the inner one away, leaving a stale English string that no later
  switch can reach.
*/
test('no translated element contains another one', () => {
  for (const page of PAGES) {
    for (const node of documentOf(page).querySelectorAll('[data-i18n]')) {
      const inner = node.querySelectorAll('[data-i18n]');
      assert.equal(
        inner.length,
        0,
        `"${node.getAttribute('data-i18n')}" wraps ${inner.map((child) => `"${child.getAttribute('data-i18n')}"`).join(', ')}; give the wrapper its own key or drop it`
      );
    }
  }
});

test('every translated attribute names an attribute the element has', () => {
  for (const page of PAGES) {
    for (const node of documentOf(page).querySelectorAll('[data-i18n-attr]')) {
      for (const pair of node.getAttribute('data-i18n-attr').split(',')) {
        const [attribute, key] = pair.split(':').map((part) => part.trim());
        assert.ok(attribute && key, `malformed data-i18n-attr in ${path.relative(root, page.file)}: "${pair}"`);
        assert.ok(
          node.getAttribute(attribute) != null,
          `${path.relative(root, page.file)} translates "${attribute}", which the element does not carry in English`
        );
      }
    }
  }
});

/*
  `hidden` is an attribute the browser applies at the weakest possible weight, so any class rule that
  sets `display` beats it and the element stays on screen. The gallery relies on it for three blocks
  it hides from script - the grid, its status box and the submission panel - and every one of them is
  a `display: grid` class, so all three were visible while the DOM said they were hidden.
*/
test('an element the script hides is really hidden', () => {
  const css = fs.readFileSync(path.join(DOCS, 'assets', 'css', 'site.css'), 'utf8');
  const flat = css.replace(/\s+/g, ' ');
  assert.ok(
    flat.includes('[hidden] { display: none !important; }'),
    'nothing in site.css forces the hidden attribute to win over a display rule'
  );

  // The blocks that rely on it, so a page that stops shipping one is noticed rather than silently
  // losing the guarantee.
  const gallery = documentOf(PAGES[1]);
  for (const selector of ['[data-gallery]', '[data-gallery-upload]']) {
    assert.ok(gallery.querySelector(selector).hasAttribute('hidden'), `${selector} should be published hidden`);
  }
});

test('the language manifest is a list the loader can use', () => {
  const file = path.join(DOCS, 'assets', 'i18n', 'languages.json');
  const languages = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(languages));

  for (const entry of languages) {
    assert.match(entry.code, /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
    assert.notEqual(entry.code, 'en', 'English is the markup itself');
    assert.ok(entry.name);
    assert.ok(fs.existsSync(path.join(DOCS, 'assets', 'i18n', `${entry.code}.json`)), `${entry.code}.json is listed but missing`);
  }
});

test('every translation matches the keys the pages actually have', () => {
  const { allStrings, languages } = require(path.join(root, 'tools', 'site', 'extract-strings.js'));
  const keys = allStrings();
  const { list, problems } = languages();
  assert.deepEqual(problems, []);
  assert.ok(list.length > 0, 'the site ships with translations');

  for (const entry of list) {
    const translated = JSON.parse(fs.readFileSync(path.join(DOCS, 'assets', 'i18n', `${entry.code}.json`), 'utf8'));

    for (const key of Object.keys(translated)) {
      assert.ok(keys.has(key), `${entry.code}.json carries "${key}", which the pages no longer use`);
      assert.equal(typeof translated[key], 'string');
      assert.ok(translated[key].trim(), `${entry.code}.json has an empty value for "${key}"`);
    }

    // A missing key only falls back to English, so it is not a failure - but these six are complete
    // and should stay that way, since a half translated page is worse than an English one.
    const missing = [...keys.keys()].filter((key) => !translated[key]);
    assert.deepEqual(missing, [], `${entry.code}.json is missing keys; run: node tools/site/extract-strings.js`);
  }
});

// A submission is one file: the package already carries the name, description, version and tags,
// so the panel only offers the three things it cannot know - how the sender would describe it, how
// it should be found, and the name for the card - and none of them are required.
test('sending a preset asks for the file, and for three optional words about it', () => {
  const document = documentOf(PAGES[1]);
  const panel = document.querySelector('[data-gallery-upload]');
  assert.ok(panel, 'the gallery has no submission panel');

  const inputs = panel.querySelectorAll('input, textarea, select');
  const file = inputs.filter((input) => input.getAttribute('type') === 'file');
  assert.equal(file.length, 1, 'there must be exactly one file input');
  assert.match(file[0].getAttribute('accept'), /\.awpreset/);

  const typed = inputs.filter((input) => input.getAttribute('type') !== 'file');
  assert.deepEqual(
    typed.map((input) => ['data-upload-description', 'data-upload-tags', 'data-upload-credit'].find((name) => input.hasAttribute(name))).sort(),
    ['data-upload-credit', 'data-upload-description', 'data-upload-tags'],
    'the panel asks for something other than the three optional fields'
  );
  for (const input of typed) {
    assert.ok(!input.hasAttribute('required'), 'none of the three may be required');
    assert.ok(Number(input.getAttribute('maxlength')) > 0, 'a free text field needs a length limit');
  }

  // It stays out of the way until a server has answered, so the page is honest with none deployed.
  assert.ok(panel.hasAttribute('hidden'), 'the panel must start hidden');

  const gallery = fs.readFileSync(path.join(DOCS, 'assets', 'js', 'gallery.js'), 'utf8');
  // The body IS the file: no multipart, no JSON envelope. The three words ride in the query string.
  assert.match(gallery, /method: 'POST',\s*\n\s*body: file,/);
  assert.doesNotMatch(gallery, /FormData/, 'a submission is the file itself, not a form');
  assert.match(gallery, /new URLSearchParams\(\)/);
  assert.match(gallery, /api \+ kind\.api \+ \(query \? '\?' \+ query : ''\)/, 'nothing is sent when nothing was typed');
  // Drawing the popup starts a browser on the server, so the page waits far longer than usual.
  assert.match(gallery, /UPLOAD_TIMEOUT_MS = 12\d{4}/);
  // A refusal is the server's own wording, written for the person sending.
  assert.match(gallery, /data\.error \|\|/);
  assert.match(gallery, /headers\.get\('retry-after'\)/, 'a quota refusal must say when to come back');
});

test('the gallery reads a server when one is named, and the committed listing when it cannot', () => {
  const document = documentOf(PAGES[1]);
  const api = document.querySelector('[data-gallery]').getAttribute('data-gallery-api');
  assert.equal(typeof api, 'string', 'the attribute must exist, empty or not');
  if (api) assert.match(api, /^https:\/\/[^/]+$/, 'an API address is an https origin with no trailing slash');

  // Whatever it says, the file it falls back to has to be there.
  assert.ok(fs.existsSync(path.join(DOCS, 'gallery', 'index.json')));

  const gallery = fs.readFileSync(path.join(DOCS, 'assets', 'js', 'gallery.js'), 'utf8');
  assert.match(gallery, /listing\(api \+ kind\.api\)/);
  assert.match(gallery, /\.catch\(function \(\) \{[\s\S]{0,400}listing\('index\.json'\)\.then\(show\)/, 'the fallback is gone');
  // The listing already carries addresses; rebuilding them would break the moment the server moves.
  assert.match(gallery, /image\.src = entry\.preview\.file;/);
  assert.match(gallery, /download\.href = entry\.file\.path;/);
});

/*
  A submission is one file and nothing else: the package already carries the name, the description,
  the version, the tags and the version it needs, and the server draws the picture of the popup from
  the preset itself. A field asking the sender for any of that would be a second source for something
  the package already states, and the two could disagree.
*/
/*
  What the panel may ask for: the file, and the three things the package cannot know - how the
  sender would describe it, how it should be found, and the name they want on the card. Nothing
  else, and none of it required: a submission with all three left empty has to work.
*/
test('the pages declare where they are, so a link preview is not blank', () => {
  for (const page of PAGES) {
    const document = documentOf(page);
    const canonical = document.querySelector('link[rel="canonical"]').getAttribute('href');
    assert.match(canonical, /^https:\/\/shirowwww\.github\.io\/Achievement-Watcher-Next\//);

    const image = document.querySelector('meta[property="og:image"]').getAttribute('content');
    const asset = image.replace('https://shirowwww.github.io/Achievement-Watcher-Next/', '');
    assert.ok(fs.existsSync(path.join(DOCS, asset)), `the link preview image ${asset} is missing`);

    assert.ok(document.querySelector('meta[name="description"]').getAttribute('content').length > 60);
  }
});
