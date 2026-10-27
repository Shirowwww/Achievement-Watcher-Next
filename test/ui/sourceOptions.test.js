'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const htmlParser = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'node-html-parser'));

const appHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'view', 'app.html'), 'utf8');
const loaderJs = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'locale', 'loader.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'settings.js'), 'utf8');
const localeDir = path.join(__dirname, '..', '..', 'app', 'locale', 'lang');

// The rows of one Sources <ul>, in document order.
function rowsOf(list) {
  return list.childNodes
    .filter((item) => item.rawTagName === 'li')
    .map((item) => {
      const select = item.querySelector('select[id^="option_"]');
      return { key: select ? select.id.replace(/^option_/, '') : null, html: item.toString() };
    });
}

// Every Sources row, across the head list and the sections that follow it.
function sourceListItems() {
  const lists = htmlParser.parse(appHtml).querySelectorAll('ul.source-list');
  assert.ok(lists.length > 1, 'the source rows are split into sections');
  return lists.flatMap(rowsOf);
}

// Keys of the achievement_source block in the settings defaults.
function configuredSources() {
  const block = settingsJs.match(/achievement_source:\s*\{([^}]*)\}/);
  assert.ok(block, 'settings.js must declare achievement_source defaults');
  return block[1]
    .split('\n')
    .map((line) => (line.match(/^\s*(\w+)\s*:/) || [])[1])
    .filter(Boolean);
}

// Every source the scanner honours must be switchable from Settings. Seven of them (Ubisoft
// Connect, GOG Galaxy, Epic, the two Nemirtingas emulators, shadPS4, Xenia) had no row at all: they
// defaulted to on and could only be turned off by hand-editing options.ini, which is why a Ubisoft
// entry could not be hidden through the UI (issue #20).
//
// The switch does not have to be in the Sources tab: the two Steam account-library ones live in the
// Steam account card, next to the connection that makes them work. What matters is that a source
// the scan honours can be turned off somewhere on screen.
test('every achievement source has a toggle in Settings', () => {
  for (const key of configuredSources()) {
    assert.ok(appHtml.includes(`id="option_${key}"`), `achievement_source.${key} has no #option_${key} switch in app.html`);
  }
});

test('no source row exists without a matching setting', () => {
  const configured = new Set(configuredSources());
  for (const { key } of sourceListItems()) {
    assert.ok(key, 'every source row must carry an #option_<key> select');
    assert.ok(configured.has(key), `#option_${key} has no achievement_source.${key} setting`);
  }
});

// A switch outside the source lists is not collected by the sweep that reads them, so it needs
// its own read in ui/settings.js or an OK silently reverts it.
test('source switches outside the Sources tab are read back on save', () => {
  const uiJs = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'settings.js'), 'utf8');
  const inTab = new Set(sourceListItems().map((item) => item.key));
  for (const key of configuredSources()) {
    if (inTab.has(key)) continue;
    assert.match(
      uiJs,
      new RegExp(`achievement_source\\.${key}\\s*=`),
      `#option_${key} is not in a source list, so ui/settings.js must read it back by id on save`
    );
  }
});

// The Sources rows move between cards (RPCS3 to the consoles, EA Desktop to the launchers), so no
// label may depend on a row's position: one inserted or moved row used to relabel its neighbours.
test('no Sources label is bound by position', () => {
  const start = loaderJs.indexOf("$('#source-options-title')");
  assert.ok(start > 0, 'loader.js must localize the Sources tab');
  const end = loaderJs.indexOf("$('#advanced-blacklist-title')", start);
  assert.ok(end > start, 'the Sources bindings end before the hidden-games card');
  assert.doesNotMatch(loaderJs.slice(start, end), /nth-child/);
});

