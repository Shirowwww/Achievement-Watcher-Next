'use strict';

/*
  Import a Steam Achievement Notifier theme and turn it into an ordinary AW Next preset.

  This is a one-way ADAPTER, not a compatibility layer. Nothing here runs afterwards: a `.san` theme
  is read once, mapped onto util/presetSchema.js, and written out through the same generator the
  preset designer uses. What lands on disk is a normal generated preset - index.html, style.css and
  aw-preset.json - so it is editable in the designer, exportable as an .awpreset, and behaves
  exactly like a preset built here. AW Next never reads a SAN file again, and removing this module
  would not affect a single preset it produced.

  The format, as SAN writes it (src/app/usertheme.ts):

    <name>.san            a plain zip under another extension
    usertheme.json        { id, label, icon, customisation, enabled, version?, userthemedir? }
    assets/**             every file the theme references, flattened to its basename
                          (a `sounddir` becomes one folder of audio under assets/)

  Inside `customisation`, every path-valued key holds an absolute path from the machine that wrote
  the theme. Only the BASENAME is ever used here, looked up inside the package - an absolute path
  from someone else's disk is not something to open.

  Trust model. A theme is untrusted data from an unknown machine:

    * nothing in a package is executed, required or evaluated. Only JSON.parse runs, on one file.
    * every zip entry goes through safePackagePath(); anything that is not usertheme.json or a file
      directly under assets/ is refused, and a path that does not clean up to exactly what the
      package claimed is treated as a traversal attempt.
    * only images and audio are ever written out, by extension AND under the size limits below.
      SVG is not among them: it is a document that can carry script.
    * every mapped value is re-clamped by normalizeOptions(), so a hand-edited theme cannot widen a
      range, name a font, or put anything unquoted into the generated stylesheet.
    * the preset is built in a staging folder and moved in one rename, so a failure anywhere leaves
      the preset storage exactly as it was.

  What could not be carried over is REPORTED rather than being a reason to fail: SAN describes a
  card AW Next does not draw (its own decorations, logos, badges and screenshot variants), and a
  theme that uses them is still worth importing for its colours, corners, motion and sound.
*/

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { normalizeOptions, COLOR_RE, ASSET_RE } = require('./presetSchema.js');
const { sanitizePresetName, PRESET_OPTIONS_FILE, PRESET_PACKAGE_FILE, buildCustomPresetHtml, buildCustomPresetCss } = require('./customPreset.js');
const { SOUND_EXT_RE } = require('./notificationSounds.js');
const presetPackage = require('./presetPackage.js');
const { safePackagePath, isInside, installSideFile, PRESET_PACKAGE_FORMAT, PRESET_PACKAGE_FORMAT_VERSION } = presetPackage;

const SAN_THEME_EXTENSION = '.san';
const SAN_MANIFEST = 'usertheme.json';
const SAN_ASSETS_DIR = 'assets';

// What the manifest records as the origin, and what a re-export carries on.
const SAN_ORIGIN_APP = 'Steam Achievement Notifier';
const SAN_ORIGIN_FORMAT = 'san-usertheme';

/*
  Deliberately tighter than the .awpreset limits. A theme is a handful of small images and one
  sound; anything approaching these numbers is not a theme, and the cost of refusing a legitimate
  outlier is one message rather than an unbounded extraction.
*/
const SAN_LIMITS = {
  packageBytes: 96 * 1024 * 1024,
  fileBytes: 16 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  entries: 400,
  manifestBytes: 4 * 1024 * 1024,
  sounds: 24,
};

// --- what a SAN theme can say ------------------------------------------------------------------

