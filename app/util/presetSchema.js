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

// Where the logo sits on the card: a corner or the middle of a side. The offset is its distance from
// the edge it is anchored to.
const LOGO_POSITIONS = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];

/*
  A property is:
    key       what it is called in aw-preset.json and in an .awpreset manifest
    type      color | number | select | toggle | sound | asset | font | logo
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
  // 0 lets the content decide; anything above makes the card at least that tall, content centred.
  { key: 'minHeight', type: 'number', def: 0, min: 0, max: 300, step: 2, group: 'layout', css: '--min-height', unit: 'px' },
  { key: 'padX', type: 'number', def: 18, min: 4, max: 48, step: 1, group: 'layout', css: '--pad-x', unit: 'px', advanced: true },
  { key: 'padY', type: 'number', def: 12, min: 4, max: 40, step: 1, group: 'layout', css: '--pad-y', unit: 'px', advanced: true },
  { key: 'gap', type: 'number', def: 12, min: 0, max: 36, step: 1, group: 'layout', css: '--gap', unit: 'px', advanced: true },

  // text
  { key: 'fontFamily', type: 'select', def: 'sans', values: Object.keys(FONT_STACKS), group: 'text' },
  /*
    A font file of the user's own, copied beside the preset and loaded with @font-face. The stack
    chosen above stays behind it as the fallback while the file loads or if it is missing.
  */
  { key: 'fontFile', type: 'font', def: '', group: 'text' },
  { key: 'fontSize', type: 'number', def: 16, min: 10, max: 28, step: 1, group: 'text', css: '--font-size', unit: 'px' },
  { key: 'detailScale', type: 'number', def: 100, min: 60, max: 130, step: 5, group: 'text', css: '--detail-scale', scale: 100, advanced: true },
  /*
    How many lines the description may use. One keeps the single-line look the builder always had -
    too long a line is scrolled instead. Two or three wrap it, which is what a card wide enough to
    read a full sentence wants.
  */
  { key: 'descriptionLines', type: 'number', def: 1, min: 1, max: 3, step: 1, group: 'text', css: '--detail-lines', advanced: true },
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
  { key: 'artworkDim', type: 'number', def: 55, min: 0, max: 100, step: 5, group: 'color', css: '--artwork-dim', scale: 100, shownFor: { bgMode: ['artwork', 'image'] }, advanced: true },
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
  /*
    A logo or decoration of the preset's own, drawn behind the text. A bare filename like the
    background picture; nothing is drawn while it is empty, so no existing preset changes.
  */
  { key: 'logoImage', type: 'logo', def: '', group: 'icon' },
  { key: 'logoPosition', type: 'select', def: 'top-right', values: LOGO_POSITIONS, group: 'icon', advanced: true },
  { key: 'logoSize', type: 'number', def: 32, min: 12, max: 120, step: 1, group: 'icon', advanced: true },
  { key: 'logoOffset', type: 'number', def: 8, min: 0, max: 60, step: 1, group: 'icon', advanced: true },

  // border & corners
  { key: 'radius', type: 'number', def: 12, min: 0, max: 40, step: 1, group: 'border', css: '--radius', unit: 'px' },
  { key: 'accentBar', type: 'select', def: 'left', values: ['left', 'right', 'top', 'bottom', 'outline', 'none'], group: 'border' },
  {
    key: 'accentBarSize',
    type: 'number',
    def: 4,
    min: 1,
    max: 14,
    step: 1,
    group: 'border',
    css: '--bar-size',
    unit: 'px',
    shownFor: { accentBar: ['left', 'right', 'top', 'bottom', 'outline'] },
  },
  { key: 'borderWidth', type: 'number', def: 0, min: 0, max: 6, step: 1, group: 'border', advanced: true, css: '--border-width', unit: 'px' },
  { key: 'borderColor', type: 'color', def: '#ffffff', group: 'border', advanced: true, css: '--border-color' },

  // shadow & glow
  { key: 'shadow', type: 'number', def: 45, min: 0, max: 100, step: 5, group: 'effect', css: '--shadow', scale: 100 },
  { key: 'glow', type: 'number', def: 0, min: 0, max: 100, step: 5, group: 'effect', css: '--glow', scale: 100 },
  /*
    A glow that moves. It only ever dims the glow the design already asked for and never brightens
    past it, so the window a preset is measured for still fits the strongest frame of the animation.
  */
  { key: 'glowAnim', type: 'select', def: 'none', values: ['none', 'pulse', 'breathe'], group: 'effect', advanced: true },

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
  { key: 'rareGlow', type: 'number', def: 55, min: 0, max: 100, step: 5, group: 'state', css: '--rare-glow', scale: 100, advanced: true },
  { key: 'platinumAccent', type: 'color', def: '#cfe3ff', group: 'state', css: '--platinum-accent' },
  { key: 'platinumGlow', type: 'number', def: 70, min: 0, max: 100, step: 5, group: 'state', css: '--platinum-glow', scale: 100, advanced: true },
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
  // A padlock before the title of a hidden achievement. Off by default, like the rarity chip.
  { key: 'hiddenLock', type: 'toggle', def: false, group: 'state', advanced: true },

  /*
    The free layout drawn on the preview: offsets for the card's own parts and the text, pictures and
    shapes added on top. Empty by default, which changes nothing; see normalizeCanvas below.
  */
  { key: 'canvas', type: 'canvas', def: Object.freeze({ move: Object.freeze({}), items: Object.freeze([]) }), group: 'layout' },

  // sound
  // '' means "whatever the Notifications tab is set to"; a filename makes the sound part of the
  // preset, which is what lets a shared package sound the way its author intended.
  { key: 'sound', type: 'sound', def: '', group: 'sound' },
];

