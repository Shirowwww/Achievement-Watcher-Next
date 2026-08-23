'use strict';

/*
  Starting points for the preset designer. A template is an ordinary set of designer options -
  applying one is indistinguishable from moving every slider by hand, never a second kind of preset.
  Names are proper names, like the bundled presets, so they read the same in every language.
*/

const { PRESET_PROPERTIES, normalizeOptions } = require('./presetSchema.js');

const PRESET_TEMPLATES = [
  {
    // The design the builder has always produced, kept as a template so "back to the classic look"
    // is one click rather than a memory exercise.
    name: 'Classic',
    options: {},
  },
  {
    name: 'Aurora',
    options: {
      bgMode: 'gradient',
      bg: '#0b1224',
      bg2: '#1d4f6c',
      bgAngle: 120,
      accent: '#57e8c3',
      text: '#eaf6ff',
      radius: 18,
      accentBar: 'left',
      accentBarSize: 5,
      glow: 35,
      shadow: 55,
      iconRadius: 22,
      animIn: 'left',
      animOut: 'left',
      rareAccent: '#ffd76e',
      platinumAccent: '#d8f4ff',
    },
  },
  {
    name: 'Neon',
    options: {
      bgMode: 'gradient',
      bg: '#12002b',
      bg2: '#3d0d63',
      bgAngle: 135,
      accent: '#ff3ea5',
      text: '#ffffff',
      radius: 22,
      accentBar: 'outline',
      accentBarSize: 2,
      glow: 75,
      shadow: 60,
      fontFamily: 'condensed',
      fontSize: 19,
      titleCase: 'uppercase',
      letterSpacing: 1,
      iconRadius: 20,
      iconBorder: 2,
      iconGlow: 60,
      animIn: 'right',
      animOut: 'right',
      easing: 'back',
      rareAccent: '#ffe14e',
      platinumAccent: '#8affd8',
    },
  },
  {
    name: 'Cover',
    options: {
      bgMode: 'artwork',
      artworkDim: 55,
      artworkBlur: 4,
      bg: '#05070c',
      accent: '#7ee787',
      text: '#ffffff',
      textShadow: 60,
      radius: 16,
      accentBar: 'bottom',
      accentBarSize: 3,
      width: 480,
      padX: 22,
      padY: 16,
      iconSize: 76,
      iconRadius: 50,
      fontSize: 18,
      detailScale: 85,
      showGameName: true,
      animIn: 'top',
      animOut: 'top',
      shadow: 70,
    },
  },
  {
    name: 'Minimal',
    options: {
      layout: 'icon-top',
      align: 'center',
      width: 320,
      padY: 18,
      gap: 8,
      bg: '#0f1115',
      accent: '#e6e6e6',
      text: '#f5f5f5',
      radius: 26,
      accentBar: 'none',
      borderWidth: 1,
      borderColor: '#3a3f4b',
      fontFamily: 'serif',
      fontSize: 17,
      iconSize: 72,
      iconRadius: 50,
      animIn: 'zoom',
      animOut: 'fade',
      glow: 15,
      duration: 4000,
      showProgress: false,
    },
  },
  {
    name: 'Console',
    options: {
      bg: '#1b1b1f',
      accent: '#9bf6a0',
      text: '#ffffff',
      radius: 8,
      accentBar: 'left',
      accentBarSize: 6,
      width: 460,
      padX: 20,
      padY: 14,
      iconSize: 72,
      iconRadius: 8,
      fontSize: 17,
      titleWeight: 800,
      shadow: 65,
      animIn: 'right',
      animOut: 'right',
      duration: 5000,
      showRarity: true,
      rareAccent: '#ffd24e',
      platinumAccent: '#bfe9ff',
    },
  },
  {
    name: 'Terminal',
    options: {
      bg: '#04120a',
      accent: '#39ff88',
      text: '#c8ffdd',
      radius: 2,
      accentBar: 'outline',
      accentBarSize: 1,
      borderWidth: 0,
      fontFamily: 'mono',
      fontSize: 15,
      detailScale: 90,
      titleCase: 'uppercase',
      letterSpacing: 1,
      layout: 'text-only',
      align: 'left',
      width: 400,
      padX: 16,
      padY: 12,
      animIn: 'fade',
      animOut: 'fade',
      easing: 'linear',
      glow: 40,
      shadow: 20,
      showRarity: true,
      rareAccent: '#eaff5c',
      platinumAccent: '#8ff5ff',
    },
  },
  {
    name: 'Slate',
    options: {
      bgMode: 'gradient',
      bg: '#20242c',
      bg2: '#12151b',
      bgAngle: 180,
      accent: '#8ab4ff',
      text: '#f2f5fa',
      radius: 14,
      accentBar: 'none',
      borderWidth: 1,
      borderColor: '#39404e',
      width: 470,
      padX: 20,
      padY: 15,
      gap: 14,
      iconSize: 68,
      iconRadius: 16,
      fontSize: 17,
      descriptionLines: 2,
      detailScale: 90,
      showGameName: true,
      shadow: 50,
      animIn: 'bottom',
      animOut: 'bottom',
    },
  },
  {
    // The only light design in the set. A bright popup is a real choice and it was previously one the
    // user had to discover by inverting every colour by hand.
    name: 'Paper',
    options: {
      bg: '#f4f1ea',
      text: '#20242c',
      accent: '#b4531f',
      titleColorMode: 'custom',
      titleColor: '#1b1f26',
      fontFamily: 'serif',
      fontSize: 17,
      detailScale: 90,
      descriptionLines: 2,
      width: 460,
      padX: 22,
      padY: 16,
      gap: 14,
      radius: 6,
      accentBar: 'left',
      accentBarSize: 5,
      borderWidth: 1,
      borderColor: '#d8d2c4',
      iconRadius: 6,
      shadow: 30,
      glow: 0,
      showGameName: true,
      animIn: 'right',
      animOut: 'right',
      rareAccent: '#a8791b',
      platinumAccent: '#2f6c8f',
      rareSilver: '#7d8792',
      rareBronze: '#9c6234',
    },
  },
  {
    name: 'Ember',
    options: {
      bgMode: 'gradient',
      bg: '#1a0906',
      bg2: '#4a1408',
      bgAngle: 155,
      accent: '#ff7a2f',
      text: '#ffece0',
      radius: 14,
      accentBar: 'bottom',
      accentBarSize: 4,
      width: 440,
      padY: 14,
      fontSize: 17,
      titleWeight: 800,
      glow: 55,
      glowAnim: 'pulse',
      shadow: 60,
      iconRadius: 50,
      iconGlow: 45,
      animIn: 'bottom',
      animOut: 'fade',
      easing: 'back',
      rareAccent: '#ffcb45',
      platinumAccent: '#ffd9b0',
    },
  },
  {
    name: 'Frost',
    options: {
      bgMode: 'gradient',
      bg: '#0d1a24',
      bg2: '#17303f',
      bgAngle: 200,
      accent: '#7fd7ff',
      text: '#e8f6ff',
      opacity: 0.85,
      radius: 20,
      accentBar: 'none',
      borderWidth: 1,
      borderColor: '#4d7f99',
      width: 450,
      padX: 22,
      padY: 16,
      gap: 14,
      fontFamily: 'rounded',
      fontSize: 17,
      detailScale: 90,
      descriptionLines: 2,
      iconRadius: 24,
      iconBorder: 1,
      shadow: 40,
      glow: 30,
      glowAnim: 'breathe',
      animIn: 'top',
      animOut: 'top',
      showGameName: true,
      rareAccent: '#ffe08a',
      platinumAccent: '#ffffff',
    },
  },
  {
    // Built for artwork: the largest stroke in the set, because a thin line vanishes on a bright cover.
    name: 'Poster',
    options: {
      bgMode: 'artwork',
      artworkDim: 40,
      artworkBlur: 2,
      artworkPosition: 'top',
      bg: '#000000',
      accent: '#ffffff',
      text: '#ffffff',
      textShadow: 40,
      textStroke: 1,
      textStrokeColor: '#000000',
      layout: 'icon-top',
      align: 'center',
      width: 400,
      padX: 20,
      padY: 18,
      gap: 10,
      fontSize: 18,
      titleCase: 'uppercase',
      letterSpacing: 1,
      iconSize: 80,
      iconRadius: 50,
      iconBorder: 2,
      radius: 10,
      accentBar: 'none',
      shadow: 70,
      showGameName: true,
      showRarity: true,
      animIn: 'zoom',
      animOut: 'fade',
    },
  },
  {
    name: 'Pixel',
    options: {
      bg: '#0b0b12',
      bg2: '#1b1b2c',
      accent: '#f2f24a',
      text: '#e8e8f4',
      fontFamily: 'mono',
      fontSize: 14,
      detailScale: 90,
      titleCase: 'uppercase',
      titleWeight: 700,
      letterSpacing: 1,
      textStroke: 0.5,
      textStrokeColor: '#000000',
      radius: 0,
      accentBar: 'outline',
      accentBarSize: 3,
      width: 380,
      padX: 14,
      padY: 12,
      gap: 10,
      iconSize: 56,
      iconRadius: 0,
      iconBorder: 2,
      shadow: 15,
      glow: 20,
      animIn: 'left',
      animOut: 'left',
      easing: 'linear',
      animInMs: 200,
      animOutMs: 200,
      showRarity: true,
      rareAccent: '#ff5cf2',
      platinumAccent: '#5cf2ff',
    },
  },
  {
    // The information-dense one: game name, rarity chip, two description lines and a thick meter.
    name: 'Ribbon',
    options: {
      bgMode: 'gradient',
      bg: '#151922',
      bg2: '#232b3c',
      bgAngle: 90,
      accent: '#ff4f6d',
      text: '#f4f6fb',
      width: 520,
      padX: 20,
      padY: 14,
      gap: 14,
      fontSize: 16,
      detailScale: 85,
      descriptionLines: 2,
      titleColorMode: 'text',
      radius: 10,
      accentBar: 'left',
      accentBarSize: 8,
      iconSize: 72,
      iconRadius: 10,
      shadow: 55,
      showGameName: true,
      showRarity: true,
      progressHeight: 12,
      animIn: 'right',
      animOut: 'bottom',
      duration: 7000,
      rareAccent: '#ffd24e',
      platinumAccent: '#9fe8ff',
    },
  },
];