// Every on/off row is bound by id; each needs its help element and a description in every bundled
// locale, or it renders as an unexplained blank switch.
test('id-bound source rows have a help element and a description in every locale', () => {
  const idBound = [...loaderJs.matchAll(/#source-help-\$\{key\}[\s\S]*?/g)];
  assert.ok(idBound.length > 0, 'loader.js must bind the source rows by id');
  const keys = (loaderJs.match(/for \(const key of \[([^\]]+)\]\)/) || [])[1];
  assert.ok(keys, 'loader.js must list the id-bound source keys');
  const looped = keys.split(',').map((k) => k.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const toggles = sourceListItems()
    .filter((item) => item.html.includes('<option value="true"'))
    .map((item) => item.key);
  assert.deepStrictEqual([...looped].sort(), [...toggles].sort(), 'every on/off Sources row is in the id loop, and nothing else');
  // Epic, Steam and Xbox PC are id-bound too, but apart from the loop: they carry three states
  // rather than an on/off switch, so their options are named one by one.
  assert.match(loaderJs, /#source-help-epicOfficial/, 'loader.js must bind the Epic help text by id');
  assert.match(loaderJs, /for \(const key of \['legitSteam', 'xboxPc'\]\)/, 'loader.js must bind the Steam and Xbox PC rows by id');
  const list = [...looped, 'epicOfficial', 'legitSteam', 'xboxPc'];

  const rows = new Map(sourceListItems().map((item) => [item.key, item.html]));
  for (const key of list) {
    assert.ok(rows.has(key), `#option_${key} row is missing`);
    assert.ok(rows.get(key).includes(`id="source-help-${key}"`), `#option_${key} has no #source-help-${key} element`);
  }

  for (const file of fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'))) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    for (const key of list) {
      const description = locale.settings.source[key] && locale.settings.source[key].description;
      assert.ok(String(description || '').trim(), `${file}: settings.source.${key}.description must be translated`);
    }
  }
});

// Three rows for three single games read as clutter: one "game fixes" row (MarkerPatch's switch)
// shows, and the MadnessPatch and PC Ports rows follow it, hidden, so each scanner keeps its key.
test('one game-fix row drives MadnessPatch and PC Ports', () => {
  const rows = new Map(sourceListItems().map((item) => [item.key, item.html]));
  assert.match(rows.get('markerpatch'), /id="source-name-markerpatch"/);
  for (const key of ['madnesspatch', 'pcports']) {
    assert.match(rows.get(key), /^<li class="hasHelper" hidden>/, `#option_${key} follows the game-fix row`);
  }
  const uiJs = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'settings.js'), 'utf8');
  assert.match(uiJs, /\$\('#option_markerpatch'\)\.on\('change', function \(\) \{\s*if \(settingsReady\) \$\('#option_madnesspatch, #option_pcports'\)\.val\(\$\(this\)\.val\(\)\);/);
  for (const file of fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'))) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    assert.ok(String(locale.settings.source.markerpatch.name || '').trim(), `${file}: settings.source.markerpatch.name`);
  }
});

// settings.js reads each source list back with `.right` > select, so a row
// whose select is not a direct child of .right would be silently dropped on save.
test('every source select is a direct child of its .right container', () => {
  for (const { key, html } of sourceListItems()) {
    const right = html.slice(html.indexOf('<div class="right">'));
    const beforeSelect = right.slice(0, right.indexOf(`id="option_${key}"`));
    const openDivs = (beforeSelect.match(/<div/g) || []).length;
    const closeDivs = (beforeSelect.match(/<\/div>/g) || []).length;
    assert.strictEqual(openDivs - closeDivs, 1, `#option_${key} must sit directly inside .right, not in a nested div`);
  }
});

test('official desktop libraries are identified clearly in every locale', () => {
  const officialKeys = ['legitSteam', 'xboxPc', 'ubisoftOfficial', 'gogOfficial', 'epicOfficial', 'ea', 'psnLibrary'];
  const rows = new Map(sourceListItems().map((item) => [item.key, item.html]));

  assert.ok(appHtml.includes('id="source-official-title"'), 'the Sources tab needs an official-platform heading');
  assert.ok(appHtml.includes('id="source-official-description"'), 'the Sources tab needs an official-platform explanation');
  for (const key of officialKeys) {
    assert.ok(rows.get(key).includes('official-source'), `#option_${key} must be marked as an official source`);
    assert.ok(rows.get(key).includes('source-official-badge'), `#option_${key} must show the official-source shield`);
  }

  for (const file of fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'))) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    const summary = locale.settings.source.officialPlatforms;
    assert.ok(String(summary && summary.title || '').trim(), `${file}: settings.source.officialPlatforms.title`);
    assert.ok(String(summary && summary.description || '').trim(), `${file}: settings.source.officialPlatforms.description`);
  }
});
