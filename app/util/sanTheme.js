'use strict';

/*
  The Steam Achievement Notifier theme format as data: each `customisation` key (SAN 1.9.47), its kind
  of value and its cleaning. A theme is kept whole and drawn by util/sanEngine, so keys are never
  remapped; here every value is re-typed and bounded, and each file key becomes a preset file name or ''.
*/

const path = require('path');
const { LAYOUT_IDS } = require('./sanEngine/engine.js');

const CORNERS = ['topleft', 'topcenter', 'topright', 'bottomleft', 'bottomcenter', 'bottomright'];
const TEXT_ELEMENTS = ['unlockmsg', 'title', 'desc'];

// What a value may be. `min`/`max` are generous on purpose: they stop nonsense, not taste.
const bool = { kind: 'bool' };
const num = (min, max) => ({ kind: 'num', min, max });
const color = { kind: 'color' };
const text = (max = 200) => ({ kind: 'text', max });
const oneOf = (...values) => ({ kind: 'enum', values });
const asset = (accept) => ({ kind: 'asset', accept });
const percent = num(0, 1000);
const offset = num(-2000, 2000);
const position = num(0, 3);

/*
  Every key, by kind. `internal` keys are SAN's own bookkeeping (shortcuts, theme lists, the
  screenshot overlay's placement): dropped, since nothing in AW Next reads them. Keys the table does
  not know (a newer SAN) are kept when they hold a plain value, and reported.
*/
const SAN_FIELDS = {
  soundmode: oneOf('file', 'folder'),
  soundfile: asset('sound'),
  sounddir: asset('sound-folder'),
  volume: num(0, 100),
  preset: oneOf(...LAYOUT_IDS, 'os'),
  displaytime: num(1, 120),
  scale: num(10, 1000),
  bgstyle: oneOf('solid', 'gradient', 'gameart', 'bgimg'),
  gradientangle: num(0, 360),
  bgimg: asset('image'),
  bgachicon: bool,
  bgimgbrightness: percent,
  brightness: percent,
  blur: num(0, 5000),
  roundness: num(0, 1000),
  fontsize: percent,
  usecustomfontsizes: bool,
  unlockmsgfontsize: percent,
  titlefontsize: percent,
  descfontsize: percent,
  opacity: num(0, 100),
  bgonly: bool,
  glow: bool,
  glowcolor: color,
  glowsize: num(0, 1000),
  glowx: offset,
  glowy: offset,
  glowanim: oneOf('off', 'pulse', 'double', 'focus', 'orbit', 'fluorescent', 'rainbow'),
  glowspeed: num(1, 1000),
  glowrarity: bool,
  glowcolorbronze: color,
  glowcolorsilver: color,
  glowcolorgold: color,
  mask: bool,
  maskimg: asset('image'),
  useoutline: bool,
  outline: oneOf('solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'),
  outlinecolor: color,
  outlinewidth: num(0, 1000),
  fontcolor: color,
  usecustomfontcolors: bool,
  unlockmsgfontcolor: color,
  titlefontcolor: color,
  descfontcolor: color,
  fontoutline: bool,
  fontoutlinecolor: color,
  fontoutlinescale: num(0, 100),
  fontshadow: bool,
  fontshadowcolor: color,
  fontshadowscale: num(0, 100),
  fontshadowx: offset,
  fontshadowy: offset,
  iconroundness: num(0, 100),
  usegameicon: bool,
  gameicontype: oneOf('icon', 'logo'),
  usecustomimgicon: bool,
  customimgicon: asset('image'),
  customicons: { kind: 'icons' },
  showdecoration: bool,
  pos: oneOf(...CORNERS),
  usecustompos: bool,
  custompos: { kind: 'point' },
  animdir: oneOf('up', 'down', 'left', 'right'),
  alldetails: bool,
  primarycolor: color,
  secondarycolor: color,
  tertiarycolor: color,
  gameart: text(400),
  customfont: asset('font'),
  showhiddenicon: bool,
  replacelogo: bool,
  hiddenicon: asset('image'),
  previewhiddenicon: bool,
  usepercent: bool,
  elems: { kind: 'elems' },
  sselems: { kind: 'elems' },
  hiddeniconpos: position,
  sshiddeniconpos: position,
  decorationpos: position,
  ssdecorationpos: position,
  percentpos: position,
  sspercentpos: position,
  percentbadge: bool,
  sspercentbadge: bool,
  percentbadgepos: oneOf(...CORNERS),
  sspercentbadgepos: oneOf(...CORNERS),
  percentbadgecolor: color,
  sspercentbadgecolor: color,
  percentbadgefontsize: percent,
  sspercentbadgefontsize: percent,
  percentbadgefontcolor: color,
  sspercentbadgefontcolor: color,
  percentbadgeroundness: num(0, 100),
  sspercentbadgeroundness: num(0, 100),
  percentbadgex: offset,
  sspercentbadgex: offset,
  percentbadgey: offset,
  sspercentbadgey: offset,
  percentbadgeimg: bool,
  sspercentbadgeimg: bool,
  percentbadgeimgbronze: asset('image'),
  sspercentbadgeimgbronze: asset('image'),
  percentbadgeimgsilver: asset('image'),
  sspercentbadgeimgsilver: asset('image'),
  percentbadgeimggold: asset('image'),
  sspercentbadgeimggold: asset('image'),
  ssdisplay: bool,
  iconanim: bool,
  iconscale: percent,
  iconshadowcolor: color,
  iconanimcolor: color,
  logoscale: percent,
  decorationscale: percent,
  showiconborder: bool,
  iconborderimg: asset('image'),
  iconborderpos: oneOf('front', 'back'),
  iconborderscale: percent,
  iconborderx: offset,
  iconbordery: offset,
  iconborderrarity: bool,
  iconborderimgbronze: asset('image'),
  iconborderimgsilver: asset('image'),
  textvspace: offset,
  decorationshadow: bool,
  usecustomtext: bool,
  customtextunlockmsg: text(),
  usegametitleunlockmsg: bool,
  customtexttitle: text(),
  usegametitletitle: bool,
  customtextdesc: text(),
  usegametitledesc: bool,
  // Older SAN releases: one custom unlock message and one "show the game's title" switch.
  customtext: text(),
  usegametitle: bool,
};