const PROPERTY_BY_KEY = new Map(PRESET_PROPERTIES.map((property) => [property.key, property]));

// Same colour syntax the builder has always accepted. Anything else falls back to the default, so a
// hand-edited options file cannot smuggle declarations into the generated stylesheet.
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/+-]+\)|[a-z]+)$/i;

// A sound is a bare filename in the app's or the user's sounds folder - never a path.
const SOUND_RE = /^[^\\/:*?"<>|\x00-\x1f]+\.(?:wav|mp3|ogg|flac|m4a|aac)$/i;
/*
  An image a preset carries. Same shape as a sound and for the same reason: a bare filename, never a
  path, so nothing a preset names can point outside the folder it was installed into. SVG is left out
  on purpose - it is a document that can carry script, and a background is not worth that.
*/
const ASSET_RE = /^[^\\/:*?"<>|\x00-\x1f]+\.(?:png|jpe?g|gif|webp|bmp)$/i;

/*
  The files a preset can carry beyond its stylesheet: a font and a logo. They come from the user or
  from a package someone else made, so the name, the size and the first bytes are all checked before
  a file is copied anywhere. No SVG on purpose: it is a document that can carry script. Kept in this
  file rather than a module of its own because the gallery service holds a copy of exactly the files
  that validate a package and would otherwise miss a dependency.
*/
const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

// A font family rarely needs more than a few hundred KB; a CJK face is the realistic worst case.
const MAX_FONT_BYTES = 4 * 1024 * 1024;
// A picture can be an animated GIF or WebP, which runs larger than a still logo.
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

// A bare filename: never a path, never anything a url('...') token or a Windows folder would mangle.
const SAFE_NAME = '[^\\\\/:*?"<>|\\x00-\\x1f\']+';
const FONT_NAME_RE = new RegExp(`^${SAFE_NAME}\\.(?:${FONT_EXTENSIONS.join('|')})$`, 'i');
const IMAGE_NAME_RE = new RegExp(`^${SAFE_NAME}\\.(?:${IMAGE_EXTENSIONS.join('|')})$`, 'i');

const ascii = (buffer, from, to) => buffer.subarray(from, to).toString('latin1');

// What the first bytes say a font is, or '' when they say nothing a browser would load.
function fontKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  const tag = ascii(buffer, 0, 4);
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'true' || buffer.readUInt32BE(0) === 0x00010000) return 'ttf';
  return '';
}

function imageKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (buffer[0] === 0x89 && ascii(buffer, 1, 4) === 'PNG') return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (ascii(buffer, 0, 3) === 'GIF') return 'gif';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'webp';
  if (ascii(buffer, 0, 2) === 'BM') return 'bmp';
  return '';
}

const extensionOf = (name) => String(name || '').split('.').pop().toLowerCase();

// .ttf and .otf both hold either flavour of sfnt, so only the container formats have to agree.
function fontKindMatches(kind, extension) {
  if (kind === 'woff' || kind === 'woff2') return kind === extension;
  return extension === 'ttf' || extension === 'otf';
}

function imageKindMatches(kind, extension) {
  return kind === 'jpeg' ? extension === 'jpg' || extension === 'jpeg' : kind === extension;
}

