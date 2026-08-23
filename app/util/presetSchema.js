'use strict';

/*
  Every property the notification preset designer can edit, in one declarative list - the single
  source of truth for the generator (util/customPreset.js), the designer UI (`#pd-<key>` in
  ui/settings.js), validation (normalizeOptions) and the package format (util/presetPackage.js).
  Add a property here, a control in view/app.html and a locale label - never a fifth place to clamp it.

  Compatibility rules: every default must reproduce the pre-existing look, so an old options file
  or .awpreset manifest still normalizes the same way (`rareGlow`/`platinumGlow` are the deliberate
  exception - see the `state` group). A preset already generated on disk is never regenerated; these
  defaults apply only when the user reopens and saves it in the designer. Nothing reaches CSS
  unvalidated: colours match a colour syntax, numbers are clamped, selects are one of their values.
*/

// Groups, in the order the designer shows them. `advanced: true` on a property folds it away behind
// the group's own "Advanced" disclosure rather than hiding a whole group.
const PRESET_GROUPS = ['layout', 'text', 'color', 'icon', 'border', 'effect', 'motion', 'state', 'sound'];

// Font stacks a preset may use. Deliberately a fixed list of families Windows ships: a preset that
// named an arbitrary font would render differently on the machine it was shared with, and a free-text
// font name is also a string that ends up in the stylesheet.
const FONT_STACKS = {
  sans: "'Segoe UI', system-ui, sans-serif",
  rounded: "'Segoe UI Variable Display', 'Trebuchet MS', 'Segoe UI', sans-serif",
  condensed: "'Bahnschrift', 'Segoe UI Semibold', 'Franklin Gothic Medium', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "Consolas, 'Cascadia Mono', 'Courier New', monospace",
};

/*
  Where a notification enters/leaves, as a transform offset - named by screen side, not direction
  of travel, so `bottom` means "the bottom edge" for both entry and exit and one list serves both.
  Offsets are percentages of the card, large enough to clear the host window's margin, so a preset
  is never half-visible before it animates in.
*/
const MOTION_OFFSETS = {
  bottom: { dx: '0%', dy: '170%', scale: 1 },
  top: { dx: '0%', dy: '-170%', scale: 1 },
  left: { dx: '-130%', dy: '0%', scale: 1 },
  right: { dx: '130%', dy: '0%', scale: 1 },
  fade: { dx: '0%', dy: '0%', scale: 1 },
  zoom: { dx: '0%', dy: '0%', scale: 0.82 },
};

/*
  The curve the entry and the exit follow. `smooth`, `linear` and `back` are the three the designer
  has always had and keep their exact spelling; the rest are the shapes those three leave out - a
  slow settle, a hard snap, and an overshoot big enough to read as a bounce.
*/
const EASINGS = {
  smooth: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  linear: 'linear',
  back: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  gentle: 'cubic-bezier(0.33, 0, 0.2, 1)',
  snap: 'cubic-bezier(0.5, 0, 0.1, 1)',
  elastic: 'cubic-bezier(0.16, 1.4, 0.3, 1)',
};

/*
  The icon's outline. `rounded` is the shape the designer has always drawn - a square whose corner
  radius is the `iconRadius` slider - so it stays the default and nothing already saved moves. The
  others are clip paths, and they ignore the radius because their outline is their own.
*/
const ICON_SHAPES = {
  rounded: '',
  circle: 'circle(50% at 50% 50%)',
  squircle: 'inset(0 0 0 0 round 32%)',
  hexagon: 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
};

/*
  A layer of texture over the card's background and under its text, drawn from gradients so a preset
  carries no picture for it. `none` is the default and emits nothing at all.
*/
const BG_PATTERNS = {
  none: '',
  grid: 'linear-gradient(var(--pattern-ink) 1px, transparent 1px), linear-gradient(90deg, var(--pattern-ink) 1px, transparent 1px)',
  dots: 'radial-gradient(var(--pattern-ink) 1.4px, transparent 1.5px)',
  lines: 'repeating-linear-gradient(45deg, var(--pattern-ink) 0 1px, transparent 1px 9px)',
  noise: 'radial-gradient(var(--pattern-ink) 0.6px, transparent 0.7px), radial-gradient(var(--pattern-ink) 0.5px, transparent 0.6px)',
};