/*
  Every key SAN's `Customisation` carries, and what becomes of it. This table is the contract:
  a key missing from it is reported as unrecognised rather than silently dropped, and a test asserts
  that the whole of SAN's own default object is accounted for here.

    mapped        turned into the AW Next property named by `to`
    app-setting   real in AW Next, but a setting of the app rather than part of a preset
    unsupported   describes something an AW Next popup does not draw
    internal      SAN bookkeeping, never a design decision - not worth reporting either way

  `note` sends a key to the report as a sentence of its own instead of a name in the lost list. Only
  for the one or two whose name would mislead: SAN's `preset` is the base card its own themes are
  built on, and "preset" in AW Next means the thing the user has just created.

  `gate` names the boolean that has to be on for the key to be doing anything. It keeps the report
  about what the author actually used: a theme that never turned the mask on should not be told its
  mask image was ignored.
*/
const SAN_KEYS = [
  // --- carried over ----------------------------------------------------------------------------
  { key: 'displaytime', code: 'mapped', to: 'duration' },
  { key: 'roundness', code: 'mapped', to: 'radius' },
  { key: 'iconroundness', code: 'mapped', to: 'iconRadius' },
  { key: 'fontsize', code: 'mapped', to: 'fontSize' },
  { key: 'usecustomfontsizes', code: 'mapped', to: 'fontSize' },
  { key: 'titlefontsize', code: 'mapped', to: 'fontSize', gate: 'usecustomfontsizes' },
  { key: 'descfontsize', code: 'mapped', to: 'detailScale', gate: 'usecustomfontsizes' },
  { key: 'opacity', code: 'mapped', to: 'opacity' },
  { key: 'bgstyle', code: 'mapped', to: 'bgMode' },
  { key: 'gradientangle', code: 'mapped', to: 'bgAngle' },
  { key: 'primarycolor', code: 'mapped', to: 'bg' },
  { key: 'secondarycolor', code: 'mapped', to: 'bg2' },
  { key: 'tertiarycolor', code: 'mapped', to: 'accent' },
  { key: 'fontcolor', code: 'mapped', to: 'text' },
  { key: 'usecustomfontcolors', code: 'mapped', to: 'text' },
  { key: 'descfontcolor', code: 'mapped', to: 'text', gate: 'usecustomfontcolors' },
  { key: 'titlefontcolor', code: 'mapped', to: 'titleColor', gate: 'usecustomfontcolors' },
  { key: 'brightness', code: 'mapped', to: 'artworkDim' },
  { key: 'bgimgbrightness', code: 'mapped', to: 'artworkDim' },
  { key: 'blur', code: 'mapped', to: 'artworkBlur' },
  { key: 'bgimg', code: 'mapped', to: 'bgImage' },
  { key: 'useoutline', code: 'mapped', to: 'borderWidth' },
  { key: 'outlinewidth', code: 'mapped', to: 'borderWidth', gate: 'useoutline' },
  { key: 'outlinecolor', code: 'mapped', to: 'borderColor', gate: 'useoutline' },
  { key: 'glow', code: 'mapped', to: 'glow' },
  { key: 'glowsize', code: 'mapped', to: 'glow', gate: 'glow' },
  { key: 'glowcolor', code: 'mapped', to: 'accent', gate: 'glow' },
  { key: 'glowanim', code: 'mapped', to: 'glowAnim', gate: 'glow' },
  { key: 'glowrarity', code: 'mapped', to: 'rareAccent', gate: 'glow' },
  { key: 'glowcolorgold', code: 'mapped', to: 'rareAccent', gate: 'glowrarity' },
  { key: 'glowcolorsilver', code: 'mapped', to: 'rareSilver', gate: 'glowrarity' },
  { key: 'glowcolorbronze', code: 'mapped', to: 'rareBronze', gate: 'glowrarity' },
  { key: 'fontshadow', code: 'mapped', to: 'textShadow' },
  { key: 'fontshadowscale', code: 'mapped', to: 'textShadow', gate: 'fontshadow' },
  { key: 'fontoutline', code: 'mapped', to: 'textStroke' },
  { key: 'fontoutlinescale', code: 'mapped', to: 'textStroke', gate: 'fontoutline' },
  { key: 'fontoutlinecolor', code: 'mapped', to: 'textStrokeColor', gate: 'fontoutline' },
  { key: 'iconscale', code: 'mapped', to: 'iconSize' },
  { key: 'showiconborder', code: 'mapped', to: 'iconBorder' },
  { key: 'iconanim', code: 'mapped', to: 'iconGlow' },
  { key: 'usegametitle', code: 'mapped', to: 'showGameName' },
  { key: 'usepercent', code: 'mapped', to: 'showRarity' },
  { key: 'animdir', code: 'mapped', to: 'animIn' },
  { key: 'customfont', code: 'mapped', to: 'fontFamily' },
  { key: 'soundfile', code: 'mapped', to: 'sound', gate: 'soundmodeIsFile' },
  { key: 'soundmode', code: 'mapped', to: 'sound' },

  // --- real here, but a setting rather than a preset ---------------------------------------------
  { key: 'scale', code: 'app-setting' },
  { key: 'pos', code: 'app-setting' },
  { key: 'usecustompos', code: 'app-setting' },
  { key: 'custompos', code: 'app-setting', gate: 'usecustompos' },
  { key: 'volume', code: 'app-setting' },
  { key: 'sounddir', code: 'app-setting', gate: 'soundmodeIsFolder' },

  // --- a card AW Next does not draw ---------------------------------------------------------------
  { key: 'preset', code: 'unsupported', note: 'base-layout' },
  { key: 'customtext', code: 'unsupported' },
  { key: 'bgonly', code: 'unsupported' },
  { key: 'bgachicon', code: 'unsupported' },
  { key: 'gameart', code: 'unsupported' },
  { key: 'mask', code: 'unsupported' },
  { key: 'maskimg', code: 'unsupported', gate: 'mask' },
  { key: 'outline', code: 'unsupported', gate: 'useoutline' },
  { key: 'glowx', code: 'unsupported', gate: 'glow' },
  { key: 'glowy', code: 'unsupported', gate: 'glow' },
  { key: 'glowspeed', code: 'unsupported', gate: 'glow' },
  { key: 'unlockmsgfontsize', code: 'unsupported', gate: 'usecustomfontsizes' },
  { key: 'unlockmsgfontcolor', code: 'unsupported', gate: 'usecustomfontcolors' },
  { key: 'fontshadowcolor', code: 'unsupported', gate: 'fontshadow' },
  { key: 'fontshadowx', code: 'unsupported', gate: 'fontshadow' },
  { key: 'fontshadowy', code: 'unsupported', gate: 'fontshadow' },
  { key: 'usegameicon', code: 'unsupported' },
  { key: 'gameicontype', code: 'unsupported', gate: 'usegameicon' },
  { key: 'usecustomimgicon', code: 'unsupported' },
  { key: 'customimgicon', code: 'unsupported', gate: 'usecustomimgicon' },
  { key: 'customicons', code: 'unsupported' },
  { key: 'showdecoration', code: 'unsupported' },
  { key: 'decorationpos', code: 'unsupported', gate: 'showdecoration' },
  { key: 'decorationscale', code: 'unsupported', gate: 'showdecoration' },
  { key: 'replacelogo', code: 'unsupported' },
  { key: 'logoscale', code: 'unsupported' },
  { key: 'showhiddenicon', code: 'unsupported' },
  { key: 'hiddenicon', code: 'unsupported', gate: 'showhiddenicon' },
  { key: 'hiddeniconpos', code: 'unsupported', gate: 'showhiddenicon' },
  { key: 'previewhiddenicon', code: 'unsupported' },
  { key: 'percentpos', code: 'unsupported', gate: 'usepercent' },
  { key: 'percentbadge', code: 'unsupported' },
  { key: 'percentbadgepos', code: 'unsupported', gate: 'percentbadge' },
  { key: 'percentbadgecolor', code: 'unsupported', gate: 'percentbadge' },
  { key: 'percentbadgefontsize', code: 'unsupported', gate: 'percentbadge' },
  { key: 'percentbadgefontcolor', code: 'unsupported', gate: 'percentbadge' },
  { key: 'percentbadgeroundness', code: 'unsupported', gate: 'percentbadge' },
  { key: 'percentbadgex', code: 'unsupported', gate: 'percentbadge' },
  { key: 'percentbadgey', code: 'unsupported', gate: 'percentbadge' },
  { key: 'percentbadgeimg', code: 'unsupported', gate: 'percentbadge' },
  { key: 'percentbadgeimgbronze', code: 'unsupported', gate: 'percentbadgeimg' },
  { key: 'percentbadgeimgsilver', code: 'unsupported', gate: 'percentbadgeimg' },
  { key: 'percentbadgeimggold', code: 'unsupported', gate: 'percentbadgeimg' },
  { key: 'iconshadowcolor', code: 'unsupported', gate: 'iconanim' },
  { key: 'iconanimcolor', code: 'unsupported', gate: 'iconanim' },
  { key: 'iconborderimg', code: 'unsupported', gate: 'showiconborder' },
  { key: 'iconborderpos', code: 'unsupported', gate: 'showiconborder' },
  { key: 'iconborderscale', code: 'unsupported', gate: 'showiconborder' },
  { key: 'iconborderx', code: 'unsupported', gate: 'showiconborder' },
  { key: 'iconbordery', code: 'unsupported', gate: 'showiconborder' },
  { key: 'iconborderrarity', code: 'unsupported', gate: 'showiconborder' },
  { key: 'iconborderimgbronze', code: 'unsupported', gate: 'iconborderrarity' },
  { key: 'iconborderimgsilver', code: 'unsupported', gate: 'iconborderrarity' },
  { key: 'textvspace', code: 'unsupported' },
  { key: 'elems', code: 'unsupported' },
  { key: 'alldetails', code: 'unsupported' },
  // The screenshot family. SAN redraws the popup for its screenshot overlay with a second set of
  // element choices; AW Next's souvenir captures the screen as it is, so none of them apply.
  { key: 'ssdisplay', code: 'unsupported' },
  { key: 'ssenabled', code: 'unsupported' },
  { key: 'sselems', code: 'unsupported' },
  { key: 'sshiddeniconpos', code: 'unsupported', gate: 'showhiddenicon' },
  { key: 'ssdecorationpos', code: 'unsupported' },
  { key: 'sspercentpos', code: 'unsupported' },
  { key: 'sspercentbadge', code: 'unsupported' },
  { key: 'sspercentbadgepos', code: 'unsupported', gate: 'sspercentbadge' },
  { key: 'sspercentbadgecolor', code: 'unsupported', gate: 'sspercentbadge' },
  { key: 'sspercentbadgefontsize', code: 'unsupported', gate: 'sspercentbadge' },
  { key: 'sspercentbadgefontcolor', code: 'unsupported', gate: 'sspercentbadge' },
  { key: 'sspercentbadgeroundness', code: 'unsupported', gate: 'sspercentbadge' },
  { key: 'sspercentbadgex', code: 'unsupported', gate: 'sspercentbadge' },
  { key: 'sspercentbadgey', code: 'unsupported', gate: 'sspercentbadge' },
  { key: 'sspercentbadgeimg', code: 'unsupported', gate: 'sspercentbadge' },
  { key: 'sspercentbadgeimgbronze', code: 'unsupported', gate: 'sspercentbadgeimg' },
  { key: 'sspercentbadgeimgsilver', code: 'unsupported', gate: 'sspercentbadgeimg' },
  { key: 'sspercentbadgeimggold', code: 'unsupported', gate: 'sspercentbadgeimg' },

  // --- SAN's own bookkeeping ----------------------------------------------------------------------
  { key: 'usertheme', code: 'internal' },
  { key: 'synctheme', code: 'internal' },
  { key: 'shortcut', code: 'internal' },
  { key: 'elemsmatch', code: 'internal' },
  { key: 'ovpos', code: 'internal' },
  { key: 'ovmatch', code: 'internal' },
  { key: 'ovx', code: 'internal' },
  { key: 'ovy', code: 'internal' },
];

