'use strict';

/*
  Builds the files of a preset that draws an imported SAN theme. The preset is an ordinary one that
  runs engine.js + host.js over the theme kept whole in a JSON block of index.html; that block is the
  only source of truth, so generated files are rebuilt from it when ENGINE_VERSION changes.
*/

const fs = require('fs');
const path = require('path');
const engine = require('./engine.js');
const sanTheme = require('../sanTheme.js');
const { PRESET_PACKAGE_FILE } = require('../customPreset.js');
const { normalizeOptions } = require('../presetSchema.js');

// Raised whenever a change here, in engine.js, host.js, base.css or a layout must reach presets
// that are already installed.
const ENGINE_VERSION = 3;

const THEME_BLOCK_ID = 'aw-san-theme';
const ENGINE_META = 'aw-san-engine';
const FONTS_DIR = 'fonts';

function read(relative) {
  return fs.readFileSync(path.join(__dirname, relative), 'utf8');
}

function readOptional(relative) {
  try {
    return read(relative);
  } catch {
    return '';
  }
}

// The base cards a theme draws with, one per state it carries.
function layoutsOf(theme) {
  const types = (theme && theme.types) || {};
  const ids = new Set();
  for (const type of engine.TYPES) if (types[type]) ids.add(engine.layoutOf(types[type].preset));
  if (!ids.size) ids.add(engine.layoutOf(''));
  return [...ids];
}

// The window must hold the largest card among the states, each at the scale its state gives it.
function windowSize(theme) {
  const types = (theme && theme.types) || {};
  const states = engine.TYPES.map((type) => types[type]).filter(Boolean);
  let width = 0;
  let height = 0;
  for (const customisation of states.length ? states : [{}]) {
    const layout = engine.LAYOUTS[engine.layoutOf(customisation.preset)];
    const scale = engine.scaleOf(customisation);
    width = Math.max(width, Math.ceil(layout.width * scale));
    height = Math.max(height, Math.ceil(layout.height * scale));
  }
  return { width, height };
}

// JSON that can sit inside a <script> element without ever closing it (the block is parsed, never
// run, so only `<` matters).
function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// fonts.css as family -> file, one @font-face per line.
function fontTable() {
  const table = [];
  for (const line of read('fonts.css').split('\n')) {
    const match = /^@font-face \{ font-family: "([^"]+)"; src: url\("fonts\/([^"]+)\.woff2"\)/.exec(line);
    if (match) table.push({ family: match[1], file: match[2], rule: line });
  }
  return table;
}

// The bundled faces a stylesheet names, so a preset only carries the fonts its cards draw with.
function fontsUsedBy(css) {
  return fontTable().filter((face) => css.includes(`"${face.family}"`));
}

/*
  Every generated file of the preset, as relative path -> text, plus the bundled font files it
  needs (`fonts`: absolute source path -> relative destination). `name` is the preset's own name.
*/
function buildPresetFiles(theme, { name = '' } = {}) {
  const layouts = layoutsOf(theme);
  const size = windowSize(theme);
  const base = read('base.css');
  const layoutCss = {};
  for (const id of layouts) layoutCss[id] = readOptional(`layouts/${id}.css`);
  const faces = fontsUsedBy([base, ...Object.values(layoutCss)].join('\n'));
  const longest = Math.max(...engine.TYPES.map((type) => Number(theme.types && theme.types[type] && theme.types[type].displaytime) || 0), 10);

  const templates = layouts
    .map((id) => `<template id="aw-san-layout-${id}">\n${readOptional(`layouts/${id}.html`).trim()}\n</template>`)
    .join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    '<meta charset="UTF-8" />',
    `<meta width="${size.width}" height="${size.height}" />`,
    `<meta name="duration" content="${Math.round(longest * 1000 + 1500)}" />`,
    `<meta name="${ENGINE_META}" content="${ENGINE_VERSION}" />`,
    `<title>${escapeHtml(name || theme.label || 'Steam Achievement Notifier theme')}</title>`,
    '<link rel="stylesheet" href="style.css" />',
    '</head><body>',
    templates,
    `<script type="application/json" id="${THEME_BLOCK_ID}">${scriptJson(theme)}</script>`,
    `<script>\n${read('engine.js').trim()}\n</script>`,
    `<script>\n${read('host.js').trim()}\n</script>`,
    '</body></html>',
    '',
  ].join('\n');

  const files = {
    'index.html': html,
    'style.css': `${faces.map((face) => face.rule).join('\n')}\n${base}`,
  };
  for (const id of layouts) files[`layout-${id}.css`] = layoutCss[id];

  const fonts = {};
  for (const face of faces) fonts[path.join(__dirname, FONTS_DIR, `${face.file}.woff2`)] = `${FONTS_DIR}/${face.file}.woff2`;
  return { files, fonts, layouts, size };
}

// The theme kept in a preset's index.html, or null when the page is not one of these.
function readEmbeddedTheme(html) {
  const match = new RegExp(`<script type="application/json" id="${THEME_BLOCK_ID}">([\\s\\S]*?)</script>`).exec(String(html || ''));
  if (!match) return null;
  try {
    const theme = JSON.parse(match[1]);
    return theme && typeof theme === 'object' && theme.types && typeof theme.types === 'object' ? theme : null;
  } catch {
    return null;
  }
}