// The tile each pattern repeats on, and the offset that keeps the two-layer ones from lining up.
const BG_PATTERN_SIZES = {
  grid: '22px 22px',
  dots: '14px 14px',
  lines: 'auto',
  noise: '7px 7px, 11px 11px',
};

const MOTION_VALUES = Object.keys(MOTION_OFFSETS);

/*
  A property is:
    key       what it is called in aw-preset.json and in an .awpreset manifest
    type      color | number | select | toggle | sound | asset
    def       the default, which must reproduce the pre-designer look (see the header)
    group     which section of the designer shows it
    advanced  folded behind the group's "Advanced" disclosure
    css       the CSS custom property it becomes, when it maps to one directly
    unit      appended in the stylesheet ('' for a bare number)
    scale     value/scale before it reaches CSS (percent sliders that become 0-1 factors)
*/
const PRESET_PROPERTIES = [
  // layout & size
  { key: 'layout', type: 'select', def: 'icon-left', values: ['icon-left', 'icon-right', 'icon-top', 'text-only'], group: 'layout' },
  { key: 'align', type: 'select', def: 'left', values: ['left', 'center', 'right'], group: 'layout' },
  /*
    The game's name, on the line above the achievement. The notification window forwards it for any
    preset that asks - a popup otherwise only ever prints what was unlocked, never where.
  */
  { key: 'showGameName', type: 'toggle', def: false, group: 'layout' },
  { key: 'width', type: 'number', def: 420, min: 280, max: 620, step: 10, group: 'layout', css: '--width', unit: 'px' },
  { key: 'padX', type: 'number', def: 18, min: 4, max: 48, step: 1, group: 'layout', css: '--pad-x', unit: 'px' },
  { key: 'padY', type: 'number', def: 12, min: 4, max: 40, step: 1, group: 'layout', css: '--pad-y', unit: 'px' },
  { key: 'gap', type: 'number', def: 12, min: 0, max: 36, step: 1, group: 'layout', css: '--gap', unit: 'px' },

  // text
  { key: 'fontFamily', type: 'select', def: 'sans', values: Object.keys(FONT_STACKS), group: 'text' },
  { key: 'fontSize', type: 'number', def: 16, min: 10, max: 28, step: 1, group: 'text', css: '--font-size', unit: 'px' },
  { key: 'detailScale', type: 'number', def: 100, min: 60, max: 130, step: 5, group: 'text', css: '--detail-scale', scale: 100 },
  /*
    How many lines the description may use. One keeps the single-line look the builder always had -
    too long a line is scrolled instead. Two or three wrap it, which is what a card wide enough to
    read a full sentence wants.
  */
  { key: 'descriptionLines', type: 'number', def: 1, min: 1, max: 3, step: 1, group: 'text', css: '--detail-lines' },
  /*
    What colours the title. It has always followed the accent - including the accent a rare or a
    completion notification swaps in - so that stays the default; the other two are for designs where
    a coloured title fights the rest of the card.
  */
  { key: 'titleColorMode', type: 'select', def: 'accent', values: ['accent', 'text', 'custom'], group: 'text' },
  { key: 'titleColor', type: 'color', def: '#ffffff', group: 'text', css: '--title-color', shownFor: { titleColorMode: ['custom'] } },
  { key: 'titleWeight', type: 'number', def: 700, min: 400, max: 900, step: 100, group: 'text', advanced: true, css: '--title-weight' },
  { key: 'titleCase', type: 'select', def: 'none', values: ['none', 'uppercase'], group: 'text', advanced: true, css: '--title-case' },
  { key: 'letterSpacing', type: 'number', def: 0, min: -1, max: 4, step: 0.5, group: 'text', advanced: true, css: '--letter-spacing', unit: 'px' },
  // Text needs its own contrast once it sits on artwork rather than on a flat colour.
  { key: 'textShadow', type: 'number', def: 0, min: 0, max: 100, step: 5, group: 'text', advanced: true, css: '--text-shadow', scale: 100 },
  /*
    An outline drawn around every glyph, which is the other way to stay readable over artwork: a
    shadow softens the edge, a stroke draws one. Zero is the default and costs nothing, so a preset
    that predates it renders exactly as before.
  */
  { key: 'textStroke', type: 'number', def: 0, min: 0, max: 3, step: 0.5, group: 'text', advanced: true, css: '--text-stroke', unit: 'px' },
  { key: 'textStrokeColor', type: 'color', def: '#000000', group: 'text', advanced: true, css: '--text-stroke-color' },

  // colours & background
  { key: 'bgMode', type: 'select', def: 'solid', values: ['solid', 'gradient', 'artwork', 'image'], group: 'color' },
  { key: 'bg', type: 'color', def: '#16181d', group: 'color', css: '--bg-base' },
  { key: 'bg2', type: 'color', def: '#2b3550', group: 'color', css: '--bg2', shownFor: { bgMode: ['gradient'] } },
  { key: 'bgAngle', type: 'number', def: 135, min: 0, max: 360, step: 5, group: 'color', advanced: true, css: '--bg-angle', unit: 'deg' },
  /*
    A picture of the preset's own, rather than the game's. A bare filename: the file is copied into
    the preset folder when the preset is written, so the stylesheet only ever names something that
    sits beside it and a package carries the image with the design.
  */
  { key: 'bgImage', type: 'asset', def: '', group: 'color', shownFor: { bgMode: ['image'] } },
  // Dimming, blur and framing treat both kinds of picture the same, so they are one set of controls.
  { key: 'artworkDim', type: 'number', def: 55, min: 0, max: 100, step: 5, group: 'color', css: '--artwork-dim', scale: 100, shownFor: { bgMode: ['artwork', 'image'] } },
  { key: 'artworkBlur', type: 'number', def: 0, min: 0, max: 20, step: 1, group: 'color', advanced: true, css: '--artwork-blur', unit: 'px' },
  // Which part of the artwork the card shows. Game headers put their logo in a fixed place, so the
  // difference between the three is the difference between a readable card and one full of lettering.
  { key: 'artworkPosition', type: 'select', def: 'center', values: ['top', 'center', 'bottom'], group: 'color', advanced: true, shownFor: { bgMode: ['artwork', 'image'] } },
  /*
    A layer of texture between the background and the text. Drawn from gradients rather than a
    picture, so it costs a preset nothing to carry and tints itself from the card's own colours.
  */
  { key: 'bgPattern', type: 'select', def: 'none', values: Object.keys(BG_PATTERNS), group: 'color', advanced: true },
  {
    key: 'bgPatternOpacity',
    type: 'number',
    def: 20,
    min: 5,
    max: 100,
    step: 5,
    group: 'color',
    advanced: true,
    css: '--pattern-opacity',
    scale: 100,
    shownFor: { bgPattern: ['grid', 'dots', 'lines', 'noise'] },
  },
  { key: 'text', type: 'color', def: '#ffffff', group: 'color', css: '--text' },
  { key: 'accent', type: 'color', def: '#4aa3ff', group: 'color', css: '--accent-base' },
  { key: 'opacity', type: 'number', def: 1, min: 0.2, max: 1, step: 0.01, group: 'color', css: '--opacity', percent: true },

  // icon
  { key: 'iconSize', type: 'number', def: 64, min: 24, max: 110, step: 1, group: 'icon', css: '--icon-size', unit: 'px' },
  { key: 'iconShape', type: 'select', def: 'rounded', values: Object.keys(ICON_SHAPES), group: 'icon' },
  // Only the rounded shape has a radius to set; the others carry their own outline.
  { key: 'iconRadius', type: 'number', def: 14, min: 0, max: 50, step: 1, group: 'icon', css: '--icon-radius', unit: '%', shownFor: { iconShape: ['rounded'] } },
  { key: 'iconBorder', type: 'number', def: 0, min: 0, max: 6, step: 1, group: 'icon', advanced: true, css: '--icon-border', unit: 'px' },
  { key: 'iconGlow', type: 'number', def: 0, min: 0, max: 100, step: 5, group: 'icon', advanced: true, css: '--icon-glow', scale: 100 },

  // border & corners
  { key: 'radius', type: 'number', def: 12, min: 0, max: 40, step: 1, group: 'border', css: '--radius', unit: 'px' },
  { key: 'accentBar', type: 'select', def: 'left', values: ['left', 'right', 'top', 'bottom', 'outline', 'none'], group: 'border' },
  { key: 'accentBarSize', type: 'number', def: 4, min: 1, max: 14, step: 1, group: 'border', css: '--bar-size', unit: 'px' },
  { key: 'borderWidth', type: 'number', def: 0, min: 0, max: 6, step: 1, group: 'border', advanced: true, css: '--border-width', unit: 'px' },
  { key: 'borderColor', type: 'color', def: '#ffffff', group: 'border', advanced: true, css: '--border-color' },

  // shadow & glow
  { key: 'shadow', type: 'number', def: 45, min: 0, max: 100, step: 5, group: 'effect', css: '--shadow', scale: 100 },
  { key: 'glow', type: 'number', def: 0, min: 0, max: 100, step: 5, group: 'effect', css: '--glow', scale: 100 },
  /*
    A glow that moves. It only ever dims the glow the design already asked for and never brightens
    past it, so the window a preset is measured for still fits the strongest frame of the animation.
  */
  { key: 'glowAnim', type: 'select', def: 'none', values: ['none', 'pulse', 'breathe'], group: 'effect' },

  // motion & timing
  { key: 'animIn', type: 'select', def: 'bottom', values: MOTION_VALUES, group: 'motion' },
  { key: 'animOut', type: 'select', def: 'bottom', values: MOTION_VALUES, group: 'motion' },
  { key: 'duration', type: 'number', def: 6000, min: 2000, max: 12000, step: 250, group: 'motion' },
  // How far the popup travels on its way in and out: a restrained slide against a sweep across the
  // corner of the screen. A multiplier rather than a distance, so it means the same for every edge.
  { key: 'entryDistance', type: 'number', def: 100, min: 30, max: 200, step: 10, group: 'motion', advanced: true, scale: 100 },
  { key: 'animInMs', type: 'number', def: 520, min: 120, max: 1500, step: 20, group: 'motion', advanced: true, css: '--ach-in', unit: 'ms' },
  { key: 'animOutMs', type: 'number', def: 380, min: 120, max: 1500, step: 20, group: 'motion', advanced: true, css: '--ach-out', unit: 'ms' },
  { key: 'easing', type: 'select', def: 'smooth', values: Object.keys(EASINGS), group: 'motion', advanced: true },
  /*
    The exit curve. It was always ease-in, written into the animation shorthand, and `same` keeps
    exactly that - so a preset that never touches this renders as it always did, and one that does
    can leave on a different curve from the one it arrived on.
  */
  { key: 'easingOut', type: 'select', def: 'same', values: ['same'].concat(Object.keys(EASINGS)), group: 'motion', advanced: true },

  /*
    states - what a rare unlock and 100% completion look like. Tier colours are the ones the
    progress meter has always used (gold under 3%, silver under 6%, bronze up to 10%); they now
    drive the whole card. The two glow defaults are the one place a new default isn't the old
    look - a state that changed nothing visible was the gap this group closes - but a preset
    already on disk keeps its own files, so nothing installed already changes because of it.
  */
  { key: 'rareAccent', type: 'color', def: '#ffd24e', group: 'state', css: '--rare-accent' },
  { key: 'rareGlow', type: 'number', def: 55, min: 0, max: 100, step: 5, group: 'state', css: '--rare-glow', scale: 100 },
  { key: 'platinumAccent', type: 'color', def: '#cfe3ff', group: 'state', css: '--platinum-accent' },
  { key: 'platinumGlow', type: 'number', def: 70, min: 0, max: 100, step: 5, group: 'state', css: '--platinum-glow', scale: 100 },
  /*
    How much of the state's own colour washes into the card. Zero is the default and changes nothing,
    which is what keeps a rare unlock on an existing preset looking exactly as it did.
  */
  { key: 'stateTint', type: 'number', def: 0, min: 0, max: 60, step: 5, group: 'state', css: '--state-tint', scale: 100 },
  { key: 'showProgress', type: 'toggle', def: true, group: 'state' },
  /*
    The rarity chip: the unlock rate the popup was told about, printed on the card. Off by default -
    it is information a preset opts into, not something an existing design should suddenly grow.
  */
  { key: 'showRarity', type: 'toggle', def: false, group: 'state' },
  { key: 'progressHeight', type: 'number', def: 8, min: 3, max: 20, step: 1, group: 'state', advanced: true, css: '--progress-height', unit: 'px' },
  { key: 'rareSilver', type: 'color', def: '#9fb2cc', group: 'state', advanced: true, css: '--rare-silver' },
  { key: 'rareBronze', type: 'color', def: '#cd7f32', group: 'state', advanced: true, css: '--rare-bronze' },

  // sound
  // '' means "whatever the Notifications tab is set to"; a filename makes the sound part of the
  // preset, which is what lets a shared package sound the way its author intended.
  { key: 'sound', type: 'sound', def: '', group: 'sound' },
];