const SAN_KEY_BY_NAME = new Map(SAN_KEYS.map((entry) => [entry.key, entry]));

/*
  What SAN writes when the user has not touched a control. Only the plain values are here: the
  defaults of the path-valued keys are absolute paths on the machine that built SAN, which this
  side cannot know, so those keys are gated on their own boolean instead.

  Nothing is decided from this table - it only keeps the "not carried over" list about what the
  author actually chose, rather than reciting every option SAN has.
*/
const SAN_DEFAULTS = {
  soundmode: 'file',
  volume: 100,
  preset: 'default',
  displaytime: 10,
  scale: 100,
  customtext: '',
  usegametitle: false,
  bgstyle: 'solid',
  gradientangle: 90,
  bgachicon: false,
  bgimgbrightness: 100,
  brightness: 100,
  blur: 0,
  roundness: 25,
  fontsize: 100,
  usecustomfontsizes: false,
  unlockmsgfontsize: 100,
  titlefontsize: 100,
  descfontsize: 100,
  opacity: 100,
  bgonly: false,
  glow: false,
  glowsize: 50,
  glowx: 0,
  glowy: 0,
  glowanim: 'off',
  glowspeed: 50,
  glowrarity: false,
  mask: false,
  useoutline: false,
  outline: 'solid',
  outlinewidth: 50,
  usecustomfontcolors: false,
  fontoutline: false,
  fontoutlinescale: 1,
  fontshadow: false,
  fontshadowcolor: '#000000',
  fontshadowscale: 1.5,
  fontshadowx: 0,
  fontshadowy: 0,
  iconroundness: 0,
  usegameicon: false,
  gameicontype: 'icon',
  usecustomimgicon: false,
  showdecoration: false,
  pos: 'bottomcenter',
  usecustompos: false,
  animdir: 'up',
  alldetails: false,
  gameart: '',
  showhiddenicon: true,
  replacelogo: false,
  previewhiddenicon: false,
  usepercent: false,
  elems: ['unlockmsg', 'title', 'desc'],
  sselems: ['title', 'desc'],
  hiddeniconpos: 2,
  sshiddeniconpos: 2,
  decorationpos: 1,
  ssdecorationpos: 1,
  percentpos: 1,
  sspercentpos: 1,
  percentbadge: false,
  sspercentbadge: false,
  percentbadgepos: 'bottomcenter',
  sspercentbadgepos: 'bottomcenter',
  percentbadgefontsize: 100,
  sspercentbadgefontsize: 100,
  percentbadgefontcolor: '#ffffff',
  sspercentbadgefontcolor: '#ffffff',
  percentbadgeroundness: 50,
  sspercentbadgeroundness: 50,
  percentbadgex: 0,
  sspercentbadgex: 0,
  percentbadgey: 0,
  sspercentbadgey: 0,
  percentbadgeimg: false,
  sspercentbadgeimg: false,
  ssdisplay: false,
  ssenabled: true,
  iconanim: false,
  iconshadowcolor: '#ffb84e99',
  iconanimcolor: '#ffb84e',
  iconscale: 100,
  logoscale: 100,
  decorationscale: 100,
  showiconborder: false,
  iconborderpos: 'front',
  iconborderscale: 100,
  iconborderx: 0,
  iconbordery: 0,
  iconborderrarity: false,
  textvspace: 0,
};

