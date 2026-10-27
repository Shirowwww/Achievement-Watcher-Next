'use strict';

/*
  Builds the files of a preset that draws an imported SAN theme. The preset is an ordinary one that
  runs engine.js + host.js over the theme kept whole in a JSON block of index.html; that block is the
  only source of truth, so generated files are rebuilt from it when ENGINE_VERSION changes.
*/

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const engine = require('./engine.js');
const sanTheme = require('../sanTheme.js');
const { PRESET_PACKAGE_FILE, canvasCss, canvasMarkup } = require('../customPreset.js');
const { normalizeOptions, normalizeCanvas, canvasFiles, canvasFonts } = require('../presetSchema.js');

// Raised whenever a change here, in engine.js, host.js, base.css or a layout must reach presets
// that are already installed.
const ENGINE_VERSION = 8;

const THEME_BLOCK_ID = 'aw-san-theme';
const ENGINE_META = 'aw-san-engine';
const FONTS_DIR = 'fonts';
// Pictures and fonts of the items added on top of the card, beside SAN's own `assets/`.
const CANVAS_DIR = 'canvas';
const CANVAS_BLOCK_ID = 'aw-san-canvas';
// The designer's live page: its own stylesheet for the items it draws over the card.
const PREVIEW_STYLE_ID = 'aw-preview-css';
// What the live page loads from the app, in this order: the stand-in for the popup's bridge first.
const PREVIEW_SCRIPTS = ['preview.js', 'engine.js', 'host.js'];

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

// Every look a theme can draw: SAN's four states, then the ones AW Next's states were given.
function customisationsOf(theme) {
  const types = (theme && theme.types) || {};
  const states = (theme && theme.states) || {};
  return [...engine.TYPES.map((type) => types[type]), ...engine.AW_STATES.map((state) => states[state])].filter(Boolean);
}

// The base cards a theme draws with, one per look it carries.
function layoutsOf(theme) {
  const ids = new Set(customisationsOf(theme).map((customisation) => engine.layoutOf(customisation.preset)));
  if (!ids.size) ids.add(engine.layoutOf(''));
  return [...ids];
}

/*
  The window must hold the largest card among the looks, each at the scale its look gives it. A look
  that glows also gets the room SAN's window keeps on each side of the card for it, or the glow
  would be cut off at the window's edge.
*/
const GLOW_ROOM = 25;