const SAN_INTERNAL = new Set(['usertheme', 'synctheme', 'shortcut', 'ssenabled', 'elemsmatch', 'ovpos', 'ovmatch', 'ovx', 'ovy']);

// What each kind of file may be, by extension. No script-capable format: SVG is checked separately.
const ASSET_EXT = {
  image: /\.(?:png|jpe?g|gif|webp|bmp|svg)$/i,
  font: /\.(?:ttf|otf|woff2?)$/i,
  sound: /\.(?:wav|mp3|ogg|flac|m4a|aac)$/i,
};

/*
  SAN's colour pickers write #rrggbb or #rrggbbaa. Kept exactly (alpha included: the engine sets
  them as CSS values), but only in shapes that cannot carry anything else into a stylesheet.
*/
const COLOR_RE = /^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(?:rgba?|hsla?)\([0-9.,%\s/+-]{1,60}\)|[a-z]{3,30})$/i;

function cleanColor(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return COLOR_RE.test(raw) ? raw : '';
}

function cleanNumber(value, spec) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(spec.max, Math.max(spec.min, parsed));
}

// Theme text is drawn with textContent, so only control characters and length need taming.
function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max);
}

// The file part of a path SAN wrote on whatever machine exported the theme.
function baseName(value) {
  if (typeof value !== 'string') return '';
  const raw = value.replace(/\\/g, '/').trim();
  const name = raw.slice(raw.lastIndexOf('/') + 1).trim();
  if (!name || name === '.' || name === '..' || /[\x00-\x1f<>:"|?*]/.test(name)) return '';
  return name;
}

/*
  Cleans one `customisation`. `resolveAsset(kind, value, key)` answers the preset-relative name of
  the file a path-valued key names (copying it as a side effect) or '' when it is not available;
  it is the only way a path survives. Returns the clean object and what happened to each key.
*/
function cleanCustomisation(raw, { resolveAsset } = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const resolve = typeof resolveAsset === 'function' ? resolveAsset : () => '';
  const out = {};
  const report = { kept: [], unknown: [], dropped: [], missing: [] };

  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const value = source[key];
    if (SAN_INTERNAL.has(key)) continue;
    const spec = SAN_FIELDS[key];
    if (!spec) {
      // A newer SAN than this table: a plain value is harmless data, so it travels with the theme.
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value;
      else if (typeof value === 'string') out[key] = cleanText(value, 400);
      else {
        report.dropped.push(key);
        continue;
      }
      report.unknown.push(key);
      continue;
    }
    const cleaned = cleanValue(key, value, spec, resolve, report);
    if (cleaned === undefined) {
      report.dropped.push(key);
      continue;
    }
    out[key] = cleaned;
    report.kept.push(key);
  }
  return { customisation: out, report };
}

function cleanValue(key, value, spec, resolve, report) {
  switch (spec.kind) {
    case 'bool':
      return typeof value === 'boolean' ? value : undefined;
    case 'num':
      return cleanNumber(value, spec);
    case 'color': {
      if (value === '' || value == null) return '';
      const clean = cleanColor(value);
      return clean || undefined;
    }
    case 'text':
      return cleanText(value, spec.max);
    case 'enum':
      return spec.values.includes(value) ? value : undefined;
    case 'asset': {
      if (!value) return '';
      const name = resolve(spec.accept, value, key);
      if (!name) report.missing.push({ key, name: baseName(value) });
      return name;
    }
    case 'elems': {
      if (!Array.isArray(value)) return undefined;
      return value.slice(0, 3).map((elem) => (TEXT_ELEMENTS.includes(elem) ? elem : null));
    }
    case 'point': {
      if (!value || typeof value !== 'object') return undefined;
      return { x: cleanNumber(value.x, { min: -100000, max: 100000 }) || 0, y: cleanNumber(value.y, { min: -100000, max: 100000 }) || 0 };
    }
    case 'icons':
      return cleanIcons(value, resolve, report);
  }
}

/*
  `customicons` maps each base card to its logo and decoration: a path, three paths (bronze, silver,
  gold) or nothing. SAN exports the card in use (plus `plat`) and blanks the others.
*/
function cleanIcons(value, resolve, report) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  for (const card of Object.keys(value)) {
    if (!LAYOUT_IDS.includes(card) && card !== 'plat' && card !== 'os') continue;
    const entry = value[card];
    if (typeof entry === 'string') {
      // `plat` is a single picture (the completion ribbon), not a logo/decoration pair.
      const name = entry ? resolve('image', entry, `customicons.${card}`) : '';
      if (entry && !name) report.missing.push({ key: `customicons.${card}`, name: baseName(entry) });
      out[card] = name;
      continue;
    }
    if (!entry || typeof entry !== 'object') {
      out[card] = null;
      continue;
    }
    const icons = {};
    for (const slot of ['logo', 'decoration']) {
      const raw = entry[slot];
      const one = (file) => {
        if (!file || typeof file !== 'string') return '';
        const name = resolve('image', file, `customicons.${card}.${slot}`);
        if (!name) report.missing.push({ key: `customicons.${card}.${slot}`, name: baseName(file) });
        return name;
      };
      if (Array.isArray(raw)) icons[slot] = raw.slice(0, 3).map(one);
      else icons[slot] = raw ? one(raw) : null;
    }
    out[card] = icons;
  }
  return out;
}

function assetAccepts(kind, name) {
  const pattern = ASSET_EXT[kind];
  return Boolean(pattern && pattern.test(name));
}

/*
  An SVG is only ever drawn as an image (CSS url() or <img>), where Chromium runs no script and
  loads nothing external; it is still refused when it carries anything script-shaped, so a theme
  file opened some other way later can't do more than a picture.
*/
function isSafeSvg(buffer) {
  const textValue = buffer.toString('utf8');
  if (!/<svg[\s>]/i.test(textValue)) return false;
  return !/<script|<foreignobject|\son[a-z]+\s*=|javascript:|<!entity|xlink:href\s*=\s*["']?(?:https?:|\/\/)|href\s*=\s*["']?(?:https?:|\/\/)/i.test(textValue);
}

function extensionOf(name) {
  return path.extname(String(name || '')).toLowerCase();
}

module.exports = {
  SAN_FIELDS,
  SAN_INTERNAL,
  cleanCustomisation,
  baseName,
  assetAccepts,
  isSafeSvg,
  extensionOf,
};