// SAN names a font file; AW Next only ever uses a family Windows already has, so the file is matched
// by name to the closest stack rather than shipped and loaded (see the note in presetSchema.js).
const SAN_FONT_FAMILIES = [
  [/jetbrains|vt323|mono|consol|courier|code|hack/i, 'mono'],
  [/titillium|bahnschrift|condens|oswald|impact|anton/i, 'condensed'],
  [/georgia|times|serif|garamond|merriweather|playfair/i, 'serif'],
  [/mandali|round|comfortaa|quicksand|nunito|varela/i, 'rounded'],
];

// SAN's six glow animations onto the two AW Next draws. `rainbow` cycles hue, which the accent-based
// glow cannot do, so it lands on the slow one rather than being dropped.
const SAN_GLOW_ANIMS = { off: 'none', pulse: 'pulse', double: 'pulse', fluorescent: 'pulse', focus: 'breathe', orbit: 'breathe', rainbow: 'breathe' };

// SAN names the direction the card travels; AW Next names the edge it comes from, so these are
// opposites and not a table that can be written by hand twice.
const SAN_ANIM_EDGE = { up: 'bottom', down: 'top', left: 'right', right: 'left' };

const SAN_BG_MODES = { solid: 'solid', gradient: 'gradient', gameart: 'artwork', bgimg: 'image' };

/*
  The sentences a report can carry, beyond the per-key lists. They are stated in full rather than
  implied, because each is a structural difference between the two apps rather than one lost option.
*/
const SAN_NOTES = ['states-merged', 'base-layout'];

// The notification type a theme was exported from, when SAN stamped it into the folder name.
const SAN_TYPE_SUFFIX = /_(main|semi|rare|plat)$/;

// --- value helpers -------------------------------------------------------------------------------

/*
  A value as text, whatever it turns out to be. JSON can only produce plain values, so this is only
  ever load-bearing for a caller passing an object of its own - but mapping is a pure function that
  should not be able to throw for any input at all, and one of these coercions runs on every key.
*/
function text(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return String(value);
  } catch {
    return '';
  }
}

function number(value, fallback) {
  // Number() runs valueOf/toString, which a hand-built object can make throw.
  let parsed;
  try {
    parsed = Number(value);
  } catch {
    return fallback;
  }
  return Number.isFinite(parsed) ? parsed : fallback;
}

/*
  A colour AW Next can show. SAN writes 8-digit hex for the values that carry alpha, and an
  <input type="color"> can only show six, so the alpha is dropped rather than the colour. Anything
  that is not a colour at all returns '' and the caller keeps its own default.
*/
function color(value) {
  const raw = text(value).trim();
  if (!raw || !COLOR_RE.test(raw)) return '';
  const hex = /^#([0-9a-f]{8})$/i.exec(raw);
  if (hex) return `#${hex[1].slice(0, 6)}`;
  const short = /^#([0-9a-f]{4})$/i.exec(raw);
  if (short) return `#${short[1].slice(0, 3)}`;
  return raw;
}

// The filename half of a path SAN wrote on another machine. Everything else about it is discarded.
function basename(value) {
  const raw = text(value).replace(/\\/g, '/');
  if (!raw) return '';
  const name = raw.slice(raw.lastIndexOf('/') + 1).trim();
  // Back through the package-path rules: a name is only usable if it is a plain, single segment.
  return name && safePackagePath(name) === name ? name : '';
}

function fontFamily(file) {
  const name = basename(file);
  if (!name) return '';
  for (const [pattern, family] of SAN_FONT_FAMILIES) if (pattern.test(name)) return family;
  return 'sans';
}

// --- mapping -------------------------------------------------------------------------------------

