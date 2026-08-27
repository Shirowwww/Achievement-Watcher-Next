'use strict';

// Theme layers and the CSS generated for the main window and overlay.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { cssUrl } = require('./cssUrl.js');

const LAYER_IDS = ['bg', 'header', 'panel', 'card', 'settings', 'text', 'muted', 'border', 'accent'];
const IMAGE_LAYER_IDS = ['bg', 'header', 'panel', 'card', 'settings'];
const FITS = ['cover', 'contain', 'repeat', 'fill'];
const EFFECT_TYPES = ['veil', 'blur'];

// Built-in colors mirror app.css; the overlay uses this table directly.
const BUILTIN_COLORS = {
  default: {
    bg: '#142236',
    header: '#26384c',
    panel: '#192a40',
    card: '#263b55',
    settings: '#263b55',
    text: '#e7edf6',
    muted: '#94a5ba',
    border: '#3e5065',
    accent: '#6c91ff',
  },
  // The only light-base built-in; kept in step with the :root[data-theme='light'] block in app.css.
  light: {
    bg: '#e6ebf3',
    header: '#f6f9fc',
    panel: '#eef2f8',
    card: '#ffffff',
    settings: '#ffffff',
    text: '#16202e',
    muted: '#5b6b80',
    border: '#c5cfdd',
    accent: '#3a63b5',
  },
  oled: {
    bg: '#000000',
    header: '#101014',
    panel: '#060608',
    card: '#141419',
    settings: '#0a0a0f',
    text: '#e8ecf2',
    muted: '#9aa3b2',
    border: '#2c2c34',
    accent: '#4da3ff',
  },
  dracula: {
    bg: '#282a36',
    header: '#343747',
    panel: '#1e1f29',
    card: '#343746',
    settings: '#21222c',
    text: '#f8f8f2',
    muted: '#9ba3c7',
    border: '#4b4e63',
    accent: '#bd93f9',
  },
  graphite: {
    bg: '#1d1f22',
    header: '#2a2d31',
    panel: '#17181b',
    card: '#292c30',
    settings: '#202327',
    text: '#e3e6ea',
    muted: '#a4aab2',
    border: '#45494f',
    accent: '#6fbf73',
  },
  // Established community color schemes, ported with their canonical palettes.
  nord: {
    bg: '#2e3440',
    header: '#3b4252',
    panel: '#242933',
    card: '#3b4252',
    settings: '#2e3440',
    text: '#eceff4',
    muted: '#9099ab',
    border: '#4c566a',
    accent: '#88c0d0',
  },
  gruvbox: {
    bg: '#282828',
    header: '#3c3836',
    panel: '#1d2021',
    card: '#3c3836',
    settings: '#32302f',
    text: '#ebdbb2',
    muted: '#a89984',
    border: '#504945',
    accent: '#fe8019',
  },
  tokyonight: {
    bg: '#1a1b26',
    header: '#24283b',
    panel: '#16161e',
    card: '#24283b',
    settings: '#1f2335',
    text: '#c0caf5',
    muted: '#565f89',
    border: '#3b4261',
    accent: '#7dcfff',
  },
  // More community palettes, ported with their canonical colors.
  catppuccin: {
    bg: '#1e1e2e',
    header: '#313244',
    panel: '#181825',
    card: '#313244',
    settings: '#26263a',
    text: '#cdd6f4',
    muted: '#a6adc8',
    border: '#45475a',
    accent: '#89b4fa',
  },
  rosepine: {
    bg: '#191724',
    header: '#1f1d2e',
    panel: '#15131d',
    card: '#26233a',
    settings: '#211f30',
    text: '#e0def4',
    muted: '#908caa',
    border: '#403d52',
    accent: '#c4a7e7',
  },
  synthwave: {
    bg: '#241b2f',
    header: '#2d2440',
    panel: '#1a1325',
    card: '#372a54',
    settings: '#271d3c',
    text: '#f4efff',
    muted: '#b7a8d9',
    border: '#52407a',
    accent: '#36f9f6',
  },
  everforest: {
    bg: '#232a2e',
    header: '#2d353b',
    panel: '#1c2226',
    card: '#343f44',
    settings: '#293237',
    text: '#d3c6aa',
    muted: '#859289',
    border: '#4a555b',
    accent: '#a7c080',
  },
  ocean: {
    bg: '#0b1e26',
    header: '#12323d',
    panel: '#08171c',
    card: '#16404d',
    settings: '#0f2730',
    text: '#d7f2f5',
    muted: '#8fb4bd',
    border: '#2e5a66',
    accent: '#35d0ba',
  },
};