function windowSize(theme) {
  const states = customisationsOf(theme);
  let width = 0;
  let height = 0;
  for (const customisation of states.length ? states : [{}]) {
    const layout = engine.LAYOUTS[engine.layoutOf(customisation.preset)];
    const scale = engine.scaleOf(customisation);
    const room = customisation.glow ? 2 * GLOW_ROOM : 0;
    width = Math.max(width, Math.ceil((layout.width + room) * scale));
    height = Math.max(height, Math.ceil((layout.height + room) * scale));
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
  `preview` ({ base, scripts }) builds the designer's live page instead: a <base> at the preset's
  folder, the scripts loaded from the app, and an empty stylesheet the designer fills.
*/
function buildPresetFiles(theme, { name = '', preview = null } = {}) {
  const layouts = layoutsOf(theme);
  const size = windowSize(theme);
  const base = read('base.css');
  const layoutCss = {};
  for (const id of layouts) layoutCss[id] = readOptional(`layouts/${id}.css`);
  const faces = fontsUsedBy([base, ...Object.values(layoutCss)].join('\n'));
  const longest = Math.max(...customisationsOf(theme).map((customisation) => Number(customisation.displaytime) || 0), 10);

  const templates = layouts
    .map((id) => `<template id="aw-san-layout-${id}">\n${readOptional(`layouts/${id}.html`).trim()}\n</template>`)
    .join('\n');
  // host.js puts the items into the card once it is drawn; their files sit in the preset's canvas/.
  const canvas = canvasOf(theme);
  const canvasStyle = canvas ? `<style id="${CANVAS_BLOCK_ID}-css">\n${canvasCss(canvas, { assetUrl: (file) => `${CANVAS_DIR}/${file}` })}\n</style>` : '';
  const canvasTemplate = canvas ? `<template id="${CANVAS_BLOCK_ID}">${canvasMarkup(canvas)}</template>` : '';

  const scripts = preview
    ? preview.scripts.map((src) => `<script src="${escapeHtml(src)}"></script>`)
    : [`<script>\n${read('engine.js').trim()}\n</script>`, `<script>\n${read('host.js').trim()}\n</script>`];
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    '<meta charset="UTF-8" />',
    preview ? `<base href="${escapeHtml(preview.base)}" />` : null,
    `<meta width="${size.width}" height="${size.height}" />`,
    `<meta name="duration" content="${Math.round(longest * 1000 + 1500)}" />`,
    `<meta name="${ENGINE_META}" content="${ENGINE_VERSION}" />`,
    `<title>${escapeHtml(name || theme.label || 'Steam Achievement Notifier theme')}</title>`,
    '<link rel="stylesheet" href="style.css" />',
    // base.css asks for a dark colour scheme; Chromium paints a frame whose scheme differs from its
    // <iframe>'s opaque, which would put the designer's card in a black box over any backdrop.
    preview ? '<style>html, body { color-scheme: normal; }</style>' : null,
    preview ? `<style id="${PREVIEW_STYLE_ID}"></style>` : canvasStyle,
    '</head><body>',
    templates,
    preview ? null : canvasTemplate,
    `<script type="application/json" id="${THEME_BLOCK_ID}">${scriptJson(theme)}</script>`,
    ...scripts,
    '</body></html>',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');

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
  const clean = (customisation) => sanTheme.cleanCustomisation(customisation, { resolveAsset }).customisation;
  const types = {};
  for (const type of engine.TYPES) {
    if (theme.types[type]) types[type] = clean(theme.types[type]);
  }
  if (!types.main) types.main = types[Object.keys(types)[0]] || {};
  const thresholds = theme.thresholds || {};
  const cutOff = (value, fallback) => (Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : fallback);
  const cleaned = {
    label: String(theme.label || '').slice(0, 80),
    sanVersion: String(theme.sanVersion || '').slice(0, 32),
    thresholds: { rarity: cutOff(thresholds.rarity, 10), semirarity: cutOff(thresholds.semirarity, 25) },
    showpercent: ['off', 'rareonly', 'all'].includes(theme.showpercent) ? theme.showpercent : 'rareonly',
    notify1line: theme.notify1line === true,
    types,
  };
  const canvas = canvasOf(theme);
  if (canvas) cleaned.awCanvas = canvas;
  return withAwSettings(cleaned, theme, clean);
}

// The items added on top of the card, as the designer stores them, or null when there are none.
function canvasOf(theme) {
  const canvas = theme && theme.awCanvas ? normalizeCanvas(theme.awCanvas) : null;
  return canvas && canvas.items.length ? canvas : null;
}

/*
  What AW Next adds over SAN's own data, both optional so a theme without them stays byte for byte
  what it was: `tierPictures` pins the per-tier pictures to one tier, `states` gives an AW Next state
  a look of its own (copied from another imported theme). `clean` makes a look safe to draw.
*/
const TIER_PICTURES = ['auto', 'bronze', 'silver', 'gold'];

function withAwSettings(target, source, clean) {
  const out = { ...target };
  if (TIER_PICTURES.includes(source && source.tierPictures) && source.tierPictures !== 'auto') out.tierPictures = source.tierPictures;
  const raw = source && source.states && typeof source.states === 'object' ? source.states : {};
  const from = source && source.stateFrom && typeof source.stateFrom === 'object' ? source.stateFrom : {};
  const states = {};
  const stateFrom = {};
  for (const state of engine.AW_STATES) {
    if (!Object.prototype.hasOwnProperty.call(raw, state) || !raw[state] || typeof raw[state] !== 'object') continue;
    states[state] = clean(raw[state]);
    // Only a name to show in the designer: the look itself is copied in and needs nothing else.
    if (Object.prototype.hasOwnProperty.call(from, state)) stateFrom[state] = String(from[state] || '').slice(0, 48);
  }
  if (Object.keys(states).length) {
    out.states = states;
    out.stateFrom = stateFrom;
  }
  return out;
}

// An AW Next state as the tier the payload of such an unlock carries.
const STATE_PAYLOAD = { normal: { tier: '' }, bronze: { tier: 'bronze' }, silver: { tier: 'silver' }, gold: { tier: 'gold' }, platinum: { tier: 'platinum', platinum: true } };

/*
  Copies one picture of another preset into this one, under its own name when that is free or holds
  the same bytes, else under a numbered one. Answers the theme value for it, '' when it cannot.
*/
function adoptAsset(fromDir, toDir, kind, value) {
  const match = /^assets\/([^/\\]+)$/.exec(String(value || ''));
  if (!match || !sanTheme.assetAccepts(kind, match[1])) return '';
  const source = path.join(fromDir, 'assets', match[1]);
  let bytes;
  try {
    bytes = fs.readFileSync(source);
  } catch {
    return '';
  }
  fs.mkdirSync(path.join(toDir, 'assets'), { recursive: true });
  const ext = path.extname(match[1]);
  const stem = path.basename(match[1], ext);
  for (let n = 1; n < 100; n += 1) {
    const name = n === 1 ? match[1] : `${stem}-${n}${ext}`;
    const target = path.join(toDir, 'assets', name);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, bytes);
      return `assets/${name}`;
    }
    if (fs.readFileSync(target).equals(bytes)) return `assets/${name}`;
  }
  return '';
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/*
  Saves what AW Next adds to an installed SAN preset. `states` maps an AW Next state to the folder of
  another imported theme whose look (pictures and sound included) it takes, or to '' to give the
  state back to the preset's own theme; a state left out keeps what it has. `mode` is the rarity
  mode, which decides which of the other theme's looks that state would have shown there.
*/
function updateAwSettings(dir, { tierPictures, states = {}, mode = 'rare' } = {}) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const theme = readEmbeddedTheme(html);
  if (!theme) return { ok: false, error: 'not-san' };
  const manifestFile = path.join(dir, PRESET_PACKAGE_FILE);
  const manifest = readJson(manifestFile) || {};
  const sounds = { ...manifest.sanSounds };
  const next = { ...theme, states: { ...theme.states }, stateFrom: { ...theme.stateFrom } };
  if (tierPictures !== undefined) next.tierPictures = tierPictures;

  for (const state of engine.AW_STATES) {
    if (!Object.prototype.hasOwnProperty.call(states, state)) continue;
    const fromDir = states[state];
    delete next.states[state];
    delete next.stateFrom[state];
    delete sounds[state];
    if (!fromDir) continue;
    const fromTheme = readEmbeddedTheme(fs.readFileSync(path.join(fromDir, 'index.html'), 'utf8'));
    if (!fromTheme) return { ok: false, error: 'not-san', state };
    const picked = engine.customisationFor(fromTheme, { ...STATE_PAYLOAD[state], mode });
    next.states[state] = sanTheme.cleanCustomisation(picked.customisation, { resolveAsset: (kind, value) => adoptAsset(fromDir, dir, kind, value) }).customisation;
    next.stateFrom[state] = path.basename(fromDir);
    const fromSounds = (readJson(path.join(fromDir, PRESET_PACKAGE_FILE)) || {}).sanSounds || {};
    const sound = fromSounds[picked.state] || fromSounds[picked.type] || fromSounds.main;
    if (sound) sounds[state] = sound;
  }

  writePresetFiles(dir, cleanEmbeddedTheme(dir, next), { name: path.basename(dir) });
  if (Object.keys(sounds).length || manifest.sanSounds) {
    fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, sanSounds: sounds }, null, 2), 'utf8');
  }
  return { ok: true };
}

