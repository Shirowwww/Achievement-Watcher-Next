'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const htmlParser = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'node-html-parser'));

/*
  Saving Settings reads the form by container (ui/settings.js, #btn-settings-save): a select under
  `#<container> .right` is stored under the config section that goes with the container. Moving a
  row into a section that the save handler does not sweep would make its value silently revert, so
  the container lists and the markup are pinned together here.
*/

const appDir = path.join(__dirname, '..', '..', 'app');
const containers = require(path.join(appDir, 'util', 'settingsContainers.js'));
const root = htmlParser.parse(fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8'));
const settingsJs = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');

function ancestorIds(node) {
  const ids = [];
  for (let el = node.parentNode; el; el = el.parentNode) {
    const id = el.getAttribute && el.getAttribute('id');
    if (id) ids.push(id);
  }
  return ids;
}

// Value selects of one tab, with the container ids above them and whether they sit directly in .right.
function selectsOf(view) {
  const tab = root.querySelector(`#settings section.content[data-view="${view}"]`);
  return tab.querySelectorAll('select[id^="option_"]').map((select) => ({
    id: select.getAttribute('id'),
    containers: ancestorIds(select),
    inRight: select.parentNode.classList.contains('right'),
  }));
}

test('every container the save handler sweeps exists in the markup', () => {
  for (const id of [...containers.GENERAL, ...containers.SOURCE]) {
    assert.ok(root.querySelector(`#${id}`), `#${id} is listed in util/settingsContainers.js but not in app.html`);
  }
});

test('the save handler sweeps the General and Sources containers through the shared lists', () => {
  assert.match(settingsJs, /rightsOf\(settingsContainers\.GENERAL\)/);
  assert.match(settingsJs, /rightsOf\(settingsContainers\.SOURCE\)/);
});

test('every General select sits in a swept container, directly under .right', () => {
  const rows = selectsOf('general');
  // Five rows left the count when the rarity thresholds became sliders.
  assert.ok(rows.length >= 12, `expected the General selects, saw ${rows.length}`);
  for (const row of rows) {
    assert.ok(containers.GENERAL.some((id) => row.containers.includes(id)), `${row.id} is outside every General container, so Save would not read it`);
    assert.ok(row.inRight, `${row.id} must be a direct child of .right`);
  }
});

test('every Sources select sits in a swept source list, directly under .right', () => {
  const rows = selectsOf('source').filter((row) => row.containers.some((id) => id.startsWith('options-source')));
  assert.ok(rows.length >= 20, `expected every source switch, saw ${rows.length}`);
  for (const row of rows) {
    assert.ok(containers.SOURCE.some((id) => row.containers.includes(id)), `${row.id} is outside every source list`);
    assert.ok(row.inRight, `${row.id} must be a direct child of .right`);
  }
});

// Rows that moved out of #options-ui / #options-source into their own section. Each one must still be
// written back under the same config key, and the sweep derives that key from the id alone.
const MOVED_GENERAL = {
  // The five rarity thresholds are sliders since the selects' fixed steps were replaced: see below.
  'options-ui-trophies': ['option_showTrophies', 'option_rarityMode'],
  'options-ui-app': ['option_startWithWindows', 'option_closeToTray', 'option_uninstallContextMenu', 'option_autoUpdate', 'option_disableHardwareAccel'],
};
// Emulators and fixes share the first card; EA Desktop and PlayStation Network sit with the official
// launchers, RPCS3 with the consoles.
const MOVED_SOURCE = {
  'options-source': ['option_steamEmu', 'option_greenLuma', 'option_lumaPlay', 'option_runeUplay', 'option_gog', 'option_epic', 'option_xlln', 'option_socialClub', 'option_markerpatch', 'option_madnesspatch', 'option_pcports', 'option_importCache'],
  'options-source-stores': ['option_legitSteam', 'option_ubisoftOfficial', 'option_gogOfficial', 'option_epicOfficial', 'option_ea', 'option_xboxPc', 'option_psnLibrary'],
  'options-source-consoles': ['option_rpcs3', 'option_shadps4', 'option_kytyps5', 'option_ps4recomp', 'option_xenia', 'option_retroAchievements'],
};

test('moved rows live in the section the test expects', () => {
  for (const [container, ids] of Object.entries({ ...MOVED_GENERAL, ...MOVED_SOURCE })) {
    const found = root
      .querySelector(`#${container}`)
      .querySelectorAll('select[id^="option_"]')
      .map((select) => select.getAttribute('id'));
    assert.deepEqual(found, ids, `${container} holds a different set of rows`);
  }
});

test('the rarity threshold sliders are read back explicitly, under their config keys', () => {
  const ids = ['option_rareGoldMax', 'option_rareSilverMax', 'option_rareMax', 'option_trophyGoldBelow', 'option_trophySilverBelow'];
  const found = root.querySelector('#options-ui-trophies').querySelectorAll('input[type="range"]').map((input) => input.getAttribute('id'));
  assert.deepEqual(found, ids, 'one slider per threshold, in the Trophies section');
  assert.match(settingsJs, /Object\.assign\(app\.config\.achievement, readRaritySliders\(\)\)/, 'the save handler reads the sliders, the select sweep cannot');
});

test('General selects the sweep skips are saved explicitly by id', () => {
  // The sweep stores everything else under `achievement`; these four belong to `general`.
  for (const id of MOVED_GENERAL['options-ui-app']) {
    assert.match(settingsJs, new RegExp(`\\$\\('#${id}'\\)\\.val\\(\\)`), `${id} needs its own read in the save handler`);
    assert.match(settingsJs, new RegExp(`\\[0\\]\\.id === '${id}'`), `${id} must be skipped by the achievement sweep`);
  }
});

test('the General head list keeps the seven rows the loader binds by nth-child', () => {
  const head = root.querySelector('#options-ui');
  const rows = head.querySelectorAll('li');
  const ids = rows.map((li) => (li.querySelector('select') || li.querySelector('#hotkey') || {}).getAttribute?.('id'));
  assert.deepEqual(ids.slice(0, 7), ['option_lang', 'option_libraryLayout', 'option_showHidden', 'option_mergeDuplicate', 'option_timeMergeRecentFirst', 'option_hideZero', 'hotkey']);
  // Rows after them are bound by the id of their control, so they must have one.
  assert.deepEqual(ids.slice(7), ['option_localizedGameTitles']);
});