/*
  Turn one SAN `customisation` into a complete, validated set of designer options plus a report of
  what happened to every key it carried.

  Pure: no file is read and nothing is written, so the whole mapping is testable on a literal. The
  two asset-valued results (`bgImage`, `sound`) come back as the basenames the theme asked for, in
  `assets`; only the installer can say whether the package actually contains them.
*/
function mapSanCustomisation(customisation) {
  const source = customisation && typeof customisation === 'object' && !Array.isArray(customisation) ? customisation : {};
  const on = (key) => source[key] === true;

  const options = {};
  const set = (key, value) => {
    if (value !== '' && value !== undefined && value !== null) options[key] = value;
  };

  // --- size, spacing and text ---
  set('duration', Math.round(number(source.displaytime, 6) * 1000));
  set('radius', Math.round(number(source.roundness, 25) / 4));

  const iconRoundness = number(source.iconroundness, 0);
  set('iconRadius', iconRoundness >= 100 ? 50 : Math.round(iconRoundness / 2.4));
  set('iconSize', Math.round(64 * (number(source.iconscale, 100) / 100)));

  const customSizes = on('usecustomfontsizes');
  const titlePercent = customSizes ? number(source.titlefontsize, 100) : number(source.fontsize, 100);
  set('fontSize', Math.round(16 * (titlePercent / 100)));
  if (customSizes) set('detailScale', Math.round((number(source.descfontsize, 100) / (titlePercent || 100)) * 100));

  set('opacity', number(source.opacity, 100) / 100);

  // --- background ---
  const bgMode = SAN_BG_MODES[text(source.bgstyle)] || 'solid';
  set('bgMode', bgMode);
  set('bgAngle', Math.round(number(source.gradientangle, 90)));
  set('bg', color(source.primarycolor));
  set('bg2', color(source.secondarycolor));
  /*
    SAN dims a picture with a CSS brightness filter and AW Next by lowering the layer's opacity.
    Neither is the other, but "how much of the picture is left" is the same question, and the two
    read the same at the values people actually use.
  */
  if (bgMode === 'artwork') set('artworkDim', Math.max(0, Math.min(100, 100 - number(source.brightness, 100))));
  if (bgMode === 'image') set('artworkDim', Math.max(0, Math.min(100, 100 - number(source.bgimgbrightness, 100))));
  // SAN's slider becomes `blur / 50` px, so its whole range is two pixels.
  set('artworkBlur', Math.round(number(source.blur, 0) / 50));

  // --- text colour ---
  const customColors = on('usecustomfontcolors');
  const bodyColor = color(customColors ? source.descfontcolor : source.fontcolor) || color(source.fontcolor);
  set('text', bodyColor);
  const titleColor = customColors ? color(source.titlefontcolor) : '';
  if (titleColor && titleColor !== bodyColor) {
    options.titleColorMode = 'custom';
    options.titleColor = titleColor;
  } else {
    // SAN prints the achievement name in the font colour, not in an accent. Following the accent is
    // AW Next's own default, so a theme that says nothing has to be told to stop.
    options.titleColorMode = 'text';
  }

  /*
    The accent, which AW Next uses for the bar, the title and the progress meter. SAN has no such
    single colour: `tertiarycolor` is what its presets tint their own marks with, and it defaults to
    plain white, so a glow colour the author did choose is the better answer when it exists.
  */
  const tertiary = color(source.tertiarycolor);
  const glowColor = on('glow') ? color(source.glowcolor) : '';
  const accent = tertiary && !/^#f{3,6}$/i.test(tertiary) ? tertiary : glowColor || tertiary;
  set('accent', accent);

  // --- text effects ---
  if (on('fontshadow')) set('textShadow', Math.max(0, Math.min(100, Math.round(number(source.fontshadowscale, 1.5) * 40))));
  else set('textShadow', 0);
  if (on('fontoutline')) {
    set('textStroke', Math.max(0, Math.min(3, number(source.fontoutlinescale, 1))));
    set('textStrokeColor', color(source.fontoutlinecolor));
  } else {
    options.textStroke = 0;
  }

  // --- border, and the accent bar SAN does not have ---
  if (on('useoutline')) {
    set('borderWidth', Math.max(0, Math.min(6, Math.round(number(source.outlinewidth, 50) / 25))));
    set('borderColor', color(source.outlinecolor));
  } else {
    options.borderWidth = 0;
  }
  // A SAN card is a plain plate. AW Next puts an accent rail down the left by default, which would
  // be an edge the theme never had, so an imported design starts without one.
  options.accentBar = 'none';

  // --- glow ---
  if (on('glow')) {
    // SAN's whole glow range is 0.6rem of blur; AW Next's is 22px. Matched by the pixels they draw
    // rather than by the number on the slider, which would be four times too strong.
    set('glow', Math.max(0, Math.min(100, Math.round(number(source.glowsize, 50) * (9.6 / 22) * 0.2) * 5)));
    set('glowAnim', SAN_GLOW_ANIMS[text(source.glowanim) || 'off'] || 'none');
  } else {
    options.glow = 0;
    options.glowAnim = 'none';
  }
  if (on('glowrarity')) {
    set('rareAccent', color(source.glowcolorgold));
    set('rareSilver', color(source.glowcolorsilver));
    set('rareBronze', color(source.glowcolorbronze));
  }

  // --- icon ---
  set('iconBorder', on('showiconborder') ? 2 : 0);
  set('iconGlow', on('iconanim') ? 50 : 0);

  // --- rows the popup prints ---
  options.showGameName = on('usegametitle');
  options.showRarity = on('usepercent');

  // --- motion ---
  const edge = SAN_ANIM_EDGE[text(source.animdir)] || '';
  if (edge) {
    options.animIn = edge;
    options.animOut = edge;
  }

  // --- font ---
  set('fontFamily', fontFamily(source.customfont));

  const assets = {
    bgImage: bgMode === 'image' ? basename(source.bgimg) : '',
    sound: (text(source.soundmode) || 'file') === 'file' ? basename(source.soundfile) : '',
  };

  /*
    The report. A key is only listed once it was actually in use: present in the theme, past its own
    gate, and not still sitting on the value SAN writes for everyone.
  */
  const mapped = [];
  const skipped = [];
  const notes = [];
  const gates = {
    soundmodeIsFile: (text(source.soundmode) || 'file') === 'file',
    soundmodeIsFolder: text(source.soundmode) === 'folder',
  };
  const passesGate = (entry) => {
    if (!entry.gate) return true;
    if (Object.prototype.hasOwnProperty.call(gates, entry.gate)) return gates[entry.gate];
    return on(entry.gate);
  };
  const isDefault = (key, value) => {
    if (!Object.prototype.hasOwnProperty.call(SAN_DEFAULTS, key)) return false;
    const fallback = SAN_DEFAULTS[key];
    // A list is compared by what is in it: SAN writes the same three element names for everyone.
    if (Array.isArray(fallback)) return Array.isArray(value) && JSON.stringify(fallback) === JSON.stringify(value);
    return fallback === value;
  };
  // Nothing chosen at all. An empty map of custom icons is not a custom icon that was lost.
  const isEmpty = (value) => {
    if (value == null || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    return typeof value === 'object' && Object.keys(value).length === 0;
  };

  for (const key of Object.keys(source)) {
    const entry = SAN_KEY_BY_NAME.get(key);
    if (!entry) {
      // A newer SAN than this adapter knows about. Reported, never a reason to refuse the theme.
      skipped.push({ key, code: 'unknown' });
      continue;
    }
    if (entry.code === 'internal') continue;
    if (!passesGate(entry)) continue;
    if (entry.code === 'mapped') {
      mapped.push({ key, to: entry.to });
      continue;
    }
    // An option left exactly as SAN ships it was never a choice, so saying it was lost is noise.
    const value = source[key];
    if (isDefault(key, value) || isEmpty(value)) continue;
    if (entry.note) {
      notes.push(entry.note);
      continue;
    }
    skipped.push({ key, code: entry.code });
  }

  /*
    Collapse a feature to the switch that turns it on.

    A theme using SAN's percentage badge sets six keys for it, and listing all six says nothing the
    word "percentbadge" did not already say - it just buries the other features that were lost. So a
    key whose own gate is already in the list is a detail of something the user has been told about,
    and only the switch is named. Tested against the unfiltered list, so a chain of gates collapses
    all the way to its root rather than one link at a time.
  */
  const named = new Set(skipped.map((entry) => entry.key));
  const collapsed = skipped.filter((entry) => {
    // A key this adapter does not know has no gate to collapse to; it is reported on its own.
    const known = SAN_KEY_BY_NAME.get(entry.key);
    const gate = known && known.gate;
    return !gate || !named.has(gate);
  });

  const byKey = (a, b) => a.key.localeCompare(b.key);
  mapped.sort(byKey);
  collapsed.sort(byKey);

  return {
    options: normalizeOptions(options),
    assets,
    report: { mapped, skipped: collapsed, assets: [], notes },
    // Only used to decide whether a missing background image should fall back to a flat colour.
    wantsImage: bgMode === 'image',
    // A folder of sounds still travels with the theme, even though the preset keeps no opinion.
    playsRandomSound: text(source.soundmode) === 'folder',
  };
}

// --- reading a package ----------------------------------------------------------------------------

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

/*
  A theme, as a manifest plus the assets that came with it.

  Two shapes are accepted, because both are what a user actually has: the `.san` file SAN exports,
  and the `usertheme.json` inside a theme SAN already imported (where the paths have been rewritten
  to a real folder on this machine). The folder form is read strictly below the folder that was
  picked, so it cannot be talked into opening anything else.
*/
function readSanTheme(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return fail('unreadable-theme');
  }
  if (!stat.isFile()) return fail('unreadable-theme');
  if (stat.size > SAN_LIMITS.packageBytes) return fail('theme-too-large');

  return path.basename(file).toLowerCase() === SAN_MANIFEST ? readThemeFolder(file) : readThemeZip(file, stat);
}

