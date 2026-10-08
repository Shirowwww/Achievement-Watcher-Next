'use strict';

// The home page states numbers, a theme list, a version and a download address. Each used to be typed
// into the markup where it was needed, and each drifted: "Thirteen" themes beside ten chips, "8 source
// families" after a ninth was added, an installer named without its version. These tests tie them to
// where the truth is - the app, the release data - so a change in one place fails here instead of
// shipping quietly.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const DOCS = path.join(root, 'docs');
const { parse } = require(path.join(root, 'app', 'node_modules', 'node-html-parser'));
const homeData = require(path.join(root, 'tools', 'site', 'home-data.js'));
const releaseData = require(path.join(root, 'tools', 'site', 'release-data.js'));
const { allStrings } = require(path.join(root, 'tools', 'site', 'extract-strings.js'));

const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
const page = parse(html);
const release = JSON.parse(fs.readFileSync(path.join(DOCS, 'data', 'release.json'), 'utf8'));

test('the theme chips and the figures are what the app says', () => {
  assert.equal(homeData.render(html), html, 'docs/index.html is out of date with the app; run node tools/site/home-data.js');

  const { BUILTIN_COLORS } = require(path.join(root, 'app', 'util', 'themeLayers.js'));
  const chips = page.querySelectorAll('[data-theme-tabs] [data-theme]').map((chip) => chip.getAttribute('data-theme'));
  assert.deepEqual([...chips].sort(), Object.keys(BUILTIN_COLORS).sort(), 'a built-in theme has no chip, or a chip has no theme');

  const figures = homeData.counts();
  for (const [name, value] of Object.entries(figures)) {
    const node = page.querySelector(`[data-count="${name}"]`);
    assert.ok(node, `the strip has no figure for ${name}`);
    assert.equal(Number(node.text), value, `the strip says ${node.text} ${name}`);
  }
  assert.equal(Number(page.querySelector('[data-count="sources"]').text), page.querySelectorAll('.source').length, 'the strip counts a different number of sources than the grid draws');
});

test('every theme has a line saying what it is, and a translation of it', () => {
  const notes = new Map(page.querySelectorAll('[data-theme-notes] [data-theme]').map((node) => [node.getAttribute('data-theme'), node.getAttribute('data-i18n')]));
  const keys = allStrings();
  for (const chip of page.querySelectorAll('[data-theme-tabs] [data-theme]')) {
    const slug = chip.getAttribute('data-theme');
    assert.ok(notes.has(slug), `no description for the "${slug}" theme`);
    assert.ok(keys.has(notes.get(slug)), `the note of "${slug}" is not a translatable string`);
  }

  // The prose no longer carries a count that the chips could disagree with.
  assert.doesNotMatch(page.querySelector('[data-i18n="homeThemes.lead"]').text, /\b(?:thirteen|twelve|ten|13|12|10)\b/i);
});

test('each picker is a tab list with a panel it controls', () => {
  for (const list of page.querySelectorAll('[role="tablist"]')) {
    const tabs = list.querySelectorAll('[role="tab"]');
    assert.ok(tabs.length > 1);
    assert.equal(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length, 1, 'exactly one tab is selected');
    assert.equal(tabs.filter((tab) => tab.getAttribute('tabindex') === '0').length, 1, 'exactly one tab is in the tab order');

    for (const tab of tabs) {
      const panel = page.querySelector(`#${tab.getAttribute('aria-controls')}`);
      assert.ok(panel, `a tab controls "${tab.getAttribute('aria-controls')}", which is not on the page`);
      assert.equal(panel.getAttribute('role'), 'tabpanel');
    }
  }
});

test('the home page says RetroAchievements where it says what it reads', () => {
  const description = page.querySelector('meta[name="description"]').getAttribute('content');
  assert.match(description, /RetroAchievements/);
  assert.match(page.querySelector('[data-i18n="hero.sub"]').text, /RetroAchievements/);
  assert.match(JSON.parse(page.querySelector('script[type="application/ld+json"]').text).description, /RetroAchievements/);
  assert.ok(page.querySelector('.source-mark[data-mark="retro"]'), 'the sources grid has no RetroAchievements tile');
});

test('the structured data names the version, the price and the author', () => {
  const application = JSON.parse(page.querySelector('script[type="application/ld+json"]').text);
  assert.equal(application.softwareVersion, release.version, 'softwareVersion is not the release in docs/data/release.json');
  assert.equal(application.offers['@type'], 'Offer');
  assert.equal(application.offers.price, '0');
  assert.ok(application.offers.priceCurrency);
  assert.equal(application.author.name, 'Shirowwww');
});

test('the download buttons lead to the installer once the release is known', () => {
  const buttons = page.querySelectorAll('[data-installer]');
  assert.ok(buttons.length >= 3, 'the hero, the header and the install section each offer the installer');
  for (const button of buttons) assert.match(button.getAttribute('href'), /github\.com\/Shirowwww\/Achievement-Watcher-Next\/releases\/latest$/, 'the fallback is the releases page');

  assert.match(release.installer, /^Achievement\.Watcher\.Setup\.\d+\.\d+\.\d+.*\.exe$/);
  assert.match(release.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(releaseData.mismatches(release), [], 'a page quotes another release than docs/data/release.json');

  // The install step names the file with its version, and the portable archive is mentioned.
  const step = page.querySelector('[data-i18n="install.step1Body"]').text;
  assert.match(step, /Achievement\.Watcher\.Setup\.<version>\.exe/);
  assert.match(step, /Portable/);
});

test('the pages declare a locale and a theme colour', () => {
  for (const file of ['index.html', path.join('gallery', 'index.html'), path.join('gallery', 'themes', 'index.html')]) {
    const document = parse(fs.readFileSync(path.join(DOCS, file), 'utf8'));
    assert.equal(document.querySelector('meta[property="og:locale"]').getAttribute('content'), 'en_US', file);
    const colours = document.querySelectorAll('meta[name="theme-color"]');
    assert.equal(colours.length, 2, `${file} needs a theme colour for light and one for dark`);
    for (const colour of colours) assert.match(colour.getAttribute('content'), /^#[0-9a-f]{6}$/i);
  }
});

test('the home page has one h1 and every image is sized', () => {
  assert.equal(page.querySelectorAll('h1').length, 1);
  for (const image of page.querySelectorAll('img')) {
    assert.ok(image.getAttribute('width') && image.getAttribute('height'), `${image.getAttribute('src')} has no width and height, so the page shifts as it loads`);
    assert.ok(fs.existsSync(path.join(DOCS, image.getAttribute('src'))), `${image.getAttribute('src')} is not there`);
  }
});

test('each feature tile is one link, to a section that exists', () => {
  const tiles = page.querySelectorAll('.tile');
  assert.ok(tiles.length >= 8, 'the grid lost a tile');

  for (const tile of tiles) {
    const links = tile.querySelectorAll('a');
    assert.equal(links.length, 1, 'a tile has more than one link, or none');
    assert.equal(tile.querySelector('img').getAttribute('alt'), '', 'the picture is described by the heading beside it');

    const [file, anchor] = links[0].getAttribute('href').split('#');
    const target = path.join(DOCS, file.replace(/\.html$/, '.md'));
    assert.ok(fs.existsSync(target), `${file} is not a guide`);
    if (anchor) {
      const heading = fs
        .readFileSync(target, 'utf8')
        .split('\n')
        .filter((line) => /^#{1,4} /.test(line))
        .map((line) => line.replace(/^#+ /, '').toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ +/g, '-'));
      assert.ok(heading.includes(anchor), `${file} has no heading for #${anchor}`);
    }
  }
});
