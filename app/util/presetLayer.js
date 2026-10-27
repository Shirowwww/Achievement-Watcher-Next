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
const {
  PRESET_ENGINE,
  PRESET_OPTIONS_FILE,
  PRESET_PACKAGE_FILE,
  CANVAS_MAX_ROOM,
  CANVAS_DECOR_SELECTORS,
  canvasCss,
  canvasOverhang,
  canvasScript,
} = require('./customPreset.js');

// The file that marks a folder as a layer, and the element the logo is drawn on.
const LAYER_FILE = 'aw-layer.json';
const LAYER_LOGO_CLASS = 'aw-layer-logo';
const CUSTOM_FONT_FAMILY = 'AW Layer Font';
const MIN_CARD_PX = 40;
const MAX_CARD_PX = 2000;

// What can be overridden, as sections the user switches on or off, with the designer values each
// one reads. A section that is off leaves the bundled preset's own look untouched.
const LAYER_SECTIONS = Object.freeze({
  background: ['bgMode', 'bg', 'bg2', 'bgAngle'],
  text: ['text'],
  accent: ['accent'],
  // The custom presets' accent bar, drawn over a bundled card as one coloured edge.
  bar: ['accentBar', 'accentBarSize'],
  border: ['borderWidth', 'borderColor'],
  glow: ['glow'],
  font: ['fontFamily', 'fontFile'],
  // Ticked = the bundled preset's own brand mark is removed. It has no value of its own to store.
  brand: [],
  logo: ['logoImage', 'logoPosition', 'logoSize', 'logoOffset'],
  // The free layout: the bundled card's parts moved, and items added over it.
  canvas: ['canvas'],
});
const LAYER_SECTION_NAMES = Object.freeze(Object.keys(LAYER_SECTIONS));

// The two backgrounds that make sense over somebody else's layout: a colour or a gradient.
const LAYER_BACKGROUND_MODES = ['solid', 'gradient'];

// A bundled preset can be layered only when it runs the shared engine verbatim.
function isLayerableHtml(html) {
  return typeof html === 'string' && html.includes(PRESET_ENGINE.trim());
}

// The brand section works only on a stylesheet whose mark fades through --mark-opacity.
function hasBrandMark(css) {
  return typeof css === 'string' && /var\(\s*--mark-opacity(?![\w-])/.test(css);
}

/*
  Which of the card's pseudo-elements draws that mark ('after' or 'before'), or '' when none does.
  The other one joins it ('after,before') when its rule says `--follows-mark`, as PlayStation's ring.
*/
function brandMarkPseudo(css) {
  const found = typeof css === 'string' && /\.ach::(after|before)\s*\{[^}]*var\(\s*--mark-opacity(?![\w-])/.exec(css);
  if (!found) return '';
  const other = found[1] === 'after' ? 'before' : 'after';
  return new RegExp(`\\.ach::${other}\\s*\\{[^}]*--follows-mark\\s*:`).test(css) ? `${found[1]},${other}` : found[1];
}

/*
  The colour variable a base's title reads when it is not --text, which the text section always
  sets: Ticket inks its type with --ink. '' for --text, for the accent (Arcade's title, on purpose)
  and for a literal colour.
*/
function titleInkVar(css) {
  const rule = typeof css === 'string' && /(?:^|[},])\s*\.ach \.title\s*\{([^}]*)\}/m.exec(css);
  const ink = rule && /(?:^|[;{\s])color\s*:\s*var\(\s*(--[\w-]+)\s*[,)]/.exec(rule[1]);
  return ink && ink[1] !== '--text' && ink[1] !== '--accent' ? ink[1] : '';
}

/*
  Whether a decoration of the bundled card paints with the accent, in any state: only then does a
  colour of its own change it. A rule counts by its selectors, with the state classes taken off.
*/
function decorUsesAccent(css, part) {
  const wanted = CANVAS_DECOR_SELECTORS[part];
  if (!wanted || typeof css !== 'string') return false;
  const bare = (selector) => selector.trim().replace(/\.(ach|icon)(?:[.:][\w-]+(?:\([^)]*\))?)*?(?=::|\s|$)/g, '.$1');
  for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/var\(\s*--accent\s*[,)]/.test(body) && selectors.split(',').some((one) => bare(one) === wanted)) return true;
  }
  return false;
}