function parseManifest(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail('invalid-theme');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('invalid-theme');
  if (!parsed.customisation || typeof parsed.customisation !== 'object' || Array.isArray(parsed.customisation)) {
    return fail('invalid-theme');
  }
  return { ok: true, theme: parsed };
}

function readThemeZip(file, stat) {
  let entries;
  try {
    entries = new AdmZip(file).getEntries();
  } catch {
    return fail('unreadable-theme');
  }
  if (entries.length > SAN_LIMITS.entries) return fail('too-many-files');

  const seen = new Set();
  const assets = new Map();
  let manifestEntry = null;
  let total = 0;
  const rejected = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const raw = String(entry.entryName || '').replace(/\\/g, '/');
    if (seen.has(raw)) return fail('duplicate-entry');
    seen.add(raw);

    if (entry.header.size > SAN_LIMITS.fileBytes) return fail('asset-too-large');
    total += entry.header.size;
    if (total > SAN_LIMITS.totalBytes) return fail('theme-too-large');

    if (raw === SAN_MANIFEST) {
      if (entry.header.size > SAN_LIMITS.manifestBytes) return fail('invalid-theme');
      manifestEntry = entry;
      continue;
    }

    const clean = safePackagePath(raw);
    // A path that does not clean up to exactly what the package claimed is a traversal attempt.
    if (!clean || clean !== raw) return fail('unsafe-path', { path: raw });

    const parts = clean.split('/');
    if (parts[0] !== SAN_ASSETS_DIR || parts.length > 3) {
      rejected.push({ name: raw, code: 'asset-rejected' });
      continue;
    }
    const name = parts[parts.length - 1];
    // Only pictures and audio are ever written out, whatever else the theme brought with it.
    if (!ASSET_RE.test(name) && !SOUND_EXT_RE.test(name)) {
      rejected.push({ name, code: 'asset-rejected' });
      continue;
    }
    // SAN flattens assets to their basename, so the first of a duplicate name wins and the rest are
    // the same file under another folder.
    if (!assets.has(name.toLowerCase())) assets.set(name.toLowerCase(), { name, size: entry.header.size, read: () => entry.getData() });
  }

  if (!manifestEntry) return fail('missing-theme-manifest');
  const parsed = parseManifest(manifestEntry.getData().toString('utf8'));
  if (!parsed.ok) return parsed;
  return { ok: true, theme: parsed.theme, assets, rejected, source: 'package' };
}