// { ok: true, kind } or { ok: false, error } with a short machine-readable reason.
function checkFont(name, bytes) {
  if (!FONT_NAME_RE.test(String(name || ''))) return { ok: false, error: 'invalid-font-name' };
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return { ok: false, error: 'empty-font' };
  if (bytes.length > MAX_FONT_BYTES) return { ok: false, error: 'font-too-large' };
  const kind = fontKind(bytes);
  if (!kind || !fontKindMatches(kind, extensionOf(name))) return { ok: false, error: 'not-a-font' };
  return { ok: true, kind };
}

function checkLogo(name, bytes) {
  if (!IMAGE_NAME_RE.test(String(name || ''))) return { ok: false, error: 'invalid-image-name' };
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return { ok: false, error: 'empty-image' };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, error: 'image-too-large' };
  const kind = imageKind(bytes);
  if (!kind || !imageKindMatches(kind, extensionOf(name))) return { ok: false, error: 'not-an-image' };
  return { ok: true, kind };
}

const FONT_MIME = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
const FONT_FORMAT = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

const fontMime = (name) => FONT_MIME[extensionOf(name)] || 'application/octet-stream';
const fontFormat = (name) => FONT_FORMAT[extensionOf(name)] || 'truetype';
const imageMime = (name) => IMAGE_MIME[extensionOf(name)] || 'image/png';

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

/*
  The free layout. `move` shifts, turns and scales the parts every preset has (by the names in
  CANVAS_PARTS); `items` are what the user added. Everything ends up in a stylesheet or as text in the
  page, so each number is clamped, each colour checked and each picture a bare image filename.
*/
// 'mark' is a bundled preset's brand mark, drawn by a pseudo-element: only a layer has one.
const CANVAS_PARTS = ['icon', 'text', 'title', 'detail', 'meta', 'progress', 'mark'];
const CANVAS_ITEM_KINDS = ['text', 'image', 'shape', 'icon'];
const CANVAS_SHAPES = ['rect', 'ellipse', 'line', 'triangle', 'diamond', 'star', 'arrow'];
/*
  'accent' paints with the state colour, so a shape turns bronze, silver, gold or platinum with the
  card; a tier name paints with that tier's colour whatever the state.
*/
const CANVAS_TIER_FILLS = ['bronze', 'silver', 'gold', 'platinum'];
const CANVAS_FILLS = ['solid', 'gradient', 'radial', 'accent', 'none', ...CANVAS_TIER_FILLS];
// The polygons, whose corners `round` softens; a picture can be cut to any shape but a line.
const CANVAS_POLYGON_SHAPES = ['triangle', 'diamond', 'star', 'arrow'];
const CANVAS_MASK_SHAPES = CANVAS_SHAPES.filter((shape) => shape !== 'line');
/*
  A shape's own settings, in percent of its box: the star's branches and how deep they cut, the
  arrow's head and shaft, the triangle's top. Each is stored only when it differs from the default.
*/
const CANVAS_SHAPE_SETTINGS = {
  star: { points: [3, 12, 5], depth: [10, 90, 42] },
  arrow: { head: [10, 90, 42], shaft: [10, 100, 40] },
  triangle: { apex: [0, 100, 50] },
};
const CANVAS_DASHES = ['solid', 'dashed', 'dotted'];
const CANVAS_LOOPS = ['none', 'pulse', 'float', 'swing', 'spin', 'shine'];
// Only these can move: a still PNG has nothing to start over.
const ANIMATED_IMAGE_RE = /\.(?:gif|webp)$/i;
// The states a popup can be in. Each can draw an item or a part of the card its own way.
const CANVAS_STATES = ['normal', 'bronze', 'silver', 'gold', 'platinum', 'progress'];
// What every state shares: what an item is, its lock and its place in the stack.
const CANVAS_SHARED_KEYS = ['kind', 'lock', 'back'];
const CANVAS_TIER_FIXED = [...CANVAS_SHARED_KEYS, 'tiers', 'states'];
/*
  The icons an item can draw: one filled path each in a 24px box, even-odd, used as a mask so the
  item's paint fills it. Drawn for AW Next, so a shared preset carries no third-party artwork.
*/
const CANVAS_ICONS = {
  trophy:
    'M6 2h12v2h4v3a5 5 0 0 1-4.6 5A6 6 0 0 1 13 15.9V18h4v4H7v-4h4v-2.1A6 6 0 0 1 6.6 12 5 5 0 0 1 2 7V4h4zM4 6h2v3.6A3 3 0 0 1 4 7zM20 6h-2v3.6A3 3 0 0 0 20 7z',
  medal: 'M6 2h4l2.2 5.2-2.6 1.6zM18 2h-4l-2.2 5.2 2.6 1.6zM12 9a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM12 12a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  crown: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 10H5zM5 18.5h14v2H5z',
  star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6-5.9-3.3-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z',
  sparkle: 'M12 2c.8 5.5 4.5 9.2 10 10-5.5.8-9.2 4.5-10 10-.8-5.5-4.5-9.2-10-10 5.5-.8 9.2-4.5 10-10z',
  shield: 'M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z',
  gem: 'M7 3h10l4 6-9 12L3 9z',
  flame: 'M12 2c1.2 4 6 6.5 6 12a6 6 0 0 1-12 0c0-2.6 1.3-4.6 3-5.8 0 2 1 3.4 2.6 3.9C11 8.6 11.2 5.2 12 2z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z',
  check: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM10.5 13.6l-3-3-1.4 1.4 4.4 4.4 7.4-7.4-1.4-1.4z',
  gamepad:
    'M7 7h10a5 5 0 0 1 4.9 6l-.8 4a2.8 2.8 0 0 1-4.8 1.3L14 16h-4l-2.3 2.3A2.8 2.8 0 0 1 2.9 17l-.8-4A5 5 0 0 1 7 7zM6.2 10.5h1.3V9.2h1.6v1.3h1.3v1.6H9.1v1.3H7.5v-1.3H6.2zM15.5 10.2a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM17.3 12.6a1 1 0 1 0 2 0 1 1 0 1 0-2 0z',
};
const CANVAS_WEIGHTS = [400, 600, 700, 800];
const CANVAS_ALIGNS = ['left', 'center', 'right'];
const CANVAS_MAX_ITEMS = 24;
const CANVAS_MAX_TEXT = 160;
// Words of the popup an added text can hold, written {game}, {title}... and filled in when it shows.
const CANVAS_TOKENS = ['game', 'title', 'detail', 'rarity', 'tier'];
// How an item comes in once the card is up, after its own delay; 'none' arrives with the card.
const CANVAS_ENTRANCES = ['none', 'fade', 'rise', 'drop', 'left', 'right', 'zoom', 'pop'];
const CANVAS_MAX_DELAY_MS = 3000;
const CANVAS_MAX_WORD = 24;