const PROPERTY_BY_KEY = new Map(PRESET_PROPERTIES.map((property) => [property.key, property]));

// Same colour syntax the builder has always accepted. Anything else falls back to the default, so a
// hand-edited options file cannot smuggle declarations into the generated stylesheet.
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)$/i;

// A sound is a bare filename in the app's or the user's sounds folder - never a path.
const SOUND_RE = /^[^\\/:*?"<>|\x00-\x1f]+\.(?:wav|mp3|ogg|flac|m4a|aac)$/i;
/*
  An image a preset carries. Same shape as a sound and for the same reason: a bare filename, never a
  path, so nothing a preset names can point outside the folder it was installed into. SVG is left out
  on purpose - it is a document that can carry script, and a background is not worth that.
*/
const ASSET_RE = /^[^\/:*?"<>| -]+.(?:png|jpe?g|gif|webp|bmp)$/i;

function clampNumber(value, property) {
  const number = Number(value);
  if (!Number.isFinite(number)) return property.def;
  const clamped = Math.max(property.min, Math.min(property.max, number));
  // Round to the control's own step so a hand-written 12.7351 cannot produce a value the designer
  // could never show back to the user.
  const step = property.step || 1;
  const snapped = Math.round(clamped / step) * step;
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return Number(Math.max(property.min, Math.min(property.max, snapped)).toFixed(decimals));
}

function normalizeValue(raw, property) {
  switch (property.type) {
    case 'color':
      return typeof raw === 'string' && COLOR_RE.test(raw.trim()) ? raw.trim() : property.def;
    case 'number':
      return clampNumber(raw, property);
    case 'select':
      return property.values.includes(raw) ? raw : property.def;
    case 'toggle':
      return raw === true || raw === 'true' ? true : raw === false || raw === 'false' ? false : property.def;
    case 'sound':
      return typeof raw === 'string' && SOUND_RE.test(raw.trim()) ? raw.trim() : property.def;
    case 'asset':
      return typeof raw === 'string' && ASSET_RE.test(raw.trim()) ? raw.trim() : property.def;
    default:
      return property.def;
  }
}

/*
  Every option, normalized. Unknown keys are dropped and missing ones take their default, so this is
  also what makes an options file from an older build - or from a newer one - safe to load.
*/
function normalizeOptions(options = {}) {
  const source = options && typeof options === 'object' ? options : {};
  const out = {};
  for (const property of PRESET_PROPERTIES) out[property.key] = normalizeValue(source[property.key], property);
  return out;
}

// The value as it appears in the stylesheet: percent sliders become factors, everything else carries
// its unit. Only for properties with a `css` mapping.
function cssValue(key, value) {
  const property = PROPERTY_BY_KEY.get(key);
  if (!property || !property.css) return '';
  if (property.type === 'select') return String(value);
  if (property.scale) return String(Number((value / property.scale).toFixed(4)));
  return `${value}${property.unit || ''}`;
}

module.exports = {
  PRESET_GROUPS,
  PRESET_PROPERTIES,
  PROPERTY_BY_KEY,
  FONT_STACKS,
  ICON_SHAPES,
  BG_PATTERNS,
  BG_PATTERN_SIZES,
  MOTION_OFFSETS,
  MOTION_VALUES,
  EASINGS,
  COLOR_RE,
  SOUND_RE,
  ASSET_RE,
  normalizeOptions,
  cssValue,
};
