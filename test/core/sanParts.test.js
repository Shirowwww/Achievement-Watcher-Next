'use strict';

/*
  The elements of an imported SAN card a designer moves or hides by hand (`awparts`): what a theme
  keeps of them, that every base card has the elements they name, and how the engine draws them.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const sanTheme = require(path.join(appRoot, 'util', 'sanTheme.js'));
const engine = require(path.join(appRoot, 'util', 'sanEngine', 'engine.js'));

const LAYOUTS = path.join(appRoot, 'util', 'sanEngine', 'layouts');

test('a look keeps the elements moved or hidden, capped, and nothing else', () => {
  const { customisation, report } = sanTheme.cleanCustomisation({
    awparts: {
      title: { x: 12.4, y: -9000, hidden: 'yes' },
      icon: { hidden: true },
      desc: { x: 0, y: 0, hidden: false },
      bg: { x: 5 },
      __proto__: { x: 1 },
    },
  });
  assert.deepEqual(customisation.awparts, { title: { x: 12, y: -600 }, icon: { hidden: true } });
  assert.deepEqual(report.unknown, [], 'an AW Next setting is no unknown SAN one');
  assert.equal(sanTheme.cleanCustomisation({ awparts: 'move it' }).customisation.awparts, undefined);
});

test('every base card has the elements a hand can move, so a moved title moves on all of them', () => {
  const layouts = fs.readdirSync(LAYOUTS).filter((file) => file.endsWith('.html'));
  assert.equal(layouts.length, engine.LAYOUT_IDS.length);
  for (const file of layouts) {
    const ids = new Set([...fs.readFileSync(path.join(LAYOUTS, file), 'utf8').matchAll(/id="([a-z0-9]+)"/g)].map((match) => match[1]));
    for (const part of ['unlockmsg', 'title', 'desc', 'icon']) {
      assert.ok(engine.PART_ELEMENTS[part].some((id) => ids.has(id)), `${file} has no element for ${part}`);
    }
  }
});

test('the engine shifts a moved element through translate and hides a hidden one, both halves of a card', () => {
  const element = () => ({ style: {} });
  const titles = [element(), element()];
  const icon = element();
  const doc = { querySelectorAll: (selector) => ({ '#title': titles, '#achiconwrapper': [icon] })[selector] || [] };
  engine.placeParts(doc, { title: { x: 10, y: -4 }, icon: { hidden: true }, logo: { x: 3 } });
  assert.deepEqual(titles.map((one) => one.style.translate), ['10px -4px', '10px -4px']);
  assert.equal(icon.style.visibility, 'hidden');
  assert.equal(icon.style.translate, undefined, 'a hidden element that was not moved keeps its place');
});