/*
  Whether a look draws anything per tier (its pictures, percentage badge, icon border, glow colour,
  or the Epic Games card's rarity colour): only then does pinning the tier change what is seen.
*/
function drawsPerTier(theme) {
  return customisationsOf(theme).some((c) => {
    const layout = engine.layoutOf(c.preset);
    const icons = (c.customicons && c.customicons[layout]) || {};
    return (
      Array.isArray(icons.logo) ||
      Array.isArray(icons.decoration) ||
      Boolean(c.percentbadge && c.percentbadgeimg) ||
      Boolean(c.showiconborder && c.iconborderrarity) ||
      Boolean(c.glow && c.glowrarity) ||
      layout === 'epicgames'
    );
  });
}

// What the designer shows of a SAN preset's AW Next settings.
function awSettingsOf(dir) {
  let theme = null;
  try {
    theme = readEmbeddedTheme(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'));
  } catch {
    return null;
  }
  if (!theme) return null;
  const clean = withAwSettings({}, theme, (look) => look);
  return { tierPictures: clean.tierPictures || 'auto', stateFrom: clean.stateFrom || {} };
}

/*
  The settings of a theme the designer can change, as SAN offers them. Files (pictures, fonts,
  sounds) are not among them: a theme's files only ever come from its own package.
*/
const LOOK_KEYS = [
  'preset', 'scale', 'roundness', 'opacity', 'displaytime',
  'bgstyle', 'primarycolor', 'secondarycolor', 'tertiarycolor', 'gradientangle', 'brightness', 'blur',
  'usecustomfontsizes', 'fontsize', 'unlockmsgfontsize', 'titlefontsize', 'descfontsize',
  'usecustomfontcolors', 'fontcolor', 'unlockmsgfontcolor', 'titlefontcolor', 'descfontcolor',
  'fontoutline', 'fontoutlinecolor', 'fontshadow', 'fontshadowcolor',
  'usecustomtext', 'customtextunlockmsg', 'customtexttitle', 'customtextdesc',
  'glow', 'glowcolor', 'glowsize', 'glowanim', 'glowspeed', 'glowrarity', 'glowcolorbronze', 'glowcolorsilver', 'glowcolorgold',
  'useoutline', 'outline', 'outlinecolor', 'outlinewidth',
  'iconroundness', 'iconscale', 'usegameicon',
  'awparts',
];
const ORIGINAL_KEY = 'sanOriginal';

function readTheme(dir) {
  try {
    return readEmbeddedTheme(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'));
  } catch {
    return null;
  }
}

function saveTheme(dir, theme) {
  writePresetFiles(dir, cleanEmbeddedTheme(dir, theme), { name: path.basename(dir) });
}

function pickLookKeys(source) {
  const picked = {};
  for (const key of LOOK_KEYS) if (source && Object.prototype.hasOwnProperty.call(source, key)) picked[key] = source[key];
  return picked;
}

// What the designer shows of a theme's own settings: each of SAN's states it carries, and its values.
function lookOf(dir) {
  const theme = readTheme(dir);
  if (!theme) return null;
  const types = engine.TYPES.filter((type) => theme.types[type]);
  const values = {};
  for (const type of types) values[type] = pickLookKeys(theme.types[type]);
  const fields = {};
  for (const key of LOOK_KEYS) fields[key] = sanTheme.SAN_FIELDS[key];
  const manifest = readJson(path.join(dir, PRESET_PACKAGE_FILE)) || {};
  return { types, values, fields, edited: Boolean(manifest[ORIGINAL_KEY]), canvas: canvasOf(theme) || normalizeCanvas(null) };
}

/*
  What the designer needs to show a SAN preset live: the page (`html`, for an iframe's srcdoc), the
  window it is drawn in, and the theme it draws, which the designer rewrites in the page to show an
  edit before it is saved. The page is rebuilt from the theme, never read from the preset's own
  index.html; its stylesheets, fonts and pictures are the preset folder's.
*/
function previewPage(dir) {
  const theme = readTheme(dir);
  if (!theme) return null;
  const clean = cleanEmbeddedTheme(dir, theme);
  const scripts = PREVIEW_SCRIPTS.map((file) => pathToFileURL(path.join(__dirname, file)).href);
  const base = pathToFileURL(dir).href.replace(/\/?$/, '/');
  const built = buildPresetFiles(clean, { name: path.basename(dir), preview: { base, scripts } });
  return { html: built.files['index.html'], width: built.size.width, height: built.size.height, theme: clean };
}

/*
  Stores the items added on top of the card. `copyAsset(file, target)` brings a picture or font the
  items name from the designer's shared folders (and checks it); a file no item names any more goes.
*/
function updateCanvas(dir, rawCanvas, { copyAsset = () => false } = {}) {
  const theme = readTheme(dir);
  if (!theme) return { ok: false, error: 'not-san' };
  const canvas = normalizeCanvas(rawCanvas);
  const folder = path.join(dir, CANVAS_DIR);
  const wanted = new Set([...canvasFiles(canvas), ...canvasFonts(canvas)]);
  if (wanted.size) fs.mkdirSync(folder, { recursive: true });
  for (const file of wanted) {
    const target = path.join(folder, file);
    // Names are checked by the schema; this keeps a copy inside the folder whatever they become.
    if (path.dirname(target) === folder && !fs.existsSync(target)) copyAsset(file, target);
  }
  if (fs.existsSync(folder)) {
    for (const file of fs.readdirSync(folder)) if (!wanted.has(file)) fs.rmSync(path.join(folder, file), { force: true });
  }
  const { awCanvas: _old, ...rest } = theme;
  saveTheme(dir, canvas.items.length ? { ...rest, awCanvas: canvas } : rest);
  return { ok: true };
}

/*
  Changes settings of one of the theme's states, each checked as an import checks it; anything
  else is ignored. The theme as imported is kept on the first change, for restoreLook.
*/
function updateLook(dir, { type, changes = {} } = {}) {
  const theme = readTheme(dir);
  if (!theme) return { ok: false, error: 'not-san' };
  if (!engine.TYPES.includes(type) || !theme.types[type]) return { ok: false, error: 'no-such-look' };
  const clean = sanTheme.cleanCustomisation(pickLookKeys(changes)).customisation;
  const manifestFile = path.join(dir, PRESET_PACKAGE_FILE);
  const manifest = readJson(manifestFile) || {};
  if (!manifest[ORIGINAL_KEY]) fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, [ORIGINAL_KEY]: theme.types }, null, 2), 'utf8');
  saveTheme(dir, { ...theme, types: { ...theme.types, [type]: { ...theme.types[type], ...clean } } });
  return { ok: true };
}