const canvasNumber = (value, min, max, fallback, digits = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number(Math.max(min, Math.min(max, number)).toFixed(digits));
};
// Hex only: the colour pickers produce nothing else, and a hex value cannot carry CSS punctuation.
const canvasColor = (value, fallback) => (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : fallback);

function normalizeCanvasMove(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const part of CANVAS_PARTS) {
    const source = raw[part];
    if (!source || typeof source !== 'object') continue;
    const move = {
      x: canvasNumber(source.x, -600, 600, 0),
      y: canvasNumber(source.y, -400, 400, 0),
      r: canvasNumber(source.r, -180, 180, 0),
      s: canvasNumber(source.s, 0.2, 4, 1, 3),
    };
    // A part back where it started is not stored, so "unchanged" has one spelling.
    if (move.x || move.y || move.r || move.s !== 1) out[part] = move;
  }
  return out;
}

function normalizeCanvasItem(source) {
  if (!source || typeof source !== 'object' || !CANVAS_ITEM_KINDS.includes(source.kind)) return null;
  const item = {
    kind: source.kind,
    x: canvasNumber(source.x, -600, 1200, 0),
    y: canvasNumber(source.y, -400, 800, 0),
    w: canvasNumber(source.w, 1, 1200, 80),
    h: canvasNumber(source.h, 1, 800, 40),
    r: canvasNumber(source.r, -180, 180, 0),
    o: canvasNumber(source.o, 0, 1, 1, 2),
    back: source.back === true,
  };
  if (item.kind === 'text') {
    const text = String(source.text ?? '').replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '').slice(0, CANVAS_MAX_TEXT);
    item.text = text.trim() ? text : 'Text';
    item.size = canvasNumber(source.size, 6, 96, 16);
    item.weight = CANVAS_WEIGHTS.includes(Number(source.weight)) ? Number(source.weight) : 700;
    item.color = source.color === 'accent' || source.color === 'text' ? source.color : canvasColor(source.color, 'text');
    item.align = CANVAS_ALIGNS.includes(source.align) ? source.align : 'left';
    item.upper = source.upper === true;
    // 'card' follows the preset's own font, the imported one included; the rest name a family.
    item.font = Object.hasOwn(FONT_STACKS, source.font) ? source.font : 'card';
    // An imported font for this text alone; the family above stays as its fallback.
    const fontFile = typeof source.fontFile === 'string' ? source.fontFile.trim() : '';
    item.fontFile = FONT_NAME_RE.test(fontFile) ? fontFile : '';
    // Older texts have no shadow, so one is stored only once it is set.
    const shadow = canvasNumber(source.shadow, 0, 40, 0, 0);
    if (shadow) {
      item.shadow = shadow;
      normalizeCanvasShadow(item, source);
    }
  } else if (item.kind === 'image') {
    const file = typeof source.file === 'string' ? source.file.trim() : '';
    if (!IMAGE_NAME_RE.test(file)) return null;
    const fit = source.fit && typeof source.fit === 'object' ? source.fit : {};
    item.file = file;
    item.radius = canvasNumber(source.radius, 0, 50, 0);
    item.fit = {
      x: canvasNumber(fit.x, -4800, 0, 0),
      y: canvasNumber(fit.y, -4800, 0, 0),
      w: canvasNumber(fit.w, 1, 4800, item.w),
      ar: canvasNumber(fit.ar, 0.05, 20, 1, 4),
    };
    // Cut to a shape; a plain rectangle (with its rounded corners) is the default.
    if (CANVAS_MASK_SHAPES.includes(source.shape) && source.shape !== 'rect') {
      item.shape = source.shape;
      normalizeShapeSettings(item, source, source.shape);
    }
    if (source.replay === true && ANIMATED_IMAGE_RE.test(file)) item.replay = true;
  } else if (item.kind === 'icon') {
    item.icon = Object.hasOwn(CANVAS_ICONS, source.icon) ? source.icon : 'trophy';
    normalizeCanvasPaint(item, source, 'accent');
  } else {
    item.shape = CANVAS_SHAPES.includes(source.shape) ? source.shape : 'rect';
    item.radius = canvasNumber(source.radius, 0, 200, 0);
    // Older layouts have none of these; their defaults draw the plain filled shape they always were.
    normalizeCanvasPaint(item, source, 'solid');
    item.stroke = canvasNumber(source.stroke, 0, 20, 0);
    item.strokeColor = canvasColor(source.strokeColor, '#ffffff');
    if (CANVAS_DASHES.includes(source.dash) && source.dash !== 'solid') item.dash = source.dash;
    // A polygon's own corner rounding: `radius` may hold what a rectangle had before it was turned.
    const round = canvasNumber(source.round, 0, 100, 0, 0);
    if (round && CANVAS_POLYGON_SHAPES.includes(item.shape)) item.round = round;
    normalizeShapeSettings(item, source, item.shape);
  }
  if (item.kind !== 'text') {
    if (source.flipX === true) item.flipX = true;
    if (source.flipY === true) item.flipY = true;
  }
  // Each of these is stored only when set, so an item nobody limited has one spelling.
  if (source.off === true) item.off = true;
  if (source.lock === true) item.lock = true;
  if (CANVAS_ENTRANCES.includes(source.enter) && source.enter !== 'none') {
    item.enter = source.enter;
    const delay = Math.round(canvasNumber(source.delay, 0, CANVAS_MAX_DELAY_MS, 0, 0) / 10) * 10;
    if (delay) item.delay = delay;
  }
  if (CANVAS_LOOPS.includes(source.loop) && source.loop !== 'none') item.loop = source.loop;
  const tiers = normalizeItemTiers(item, source);
  if (tiers) item.tiers = tiers;
  return item;
}