function readThemeFolder(manifestFile) {
  let parsed;
  try {
    if (fs.statSync(manifestFile).size > SAN_LIMITS.manifestBytes) return fail('invalid-theme');
    parsed = parseManifest(fs.readFileSync(manifestFile, 'utf8'));
  } catch {
    return fail('unreadable-theme');
  }
  if (!parsed.ok) return parsed;

  const root = path.dirname(path.resolve(manifestFile));
  const assetsDir = path.join(root, SAN_ASSETS_DIR);
  const assets = new Map();
  const rejected = [];
  let total = 0;

  const walk = (dir, depth) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      // Nothing outside the folder that was picked, whatever a link or a name claims.
      if (!isInside(root, full)) continue;
      if (entry.isDirectory()) {
        if (depth < 1) walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (assets.size + rejected.length >= SAN_LIMITS.entries) return;
      if (!ASSET_RE.test(entry.name) && !SOUND_EXT_RE.test(entry.name)) {
        rejected.push({ name: entry.name, code: 'asset-rejected' });
        continue;
      }
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      if (size > SAN_LIMITS.fileBytes) {
        rejected.push({ name: entry.name, code: 'asset-rejected' });
        continue;
      }
      total += size;
      if (total > SAN_LIMITS.totalBytes) return;
      if (!assets.has(entry.name.toLowerCase())) assets.set(entry.name.toLowerCase(), { name: entry.name, size, read: () => fs.readFileSync(full) });
    }
  };
  walk(assetsDir, 0);

  return { ok: true, theme: parsed.theme, assets, rejected, source: 'folder' };
}

// --- installing ------------------------------------------------------------------------------------

function nextFreeName(presetsDir, name, taken) {
  for (let i = 2; i < 100; i += 1) {
    const candidate = sanitizePresetName(`${name} (${i})`);
    if (candidate && !taken.has(candidate.toLowerCase()) && !fs.existsSync(path.join(presetsDir, candidate))) return candidate;
  }
  return '';
}

// The preset a theme becomes, before any name clash is resolved.
function themeName(theme) {
  return sanitizePresetName(text(theme && theme.label)) || sanitizePresetName('SAN theme');
}

// Everything the user is shown about one import, in one place, so preview and install cannot differ.
function buildReport(read, mapping) {
  const theme = read.theme;
  const report = mapping.report;

  report.label = text(theme.label).slice(0, 80);
  report.sanVersion = text(theme.version).slice(0, 32);
  report.sanPreset = text(theme.customisation && theme.customisation.preset).slice(0, 32);
  const suffix = SAN_TYPE_SUFFIX.exec(text(theme.userthemedir));
  report.notifyType = suffix ? suffix[1] : '';

  /*
    The one structural difference worth stating outright: SAN keeps four separate themes and AW Next
    paints those states from one preset, so a `.san` file only ever carries one of the four and the
    other three are the imported preset's own rare and completion colours.
  */
  if (!report.notes.includes('states-merged')) report.notes.push('states-merged');
  for (const entry of read.rejected || []) report.assets.push(entry);
  return report;
}

