'use strict';

/*
  A preset that is a few overrides on top of a bundled one.

  Nothing of the bundled preset is copied or edited: the layer names it (`base`) and carries only the
  values the user chose to change. When a popup is shown, the app loads the bundled page as it ships
  and inserts the stylesheet built here after it, so a later update of the bundled preset reaches
  every layer made from it.

  This only works for presets built on the shared preset engine, whose markup (`.ach`, `.icon`,
  `.text_wrap`, `.title`, `.detail`) a generic stylesheet can aim at. A bundled or community preset
  with its own markup is not offered: its structure is not something an overlay can reason about.
*/

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const schema = require('./presetSchema.js');
const { cssUrl } = require('./cssUrl.js');
const { PRESET_ENGINE } = require('./customPreset.js');

// The file that marks a folder as a layer, and the element the logo is drawn on.
const LAYER_FILE = 'aw-layer.json';
const LAYER_LOGO_CLASS = 'aw-layer-logo';
const CUSTOM_FONT_FAMILY = 'AW Layer Font';

// What can be overridden, as sections the user switches on or off, with the designer values each
// one reads. A section that is off leaves the bundled preset's own look untouched.
const LAYER_SECTIONS = Object.freeze({
  background: ['bgMode', 'bg', 'bg2', 'bgAngle'],
  text: ['text'],
  accent: ['accent'],
  border: ['borderWidth', 'borderColor'],
  glow: ['glow'],
  font: ['fontFamily', 'fontFile'],
  logo: ['logoImage', 'logoPosition', 'logoSize', 'logoOffset'],
});
const LAYER_SECTION_NAMES = Object.freeze(Object.keys(LAYER_SECTIONS));
const LAYER_KEYS = Object.freeze(Object.values(LAYER_SECTIONS).flat());

// The two backgrounds that make sense over somebody else's layout: a colour or a gradient.
const LAYER_BACKGROUND_MODES = ['solid', 'gradient'];

// A bundled preset can be layered only when it runs the shared engine verbatim.
function isLayerableHtml(html) {
  return typeof html === 'string' && html.includes(PRESET_ENGINE.trim());
}

// Strict parse of aw-layer.json (or of what a designer sends): unknown sections and keys are dropped.
function normalizeLayer(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = typeof source.base === 'string' ? source.base.trim().slice(0, 48) : '';
  const sections = LAYER_SECTION_NAMES.filter((name) => Array.isArray(source.sections) && source.sections.includes(name));
  const options = schema.normalizeOptions(source.options || {});
  if (!LAYER_BACKGROUND_MODES.includes(options.bgMode)) options.bgMode = 'solid';
  return { base, sections, options };
}

// Only the values of the sections that are switched on, so the file records what was changed and
// nothing else.
function layerOptions(layer) {
  const out = {};
  for (const name of layer.sections) for (const key of LAYER_SECTIONS[name]) out[key] = layer.options[key];
  return out;
}

function logoPosition(position, offset) {
  const [first, second] = String(position).split('-');
  const edge = (side) => `${side}: ${offset}px`;
  if (!second) {
    if (first === 'left' || first === 'right') return `${edge(first)}; top: 50%; transform: translateY(-50%)`;
    return `${edge(first)}; left: 50%; transform: translateX(-50%)`;
  }
  return `${edge(first)}; ${edge(second)}`;
}

/*
  The stylesheet that goes after the bundled one. `assetUrl(name)` turns a font or logo filename into
  a URL: the live popup points at the layer's own folder, the designer's preview at a data URI.
  Declarations that a bundled stylesheet writes as shorthands with several layers are `!important`,
  because a generic override has no way to out-specify every selector a preset uses.
*/
function buildLayerCss(rawLayer, { assetUrl = (name) => name } = {}) {
  const layer = normalizeLayer(rawLayer);
  const on = new Set(layer.sections);
  const v = layer.options;
  const css = [];

  if (on.has('font') && v.fontFile) {
    css.push(
      `@font-face { font-family: '${CUSTOM_FONT_FAMILY}'; src: ${cssUrl(assetUrl(v.fontFile))} format('${schema.fontFormat(v.fontFile)}'); font-display: block; }`
    );
  }
  if (on.has('font')) {
    const stack = `${v.fontFile ? `'${CUSTOM_FONT_FAMILY}', ` : ''}${schema.FONT_STACKS[v.fontFamily]}`;
    css.push(`.ach, .ach .title, .ach .detail, .ach .game, .ach .rarity, .ach .progress_label { font-family: ${stack} !important; }`);
  }
  if (on.has('accent')) css.push(`.ach { --accent: ${v.accent}; }`);
  if (on.has('text')) css.push(`.ach { --text: ${v.text}; color: ${v.text} !important; }`);
  if (on.has('background')) {
    css.push(
      v.bgMode === 'gradient'
        ? `.ach { background: linear-gradient(${v.bgAngle}deg, ${v.bg} 0%, ${v.bg2} 100%) !important; }`
        : `.ach { background: ${v.bg} !important; }`
    );
  }
  if (on.has('border')) css.push(`.ach { border: ${v.borderWidth}px solid ${v.borderColor} !important; }`);
  if (on.has('glow')) {
    css.push(
      `.ach { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45), 0 0 ${Math.round((v.glow / 100) * 22)}px color-mix(in srgb, var(--accent, ${v.accent}) 65%, transparent) !important; }`
    );
  }
  if (on.has('logo') && v.logoImage) {
    css.push(
      `.ach > .${LAYER_LOGO_CLASS} { position: absolute; z-index: -1; pointer-events: none; ${logoPosition(v.logoPosition, v.logoOffset)}; ` +
        `height: ${v.logoSize}px; aspect-ratio: 1 / 1; background: ${cssUrl(assetUrl(v.logoImage))} no-repeat center / contain; }`
    );
  }
  return css.join('\n');
}