const DEFAULT_THEME_COLOR = BUILTIN_COLORS.default.bg;
const DEFAULT_ACCENT_COLOR = BUILTIN_COLORS.default.accent;

function customThemeFile(userDataPath) {
  return path.join(String(userDataPath || ''), 'cfg', 'customTheme.json');
}

function themeImagesDir(userDataPath) {
  return path.join(String(userDataPath || ''), 'theme-images');
}

function isHex(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '').trim());
}

function isRgb(value) {
  return /^rgba?\(\s*\d{1,3}(\s*,\s*\d{1,3}){2,3}\s*\)$/i.test(String(value || '').trim());
}

function normalizeColor(value, fallback) {
  const raw = String(value || '').trim();
  if (isHex(raw) || isRgb(raw)) return raw;
  return fallback;
}

// `<input type="color">` only produces/accepts #rrggbb, so alpha (CSS #rrggbbaa) is split off
// here and rejoined by colorWithAlpha to survive a round trip through the picker.
function colorAlpha(value) {
  const raw = String(value || '').trim();
  const hex8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(raw);
  if (hex8) return Math.round((parseInt(hex8[2], 16) / 255) * 100);
  const hex4 = /^#([0-9a-f]{3})([0-9a-f])$/i.exec(raw);
  if (hex4) return Math.round((parseInt(hex4[2] + hex4[2], 16) / 255) * 100);
  const rgba = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*([\d.]+)\s*\)$/i.exec(raw);
  if (rgba) {
    const alpha = Number(rgba[1]);
    return Number.isFinite(alpha) ? Math.round(Math.min(1, Math.max(0, alpha)) * 100) : 100;
  }
  return 100;
}

// The opaque #rrggbb half of a stored color - what `<input type="color">` can actually display.
function colorWithoutAlpha(value, fallback = DEFAULT_THEME_COLOR) {
  const raw = String(value || '').trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(raw);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      return `#${digits.slice(0, 3).split('').map((c) => c + c).join('')}`.toLowerCase();
    }
    if (digits.length === 6 || digits.length === 8) return `#${digits.slice(0, 6)}`.toLowerCase();
  }
  if (isRgb(raw)) return `#${hexToRgbTriplet(raw).split(',').map((n) => Number(n.trim()).toString(16).padStart(2, '0')).join('')}`;
  return fallback;
}

// Recombine the picker's #rrggbb with an opacity percentage. 100% stays a plain 6-digit hex so a
// theme that never touches opacity keeps writing exactly the files it wrote before.
function colorWithAlpha(value, opacityPercent) {
  const base = colorWithoutAlpha(value);
  const percent = clampInt(opacityPercent, 0, 100, 100);
  if (percent >= 100) return base;
  return `${base}${Math.round((percent / 100) * 255).toString(16).padStart(2, '0')}`;
}

function normalizeFit(value) {
  return FITS.includes(value) ? value : 'cover';
}