// Strict parse of aw-layer.json (or of what a designer sends): unknown sections and keys are dropped.
function normalizeLayer(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = typeof source.base === 'string' ? source.base.trim().slice(0, 48) : '';
  const sections = LAYER_SECTION_NAMES.filter((name) => Array.isArray(source.sections) && source.sections.includes(name));
  const options = schema.normalizeOptions(source.options || {});
  if (!LAYER_BACKGROUND_MODES.includes(options.bgMode)) options.bgMode = 'solid';
  return { base, sections, options, card: normalizeCardSize(source.card) };
}

// The bundled card's size as the designer measured it, or null for a layer saved without it.
function normalizeCardSize(raw) {
  const size = (value) => (Number.isFinite(value) && value >= MIN_CARD_PX && value <= MAX_CARD_PX ? Math.round(value) : null);
  const width = size(raw && raw.width);
  const height = size(raw && raw.height);
  return width && height ? { width, height } : null;
}

/*
  The bundled window, grown evenly so items reaching past the card are drawn: the bundled card stays
  centred in it. Only the designer can measure that card, so a layer saved without it keeps the box.
*/
function layerBoxSize(rawLayer, box) {
  const layer = normalizeLayer(rawLayer);
  if (!layer.card || !layer.sections.includes('canvas')) return box;
  const room = canvasOverhang(layer.options.canvas, layer.card);
  const grow = (reach, outer, inner) => 2 * Math.max(0, Math.ceil(Math.min(CANVAS_MAX_ROOM, reach) - (outer - inner) / 2));
  return {
    width: box.width + grow(Math.max(room.left, room.right), box.width, layer.card.width),
    height: box.height + grow(Math.max(room.top, room.bottom), box.height, layer.card.height),
  };
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
function buildLayerCss(rawLayer, { assetUrl = (name) => name, markPseudo, textVar = '', editing = false, entrances = !editing, tokenNames = null } = {}) {
  const layer = normalizeLayer(rawLayer);
  const on = new Set(layer.sections);
  const v = layer.options;
  const css = [];
  const ink = /^--[\w-]+$/.test(textVar) ? ` ${textVar}: ${v.text};` : '';

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
  if (on.has('text')) css.push(`.ach { --text: ${v.text};${ink} color: ${v.text} !important; }`);
  if (on.has('background')) {
    css.push(
      v.bgMode === 'gradient'
        ? `.ach { background: linear-gradient(${v.bgAngle}deg, ${v.bg} 0%, ${v.bg2} 100%) !important; }`
        : `.ach { background: ${v.bg} !important; }`
    );
  }
  if (on.has('border')) css.push(`.ach { border: ${v.borderWidth}px solid ${v.borderColor} !important; }`);
  // After the border, so the bar wins its edge, as on a custom preset.
  if (on.has('bar') && v.accentBar !== 'none') {
    const edge = v.accentBar === 'outline' ? 'border' : `border-${v.accentBar}`;
    css.push(`.ach { ${edge}: ${v.accentBarSize}px solid var(--accent, ${v.accent}) !important; }`);
  }
  if (on.has('glow')) {
    css.push(
      `.ach { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45), 0 0 ${Math.round((v.glow / 100) * 22)}px color-mix(in srgb, var(--accent, ${v.accent}) 65%, transparent) !important; }`
    );
  }
  // `--mark-opacity` is what the bundled presets' brand marks read, in every state and animation.
  if (on.has('brand')) css.push('.ach { --mark-opacity: 0 !important; }');
  if (on.has('logo') && v.logoImage) {
    css.push(
      `.ach > .${LAYER_LOGO_CLASS} { position: absolute; z-index: -1; pointer-events: none; ${logoPosition(v.logoPosition, v.logoOffset)}; ` +
        `height: ${v.logoSize}px; aspect-ratio: 1 / 1; background: ${cssUrl(assetUrl(v.logoImage))} no-repeat center / contain; }`
    );
  }
  if (on.has('canvas')) {
    const free = canvasCss(v.canvas, { assetUrl, markPseudo, editing, entrances, tokenNames });
    if (free) css.push(free);
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
function isLayerableFolder(folder) {
  try {
    return isLayerableHtml(fs.readFileSync(path.join(folder, 'index.html'), 'utf8'));
  } catch {
    return false;
  }
}

// Installed from a package (the gallery) with no designer options behind it, and the shared card.
// A preset made in the designer is edited as it is, so it is never a base.
const isInstalledBase = (folder) =>
  fs.existsSync(path.join(folder, PRESET_PACKAGE_FILE)) && !fs.existsSync(path.join(folder, PRESET_OPTIONS_FILE)) && isLayerableFolder(folder);

/*
  Where the base a layer names lives: an installed preset first, as the popup's own lookup finds it
  first, then the bundled one. Null for a name that is neither, or that is not a plain folder name.
*/
function layerBaseFolder(usersDir, baseRoot, name) {
  const base = String(name || '');
  if (!base || path.basename(base) !== base || base.startsWith('.')) return null;
  if (isInstalledBase(path.join(usersDir, base))) return path.join(usersDir, base);
  return isLayerableFolder(path.join(baseRoot, base)) ? path.join(baseRoot, base) : null;
}

// Every preset a layer can be made over, by name.
function layerBaseNames(usersDir, baseRoot) {
  const names = (root) => {
    try {
      return fs.readdirSync(root);
    } catch {
      return [];
    }
  };
  const all = new Set([...names(usersDir), ...names(baseRoot)]);
  return [...all].filter((name) => layerBaseFolder(usersDir, baseRoot, name)).sort((a, b) => a.localeCompare(b));
}

function readLayerFolder(usersDir, baseRoot, name) {
  const dir = path.join(usersDir, name);
  const layer = normalizeLayer(JSON.parse(fs.readFileSync(path.join(dir, LAYER_FILE), 'utf8')));
  const baseFolder = layerBaseFolder(usersDir, baseRoot, layer.base);
  if (!baseFolder) return null;
  const baseCss = path.join(baseFolder, 'style.css');
  const css = fs.existsSync(baseCss) ? fs.readFileSync(baseCss, 'utf8') : '';
  return { baseFolder, layer: { ...layer, dir, markPseudo: brandMarkPseudo(css), textVar: titleInkVar(css) } };
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

// The script that puts the layer's added items into the bundled page, or '' when it has none.
function layerCanvasScript(rawLayer) {
  const layer = normalizeLayer(rawLayer);
  if (!layer.sections.includes('canvas') || !layer.options.canvas.items.length) return '';
  return canvasScript(layer.options.canvas);
}

// The files a layer folder may hold, named by the layer: used to copy, and to clean up.
function layerAssets(rawLayer) {
  const layer = normalizeLayer(rawLayer);
  const on = new Set(layer.sections);
  return {
    fontFile: on.has('font') ? layer.options.fontFile : '',
    logoImage: on.has('logo') ? layer.options.logoImage : '',
    canvasImages: on.has('canvas') ? schema.canvasFiles(layer.options.canvas) : [],
    canvasFonts: on.has('canvas') ? schema.canvasFonts(layer.options.canvas) : [],
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
  LAYER_BACKGROUND_MODES,
  isLayerableHtml,
  hasBrandMark,
  brandMarkPseudo,
  titleInkVar,
  decorUsesAccent,
  normalizeLayer,
  layerOptions,
  layerBoxSize,
  buildLayerCss,
  absolutizeCssUrls,
  layerBaseFolder,
  layerBaseNames,
  readLayerFolder,
  LAYER_FIELD_SECTION,
  layerHasLogo,
  LAYER_LOGO_SCRIPT,
  layerCanvasScript,
  layerAssets,
  layerAssetFileUrl,
};