// `base` with `own` over it; a null in `own` takes the value away, back to its default.
function overlay(base, own, skip = []) {
  const out = { ...base };
  for (const [key, value] of Object.entries(own || {})) {
    if (skip.includes(key)) continue;
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out;
}

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// What `drawn` changes on `base`, a value it no longer has written null.
function tierDiff(base, drawn) {
  const diff = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(drawn)])) {
    if (CANVAS_TIER_FIXED.includes(key) || sameValue(base[key], drawn[key])) continue;
    diff[key] = drawn[key] === undefined ? null : drawn[key];
  }
  return diff;
}

/*
  What each state changes on the item, kept only where it differs from the item itself, so a state
  nobody touched has no entry. An older layout kept an item to some states: it is off in the others.
*/
function normalizeItemTiers(item, source) {
  const raw = source.tiers && typeof source.tiers === 'object' && !Array.isArray(source.tiers) ? source.tiers : {};
  const legacy = Array.isArray(source.states) ? CANVAS_STATES.filter((state) => source.states.includes(state)) : [];
  const limited = legacy.length && legacy.length < CANVAS_STATES.length;
  const tiers = {};
  for (const state of CANVAS_STATES) {
    const own = raw[state] && typeof raw[state] === 'object' && !Array.isArray(raw[state]) ? { ...raw[state] } : {};
    if (limited && !legacy.includes(state) && !Object.hasOwn(own, 'off')) own.off = true;
    if (!Object.keys(own).length) continue;
    const drawn = normalizeCanvasItem(overlay(item, own, CANVAS_TIER_FIXED));
    const diff = drawn ? tierDiff(item, drawn) : {};
    if (Object.keys(diff).length) tiers[state] = diff;
  }
  return Object.keys(tiers).length ? tiers : null;
}