function engineVersionOf(html) {
  const match = new RegExp(`<meta name="${ENGINE_META}" content="(\\d+)"`).exec(String(html || ''));
  return match ? Number(match[1]) : 0;
}

/*
  Writes (or rewrites) the generated files of a preset folder from its theme. The theme's own
  pictures, fonts and the JSON block are the data; everything written here can be regenerated.
*/
function writePresetFiles(dir, theme, { name = '' } = {}) {
  const built = buildPresetFiles(theme, { name });
  for (const file of fs.readdirSync(dir)) {
    if (/^layout-[a-z0-9]+\.css$/.test(file) && !Object.prototype.hasOwnProperty.call(built.files, file)) fs.rmSync(path.join(dir, file), { force: true });
  }
  for (const [relative, content] of Object.entries(built.files)) fs.writeFileSync(path.join(dir, relative), content, 'utf8');
  fs.mkdirSync(path.join(dir, FONTS_DIR), { recursive: true });
  for (const [source, relative] of Object.entries(built.fonts)) {
    const target = path.join(dir, relative);
    // Read then written rather than copied: in a packaged build the source sits inside app.asar.
    if (!fs.existsSync(target)) fs.writeFileSync(target, fs.readFileSync(source));
  }
  return built;
}

/*
  Brings one installed preset up to this engine, when it is one of ours and was built by an older
  one. Answers whether anything was rewritten; never throws for a folder that is not a SAN preset.
*/
function refreshPreset(dir) {
  let html;
  try {
    html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  } catch {
    return false;
  }
  if (!html.includes(`name="${ENGINE_META}"`)) return false;
  if (engineVersionOf(html) === ENGINE_VERSION) return false;
  const theme = readEmbeddedTheme(html);
  if (!theme) return false;
  writePresetFiles(dir, cleanEmbeddedTheme(dir, theme), { name: path.basename(dir) });
  return true;
}

/*
  The block may have come from a shared .awpreset rather than from an import, so it is cleaned the
  same way before it is drawn: every file it names must be one of the preset's own assets.
*/
function cleanEmbeddedTheme(dir, theme) {
  const resolveAsset = (kind, value) => {
    const match = /^assets\/([^/\\]+)$/.exec(String(value || ''));
    return match && sanTheme.assetAccepts(kind, match[1]) && fs.existsSync(path.join(dir, 'assets', match[1])) ? match[0] : '';
  };
  const types = {};
  for (const type of engine.TYPES) {
    if (theme.types[type]) types[type] = sanTheme.cleanCustomisation(theme.types[type], { resolveAsset }).customisation;
  }
  if (!types.main) types.main = types[Object.keys(types)[0]] || {};
  const thresholds = theme.thresholds || {};
  const cutOff = (value, fallback) => (Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : fallback);
  return {
    label: String(theme.label || '').slice(0, 80),
    sanVersion: String(theme.sanVersion || '').slice(0, 32),
    thresholds: { rarity: cutOff(thresholds.rarity, 10), semirarity: cutOff(thresholds.semirarity, 25) },
    showpercent: ['off', 'rareonly', 'all'].includes(theme.showpercent) ? theme.showpercent : 'rareonly',
    notify1line: theme.notify1line === true,
    types,
  };
}

/*
  The sound an imported SAN preset plays for one notification: each of SAN's four states can bring
  its own file, or a folder SAN picks from at random. null means "not a SAN preset" (the caller asks
  the ordinary preset rules); '' means the theme has no sound of its own. The state is the one the
  page paints: from AW Next's rarity tier, or the theme's cut-offs when no tier is given.
*/
function presetSound(dir, { notificationType = '', rarityTier, rarityMode = '', unlockRate = null, random = Math.random } = {}) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, PRESET_PACKAGE_FILE), 'utf8'));
  } catch {
    return null;
  }
  const sounds = manifest && manifest.sanSounds;
  if (!sounds || typeof sounds !== 'object') return null;
  const platinum = String(notificationType || '').toLowerCase() === 'platinum';
  const type = engine.stateOf({ tier: rarityTier, mode: rarityMode, platinum, percent: unlockRate, thresholds: manifest.sanThresholds });
  const entry = sounds[type] || sounds.main;
  const files = (entry && Array.isArray(entry.files) ? entry.files : []).map((name) => normalizeOptions({ sound: name }).sound).filter(Boolean);
  if (!files.length) return '';
  return files[Math.min(files.length - 1, Math.floor(random() * files.length))];
}

function isSanPreset(dir) {
  try {
    return fs.readFileSync(path.join(dir, 'index.html'), 'utf8').includes(`name="${ENGINE_META}"`);
  } catch {
    return false;
  }
}

module.exports = {
  ENGINE_VERSION,
  layoutsOf,
  buildPresetFiles,
  writePresetFiles,
  readEmbeddedTheme,
  engineVersionOf,
  refreshPreset,
  isSanPreset,
  presetSound,
};