// Puts back the theme's settings as they were imported.
function restoreLook(dir) {
  const theme = readTheme(dir);
  if (!theme) return { ok: false, error: 'not-san' };
  const manifestFile = path.join(dir, PRESET_PACKAGE_FILE);
  const manifest = readJson(manifestFile) || {};
  const original = manifest[ORIGINAL_KEY];
  if (!original || typeof original !== 'object') return { ok: true };
  saveTheme(dir, { ...theme, types: original });
  const { [ORIGINAL_KEY]: _dropped, ...rest } = manifest;
  fs.writeFileSync(manifestFile, JSON.stringify(rest, null, 2), 'utf8');
  return { ok: true };
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
  const { type, state } = engine.customisationFor({ thresholds: manifest.sanThresholds }, { tier: rarityTier, mode: rarityMode, platinum, percent: unlockRate });
  // A state given a theme of its own brings that theme's sound with it.
  const entry = sounds[state] || sounds[type] || sounds.main;
  const files = (entry && Array.isArray(entry.files) ? entry.files : []).map((name) => normalizeOptions({ sound: name }).sound).filter(Boolean);
  if (!files.length) return '';
  return files[Math.min(files.length - 1, Math.floor(random() * files.length))];
}

/*
  How far inside the screen edges SAN keeps a card (listeners.js, setnotifybounds): its window has
  25px of glow room per side at 100%, and the cards with an offset pull it back to a fixed 25px at
  any scale; ps4 and gfwl (offset 0) keep the room, so theirs grows with the card. `zoom` is AW
  Next's size setting. 0 for a preset that is not an imported SAN theme.
*/
const SAN_EDGE_GAP = 25;