// The item as one state draws it, with no tiers left on it.
function canvasItemIn(item, state) {
  const own = item.tiers && item.tiers[state];
  const plain = { ...item };
  delete plain.tiers;
  return (own && normalizeCanvasItem(overlay(plain, own, CANVAS_TIER_FIXED))) || plain;
}

function normalizeShapeSettings(item, source, shape) {
  for (const [key, [min, max, def]] of Object.entries(CANVAS_SHAPE_SETTINGS[shape] || {})) {
    const value = canvasNumber(source[key], min, max, def, 0);
    if (value !== def) item[key] = value;
  }
}

// A plain black drop shadow is the default, so only another colour or a glow is stored.
function normalizeCanvasShadow(item, source) {
  if (source.shadowStyle === 'glow') item.shadowStyle = 'glow';
  const color = source.shadowColor === 'accent' ? 'accent' : canvasColor(source.shadowColor, '#000000');
  if (color !== '#000000') item.shadowColor = color;
}

/*
  What {tier} reads in each tier, in the words of whoever made the layout (the engine has no locale).
  Kept only while a text says {tier}.
*/
// An item's own values and each state's, for what a layout needs whichever state shows.
const tierEntries = (item) => [item, ...Object.values(item.tiers || {})];
const saysTier = (item) => item.kind === 'text' && tierEntries(item).some((entry) => typeof entry.text === 'string' && entry.text.includes('{tier}'));

function normalizeCanvasWords(raw, items) {
  if (!raw || typeof raw !== 'object' || !items.some(saysTier)) return null;
  const words = {};
  for (const tier of CANVAS_TIER_FILLS) {
    const word = typeof raw[tier] === 'string' ? raw[tier].replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, CANVAS_MAX_WORD) : '';
    if (word) words[tier] = word;
  }
  return Object.keys(words).length ? words : null;
}

// What a shape or an icon is filled with, and the soft edges it can have.
function normalizeCanvasPaint(item, source, fallbackMode) {
  item.fill = canvasColor(source.fill, '#ffffff');
  item.fillMode = CANVAS_FILLS.includes(source.fillMode) ? source.fillMode : fallbackMode;
  item.fill2 = canvasColor(source.fill2, '#4aa3ff');
  item.angle = canvasNumber(source.angle, 0, 360, 135, 0);
  item.shadow = canvasNumber(source.shadow, 0, 40, 0, 0);
  // Its look is kept only while there is a shadow to draw, as for a text.
  if (item.shadow) normalizeCanvasShadow(item, source);
  item.blur = canvasNumber(source.blur, 0, 20, 0);
}

/*
  The card's own text lines can take the look of an added text: only what the user changed is kept,
  so a line nobody touched still follows the preset's text settings.
*/
const CANVAS_STYLED_PARTS = ['title', 'detail', 'meta', 'progress'];

function normalizeCanvasStyle(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const part of CANVAS_STYLED_PARTS) {
    const source = raw[part];
    if (!source || typeof source !== 'object') continue;
    const style = {};
    const color = source.color === 'accent' || source.color === 'text' ? source.color : canvasColor(source.color, '');
    if (color) style.color = color;
    if (Object.hasOwn(FONT_STACKS, source.font)) style.font = source.font;
    const fontFile = typeof source.fontFile === 'string' ? source.fontFile.trim() : '';
    if (FONT_NAME_RE.test(fontFile)) style.fontFile = fontFile;
    if (source.size != null && source.size !== '' && Number.isFinite(Number(source.size))) style.size = canvasNumber(source.size, 6, 96, 16);
    if (CANVAS_WEIGHTS.includes(Number(source.weight))) style.weight = Number(source.weight);
    if (typeof source.upper === 'boolean') style.upper = source.upper;
    if (CANVAS_ALIGNS.includes(source.align)) style.align = source.align;
    if (Object.keys(style).length) out[part] = style;
  }
  return out;
}