function normalizeImage(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

const GRADIENT_ANGLES = new Set([0, 45, 90, 135, 180, 270]);

function darkenHex(value, percent = 48) {
  const rgb = hexToRgbTriplet(value).split(',').map((n) => Math.round(Number(n.trim()) * (1 - percent / 100)));
  return `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

// Legacy `gradient: true` (the first simple toggle) is converted into a default dark fade.
function normalizeGradient(raw, baseColor) {
  const legacy = raw === true;
  const value = raw && typeof raw === 'object' ? raw : {};
  const from = normalizeColor(value.from, baseColor);
  return {
    enabled: value.enabled === true || legacy,
    from,
    to: normalizeColor(value.to, legacy ? darkenHex(from, 48) : from),
    angle: GRADIENT_ANGLES.has(Number(value.angle)) ? Number(value.angle) : 180,
  };
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function normalizeEffect(raw) {
  const effect = (raw && typeof raw === 'object' ? raw : {}) || {};
  return {
    enabled: effect.enabled === true,
    type: effect.type === 'blur' ? 'blur' : 'veil',
    color: normalizeColor(effect.color, '#000000'),
    opacity: clampInt(effect.opacity, 0, 100, 40),
    blur: clampInt(effect.blur, 0, 40, 8),
    blurImage: typeof effect.blurImage === 'string' ? effect.blurImage : '',
  };
}

function defaultCustomTheme() {
  const theme = {};
  for (const id of LAYER_IDS) {
    const color = BUILTIN_COLORS.default[id] || DEFAULT_THEME_COLOR;
    theme[id] = {
      color,
      gradient: { enabled: false, from: color, to: darkenHex(color, 48), angle: 180 },
    };
    if (IMAGE_LAYER_IDS.includes(id)) {
      theme[id].image = '';
      theme[id].fit = 'cover';
      theme[id].effect = {
        enabled: false,
        type: 'veil',
        color: '#000000',
        opacity: 40,
        blur: 8,
        blurImage: '',
      };
    }
  }
  return theme;
}

function sanitizeCustomTheme(raw) {
  const fallback = defaultCustomTheme();
  const theme = {};
  for (const id of LAYER_IDS) {
    const layer = (raw && raw[id]) || {};
    const base = fallback[id] || {};
    theme[id] = {
      color: normalizeColor(layer.color, base.color),
      // The legacy `gradient: true` fade is derived from this layer's own color,
      // never from the built-in fallback color.
      gradient: normalizeGradient(layer.gradient, layer.color || base.color),
    };
    if (IMAGE_LAYER_IDS.includes(id)) {
      theme[id].image = normalizeImage(layer.image);
      theme[id].fit = normalizeFit(layer.fit);
      theme[id].effect = normalizeEffect(layer.effect);
    }
  }
  return theme;
}

// Same rules as themePackage.js `sanitizeThemeName`, deliberately repeated rather than imported
// (that file requires this one, and this half also has to load in the overlay). Pinned together
// by test/core/themeAlpha.test.js.
function sanitizeCustomThemeName(raw) {
  return String(raw == null ? '' : raw)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 48)
    .trim();
}

// The name is stored beside the layer model, not inside it, so sanitizeCustomTheme keeps
// describing exactly the nine layers. A file written before the field existed has no name.
function loadCustomThemeName(userDataPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(customThemeFile(userDataPath), 'utf8'));
    return sanitizeCustomThemeName(raw && raw.name);
  } catch {
    return '';
  }
}

function loadCustomTheme(userDataPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(customThemeFile(userDataPath), 'utf8'));
    return sanitizeCustomTheme(raw);
  } catch {
    return defaultCustomTheme();
  }
}

// `name` is optional: passing one renames the theme, omitting it keeps the name on disk. The save
// path runs twice per edit (draft, then generated blur copies) and only the first call knows it.
function saveCustomTheme(userDataPath, theme, name) {
  const clean = sanitizeCustomTheme(theme);
  const themeName = name === undefined ? loadCustomThemeName(userDataPath) : sanitizeCustomThemeName(name);
  fs.mkdirSync(path.dirname(customThemeFile(userDataPath)), { recursive: true });
  fs.writeFileSync(customThemeFile(userDataPath), JSON.stringify({ name: themeName, ...clean }, null, 2), 'utf8');
  return clean;
}

// The r, g, b of a color with any alpha dropped: callers rebuild alpha themselves (rgba() veils,
// --accent-soft), so #rrggbbaa must resolve to its rgb half rather than fall through to the default.
function hexToRgbTriplet(value) {
  const raw = String(value || DEFAULT_ACCENT_COLOR).trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(raw)) {
    const digits = raw.slice(1);
    const short = digits.length === 3 || digits.length === 4;
    const full = short ? digits.slice(0, 3).split('').map((c) => c + c).join('') : digits.slice(0, 6);
    const n = parseInt(full, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(raw);
  if (m) return `${m[1]}, ${m[2]}, ${m[3]}`;
  return hexToRgbTriplet(DEFAULT_ACCENT_COLOR);
}

function imageUrl(filePath) {
  if (!filePath) return 'none';
  try {
    if (!fs.existsSync(filePath)) return 'none';
    return cssUrl(pathToFileURL(path.resolve(filePath)).href);
  } catch {
    return 'none';
  }
}

// The image actually rendered for a layer: a pre-blurred copy when the blur or veil effect is
// active (baked in so the element's own text stays crisp), otherwise the source image.
function effectiveImage(layer) {
  if (!layer) return '';
  if (layer.effect && layer.effect.enabled === true && layer.effect.blurImage) {
    return layer.effect.blurImage;
  }
  return layer.image || '';
}

function veilRgba(layer) {
  if (!layer || !layer.effect || layer.effect.enabled !== true || layer.effect.type !== 'veil' || layer.effect.opacity <= 0) {
    return 'transparent';
  }
  return `rgba(${hexToRgbTriplet(layer.effect.color)}, ${(layer.effect.opacity / 100).toFixed(3)})`;
}

function veilLayer(layer) {
  return `linear-gradient(${veilRgba(layer)}, ${veilRgba(layer)})`;
}

// Whether the layer's gradient is actually painting it: an image wins over a gradient (the
// gradient sits on top in `background-image` and would hide the picture otherwise).
function gradientActive(layer) {
  return !!(layer && layer.gradient && layer.gradient.enabled === true && !layer.image);
}

function layerGradient(layer) {
  if (!gradientActive(layer)) return 'none';
  const from = layer.gradient.from || layer.color || DEFAULT_THEME_COLOR;
  const to = layer.gradient.to || from;
  const angle = Number.isFinite(Number(layer.gradient.angle)) ? Number(layer.gradient.angle) : 180;
  return `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;
}

function gradientEnabled(layer) {
  return gradientActive(layer);
}

// A layer made see-through via the opacity slider must drop app.css's backdrop blur too, or a
// panel at 0% opacity still shows as a blurred silhouette instead of gone.
function layerIsTranslucent(layer) {
  return colorAlpha(layer && layer.color) < 100;
}

// The blur radius a layer asks for through Effect -> Blur, or 0: the only way to put blur back on
// a layer once translucency has removed app.css's automatic frost.
function layerBlurRadius(layer) {
  const effect = layer && layer.effect;
  if (!effect || effect.enabled !== true || effect.type !== 'blur') return 0;
  return clampInt(effect.blur, 0, 40, 8);
}

function fitProps(fit) {
  if (fit === 'repeat') return 'size:auto; repeat:repeat';
  if (fit === 'contain') return 'size:contain; repeat:no-repeat';
  if (fit === 'fill') return 'size:100% 100%; repeat:no-repeat';
  return 'size:cover; repeat:no-repeat';
}

function layerVars(theme, prefix) {
  const lines = [];
  for (const id of LAYER_IDS) {
    const layer = theme[id] || {};
    lines.push(`  --${prefix}${id}: ${layer.color || DEFAULT_THEME_COLOR};`);
    lines.push(`  --aw-grad-${id}: ${layerGradient(layer)};`);
  }
  for (const id of IMAGE_LAYER_IDS) {
    const layer = theme[id] || {};
    const fit = fitProps(layer.fit);
    lines.push(`  --aw-img-${id}: ${imageUrl(effectiveImage(layer))};`);
    lines.push(`  --aw-veil-${id}: ${veilRgba(layer)};`);
    lines.push(`  --aw-img-${id}-size: ${fit.split('; ')[0].replace('size:', '')};`);
    lines.push(`  --aw-img-${id}-repeat: ${fit.split('; ')[1].replace('repeat:', '')};`);
  }
  return lines.join('\n');
}

function buildCustomAppCss(theme) {
  const clean = sanitizeCustomTheme(theme);
  const bg = clean.bg.color;
  const header = clean.header.color;
  const panel = clean.panel.color;
  const card = clean.card.color;
  const settings = clean.settings.color;
  const text = clean.text.color;
  const muted = clean.muted.color;
  const border = clean.border.color;
  const accent = clean.accent.color;
  const accentRgb = hexToRgbTriplet(accent);
  const bgGrad = gradientEnabled(clean.bg);
  const headerGrad = gradientEnabled(clean.header);
  const panelGrad = gradientEnabled(clean.panel);
  const cardGrad = gradientEnabled(clean.card);
  const settingsGrad = gradientEnabled(clean.settings);
  // title-bar is shadow-DOM, so overrides go through a custom property :host reads (titlebar.css).
  // The 72% mix only applies without a bg image, or the header blends into unrelated artwork.
  const headerScrim = headerGrad
    ? 'transparent'
    : clean.header.image
      ? 'rgba(0, 0, 0, 0.30)'
      : clean.bg.image
        ? header
        : `color-mix(in srgb, ${header} 72%, transparent)`;
  // Same specificity trap for the header's border/shadow: crisp() clears these via a light-DOM
  // rule for every other layer, but title-bar's :host declares both, so it needs the var path too.
  const headerFullyInvisible = colorAlpha(clean.header.color) === 0;
  const headerBorder = headerFullyInvisible ? 'transparent' : 'color-mix(in srgb, var(--border) 15%, transparent)';
  const headerShadow = headerFullyInvisible ? 'none' : '0 10px 30px rgba(0, 0, 0, 0.06)';

  const rules = [
    ':root {',
    `  --bg-base: ${bg};`,
    `  --bg-glow: ${header};`,
    `  --aw-header-scrim: ${headerScrim};`,
    `  --aw-header-border: ${headerBorder};`,
    `  --aw-header-shadow: ${headerShadow};`,
    `  --bg-panel: ${panel};`,
    '  --bg-panel-translucent: color-mix(in srgb, var(--bg-panel) 78%, transparent);',
    `  --surface: ${card};`,
    '  --surface-elevated: color-mix(in srgb, var(--surface) 88%, white 12%);',
    '  --surface-sunken: color-mix(in srgb, var(--surface) 82%, black);',
    // Settings-modal-only surfaces: derived from the "settings" layer, not "card", so a custom
    // Cards/tiles color/image never bleeds into the Settings UI chrome (see app.css --set-* tokens).
    `  --set-surface: ${settings};`,
    '  --set-surface-elevated: color-mix(in srgb, var(--set-surface) 88%, white 12%);',
    '  --set-surface-sunken: color-mix(in srgb, var(--set-surface) 82%, black);',
    `  --text: ${text};`,
    `  --text-muted: ${muted};`,
    `  --border: ${border};`,
    `  --accent: ${accent};`,
    '  --accent-strong: color-mix(in srgb, var(--accent) 88%, white 12%);',
    `  --accent-soft: rgba(${accentRgb}, 0.16);`,
    `  --aw-settings-color: ${settings};`,
    layerVars(clean, 'aw-'),
    '}',
    '',
    'body {',
    `  background-color: ${bgGrad ? 'transparent' : bg} !important;`,
    `  background-image: ${veilLayer(clean.bg)}, ${bgGrad ? 'var(--aw-grad-bg, none)' : `radial-gradient(140% 90% at 50% -10%, ${header} 0%, ${bg} 60%)`}, ${bgGrad ? 'none' : 'var(--aw-grad-bg, none)'}, var(--aw-img-bg, none) !important;`,
    `  background-size: auto, 100% 100%, 100% 100%, var(--aw-img-bg-size, cover) !important;`,
    '  background-repeat: no-repeat, no-repeat, no-repeat, var(--aw-img-bg-repeat, no-repeat) !important;',
    '  background-position: center !important;',
    '}',
    '',
    `#game-list {
  background-color: ${panelGrad ? 'transparent' : 'color-mix(in srgb, var(--bg-panel) 62%, transparent)'};
  background-image: ${veilLayer(clean.panel)}, var(--aw-grad-panel, none), var(--aw-img-panel, none);
  background-size: auto, 100% 100%, var(--aw-img-panel-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-panel-repeat, no-repeat);
  background-position: center;
}`,
    '',
    `#game-list .game-box .info {
  ${cardGrad ? 'background-color: transparent;' : ''}
  background-image: ${veilLayer(clean.card)}, var(--aw-grad-card, none), var(--aw-img-card, none);
  background-size: auto, 100% 100%, var(--aw-img-card-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-card-repeat, no-repeat);
  background-position: center;
}`,
    '',
    `#settings .box,
#game-config .box {
  --set-modal-top: var(--aw-settings-color);
  --set-modal-bottom: var(--aw-settings-color);
  ${settingsGrad ? 'background-color: transparent;' : ''}
  /* Keep the box's color gradient as the bottom layer: without an image (and with
     no effect) the two upper layers are transparent/none, so the settings surface
     must still render its chosen color instead of becoming transparent. An enabled
     per-layer gradient replaces that base color entirely. */
  background-image: ${veilLayer(clean.settings)}, var(--aw-grad-settings, none), var(--aw-img-settings, none)${settingsGrad ? '' : ', linear-gradient(180deg, var(--set-modal-top) 0%, var(--set-modal-bottom) 100%)'};
  background-size: auto, 100% 100%, var(--aw-img-settings-size, cover)${settingsGrad ? '' : ', cover'};
  background-repeat: no-repeat, no-repeat, var(--aw-img-settings-repeat, no-repeat)${settingsGrad ? '' : ', no-repeat'};
  background-position: center;
}`,
  ];

  // When a layer has an image, the layer color must NOT hide it: drop the opaque
  // surface to a dark scrim so the image is clearly visible and text stays readable.
  if (clean.bg.image) {
    rules.push(`body {
  background-color: rgba(0, 0, 0, 0.25) !important;
  background-image: ${veilLayer(clean.bg)}, linear-gradient(180deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.55)), var(--aw-grad-bg, none), var(--aw-img-bg, none) !important;
  background-size: auto, auto, 100% 100%, var(--aw-img-bg-size, cover) !important;
  background-repeat: no-repeat, no-repeat, no-repeat, var(--aw-img-bg-repeat, no-repeat) !important;
}`);
  }
  if (clean.panel.image) {
    rules.push(`#game-list {
  background-color: rgba(0, 0, 0, 0.28);
}`);
  }
  if (clean.card.image) {
    rules.push(`#game-list .game-box .info {
  background-color: rgba(0, 0, 0, 0.30);
}

#achievement .achievement-list ul > li {
  background-image: ${veilLayer(clean.card)}, linear-gradient(145deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.42)), var(--aw-grad-card, none), var(--aw-img-card, none);
  background-size: auto, auto, 100% 100%, var(--aw-img-card-size, cover);
  background-repeat: repeat, no-repeat, no-repeat, var(--aw-img-card-repeat, no-repeat);
  background-position: 0 0, center;
}

#achievement .achievement-list ul > li:hover {
  background-image: ${veilLayer(clean.card)}, linear-gradient(145deg, rgba(0, 0, 0, 0.26), rgba(0, 0, 0, 0.40)), var(--aw-grad-card, none), var(--aw-img-card, none);
  background-size: auto, auto, 100% 100%, var(--aw-img-card-size, cover);
  background-repeat: repeat, no-repeat, no-repeat, var(--aw-img-card-repeat, no-repeat);
  background-position: 0 0, center;
}`);
  }
  if (clean.settings.image) {
    rules.push(`#settings .box {
  background-color: rgba(0, 0, 0, 0.12);
}`);
  }

  // A translucent layer clears app.css's backdrop blur; at 0% opacity, border and shadow go too,
  // or an "invisible" panel still draws its own silhouette.
  const crisp = (selector, layer) => {
    const radius = layerBlurRadius(layer);
    if (radius > 0) {
      rules.push(`${selector} {
  backdrop-filter: blur(${radius}px);
  -webkit-backdrop-filter: blur(${radius}px);
}`);
      return;
    }
    if (!layerIsTranslucent(layer)) return;
    const cleared =
      colorAlpha(layer.color) === 0
        ? `
  border-color: transparent;
  box-shadow: none;`
        : '';
    rules.push(`${selector} {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;${cleared}
}`);
  };
  crisp('title-bar', clean.header);
  crisp('#game-list', clean.panel);
  crisp('#game-list .game-box', clean.card);
  crisp(`#settings .box,
#game-config .box`, clean.settings);

  // The scrim behind the Settings modal belongs to the same layer as the modal, so it fades with
  // it instead of staying opaque when the Settings layer goes translucent.
  if (layerIsTranslucent(clean.settings)) {
    rules.push(`#settings .overlay,
#game-config .overlay {
  background-color: color-mix(in srgb, var(--set-scrim) ${colorAlpha(clean.settings.color)}%, transparent);
  background-image: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}`);
  }

  return rules.join('\n\n') + '\n';
}

function buildOverlayCss(colors, imageTheme) {
  const bg = colors.bg;
  const header = colors.header;
  const card = colors.card;
  const text = colors.text;
  const muted = colors.muted;
  const border = colors.border;
  const accent = colors.accent;
  const accentRgb = hexToRgbTriplet(accent);
  const images = imageTheme
    ? {
        bg: imageTheme.bg,
        header: imageTheme.header,
        panel: imageTheme.panel,
        card: imageTheme.card,
      }
    : { bg: null, header: null, panel: null, card: null };

  const imgVars = [];
  for (const id of ['bg', 'header', 'panel', 'card']) {
    const layer = images[id];
    imgVars.push(`  --aw-img-${id}: ${layer && effectiveImage(layer) ? imageUrl(effectiveImage(layer)) : 'none'};`);
    imgVars.push(`  --aw-veil-${id}: ${layer ? veilRgba(layer) : 'transparent'};`);
    imgVars.push(`  --aw-grad-${id}: ${layerGradient(layer)};`);
    const fit = layer && layer.fit ? fitProps(layer.fit) : fitProps('cover');
    imgVars.push(`  --aw-img-${id}-size: ${fit.split('; ')[0].replace('size:', '')};`);
    imgVars.push(`  --aw-img-${id}-repeat: ${fit.split('; ')[1].replace('repeat:', '')};`);
  }

  const rules = [
    ':root {',
    `  --aw-theme-bg: ${bg};`,
    `  --aw-theme-header: ${header};`,
    `  --aw-theme-surface: ${card};`,
    `  --aw-theme-text: ${text};`,
    `  --aw-theme-muted: ${muted};`,
    `  --aw-theme-border: ${border};`,
    `  --aw-theme-accent: ${accent};`,
    ...imgVars,
    `  --accent: var(--aw-theme-accent);
  --accent-rgb: ${accentRgb};
  --bg: color-mix(in srgb, var(--aw-theme-bg) calc(var(--panel-alpha, 0.88) * 100%), transparent);
  --bg-soft: color-mix(in srgb, var(--aw-theme-surface) 55%, transparent);
  --bg-hover: color-mix(in srgb, var(--aw-theme-surface) 72%, transparent);
  --text: var(--aw-theme-text);
  --muted: var(--aw-theme-muted);
  --border: color-mix(in srgb, var(--aw-theme-border) 55%, transparent);`,
    '}',
    '',
    `.overlay-panel {
  ${gradientEnabled(images.bg) ? 'background-color: transparent;' : ''}
  background-image: ${veilLayer(images.bg)}, var(--aw-grad-bg, none), var(--aw-img-bg, none);
  background-size: auto, 100% 100%, var(--aw-img-bg-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-bg-repeat, no-repeat);
  background-position: center;
}`,
    '',
    `.overlay-header {
  background-color: ${gradientEnabled(images.header) ? 'transparent' : 'color-mix(in srgb, var(--aw-theme-header) 70%, transparent)'};
  background-image: ${veilLayer(images.header)}, var(--aw-grad-header, none), var(--aw-img-header, none);
  background-size: auto, 100% 100%, var(--aw-img-header-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-header-repeat, no-repeat);
  background-position: center;
}`,
    '',
    `.overlay-tools,
.overlay-stats {
  ${gradientEnabled(images.panel) ? 'background-color: transparent;' : ''}
  background-image: ${veilLayer(images.panel)}, var(--aw-grad-panel, none), var(--aw-img-panel, none);
  background-size: auto, 100% 100%, var(--aw-img-panel-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-panel-repeat, no-repeat);
  background-position: center;
}`,
    '',
    `.overlay-row {
  ${gradientEnabled(images.card) ? 'background-color: transparent;' : ''}
  background-image: ${veilLayer(images.card)}, var(--aw-grad-card, none), var(--aw-img-card, none);
  background-size: auto, 100% 100%, var(--aw-img-card-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-card-repeat, no-repeat);
  background-position: center;
}`,
    '',
    `.overlay-row:hover {
  background-color: ${gradientEnabled(images.card) ? 'transparent' : 'var(--bg-hover)'};
  background-image: ${veilLayer(images.card)}, var(--aw-grad-card, none), var(--aw-img-card, none);
  background-size: auto, 100% 100%, var(--aw-img-card-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-card-repeat, no-repeat);
  background-position: center;
}`,
  ];

  // Same rule as the main window: when an image is set, the layer color must not
  // cover it - keep a light dark scrim for readability instead.
  if (images.bg && images.bg.image) {
    rules.push(`.overlay-panel {
  background-color: rgba(0, 0, 0, 0.25);
  background-image: ${veilLayer(images.bg)}, var(--aw-grad-bg, none), var(--aw-img-bg, none);
  background-size: auto, 100% 100%, var(--aw-img-bg-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-bg-repeat, no-repeat);
}`);
  }
  if (images.header && images.header.image) {
    rules.push(`.overlay-header {
  background-color: rgba(0, 0, 0, 0.25);
}`);
  }
  if (images.panel && images.panel.image) {
    rules.push(`.overlay-tools,
.overlay-stats {
  background-color: rgba(0, 0, 0, 0.25);
}`);
  }
  if (images.card && images.card.image) {
    rules.push(`.overlay-row {
  background-color: rgba(0, 0, 0, 0.18);
  background-image: ${veilLayer(images.card)}, var(--aw-grad-card, none), var(--aw-img-card, none);
  background-size: auto, 100% 100%, var(--aw-img-card-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-card-repeat, no-repeat);
}

.overlay-row:hover {
  background-color: rgba(0, 0, 0, 0.28);
  background-image: ${veilLayer(images.card)}, var(--aw-grad-card, none), var(--aw-img-card, none);
  background-size: auto, 100% 100%, var(--aw-img-card-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-card-repeat, no-repeat);
}`);
  }

  return rules.join('\n\n') + '\n';
}

function buildCustomOverlayCss(theme) {
  const clean = sanitizeCustomTheme(theme);
  return buildOverlayCss(
    {
      bg: clean.bg.color,
      header: clean.header.color,
      card: clean.card.color,
      text: clean.text.color,
      muted: clean.muted.color,
      border: clean.border.color,
      accent: clean.accent.color,
    },
    clean
  );
}

function buildBuiltinOverlayCss(themeName) {
  return buildOverlayCss(BUILTIN_COLORS[themeName] || BUILTIN_COLORS.default, null);
}

// `packTheme` is the layer model of an imported .awtheme, resolved to local paths by
// themePackage.js, and painted by the same generator as the Custom theme.
function themePayload(userDataPath, themeName, customTheme, userCss, packTheme) {
  const isCustom = themeName === 'custom';
  const isUserCss = String(themeName || '').startsWith('user:');
  const isPack = /^pack:/i.test(String(themeName || '')) && packTheme != null;
  const theme = isCustom ? sanitizeCustomTheme(customTheme) : isPack ? sanitizeCustomTheme(packTheme) : null;
  return {
    name: themeName || 'default',
    custom: isCustom,
    imported: isPack,
    appCss: theme ? buildCustomAppCss(theme) : '',
    overlayCss: theme ? buildCustomOverlayCss(theme) : buildBuiltinOverlayCss(themeName),
    userCss: isUserCss ? userCss || '' : '',
    customTheme: theme,
    builtinColors: BUILTIN_COLORS[themeName] || BUILTIN_COLORS.default,
    accent: theme ? theme.accent.color : (BUILTIN_COLORS[themeName] || BUILTIN_COLORS.default).accent,
  };
}

module.exports = {
  LAYER_IDS,
  IMAGE_LAYER_IDS,
  FITS,
  BUILTIN_COLORS,
  colorAlpha,
  colorWithAlpha,
  colorWithoutAlpha,
  customThemeFile,
  themeImagesDir,
  defaultCustomTheme,
  sanitizeCustomTheme,
  sanitizeCustomThemeName,
  loadCustomTheme,
  loadCustomThemeName,
  saveCustomTheme,
  hexToRgbTriplet,
  buildCustomAppCss,
  buildCustomOverlayCss,
  buildBuiltinOverlayCss,
  buildOverlayCss,
  themePayload,
};