/*
  Install a theme as an AW Next preset.

  Mirrors installPackage(): built in a staging folder and moved in one rename, `duplicate` decides
  what an existing name means, and `takenNames` are the bundled presets an install here would
  otherwise hide. Nothing outside the preset storage, the sounds folder and the shared preset-images
  folder is ever written.
*/
function installSanTheme({
  file,
  presetsDir,
  soundsDir,
  imagesDir = '',
  appVersion = '',
  duplicate = 'fail',
  reservedNames = [],
  takenNames = [],
}) {
  const read = readSanTheme(file);
  if (!read.ok) return read;

  const mapping = mapSanCustomisation(read.theme.customisation);
  const report = buildReport(read, mapping);
  const options = { ...mapping.options };

  if (reservedNames.includes(themeName(read.theme))) return fail('reserved-name', { name: themeName(read.theme) });

  fs.mkdirSync(presetsDir, { recursive: true });

  const taken = new Set(takenNames.map((entry) => String(entry).toLowerCase()));
  let name = themeName(read.theme);
  const installedHere = fs.existsSync(path.join(presetsDir, name));
  const existed = installedHere || taken.has(name.toLowerCase());
  if (existed) {
    if (duplicate === 'fail') return fail('duplicate', { name, bundled: !installedHere, report });
    if (duplicate === 'rename') {
      name = nextFreeName(presetsDir, name, taken);
      if (!name) return fail('duplicate', { name: themeName(read.theme) });
    } else if (duplicate !== 'replace') {
      return fail('invalid-duplicate-policy');
    }
  }

  const destination = path.join(presetsDir, name);
  if (!isInside(presetsDir, destination)) return fail('outside-preset-storage');

  const staging = fs.mkdtempSync(path.join(presetsDir, '.awsan-'));
  const stagedPreset = path.join(staging, 'preset');
  const backup = `${destination}.awsan-old`;
  const createdSounds = [];
  const createdImages = [];
  let backedUp = false;

  try {
    fs.mkdirSync(stagedPreset, { recursive: true });

    // --- the background picture, if the theme brought one ---
    if (mapping.assets.bgImage) {
      const asset = read.assets.get(mapping.assets.bgImage.toLowerCase());
      if (asset && ASSET_RE.test(asset.name)) {
        const data = asset.read();
        // The header of a zip entry can lie about the size; the data itself cannot.
        if (data.length > SAN_LIMITS.fileBytes) throw new Error('asset-too-large');
        /*
          The picture goes into the shared preset-images folder first, because that is what decides
          its NAME: two themes both shipping a "backdrop.png" must not end up sharing one file. The
          preset's own copy and the stored option then follow that name, so the designer's preview
          (which resolves through the shared folder) and the installed preset (which reads the copy
          beside its stylesheet) can never be showing two different pictures.

          The shared copy is also what lets an imported preset be re-saved with its own background:
          the designer only offers pictures it can list.
        */
        let name = asset.name;
        if (imagesDir) {
          try {
            const installed = installSideFile(imagesDir, asset.name, data);
            name = installed.name;
            if (installed.created) createdImages.push(path.join(imagesDir, installed.name));
          } catch {}
        }
        const target = path.join(stagedPreset, name);
        if (!isInside(stagedPreset, target)) throw new Error('unsafe-path');
        fs.writeFileSync(target, data);
        options.bgImage = name;
        report.assets.push({ name, kind: 'image', code: 'installed' });
      } else {
        // The theme asked for a picture it did not bring. A flat colour is the honest fallback.
        options.bgMode = 'solid';
        report.assets.push({ name: mapping.assets.bgImage, kind: 'image', code: 'asset-missing' });
      }
    } else if (mapping.wantsImage) {
      options.bgMode = 'solid';
      report.assets.push({ name: '', kind: 'image', code: 'asset-missing' });
    }

    // --- the sound ---
    if (mapping.assets.sound) {
      const asset = read.assets.get(mapping.assets.sound.toLowerCase());
      if (asset && SOUND_EXT_RE.test(asset.name)) {
        const data = asset.read();
        if (data.length > SAN_LIMITS.fileBytes) throw new Error('asset-too-large');
        const installed = installSideFile(soundsDir, asset.name, data);
        if (installed.created) createdSounds.push(path.join(soundsDir, installed.name));
        options.sound = installed.name;
        report.assets.push({ name: installed.name, kind: 'sound', code: 'installed' });
      } else {
        report.assets.push({ name: mapping.assets.sound, kind: 'sound', code: 'asset-missing' });
      }
    } else if (mapping.playsRandomSound) {
      /*
        A theme set to play a random sound from a folder travels with that whole folder. AW Next has
        the same idea as an app setting rather than a preset one, so the preset keeps no opinion -
        but the audio itself is worth having, or the user is told a folder was ignored and left with
        nothing to point the Notifications tab at.
      */
      let added = 0;
      for (const asset of read.assets.values()) {
        if (added >= SAN_LIMITS.sounds) break;
        if (!SOUND_EXT_RE.test(asset.name)) continue;
        const data = asset.read();
        if (data.length > SAN_LIMITS.fileBytes) throw new Error('asset-too-large');
        const installed = installSideFile(soundsDir, asset.name, data);
        if (installed.created) createdSounds.push(path.join(soundsDir, installed.name));
        report.assets.push({ name: installed.name, kind: 'sound', code: 'installed' });
        added += 1;
      }
    }

    const values = normalizeOptions(options);

    fs.writeFileSync(path.join(stagedPreset, 'index.html'), buildCustomPresetHtml(values), 'utf8');
    fs.writeFileSync(path.join(stagedPreset, 'style.css'), buildCustomPresetCss(values), 'utf8');
    // The builder's own options file: this is what makes the result an ordinary editable preset
    // rather than something that merely looks like one.
    fs.writeFileSync(path.join(stagedPreset, PRESET_OPTIONS_FILE), JSON.stringify({ name, ...values }, null, 2), 'utf8');

    const manifest = {
      format: PRESET_PACKAGE_FORMAT,
      formatVersion: PRESET_PACKAGE_FORMAT_VERSION,
      name,
      description: `Converted from a ${SAN_ORIGIN_APP} theme.`,
      author: '',
      version: '1.0.0',
      tags: ['imported', 'san'],
      createdAt: new Date().toISOString(),
      app: { createdWith: String(appVersion || '').slice(0, 32), minVersion: '' },
      // Provenance, kept so it survives an export and a re-import (see cleanOrigin in presetPackage).
      origin: {
        app: SAN_ORIGIN_APP,
        format: SAN_ORIGIN_FORMAT,
        version: report.sanVersion,
        name: report.label,
      },
      sound: values.sound,
    };
    fs.writeFileSync(path.join(stagedPreset, PRESET_PACKAGE_FILE), JSON.stringify(manifest, null, 2), 'utf8');

    if (fs.existsSync(destination)) {
      fs.renameSync(destination, backup);
      backedUp = true;
    }
    try {
      fs.renameSync(stagedPreset, destination);
    } catch (err) {
      if (backedUp) {
        fs.renameSync(backup, destination);
        backedUp = false;
      }
      throw err;
    }
    if (backedUp) {
      fs.rmSync(backup, { recursive: true, force: true });
      backedUp = false;
    }

    return { ok: true, name, replaced: existed && duplicate === 'replace', options: values, report, manifest };
  } catch (err) {
    for (const created of createdSounds.concat(createdImages)) fs.rmSync(created, { force: true });
    if (backedUp) {
      try {
        fs.rmSync(destination, { recursive: true, force: true });
        fs.renameSync(backup, destination);
      } catch {}
    }
    return fail(String(err.message || err));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = {
  SAN_THEME_EXTENSION,
  SAN_MANIFEST,
  SAN_ORIGIN_APP,
  SAN_ORIGIN_FORMAT,
  SAN_LIMITS,
  SAN_KEYS,
  SAN_NOTES,
  SAN_DEFAULTS,
  SAN_GLOW_ANIMS,
  SAN_ANIM_EDGE,
  SAN_BG_MODES,
  mapSanCustomisation,
  readSanTheme,
  themeName,
  installSanTheme,
  // Exported so the tests can assert the font match on its own.
  fontFamily,
};