const FRESH_MOVE = { x: 0, y: 0, r: 0, s: 1 };
const MOVE_KEYS = Object.keys(FRESH_MOVE);

// The card's own parts as one state places, styles and shows them: the card's values, then the state's.
function canvasPartsIn(canvas, state) {
  const own = (canvas.tiers && canvas.tiers[state]) || {};
  const move = {};
  for (const part of CANVAS_PARTS) {
    const drawn = { ...(canvas.move[part] || FRESH_MOVE), ...(own.move && own.move[part]) };
    if (MOVE_KEYS.some((key) => drawn[key] !== FRESH_MOVE[key])) move[part] = drawn;
  }
  const style = {};
  for (const part of CANVAS_STYLED_PARTS) {
    const drawn = overlay(canvas.style && canvas.style[part], own.style && own.style[part]);
    if (Object.keys(drawn).length) style[part] = drawn;
  }
  const shown = own.hidden || {};
  const hidden = CANVAS_PARTS.filter((part) => (Object.hasOwn(shown, part) ? shown[part] : (canvas.hidden || []).includes(part)));
  return { move, style, hidden };
}

// What each state changes on the card's parts, kept only where it differs from the card itself.
function normalizeCanvasTiers(raw, out) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const base = canvasPartsIn(out, null);
  const tiers = {};
  for (const state of CANVAS_STATES) {
    const source = raw[state];
    if (!source || typeof source !== 'object') continue;
    const entry = {};
    const moves = {};
    for (const part of CANVAS_PARTS) {
      const asked = source.move && source.move[part];
      if (!asked || typeof asked !== 'object') continue;
      const was = base.move[part] || FRESH_MOVE;
      const drawn = normalizeCanvasMove({ [part]: { ...was, ...asked } })[part] || FRESH_MOVE;
      const diff = Object.fromEntries(MOVE_KEYS.filter((key) => drawn[key] !== was[key]).map((key) => [key, drawn[key]]));
      if (Object.keys(diff).length) moves[part] = diff;
    }
    if (Object.keys(moves).length) entry.move = moves;
    const styles = {};
    for (const part of CANVAS_STYLED_PARTS) {
      const asked = source.style && source.style[part];
      if (!asked || typeof asked !== 'object') continue;
      const was = base.style[part] || {};
      const diff = tierDiff(was, normalizeCanvasStyle({ [part]: overlay(was, asked) })[part] || {});
      if (Object.keys(diff).length) styles[part] = diff;
    }
    if (Object.keys(styles).length) entry.style = styles;
    const hidden = {};
    for (const part of CANVAS_PARTS) {
      const asked = source.hidden && source.hidden[part];
      if (typeof asked === 'boolean' && asked !== base.hidden.includes(part)) hidden[part] = asked;
    }
    if (Object.keys(hidden).length) entry.hidden = hidden;
    if (Object.keys(entry).length) tiers[state] = entry;
  }
  return Object.keys(tiers).length ? tiers : null;
}

// The layout as one state draws it, shaped like what normalizeCanvas returns but with no tiers left.
function canvasIn(canvas, state) {
  const { move, style, hidden } = canvasPartsIn(canvas, state);
  const out = { move, items: canvas.items.map((item) => canvasItemIn(item, state)) };
  if (hidden.length) out.hidden = hidden;
  if (Object.keys(style).length) out.style = style;
  if (canvas.words) out.words = canvas.words;
  if (canvas.order) out.order = canvas.order;
  return out;
}

/*
  One stacking order for the card's parts and the added items, bottom first: a part by its name, an
  item by its index. Without one, items marked `back` sit under the parts and the rest above them,
  which is also what an older build draws, so `back` is kept in step with any order.
*/
const CANVAS_LAYER_PARTS = ['icon', 'meta', 'title', 'detail', 'progress'];

const defaultCanvasOrder = (items) => [
  ...items.flatMap((item, index) => (item.back ? [index] : [])),
  ...CANVAS_LAYER_PARTS,
  ...items.flatMap((item, index) => (item.back ? [] : [index])),
];

// Every part and item once each: what a stored order lacks goes on top, what it names twice or
// does not have is dropped.
function canvasOrder(canvas) {
  const items = canvas.items || [];
  const fallback = defaultCanvasOrder(items);
  if (!Array.isArray(canvas.order)) return fallback;
  const valid = (entry) => CANVAS_LAYER_PARTS.includes(entry) || (Number.isInteger(entry) && entry >= 0 && entry < items.length);
  const order = [...new Set(canvas.order.filter(valid))];
  return [...order, ...fallback.filter((entry) => !order.includes(entry))];
}