/*
  A bundled stylesheet names its pictures and fonts relative to its own folder. The designer shows it
  inside a document with no folder behind it, so each relative url() is pointed at the real one.
  Absolute, data: and fragment references are left exactly as written.
*/
function absolutizeCssUrls(css, folderUrl) {
  const base = String(folderUrl).endsWith('/') ? String(folderUrl) : `${folderUrl}/`;
  return String(css).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, target) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(target)) return match;
    return `url('${base}${encodeURI(target)}')`;
  });
}

// Which section each designer value belongs to, for the controls that a layer can drive.
const LAYER_FIELD_SECTION = Object.freeze(
  Object.fromEntries(Object.entries(LAYER_SECTIONS).flatMap(([section, keys]) => keys.map((key) => [key, section])))
);

/*
  Reads <usersDir>/<name>/aw-layer.json against the bundled library in `baseRoot`. The base is looked
  up by name there and nowhere else; a layer naming anything else, or a preset that no longer runs
  the shared engine, is unusable (null) and the notification falls back to the default preset.
*/
function readLayerFolder(usersDir, baseRoot, name) {
  const dir = path.join(usersDir, name);
  const layer = normalizeLayer(JSON.parse(fs.readFileSync(path.join(dir, LAYER_FILE), 'utf8')));
  const baseFolder = path.join(baseRoot, layer.base);
  const baseHtml = path.join(baseFolder, 'index.html');
  if (!layer.base || path.basename(baseFolder) !== layer.base || !fs.existsSync(baseHtml)) return null;
  if (!isLayerableHtml(fs.readFileSync(baseHtml, 'utf8'))) return null;
  return { baseFolder, layer: { ...layer, dir } };
}

// True when the layer draws a logo, which needs one extra element inside the card.
function layerHasLogo(rawLayer) {
  const layer = normalizeLayer(rawLayer);
  return layer.sections.includes('logo') && Boolean(layer.options.logoImage);
}

// Adds that element as the card's first child, once. Run in the page after it has loaded.
const LAYER_LOGO_SCRIPT =
  `(function () { var card = document.querySelector('.ach'); if (!card || card.querySelector('.${LAYER_LOGO_CLASS}')) return; ` +
  `var logo = document.createElement('div'); logo.className = '${LAYER_LOGO_CLASS}'; card.insertBefore(logo, card.firstChild); })();`;

// The files a layer folder may hold, named by the layer: used to copy, and to clean up.
function layerAssets(rawLayer) {
  const layer = normalizeLayer(rawLayer);
  const on = new Set(layer.sections);
  return {
    fontFile: on.has('font') ? layer.options.fontFile : '',
    logoImage: on.has('logo') ? layer.options.logoImage : '',
  };
}

// The URL of a file inside a layer folder, for a page that lives somewhere else.
function layerAssetFileUrl(layerDir, name) {
  return pathToFileURL(path.join(layerDir, name)).href;
}

module.exports = {
  LAYER_FILE,
  LAYER_LOGO_CLASS,
  LAYER_SECTIONS,
  LAYER_SECTION_NAMES,
  LAYER_KEYS,
  LAYER_BACKGROUND_MODES,
  isLayerableHtml,
  normalizeLayer,
  layerOptions,
  buildLayerCss,
  absolutizeCssUrls,
  readLayerFolder,
  LAYER_FIELD_SECTION,
  layerHasLogo,
  LAYER_LOGO_SCRIPT,
  layerAssets,
  layerAssetFileUrl,
};
