'use strict';

/*
  The numbers and the theme list the home page states, read from the app instead of typed in.

  The page said "Thirteen" themes beside ten chips and "8 source families" after a ninth was added,
  because each figure was written by hand where it was needed. Now the app is the source:

    - the theme chips, with their palettes and names, come from BUILTIN_COLORS in
      app/util/themeLayers.js and the picker lists in app/ui/settings.js;
    - the figures in the strip come from the locale files, the bundled presets, the built-in themes
      and the source tiles on the page itself.

    node tools/site/home-data.js           rewrite docs/index.html
    node tools/site/home-data.js --check   fail when it is out of date
*/

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const PAGE = path.join(root, 'docs', 'index.html');
const THEME_LAYERS = path.join(root, 'app', 'util', 'themeLayers.js');
const SETTINGS = path.join(root, 'app', 'ui', 'settings.js');
const LOCALES = path.join(root, 'app', 'locale', 'lang');
const PRESETS = path.join(root, 'app', 'presets', 'Default Presets');

const CHIPS_START = '<!-- generated:theme-chips (node tools/site/home-data.js) -->';
const CHIPS_END = '<!-- /generated:theme-chips -->';

// The order the palette is written in on a chip, and the one assets/js/site.js reads it in.
const SLOTS = ['bg', 'header', 'panel', 'card', 'text', 'muted', 'border', 'accent'];

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The picker lists in the settings window, in the order the app shows them: [value, label] pairs.
function themeNames() {
  const source = fs.readFileSync(SETTINGS, 'utf8');
  const names = new Map();
  for (const list of ['PRIMARY_THEMES', 'MORE_THEMES']) {
    const block = new RegExp(`const ${list} = \\[([\\s\\S]*?)\\n\\];`).exec(source);
    if (!block) throw new Error(`${list} is not in app/ui/settings.js any more`);
    for (const pair of block[1].matchAll(/\[\s*'([a-z0-9]+)'\s*,\s*(?:'([^']*)'|"([^"]*)")\s*\]/g)) {
      names.set(pair[1], pair[2] !== undefined ? pair[2] : pair[3]);
    }
  }
  return names;
}

function themes() {
  const { BUILTIN_COLORS } = require(THEME_LAYERS);
  const names = themeNames();
  const list = [...names.keys()].map((key) => ({
    key,
    name: names.get(key),
    colors: SLOTS.map((slot) => {
      const value = (BUILTIN_COLORS[key] || {})[slot];
      if (!/^#[0-9a-f]{6}$/i.test(value || '')) throw new Error(`theme ${key} has no usable ${slot} colour`);
      return value.toLowerCase();
    }),
  }));
  for (const key of Object.keys(BUILTIN_COLORS)) {
    if (!names.has(key)) throw new Error(`theme ${key} is built in but is not in the settings picker lists`);
  }
  return list;
}

function counts() {
  return {
    themes: themes().length,
    languages: fs.readdirSync(LOCALES).filter((name) => name.endsWith('.json')).length,
    presets: fs.readdirSync(PRESETS, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length,
  };
}

function chipsHtml(list, indent) {
  const pad = ' '.repeat(indent);
  return list
    .map((theme, index) => {
      const first = index === 0;
      return (
        `${pad}<button class="chip" type="button" role="tab" aria-selected="${first}" tabindex="${first ? 0 : -1}" ` +
        `aria-controls="theme-panel" data-theme="${escapeHtml(theme.key)}" data-colors="${theme.colors.join(',')}">${escapeHtml(theme.name)}</button>`
      );
    })
    .join('\n');
}

// What the page should say. Returns the new text, or throws when a marker is missing.
function render(html) {
  const list = themes();
  const start = html.indexOf(CHIPS_START);
  const end = html.indexOf(CHIPS_END);
  if (start < 0 || end < start) throw new Error('docs/index.html has lost the theme chip markers');

  const indent = /([ \t]*)$/.exec(html.slice(0, start))[1].length;
  let next = `${html.slice(0, start)}${CHIPS_START}\n${chipsHtml(list, indent)}\n${' '.repeat(indent)}${CHIPS_END}${html.slice(end + CHIPS_END.length)}`;

  const figures = counts();
  next = next.replace(/(<b data-count="(languages|presets|themes)">)\d+(<\/b>)/g, (whole, open, name, close) => `${open}${figures[name]}${close}`);
  // The sources are the tiles drawn in the grid, so that figure is whatever the page shows.
  const tiles = (next.match(/<div class="source">/g) || []).length;
  next = next.replace(/(<b data-count="sources">)\d+(<\/b>)/, `$1${tiles}$2`);
  return next;
}

function run({ check = false } = {}) {
  const html = fs.readFileSync(PAGE, 'utf8');
  const next = render(html);
  if (check) {
    if (next !== html) {
      console.error('docs/index.html is out of date with the app. Run: node tools/site/home-data.js');
      process.exitCode = 1;
      return false;
    }
    console.log(`home data: current (${themes().length} themes)`);
    return true;
  }
  if (next !== html) fs.writeFileSync(PAGE, next, 'utf8');
  console.log(`home data: ${next !== html ? 'rewritten' : 'already current'} (${themes().length} themes)`);
  return true;
}

if (require.main === module) run({ check: process.argv.includes('--check') });

module.exports = { CHIPS_END, CHIPS_START, counts, render, run, themes };