function edgeGap(dir, { notificationType = '', rarityTier, rarityMode = '', unlockRate = null, zoom = 1 } = {}) {
  let theme;
  try {
    theme = readEmbeddedTheme(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'));
  } catch {
    return 0;
  }
  if (!theme) return 0;
  const platinum = String(notificationType || '').toLowerCase() === 'platinum';
  const c = engine.customisationFor(theme, { tier: rarityTier, mode: rarityMode, platinum, percent: unlockRate }).customisation;
  const layout = engine.layoutOf(c.preset);
  if (engine.LAYOUTS[layout].offset !== 0) return SAN_EDGE_GAP;
  return SAN_EDGE_GAP * engine.scaleOf(c) * (Number(zoom) > 0 ? Number(zoom) : 1);
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
  AW_STATES: engine.AW_STATES,
  TIER_PICTURES,
  withAwSettings,
  updateAwSettings,
  awSettingsOf,
  lookOf,
  updateLook,
  restoreLook,
  updateCanvas,
  previewPage,
  PREVIEW_STYLE_ID,
  windowSize,
  drawsPerTier,
  layoutsOf,
  buildPresetFiles,
  writePresetFiles,
  readEmbeddedTheme,
  engineVersionOf,
  refreshPreset,
  isSanPreset,
  presetSound,
  edgeGap,
};