const TEMPLATE_BY_NAME = new Map(PRESET_TEMPLATES.map((template) => [template.name, template]));

// A template as a complete, validated option set. Unknown or out-of-range values in a template would
// be clamped exactly like anything else, so a template can never describe a design the designer
// cannot show back to the user.
function templateOptions(name) {
  const template = TEMPLATE_BY_NAME.get(String(name));
  return template ? normalizeOptions(template.options) : null;
}

// Randomiser helpers

const pick = (random, list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
const between = (random, min, max, step = 1) => {
  const steps = Math.floor((max - min) / step);
  return min + Math.min(steps, Math.floor(random() * (steps + 1))) * step;
};

function hsl(hue, saturation, lightness) {
  // Written as hex rather than hsl() so it lands in a colour input, which only takes #rrggbb.
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  const to255 = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255);
  const [r, g, b] = s === 0 ? [l, l, l] : [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
  return `#${[to255(r), to255(g), to255(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/*
  A random design that is still a design. Rolling every property independently produces noise, so the
  draw is made in two stages: first an ARCHETYPE fixes the decisions that have to agree with each other
  (flat/gradient/artwork background, dark or light, glow level, text), then everything else is rolled
  inside the range that archetype leaves open. `random` is injectable so the result can be asserted.
*/

// What each archetype fixes. Anything it does not name is rolled below within the same bounds for
// all of them, so adding an archetype means stating only what makes it different.
const RANDOM_ARCHETYPES = [
  // The everyday card: a flat dark plate with one accent edge. Drawn most often on purpose.
  { key: 'flat', weight: 4, bgMode: 'solid', light: false, bgLight: [6, 15], bgSat: [12, 45], glow: [0, 30], fonts: ['sans', 'sans', 'rounded', 'condensed'] },
  { key: 'gradient', weight: 3, bgMode: 'gradient', light: false, bgLight: [7, 16], bgSat: [25, 55], glow: [0, 45], fonts: ['sans', 'rounded', 'condensed', 'serif'] },
  // Loud: a saturated gradient, a hard outline and a glow that moves.
  { key: 'neon', weight: 2, bgMode: 'gradient', light: false, bgLight: [5, 12], bgSat: [45, 75], glow: [45, 85], glowAnim: ['pulse', 'breathe'], bars: ['outline', 'left'], fonts: ['condensed', 'mono', 'sans'], upper: true },
  // Over the game's own artwork, which is the one case where the text needs help staying readable.
  { key: 'artwork', weight: 2, bgMode: 'artwork', light: false, bgLight: [4, 10], bgSat: [10, 35], glow: [0, 25], shadowText: [40, 70], stroke: [0, 1], fonts: ['sans', 'condensed', 'rounded'] },
  // Quiet and see-through, with no accent bar at all.
  { key: 'glass', weight: 2, bgMode: 'gradient', light: false, bgLight: [10, 20], bgSat: [15, 40], glow: [10, 35], glowAnim: ['none', 'breathe'], bars: ['none'], border: true, opacity: [0.72, 0.92], fonts: ['rounded', 'sans', 'serif'] },
  // Monospaced, square and hard-edged. A look rather than a treatment, so it stays uncommon.
  { key: 'terminal', weight: 1, bgMode: 'solid', light: false, bgLight: [3, 8], bgSat: [20, 60], glow: [20, 55], bars: ['outline', 'left', 'none'], fonts: ['mono'], upper: true, radius: [0, 4], layouts: ['icon-left', 'text-only'] },
  // Light. Rare, because most people watch a game on a dark screen, but it has to be reachable.
  { key: 'paper', weight: 1, bgMode: 'solid', light: true, bgLight: [88, 96], bgSat: [4, 22], glow: [0, 10], bars: ['left', 'none'], border: true, fonts: ['serif', 'sans', 'rounded'], radius: [2, 12] },
];

function pickArchetype(random) {
  const total = RANDOM_ARCHETYPES.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const archetype of RANDOM_ARCHETYPES) {
    roll -= archetype.weight;
    if (roll < 0) return archetype;
  }
  return RANDOM_ARCHETYPES[0];
}

function randomPresetOptions(random = Math.random) {
  const archetype = pickArchetype(random);
  const range = (name, fallback, step) => {
    const bounds = archetype[name] || fallback;
    return between(random, bounds[0], bounds[1], step || 1);
  };

  const hue = between(random, 0, 350, 10);
  const backgroundHue = (hue + pick(random, [-30, -15, 0, 0, 15, 30]) + 360) % 360;
  const light = archetype.light;
  const bgLightness = range('bgLight', [6, 14]);
  const bgSaturation = range('bgSat', [20, 45]);

  // On a light card the accent has to be dark enough to read against it, and the other way round.
  const accent = hsl(hue, between(random, 60, 95), light ? between(random, 32, 45) : between(random, 55, 70));
  const text = light
    ? hsl(backgroundHue, between(random, 6, 18), between(random, 12, 20))
    : hsl(backgroundHue, between(random, 0, 12), between(random, 92, 100));

  const layout = pick(random, archetype.layouts || ['icon-left', 'icon-left', 'icon-left', 'icon-right', 'icon-top']);
  const align = layout === 'icon-top' ? pick(random, ['center', 'center', 'left']) : pick(random, ['left', 'left', 'left', 'center']);
  const accentBar = pick(random, archetype.bars || ['left', 'left', 'left', 'bottom', 'outline', 'none']);
  const border = archetype.border ? random() < 0.75 : random() < 0.2;
  const glow = range('glow', [0, 40], 5);
  const descriptionLines = pick(random, [1, 1, 1, 2, 2, 3]);
  const showGameName = random() < 0.45;

  return normalizeOptions({
    layout,
    align,
    showGameName,
    // A card carrying more than one line of description or a game name above it needs the room.
    width: between(random, descriptionLines > 1 || showGameName ? 420 : 340, 540, 20),
    padX: between(random, 14, 26),
    padY: between(random, 10, 20),
    gap: between(random, 8, 18),

    fontFamily: pick(random, archetype.fonts || ['sans', 'sans', 'rounded', 'condensed', 'serif', 'mono']),
    fontSize: between(random, 15, 20),
    detailScale: between(random, 80, 105, 5),
    descriptionLines,
    titleColorMode: pick(random, ['accent', 'accent', 'accent', 'text']),
    titleColor: text,
    titleWeight: pick(random, [600, 700, 700, 800, 900]),
    titleCase: archetype.upper ? pick(random, ['uppercase', 'uppercase', 'none']) : pick(random, ['none', 'none', 'none', 'uppercase']),
    letterSpacing: between(random, 0, archetype.upper ? 2 : 1, 0.5),
    textShadow: range('shadowText', [0, 25], 5),
    textStroke: range('stroke', [0, 0], 0.5),
    textStrokeColor: light ? '#ffffff' : '#000000',

    bgMode: archetype.bgMode,
    bg: hsl(backgroundHue, bgSaturation, bgLightness),
    bg2: hsl(
      (backgroundHue + pick(random, [20, 30, 40, 55])) % 360,
      bgSaturation + between(random, 0, 15),
      bgLightness + (light ? -between(random, 3, 8) : between(random, 5, 14))
    ),
    bgAngle: between(random, 0, 350, 15),
    artworkDim: between(random, 35, 65, 5),
    artworkBlur: pick(random, [0, 0, 2, 4, 6]),
    artworkPosition: pick(random, ['center', 'center', 'top', 'bottom']),
    text,
    accent,
    opacity: archetype.opacity ? between(random, archetype.opacity[0], archetype.opacity[1], 0.02) : 1,

    iconSize: between(random, 52, 84, 2),
    iconRadius: pick(random, [0, 8, 14, 20, 50, 50]),
    iconBorder: pick(random, [0, 0, 0, 1, 2]),
    iconGlow: pick(random, [0, 0, 25, 45, 65]),

    radius: range('radius', [0, 28], 2),
    accentBar,
    accentBarSize: between(random, 2, accentBar === 'outline' ? 4 : 8),
    borderWidth: border ? between(random, 1, 2) : 0,
    borderColor: light
      ? hsl(backgroundHue, bgSaturation, bgLightness - between(random, 8, 16))
      : hsl(backgroundHue, bgSaturation, bgLightness + between(random, 10, 20)),

    shadow: between(random, 25, 70, 5),
    glow,
    glowAnim: glow > 0 ? pick(random, archetype.glowAnim || ['none', 'none', 'none', 'pulse', 'breathe']) : 'none',

    animIn: pick(random, ['bottom', 'bottom', 'left', 'right', 'top', 'zoom', 'fade']),
    animOut: pick(random, ['bottom', 'bottom', 'left', 'right', 'top', 'fade']),
    duration: between(random, 4000, 8000, 500),
    entryDistance: between(random, 60, 150, 10),
    animInMs: between(random, 320, 700, 20),
    animOutMs: between(random, 240, 520, 20),
    easing: pick(random, ['smooth', 'smooth', 'smooth', 'back', 'linear']),

    rareAccent: hsl(between(random, 38, 52), 90, light ? 42 : 62),
    rareGlow: between(random, 35, 80, 5),
    platinumAccent: hsl(between(random, 190, 220), 70, light ? 45 : 85),
    platinumGlow: between(random, 45, 90, 5),
    showProgress: random() < 0.85,
    showRarity: random() < 0.35,
    progressHeight: between(random, 5, 12),
    rareSilver: hsl(between(random, 200, 225), 20, light ? 45 : 72),
    rareBronze: hsl(between(random, 20, 32), 55, light ? 40 : 52),
  });
}

// Every property a template or the randomiser can set has to be one the schema knows, or it would be
// dropped on the way in and the design would silently differ from the one that was described.
function unknownTemplateKeys() {
  const known = new Set(PRESET_PROPERTIES.map((property) => property.key));
  const out = [];
  for (const template of PRESET_TEMPLATES) {
    for (const key of Object.keys(template.options)) if (!known.has(key)) out.push(`${template.name}.${key}`);
  }
  return out;
}

module.exports = { PRESET_TEMPLATES, templateOptions, randomPresetOptions, unknownTemplateKeys };