// Takes the object itself or its JSON text (what the designer's hidden field holds).
function normalizeCanvas(raw) {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return { move: {}, items: [] };
  const rawItems = Array.isArray(source.items) ? source.items.slice(0, CANVAS_MAX_ITEMS) : [];
  // Indices in a stored order name the raw list, so they follow each item past the ones dropped here.
  const kept = [];
  const items = [];
  rawItems.forEach((rawItem, index) => {
    const item = normalizeCanvasItem(rawItem);
    if (!item) return;
    kept[index] = items.length;
    items.push(item);
  });
  const out = { move: normalizeCanvasMove(source.move), items };
  // Parts the user removed from the card, kept by name so "put back" can bring them back.
  const hidden = Array.isArray(source.hidden) ? CANVAS_PARTS.filter((part) => source.hidden.includes(part)) : [];
  if (hidden.length) out.hidden = hidden;
  const style = normalizeCanvasStyle(source.style);
  if (Object.keys(style).length) out.style = style;
  const tiers = normalizeCanvasTiers(source.tiers, out);
  if (tiers) out.tiers = tiers;
  const words = normalizeCanvasWords(source.words, items);
  if (words) out.words = words;
  if (Array.isArray(source.order)) {
    const remapped = source.order.map((entry) => (Number.isInteger(entry) ? kept[entry] : entry)).filter((entry) => entry !== undefined);
    const order = canvasOrder({ items, order: remapped });
    const firstPart = order.findIndex((entry) => typeof entry === 'string');
    order.forEach((entry, position) => {
      if (Number.isInteger(entry)) items[entry].back = position < firstPart;
    });
    // An order that only says what `back` already says is not stored, so "unchanged" has one spelling.
    if (order.join() !== defaultCanvasOrder(items).join()) out.order = order;
  }
  return out;
}

// The picture files a free layout names, once each.
const canvasFiles = (canvas) => [
  ...new Set(
    normalizeCanvas(canvas)
      .items.filter((item) => item.kind === 'image')
      .flatMap(tierEntries)
      .map((entry) => entry.file)
      .filter(Boolean)
  ),
];

// The font files the texts of a free layout name, its added texts and its restyled lines, once each.
const canvasFonts = (canvas) => {
  const normalized = normalizeCanvas(canvas);
  const styles = [normalized.style, ...Object.values(normalized.tiers || {}).map((own) => own.style)].flatMap((style) => Object.values(style || {}));
  return [...new Set([...normalized.items.flatMap(tierEntries), ...styles].map((entry) => entry.fontFile).filter(Boolean))];
};

function normalizeValue(raw, property) {
  switch (property.type) {
    case 'canvas':
      return normalizeCanvas(raw);
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
    case 'font':
      return typeof raw === 'string' && FONT_NAME_RE.test(raw.trim()) ? raw.trim() : property.def;
    case 'logo':
      return typeof raw === 'string' && IMAGE_NAME_RE.test(raw.trim()) ? raw.trim() : property.def;
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
  LOGO_POSITIONS,
  FONT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_FONT_BYTES,
  MAX_LOGO_BYTES,
  FONT_NAME_RE,
  IMAGE_NAME_RE,
  fontKind,
  imageKind,
  checkFont,
  checkLogo,
  fontMime,
  fontFormat,
  imageMime,
  EASINGS,
  COLOR_RE,
  SOUND_RE,
  ASSET_RE,
  normalizeOptions,
  cssValue,
  CANVAS_PARTS,
  CANVAS_SHAPES,
  CANVAS_POLYGON_SHAPES,
  CANVAS_MASK_SHAPES,
  CANVAS_SHAPE_SETTINGS,
  CANVAS_DASHES,
  CANVAS_LOOPS,
  ANIMATED_IMAGE_RE,
  CANVAS_TIER_FILLS,
  CANVAS_STATES,
  CANVAS_SHARED_KEYS,
  CANVAS_ICONS,
  CANVAS_TOKENS,
  CANVAS_ENTRANCES,
  CANVAS_MAX_DELAY_MS,
  CANVAS_MAX_ITEMS,
  CANVAS_STYLED_PARTS,
  CANVAS_LAYER_PARTS,
  canvasOrder,
  normalizeCanvas,
  normalizeCanvasItem,
  canvasItemIn,
  canvasPartsIn,
  canvasIn,
  canvasFiles,
  canvasFonts,
};
