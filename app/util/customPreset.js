'use strict';

// Build notification preset files from the Settings preset designer.
// Everything below is string work driven by util/presetSchema.js; init.js writes the result to
// userData. The one exception is presetSound(), which reads a preset folder that is already on disk.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const schema = require('./presetSchema.js');
const { cssUrl } = require('./cssUrl.js');
const { escapeHtml } = require('./escapeHtml.js');
const { PRESET_PROPERTIES, FONT_STACKS, ICON_SHAPES, BG_PATTERNS, BG_PATTERN_SIZES, MOTION_OFFSETS, EASINGS, normalizeOptions, cssValue } = schema;

// The family name @font-face gives the preset's own font file.
const CUSTOM_FONT_FAMILY = 'AW Custom Font';

/*
  The one inline script every generated preset carries, identical in all of them - the design is
  entirely in the generated stylesheet. This lets the designer preview a draft with this same
  markup/engine and a different stylesheet, instead of a second renderer that could drift.
*/
const PRESET_ENGINE = [
  "window.addEventListener('DOMContentLoaded', function () {",
  "  var root = document.querySelector('.ach');",
  '  var metaDur = document.querySelector(\'meta[name="duration"]\');',
  '  var total = Math.max(600, Number((metaDur && metaDur.content) || 6000));',
  '  // Timings live in the stylesheet, so the designer changes them by swapping the CSS alone.',
  '  function timing(name, fallback) {',
  '    try {',
  '      var raw = getComputedStyle(root).getPropertyValue(name).trim();',
  '      var value = parseFloat(raw);',
  "      if (!isFinite(value)) return fallback;",
  "      return raw.indexOf('ms') > -1 ? value : value * 1000;",
  '    } catch (e) { return fallback; }',
  '  }',
  '  // A Windows path becomes a file URL; anything that already carries a scheme is left alone, so a',
  '  // data: or https: image (the designer previews with data: URIs) is not turned into file:///data:.',
  '  function fileUrl(value) {',
  "    var p = String(value || '').replace(/\\\\/g, '/');",
  "    if (!p) return '';",
  "    return /^(?:file|data|https?|blob):/i.test(p) ? p : 'file:///' + p;",
  '  }',
  '  function applyState(data) {',
  "    root.classList.remove('state-rare', 'state-platinum', 'tier-gold', 'tier-silver', 'tier-bronze');",
  "    var type = String((data && data.notificationType) || '').toLowerCase();",
  "    if ((data && data.isPlatinum) || type === 'platinum') { root.classList.add('state-platinum'); return; }",
  "    if (type === 'progress' || type === 'playtime') return;",
  '    // The host names the tier (rare tiers or trophy grades); the percentage is the fallback for a',
  '    // host that does not send one, such as the designer preview.',
  '    var tier = data && data.rarityTier;',
  "    if (typeof tier === 'string') {",
  "      if (tier === 'gold' || tier === 'silver' || tier === 'bronze') root.classList.add('state-rare', 'tier-' + tier);",
  '      return;',
  '    }',
  '    // An ordinary unlock carries rarityPercent null, and Number(null) is 0 - which would make',
  '    // every notification the rarest tier there is. Absence has to be checked before the number.',
  '    var raw = data && data.rarityPercent;',
  "    if (raw == null || raw === '') return;",
  '    var percent = Number(raw);',
  '    if (!isFinite(percent) || percent < 0 || percent > 15) return;',
  "    root.classList.add('state-rare');",
  "    root.classList.add(percent <= 5 ? 'tier-gold' : percent <= 10 ? 'tier-silver' : 'tier-bronze');",
  '  }',
  '  function applyArtwork(data) {',
  '    var art = fileUrl((data && (data.imagePath || data.headerPath)) || (data && data.gameIconPath) || "");',
  '    root.style.setProperty(\'--artwork\', art ? \'url("\' + art + \'")\' : \'none\');',
  '  }',
  '  function normalizeProgress(data) {',
  '    var src = (data && data.progress) || data || {};',
  '    var max = Number(src.max != null ? src.max : src.progressMax);',
  '    if (!isFinite(max) || max <= 1) return null;',
  '    var currentRaw = Number(src.current != null ? src.current : src.progressCurrent);',
  '    var current = Math.max(0, Math.min(max, isFinite(currentRaw) ? currentRaw : 0));',
  '    var percentRaw = Number(src.percent != null ? src.percent : src.progressPercent);',
  '    var percent = isFinite(percentRaw)',
  '      ? Math.max(0, Math.min(100, Math.floor(percentRaw)))',
  '      : Math.max(0, Math.min(100, Math.floor((current / max) * 100)));',
  '    return { current: current, max: max, percent: percent };',
  '  }',
  '  function applyProgress(data) {',
  "    var line = document.querySelector('.progress_line');",
  "    var meter = document.querySelector('.progress_meter');",
  "    var label = document.querySelector('.progress_label');",
  '    if (!line || !meter || !label) return;',
  '    var progress = normalizeProgress(data);',
  '    if (!progress) { line.hidden = true; meter.style.width = "0%"; label.textContent = ""; return; }',
  '    line.hidden = false;',
  '    meter.style.width = progress.percent + "%";',
  '    label.textContent = progress.current + "/" + progress.max + " - " + progress.percent + "%";',
  '  }',
  '  /*',
  '    A line too long for the card stays still long enough to be read from its start, scrolls to its',
  '    end, rests there, then comes back, for as long as the card is up. The card stays up for one full',
  '    pass of its longest line (capped), so the end of a long description is never cut off.',
  '  */',
  '  var MARQUEE_LEAD_MS = 2500;',
  '  var MARQUEE_REST_MS = 1500;',
  '  var MARQUEE_BACK_MS = 1200;',
  '  var MARQUEE_MAX_TOTAL_MS = 15000;',
  '  function marqueePlan(lineEl) {',
  '    if (!lineEl) return null;',
  '    try { lineEl.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {}',
  "    lineEl.classList.remove('marquee');",
  '    void lineEl.offsetWidth;',
  "    var clip = lineEl.closest('.text_wrap') || lineEl;",
  '    var overflow = Math.round((lineEl.scrollWidth || 0) - (clip.clientWidth || 0));',
  '    if (overflow <= 2) return null;',
  '    var px = Math.ceil(overflow + 24);',
  '    var scrollMs = Math.max(3000, Math.round((px / 50) * 1000));',
  '    return { el: lineEl, px: px, scrollMs: scrollMs, readMs: MARQUEE_LEAD_MS + scrollMs + MARQUEE_REST_MS };',
  '  }',
  '  function startMarquee(plan) {',
  '    if (!plan) return;',
  '    var cycle = plan.readMs + MARQUEE_BACK_MS;',
  '    var home = "translateX(0)";',
  '    var end = "translateX(-" + plan.px + "px)";',
  "    plan.el.classList.add('marquee');",
  '    plan.el.animate([',
  '      { transform: home, offset: 0 },',
  '      { transform: home, offset: MARQUEE_LEAD_MS / cycle },',
  '      { transform: end, offset: (MARQUEE_LEAD_MS + plan.scrollMs) / cycle },',
  '      { transform: end, offset: plan.readMs / cycle },',
  '      { transform: home, offset: 1 }',
  '    ], { duration: cycle, easing: "linear", iterations: Infinity });',
  '  }',
  '  /*',
  '    The line above the title (game name + rarity). Each half hides when the payload lacks it,',
  '    and the whole row disappears when both do, so it never reserves an empty line.',
  '  */',
  '  function rarityText(data) {',
  '    var percent = data && data.rarityPercent;',
  "    if (percent == null || percent === '' || !isFinite(Number(percent))) return '';",
  "    return (Math.round(Number(percent) * 10) / 10) + '%';",
  '  }',
  '  function applyMeta(data) {',
  "    var row = document.querySelector('.meta');",
  "    var gameEl = document.querySelector('.game');",
  "    var rarityEl = document.querySelector('.rarity');",
  '    if (!row || !gameEl || !rarityEl) return;',
  "    var game = String((data && data.gameName) || '').trim();",
  '    gameEl.textContent = game;',
  '    gameEl.hidden = !game;',
  '    var rarity = rarityText(data);',
  '    rarityEl.textContent = rarity;',
  '    rarityEl.hidden = !rarity;',
  '    row.hidden = !game && !rarity;',
  '  }',
  '  // An added text that says {game}, {title}... gets those words here; {tier} is in the stylesheet.',
  '  function applyTokens(words) {',
  "    var spans = document.querySelectorAll('.aw-canvas [data-tok]');",
  '    for (var i = 0; i < spans.length; i++) {',
  "      var key = spans[i].getAttribute('data-tok');",
  "      if (Object.prototype.hasOwnProperty.call(words, key)) spans[i].textContent = words[key];",
  '    }',
  '  }',
  '  // An animated picture set to replay starts over as it appears: a new address is a new animation,',
  '  // swapped in once loaded so the element never shows a gap. A picture held inline (the',
  '  // designer preview) gets its new address from a parameter of its media type.',
  '  var replayTimers = [];',
  '  var replayCount = 0;',
  '  function restartPicture(node) {',
  "    node.style.backgroundImage = '';",
  '    var match = /^url\\("(.+)"\\)$/.exec(getComputedStyle(node).backgroundImage);',
  '    if (!match) return;',
  '    replayCount += 1;',
  "    var next = match[1].indexOf('data:') === 0",
  "      ? match[1].replace(/^data:([^;,]*)(;replay=\\d+)?/, 'data:$1;replay=' + replayCount)",
  "      : match[1].replace(/[?#].*$/, '') + '?replay=' + replayCount;",
  '    var picture = new Image();',
  '    picture.onload = function () { node.style.backgroundImage = \'url("\' + next + \'")\'; };',
  '    picture.src = next;',
  '  }',
  '  function replayPictures() {',
  '    replayTimers.forEach(clearTimeout);',
  "    var nodes = document.querySelectorAll('.aw-canvas [data-replay]');",
  '    replayTimers = Array.prototype.map.call(nodes, function (node) {',
  "      return setTimeout(function () { restartPicture(node); }, Number(node.getAttribute('data-replay')) || 0);",
  '    });',
  '  }',
  '  var closeTimer = null;',
  '  function onPayload(displayName, description, iconPath, scale, data) {',
  "    var titleEl = document.querySelector('.title');",
  "    var detailEl = document.querySelector('.detail');",
  "    var iconEl = document.querySelector('.icon img');",
  '    if (displayName != null) titleEl.textContent = displayName;',
  '    if (description != null) detailEl.textContent = description;',
  '    if (iconPath) { iconEl.src = fileUrl(iconPath); iconEl.style.display = "block"; }',
  "    else { iconEl.style.display = 'none'; }",
  '    var s = Math.max(0.01, parseFloat(scale || 1) || 1);',
  "    root.style.setProperty('--scale', String(s));",
  '    applyState(data);',
  "    root.classList.toggle('is-hidden', data.hidden === true);",
  '    applyArtwork(data);',
  '    applyMeta(data);',
  '    applyProgress(data);',
  "    applyTokens({ game: String(data.gameName || '').trim(), title: titleEl.textContent, detail: detailEl.textContent, rarity: rarityText(data) });",
  "    var inMs = timing('--ach-in', 520);",
  "    var outMs = timing('--ach-out', 380);",
  '    var marquees = [marqueePlan(titleEl), marqueePlan(detailEl)];',
  '    var readMs = Math.max(0, (marquees[0] || {}).readMs || 0, (marquees[1] || {}).readMs || 0);',
  '    var shownMs = readMs > 0 ? Math.max(total, Math.min(inMs + readMs + outMs, MARQUEE_MAX_TOTAL_MS)) : total;',
  '    var holdMs = Math.max(0, shownMs - inMs - outMs);',
  "    root.style.setProperty('--ach-hold', holdMs + 'ms');",
  "    root.classList.remove('active');",
  '    void root.offsetWidth;',
  "    root.classList.add('active');",
  '    replayPictures();',
  '    if (window.api && window.api.notificationRenderReady) window.api.notificationRenderReady();',
  '    requestAnimationFrame(function () { marquees.forEach(startMarquee); });',
  '    clearTimeout(closeTimer);',
  '    closeTimer = setTimeout(function () {',
  "      root.classList.remove('active');",
  '      if (window.api && window.api.closeNotificationWindow) window.api.closeNotificationWindow();',
  '    }, shownMs);',
  '  }',
  '  if (window.api && window.api.onNotification) window.api.onNotification(function (d) {',
  '    onPayload(d && d.displayName, d && d.description, d && (d.iconPath || d.icon), d && d.scale, d || {});',
  '  });',
  '});',
].join('\n');

/*
  One spelling for an inline script, and the CSP hash that matches it. A srcdoc preview inherits
  the embedder's CSP, so it only runs because view/app.html lists these hashes - change the engine
  by one character and the preview breaks until the policy is updated (a test enforces this).
*/
function inlineScript(source) {
  return `<script>\n${source}\n</script>`;
}

function inlineScriptHash(source) {
  return `sha256-${crypto.createHash('sha256').update(`\n${source}\n`, 'utf8').digest('base64')}`;
}

// The card itself. Shared by the generated preset and by the designer's preview so both lay out the
// exact same DOM.
const PRESET_MARKUP = [
  '<div class="ach"><div class="icon"><img src="" alt="" /></div>',
  '<div class="text_wrap">',
  '<div class="meta" hidden><span class="game" hidden></span><span class="rarity" hidden></span></div>',
  '<p class="title"></p><span class="detail"></span>',
  '<div class="progress_line" hidden><span class="progress_track"><span class="progress_meter"></span></span><span class="progress_label"></span></div></div></div>',
].join('');

/*
  Parts move through their own `translate`, `rotate` and `scale`, so they compose with a preset's
  animated `transform`. Items sit in one container with no stacking context: z-index -1 puts one
  behind the text, still above the card's background.
*/
const CANVAS_CLASS = 'aw-canvas';
const CANVAS_PART_SELECTORS = { icon: '.icon', text: '.text_wrap', title: '.title', detail: '.detail', meta: '.meta', progress: '.progress_line' };
const CANVAS_TEXT_PARTS = ['title', 'detail', 'meta', 'progress'];
const CANVAS_TEXT_COLOR = { accent: 'var(--accent, #ffffff)', text: 'var(--text, #ffffff)' };

const CANVAS_FONT_FAMILY = 'AW Item Font';

// Shapes CSS cannot draw with a border: an SVG polygon in a 100x100 box stretched over the item.
const CANVAS_POLYGONS = new Set(schema.CANVAS_POLYGON_SHAPES);
const fmt = (value) => String(Number(value.toFixed(1)));

// Stretched to fill its box, so the handles frame the star rather than the circle around it.
function starPoints(count, depth) {
  const raw = Array.from({ length: count * 2 }, (_, i) => {
    const radius = i % 2 ? depth / 2 : 50;
    const angle = (Math.PI / count) * i - Math.PI / 2;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  const xs = raw.map(([x]) => x);
  const ys = raw.map(([, y]) => y);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const [spanX, spanY] = [Math.max(...xs) - minX, Math.max(...ys) - minY];
  return raw.map(([x, y]) => [((x - minX) / spanX) * 100, ((y - minY) / spanY) * 100]);
}

// A polygon's corners in a 100x100 box, from the shape's own settings.
function shapePoints(item) {
  const setting = (key) => item[key] ?? schema.CANVAS_SHAPE_SETTINGS[item.shape][key][2];
  if (item.shape === 'triangle') return [[setting('apex'), 0], [100, 100], [0, 100]];
  if (item.shape === 'diamond') return [[50, 0], [100, 50], [50, 100], [0, 50]];
  if (item.shape === 'arrow') {
    const neck = 100 - setting('head');
    const top = 50 - setting('shaft') / 2;
    return [[0, top], [neck, top], [neck, 0], [100, 50], [neck, 100], [neck, 100 - top], [0, 100 - top]];
  }
  return starPoints(setting('points'), setting('depth'));
}

// Each corner cut back by up to `round` pixels along both its edges, the two cuts joined by a curve.
function roundedPath(points, round) {
  const toward = (from, to) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    const cut = Math.min(round, length / 2) / length;
    return [from[0] + (to[0] - from[0]) * cut, from[1] + (to[1] - from[1]) * cut];
  };
  const xy = ([x, y]) => `${fmt(x)} ${fmt(y)}`;
  const corners = points.map((point, i) => ({
    from: toward(point, points[(i + points.length - 1) % points.length]),
    at: point,
    to: toward(point, points[(i + 1) % points.length]),
  }));
  return `M${xy(corners[0].from)}${corners.map((corner) => `L${xy(corner.from)}Q${xy(corner.at)} ${xy(corner.to)}`).join('')}Z`;
}

// A tier's own colour, with the custom presets' defaults for a bundled base that has none.
const CANVAS_TIER_PAINT = {
  bronze: 'var(--rare-bronze, #cd7f32)',
  silver: 'var(--rare-silver, #9fb2cc)',
  gold: 'var(--rare-accent, #ffd24e)',
  platinum: 'var(--platinum-accent, #cfe3ff)',
};

function shapePaint(item) {
  if (item.fillMode === 'none') return 'transparent';
  if (item.fillMode === 'accent') return 'var(--accent)';
  if (CANVAS_TIER_PAINT[item.fillMode]) return CANVAS_TIER_PAINT[item.fillMode];
  if (item.fillMode === 'radial') return `radial-gradient(closest-side, ${item.fill}, ${item.fill2})`;
  return item.fillMode === 'gradient' ? `linear-gradient(${item.angle}deg, ${item.fill}, ${item.fill2})` : item.fill;
}

// An icon is its paint seen through the icon's outline.
const canvasIconMask = (name) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill-rule='evenodd' d='${schema.CANVAS_ICONS[name]}'/></svg>`)}")`;

/*
  Where each state can be told apart on the card: the engine's state classes, and the progress line
  it shows for a progress popup (normal and progress popups have no class of their own). No card
  matches two of them, or an item drawn its own way in each would show twice: a rare unlock that
  carries a progress line is its tier.
*/
const CANVAS_STATE_SELECTORS = {
  normal: ':not(.state-rare, .state-platinum):not(:has(.progress_line:not([hidden])))',
  bronze: '.tier-bronze',
  silver: '.tier-silver',
  gold: '.tier-gold',
  platinum: '.state-platinum',
  progress: ':not(.state-rare, .state-platinum):has(.progress_line:not([hidden]))',
};

// Where each tier's word for {tier} shows; a platinum popup carries no tier class.
const CANVAS_TIER_STATES = { bronze: '.tier-bronze', silver: '.tier-silver', gold: '.tier-gold', platinum: '.state-platinum' };

// A CSS string for `content`. `<` is escaped too, so a word cannot close the <style> it sits in.
const cssString = (text) => `"${String(text).replace(/[\\"<\n]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;

/*
  Each entrance starts from its own frame and ends where the item sits. It runs while the engine
  holds `.active` on the card, so it replays with every popup; its delay counts from the card's start.
*/
const CANVAS_ENTER_MS = 480;
const CANVAS_ENTER_FROM = {
  fade: 'opacity: 0;',
  rise: 'opacity: 0; transform: translateY(14px);',
  drop: 'opacity: 0; transform: translateY(-14px);',
  left: 'opacity: 0; transform: translateX(-18px);',
  right: 'opacity: 0; transform: translateX(18px);',
  zoom: 'opacity: 0; transform: scale(0.8);',
  pop: 'opacity: 0; transform: scale(0.5);',
};
const CANVAS_ENTER_EASE = { pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' };
const CANVAS_ENTER_EASE_DEFAULT = 'cubic-bezier(0.22, 1, 0.36, 1)';

/*
  A loop starts once the item is in, and keeps the look the item already has: `shine` brightens its
  own filters, so its keyframes are written per item.
*/
const CANVAS_LOOP_KEYFRAMES = {
  pulse: '50% { transform: scale(1.06); }',
  float: '50% { transform: translateY(-3px); }',
  swing: '25% { transform: rotate(4deg); } 75% { transform: rotate(-4deg); }',
  spin: 'to { transform: rotate(360deg); }',
};
const CANVAS_LOOP_TIMING = { pulse: '1600ms ease-in-out', float: '2400ms ease-in-out', swing: '2000ms ease-in-out', spin: '6000ms linear', shine: '2200ms ease-in-out' };

function canvasMotionCss(variants) {
  const keyframes = new Set();
  const rules = [];
  variants.forEach(({ item, select, id }) => {
    const animations = [];
    if (item.enter) {
      keyframes.add(`@keyframes aw-cv-${item.enter} { from { ${CANVAS_ENTER_FROM[item.enter]} } }`);
      const ease = CANVAS_ENTER_EASE[item.enter] || CANVAS_ENTER_EASE_DEFAULT;
      animations.push(`aw-cv-${item.enter} ${CANVAS_ENTER_MS}ms ${ease} ${item.delay || 0}ms both`);
    }
    if (item.loop) {
      const name = item.loop === 'shine' ? `aw-cv-shine-${id}` : `aw-cv-loop-${item.loop}`;
      const frames = item.loop === 'shine' ? `50% { filter: ${[...itemFilters(item), 'brightness(1.35)'].join(' ')}; }` : CANVAS_LOOP_KEYFRAMES[item.loop];
      keyframes.add(`@keyframes ${name} { ${frames} }`);
      const start = item.enter ? (item.delay || 0) + CANVAS_ENTER_MS : 0;
      animations.push(`${name} ${CANVAS_LOOP_TIMING[item.loop]} ${start}ms infinite`);
    }
    if (animations.length) rules.push(`.ach.active > .${CANVAS_CLASS} > ${select} { animation: ${animations.join(', ')}; }`);
  });
  if (!rules.length) return [];
  return [`@media (prefers-reduced-motion: no-preference) {\n${[...keyframes, ...rules].join('\n')}\n}`];
}

// A plain shadow falls down and to the back; a glow spreads evenly in its colour, twice for strength.
function itemFilters(item) {
  const filters = [];
  if (item.shadow) {
    const color = item.shadowColor === 'accent' ? 'var(--accent)' : item.shadowColor || 'rgba(0, 0, 0, 0.55)';
    if (item.shadowStyle === 'glow') filters.push(`drop-shadow(0 0 ${Math.round(item.shadow / 2)}px ${color})`, `drop-shadow(0 0 ${item.shadow}px ${color})`);
    else filters.push(`drop-shadow(0 ${Math.round(item.shadow / 3)}px ${item.shadow}px ${color})`);
  }
  if (item.blur) filters.push(`blur(${item.blur}px)`);
  return filters;
}

function shapeFilter(item) {
  const filters = itemFilters(item);
  return filters.length ? `filter: ${filters.join(' ')};` : '';
}

const DASH_ATTRS = {
  dashed: (width) => ` stroke-dasharray="${width * 3} ${width * 2}"`,
  dotted: (width) => ` stroke-dasharray="0 ${width * 2}" stroke-linecap="round"`,
};

/*
  Every value here went through the schema: hex colours and plain numbers only. Drawn in the item's
  own pixels once its corners are rounded or its outline dashed, so neither is stretched with the box.
*/
const pointsIn = (item, w, h) => shapePoints(item).map(([x, y]) => [(x * w) / 100, (y * h) / 100]);

function polygonSvg(item, id) {
  const gradientId = `aw-cv-g${id}`;
  const stops = `<stop offset="0" stop-color="${item.fill}"/><stop offset="1" stop-color="${item.fill2}"/>`;
  let defs = '';
  if (item.fillMode === 'gradient') defs = `<defs><linearGradient id="${gradientId}" gradientTransform="rotate(${item.angle - 90} 0.5 0.5)">${stops}</linearGradient></defs>`;
  if (item.fillMode === 'radial') defs = `<defs><radialGradient id="${gradientId}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient></defs>`;
  // The state and tier colours are CSS variables, which only a style (not a fill attribute) resolves.
  const fill = item.fillMode === 'none' ? 'none' : defs ? `url(#${gradientId})` : item.fill;
  const variable = item.fillMode === 'accent' ? 'var(--accent)' : CANVAS_TIER_PAINT[item.fillMode];
  const paint = variable ? `style="fill: ${variable}"` : `fill="${fill}"`;
  const dash = item.stroke && DASH_ATTRS[item.dash] ? DASH_ATTRS[item.dash](item.stroke) : '';
  const stroke = item.stroke ? ` stroke="${item.strokeColor}" stroke-width="${item.stroke}" stroke-linejoin="round" vector-effect="non-scaling-stroke"${dash}` : '';
  const [w, h] = item.round || dash ? [item.w, item.h] : [100, 100];
  const points = pointsIn(item, w, h);
  const outline = item.round ? `<path d="${roundedPath(points, item.round)}"` : `<polygon points="${points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')}"`;
  return `<svg viewBox="0 0 ${fmt(w)} ${fmt(h)}" preserveAspectRatio="none">${defs}${outline} ${paint}${stroke}/></svg>`;
}

// A line drawn in dashes or dots of its own thickness.
function dashedLine(item) {
  const thickness = Math.max(1, Math.round(item.h));
  if (item.dash === 'dotted') return `radial-gradient(circle closest-side, ${item.fill} 96%, transparent) 0 0 / ${thickness * 2}px ${thickness}px repeat-x`;
  const dash = Math.max(4, thickness * 3);
  return `repeating-linear-gradient(90deg, ${item.fill} 0 ${dash}px, transparent ${dash}px ${dash + Math.max(3, thickness * 2)}px)`;
}

// A picture's outline: its rounded corners, an ellipse, or a polygon cut out of it.
function pictureShape(item) {
  if (item.shape === 'ellipse') return 'border-radius: 50%;';
  if (!CANVAS_POLYGONS.has(item.shape)) return `border-radius: ${item.radius}%;`;
  const round = (item.radius / 100) * Math.min(item.w, item.h);
  if (!round) return `clip-path: polygon(${shapePoints(item).map(([x, y]) => `${fmt(x)}% ${fmt(y)}%`).join(', ')});`;
  const points = pointsIn(item, item.w, item.h);
  return `clip-path: path('${roundedPath(points, round)}');`;
}

// No rule for 'card' without a file: the item inherits the card's font, whichever the preset uses.
function canvasFontRule(item, fonts) {
  const family = FONT_STACKS[item.font];
  if (item.fontFile) return `font-family: '${CANVAS_FONT_FAMILY} ${fonts.indexOf(item.fontFile)}', ${family || 'var(--font, sans-serif)'};`;
  return family ? `font-family: ${family};` : '';
}

// Where a restyled line's text is: the progress line keeps its words in its label.
const CANVAS_STYLE_SELECTORS = { title: '.title', detail: '.detail', meta: '.meta', progress: '.progress_label' };
const CANVAS_SELF_ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' };

// A line's own look, over the preset's text settings. Colour and face reach into the spans a line
// holds (the game name, the rarity chip), which have colours of their own.
function canvasStyleCss(part, style, fonts, states = ALL_STATES) {
  const selector = `${inStates('.ach', states)} ${CANVAS_STYLE_SELECTORS[part]}`;
  const textRules = [];
  const boxRules = [];
  if (style.color) textRules.push(`color: ${CANVAS_TEXT_COLOR[style.color] || style.color} !important;`);
  if (style.fontFile || style.font) textRules.push(canvasFontRule({ font: style.font, fontFile: style.fontFile }, fonts).replace(';', ' !important;'));
  if (style.weight) textRules.push(`font-weight: ${style.weight} !important;`);
  if (style.upper === true) textRules.push('text-transform: uppercase !important; letter-spacing: 0.06em !important;');
  if (style.upper === false) textRules.push('text-transform: none !important; letter-spacing: normal !important;');
  if (style.size) boxRules.push(`font-size: ${style.size}px !important;`);
  if (style.align) boxRules.push(`text-align: ${style.align} !important; align-self: ${CANVAS_SELF_ALIGN[style.align]} !important;`);
  const css = [];
  if (textRules.length) css.push(`${selector}, ${selector} * { ${textRules.join(' ')} }`);
  if (style.size) css.push(`${selector} * { font-size: inherit !important; }`);
  if (boxRules.length) css.push(`${selector} { ${boxRules.join(' ')} }`);
  return css;
}

/*
  A stored order gives every layer a z-index of its own, all inside the card's stacking context. The
  text column must not open one of its own, or its lines could not go between two items: it loses
  its z-index and its fade. A moved column still opens one (its translate does), and its lines then
  stack among themselves only.
*/
function canvasOrderCss(canvas) {
  if (!canvas.order) return { css: [], zOf: () => null };
  const css = ['.ach .text_wrap { z-index: auto !important; -webkit-mask-image: none !important; mask-image: none !important; }'];
  const z = new Map(canvas.order.map((entry, position) => [entry, position + 1]));
  for (const part of schema.CANVAS_LAYER_PARTS) css.push(`.ach ${CANVAS_PART_SELECTORS[part]} { z-index: ${z.get(part)} !important; }`);
  return { css, zOf: (index) => z.get(index) };
}

// A bundled preset's mark is its card's ::after or ::before, which only its own stylesheet tells.
const partSelector = (part, markPseudo) => {
  if (part !== 'mark') return `.ach ${CANVAS_PART_SELECTORS[part]}`;
  const pseudos = String(markPseudo || '').split(',').filter((name) => name === 'after' || name === 'before');
  return pseudos.length ? pseudos.map((name) => `.ach::${name}`).join(', ') : null;
};

const ALL_STATES = schema.CANVAS_STATES;
const statesSelector = (states) => states.map((state) => CANVAS_STATE_SELECTORS[state]).join(', ');

// The states, gathered by what `pick` gives for each; a single group means they all agree.
function groupStates(pick) {
  const groups = new Map();
  for (const state of ALL_STATES) {
    const value = pick(state);
    const key = JSON.stringify(value ?? null);
    if (!groups.has(key)) groups.set(key, { value, states: [] });
    groups.get(key).states.push(state);
  }
  return [...groups.values()];
}

// Each selector of a list kept to some states; with all of them it stays as it is.
const inStates = (selector, states) =>
  states.length === ALL_STATES.length
    ? selector
    : selector
        .split(', ')
        .map((one) => one.replace(/^\.ach/, `.ach:is(${statesSelector(states)})`))
        .join(', ');

/*
  The ways one item is drawn: states that draw it alike share one element, so an item no state
  changes is one element with the selector it always had. `off` does not split them: a state that
  switches the item off hides its element.
*/
function itemVariants(item, index) {
  const groups = groupStates((state) => {
    const look = schema.canvasItemIn(item, state);
    delete look.off;
    return look;
  });
  return groups.map(({ value, states }, k) => {
    const split = groups.length > 1;
    const shown = states.filter((state) => !schema.canvasItemIn(item, state).off);
    return {
      item: value,
      index,
      states,
      shown,
      v: split ? k : null,
      id: split ? `${index}-${k}` : String(index),
      select: split ? `[data-i="${index}"][data-v="${k}"]` : `[data-i="${index}"]`,
    };
  });
}

const canvasVariants = (canvas) => canvas.items.flatMap((item, index) => itemVariants(item, index));

function canvasItemCss({ item, select }, { zIndex, fonts, assetUrl }) {
  const css = [];
  const rules = [
    `left: ${item.x}px; top: ${item.y}px; width: ${item.w}px;`,
    item.kind === 'text' ? '' : `height: ${item.h}px;`,
    `rotate: ${item.r}deg; opacity: ${item.o}; z-index: ${zIndex};`,
    item.flipX || item.flipY ? `scale: ${item.flipX ? -1 : 1} ${item.flipY ? -1 : 1};` : '',
  ];
  if (item.kind === 'text') {
    rules.push(
      `font-size: ${item.size}px; font-weight: ${item.weight}; line-height: 1.25; color: ${CANVAS_TEXT_COLOR[item.color] || item.color};`,
      `text-align: ${item.align}; white-space: pre-wrap; overflow-wrap: anywhere;`,
      item.upper ? 'text-transform: uppercase; letter-spacing: 0.06em;' : '',
      canvasFontRule(item, fonts),
      shapeFilter(item)
    );
  } else if (item.kind === 'image') {
    const url = cssUrl(assetUrl ? assetUrl(item.file) : item.file);
    const height = Number((item.fit.w / item.fit.ar).toFixed(1));
    rules.push(
      `${pictureShape(item)} background: ${url} no-repeat;`,
      `background-size: ${item.fit.w}px ${height}px; background-position: ${item.fit.x}px ${item.fit.y}px;`
    );
  } else if (item.kind === 'icon') {
    // The shadow goes on the item and the mask on its child: a mask would cut the shadow off.
    const mask = `${canvasIconMask(item.icon)} center / contain no-repeat`;
    rules.push(shapeFilter(item));
    css.push(`.ach > .${CANVAS_CLASS} > ${select} > span { display: block; width: 100%; height: 100%; background: ${shapePaint(item)}; -webkit-mask: ${mask}; mask: ${mask}; }`);
  } else if (CANVAS_POLYGONS.has(item.shape)) {
    rules.push(shapeFilter(item));
  } else {
    const paint = item.shape === 'line' && item.dash ? dashedLine(item) : shapePaint(item);
    rules.push(
      `background: ${paint}; border-radius: ${item.shape === 'ellipse' ? '50%' : `${item.radius}px`};`,
      item.stroke ? `border: ${item.stroke}px ${item.dash || 'solid'} ${item.strokeColor};` : '',
      shapeFilter(item)
    );
  }
  css.unshift(`.ach > .${CANVAS_CLASS} > ${select} { ${rules.filter(Boolean).join(' ')} }`);
  return css;
}

/*
  An element shows in the states that draw it switched on. While editing, one switched off stays
  faint so it can be picked and switched back on; another state's element is never shown.
*/
function variantVisibilityCss({ select, states, shown }, editing) {
  const css = [];
  const at = `> .${CANVAS_CLASS} > ${select}`;
  if (editing && states.length < ALL_STATES.length) css.push(`.ach:not(:is(${statesSelector(states)})) ${at} { display: none !important; }`);
  if (shown.length < ALL_STATES.length) {
    const away = shown.length ? `.ach:not(:is(${statesSelector(shown)}))` : '.ach';
    const look = editing ? 'opacity: 0.25 !important; outline: 1px dashed rgba(255, 255, 255, 0.6);' : 'display: none !important;';
    css.push(`${away} ${at} { ${look} }`);
  }
  return css;
}

// The card's own parts: placed, hidden and restyled for every state at once, or state by state.
function canvasPartsCss(canvas, { markPseudo, editing, fonts }) {
  const views = Object.fromEntries(ALL_STATES.map((state) => [state, schema.canvasPartsIn(canvas, state)]));
  const css = [];
  for (const part of schema.CANVAS_PARTS) {
    const selector = partSelector(part, markPseudo);
    if (!selector) continue;
    for (const { value: move, states } of groupStates((state) => views[state].move[part])) {
      if (move) css.push(`${inStates(selector, states)} { translate: ${move.x}px ${move.y}px !important; rotate: ${move.r}deg !important; scale: ${move.s} !important; }`);
    }
  }
  for (const part of schema.CANVAS_PARTS) {
    const selector = partSelector(part, markPseudo);
    const states = ALL_STATES.filter((state) => views[state].hidden.includes(part));
    if (selector && states.length) css.push(`${inStates(selector, states)} { ${editing ? 'opacity: 0.3 !important; outline: 1px dashed rgba(255, 255, 255, 0.6);' : 'visibility: hidden !important;'} }`);
  }
  // The text column clips (and fades) its lines so a long one can scroll; a line moved out of it
  // would be cut off, so the column stops clipping once one of its lines has moved.
  if (ALL_STATES.some((state) => CANVAS_TEXT_PARTS.some((part) => views[state].move[part]))) {
    css.push('.ach .text_wrap { overflow: visible !important; -webkit-mask-image: none !important; mask-image: none !important; }');
  }
  return {
    css,
    styles: schema.CANVAS_STYLED_PARTS.flatMap((part) =>
      groupStates((state) => views[state].style[part]).flatMap(({ value, states }) => (value ? canvasStyleCss(part, value, fonts, states) : []))
    ),
  };
}

/*
  `markPseudo` names the pseudo-element that draws the base's brand mark, for a layer. `editing`
  keeps a removed part faintly on screen, so the layout editor can still pick it and put it back.
*/
function canvasCss(rawCanvas, { assetUrl, markPseudo, editing = false, entrances = !editing } = {}) {
  const canvas = schema.normalizeCanvas(rawCanvas);
  const fonts = schema.canvasFonts(canvas);
  const parts = canvasPartsCss(canvas, { markPseudo, editing, fonts });
  const css = [...parts.css];
  fonts.forEach((file, index) => {
    const url = cssUrl(assetUrl ? assetUrl(file) : file);
    css.push(`@font-face { font-family: '${CANVAS_FONT_FAMILY} ${index}'; src: ${url} format('${schema.fontFormat(file)}'); font-display: block; }`);
  });
  css.push(...parts.styles);
  const order = canvasOrderCss(canvas);
  css.push(...order.css);
  if (!canvas.items.length) return css.join('\n');
  css.push(`.ach > .${CANVAS_CLASS} { position: absolute !important; inset: 0; z-index: auto !important; pointer-events: none; }`);
  css.push(`.ach > .${CANVAS_CLASS} > div { position: absolute; box-sizing: border-box; margin: 0; }`);
  css.push(`.ach > .${CANVAS_CLASS} svg { display: block; width: 100%; height: 100%; overflow: visible; }`);
  const variants = canvas.items.flatMap((item, index) => {
    const zIndex = order.zOf(index) ?? (item.back ? -1 : 2);
    return itemVariants(item, index).map((variant) => {
      css.push(...canvasItemCss(variant, { zIndex, fonts, assetUrl }), ...variantVisibilityCss(variant, editing));
      return variant;
    });
  });
  for (const [tier, word] of Object.entries(canvas.words || {})) {
    css.push(`.ach${CANVAS_TIER_STATES[tier]} > .${CANVAS_CLASS} [data-tok="tier"]::after { content: ${cssString(word)}; }`);
  }
  // Not while editing, unless asked: an item would vanish and come back at every change.
  if (entrances) css.push(...canvasMotionCss(variants));
  return css.join('\n');
}

const TOKEN_RE = new RegExp(`\\{(${schema.CANVAS_TOKENS.join('|')})\\}`);

// A text's words, with an empty span the engine (or, for {tier}, the stylesheet) fills per token.
const textMarkup = (text) =>
  text
    .split(TOKEN_RE)
    .map((piece, index) => (index % 2 ? `<span data-tok="${piece}"></span>` : escapeHtml(piece)))
    .join('');

// The items' elements; their look is all in canvasCss. Text is escaped, nothing else is user text.
function canvasMarkup(rawCanvas) {
  const canvas = schema.normalizeCanvas(rawCanvas);
  if (!canvas.items.length) return '';
  const inner = (item, id) => {
    if (item.kind === 'text') return textMarkup(item.text);
    if (item.kind === 'icon') return '<span></span>';
    return item.kind === 'shape' && CANVAS_POLYGONS.has(item.shape) ? polygonSvg(item, id) : '';
  };
  // When the engine starts an animated picture over. The file name changes the markup when the
  // picture does, so the preview rebuilds the element instead of keeping the old picture's restart.
  const replay = (item) => (item.replay ? ` data-replay="${item.enter ? item.delay || 0 : 0}" data-file="${escapeHtml(item.file)}"` : '');
  const items = canvasVariants(canvas).map(
    ({ item, index, id, v }) => `<div data-i="${index}"${v === null ? '' : ` data-v="${v}"`} data-kind="${item.kind}"${replay(item)}>${inner(item, id)}</div>`
  );
  return `<div class="${CANVAS_CLASS}" aria-hidden="true">${items.join('')}</div>`;
}

// The card's markup with the items in it, for a page this module writes itself. A replacer
// function, because a user's text may hold `$&` and the like, which a replacement string expands.
const markupWithCanvas = (canvas) => PRESET_MARKUP.replace('<div class="ach">', () => `<div class="ach">${canvasMarkup(canvas)}`);

/*
  For a page this module did not write (a bundled preset under a layer): run in the page once it has
  loaded, it swaps the items in. The markup travels as a JSON string and is already escaped.
*/
function canvasScript(rawCanvas) {
  return (
    `(function () { var card = document.querySelector('.ach'); if (!card) return; ` +
    `var old = card.querySelector(':scope > .${CANVAS_CLASS}'); if (old) old.remove(); ` +
    `card.insertAdjacentHTML('afterbegin', ${JSON.stringify(canvasMarkup(rawCanvas))}); })();`
  );
}

// A plain padlock, used as a mask so it takes the colour of the text it sits in.
const HIDDEN_LOCK_MASK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M7 10V7a5 5 0 0 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v9A1.5 1.5 0 0 1 18.5 22h-13A1.5 1.5 0 0 1 4 20.5v-9A1.5 1.5 0 0 1 5.5 10H7zm2 0h6V7a3 3 0 0 0-6 0v3z'/%3E%3C/svg%3E";

/*
  Slack around the card inside its host window: what the drop shadow and the state glow paint past
  its edge, and no more. It IS the visible gap to the screen corner, since the host places the
  window against the edge, so a card with neither gets almost none.
*/
const GLOW_RADIUS_PX = 22;
const MAX_PRESET_HEIGHT = 460;
const EDGE_BASE_PX = 4;
// The card's box-shadow is `0 4px 12px`: 12px of blur each side, shifted 4px down.
const SHADOW_EDGE = { x: 12, y: 16 };

function presetEdge(values) {
  const glow = (Math.max(values.glow, values.rareGlow, values.platinumGlow) / 100) * GLOW_RADIUS_PX;
  const shadow = values.shadow > 0;
  return {
    x: Math.ceil(Math.max(shadow ? SHADOW_EDGE.x : 0, glow)) + EDGE_BASE_PX,
    y: Math.ceil(Math.max(shadow ? SHADOW_EDGE.y : 0, glow)) + EDGE_BASE_PX,
  };
}

/*
  The host window's size, written as `<meta width height>`; createNotificationWindow() gives the
  popup exactly this box, so a taller card is cropped. It is derived from the same options that
  generate the stylesheet, so every layout (icon-top included) gets a box that fits.
*/
function presetBoxSize(options = {}, { editing = false } = {}) {
  const values = normalizeOptions(options);
  const room = canvasRoom(values, { editing });
  const card = cardSize(values);
  const edge = presetEdge(values);
  return {
    width: values.width + room.left + room.right + edge.x * 2,
    height: Math.min(MAX_PRESET_HEIGHT + room.top + room.bottom, Math.round(card.height) + room.top + room.bottom + edge.y * 2),
  };
}

function cardSize(values) {
  const lineHeight = 1.35;
  const titleHeight = values.fontSize * lineHeight;
  const detailHeight = values.fontSize * (values.detailScale / 100) * lineHeight * values.descriptionLines;
  // Everything below only appears for some notifications, but the window cannot be resized once it
  // is up - so a preset that CAN show a row is measured as though it does.
  const metaHeight = values.showGameName || values.showRarity ? values.fontSize * 0.66 * 1.2 + 2 : 0;
  const progressHeight = values.showProgress ? values.progressHeight + 12 : 0;
  const textHeight = metaHeight + titleHeight + detailHeight + progressHeight;
  const iconHeight = values.layout === 'text-only' ? 0 : values.iconSize;
  const contentHeight = values.layout === 'icon-top' ? iconHeight + values.gap + textHeight : Math.max(iconHeight, textHeight);
  return { width: values.width, height: Math.max(values.minHeight, contentHeight + values.padY * 2 + values.borderWidth * 2) };
}

/*
  The popup shows the card and whatever touches it; an item left floating away from it is a draft
  and only the designer shows it. Sizes are estimated from the options (text wraps unmeasured), the
  same way the card's own height is, so a small margin stands in for the guess.
*/
const CANVAS_TOUCH_PX = 2;
const CANVAS_MAX_ROOM = 400;
// How far past the card the designer lets an item go; the editor keeps items inside it. The pad
// leaves the handles and the rotation knob of an item on the card's edge room to be grabbed.
const CANVAS_EDIT_ROOM = { x: 240, y: 160 };
const CANVAS_EDIT_PAD = 28;

function canvasItemBounds(item) {
  let h = item.h;
  if (item.kind === 'text') {
    const perLine = Math.max(1, Math.floor(item.w / (item.size * 0.55)));
    const lines = item.text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
    h = lines * item.size * 1.25;
  }
  const rad = (item.r * Math.PI) / 180;
  const halfW = (Math.abs(item.w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
  const halfH = (Math.abs(item.w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))) / 2;
  const spread = item.kind === 'shape' || item.kind === 'icon' ? item.shadow + item.blur + (item.stroke || 0) : 0;
  const cx = item.x + item.w / 2;
  const cy = item.y + h / 2;
  return { left: cx - halfW - spread, right: cx + halfW + spread, top: cy - halfH - spread, bottom: cy + halfH + spread };
}

const touchesCard = (box, card) =>
  box.left <= card.width + CANVAS_TOUCH_PX && box.right >= -CANVAS_TOUCH_PX && box.top <= card.height + CANVAS_TOUCH_PX && box.bottom >= -CANVAS_TOUCH_PX;

// Room each side of the card needs for every state's items, and the elements the popup leaves out.
function canvasRoom(values, { editing = false } = {}) {
  const canvas = schema.normalizeCanvas(values.canvas);
  const card = cardSize(values);
  const room = { left: 0, top: 0, right: 0, bottom: 0, detached: [] };
  canvasVariants(canvas).forEach(({ item, select, shown }) => {
    // Switched off in every state it stands for, it is never drawn: only the designer shows it.
    if (!editing && !shown.length) return;
    const box = canvasItemBounds(item);
    if (!touchesCard(box, card)) {
      room.detached.push(select);
      if (!editing) return;
    }
    room.left = Math.max(room.left, -box.left);
    room.top = Math.max(room.top, -box.top);
    room.right = Math.max(room.right, box.right - card.width);
    room.bottom = Math.max(room.bottom, box.bottom - card.height);
  });
  if (editing) {
    // Even on both sides, so the card stays centred and still under the pointer as the room grows.
    const x = Math.min(CANVAS_EDIT_ROOM.x, Math.max(room.left, room.right)) + CANVAS_EDIT_PAD;
    const y = Math.min(CANVAS_EDIT_ROOM.y, Math.max(room.top, room.bottom)) + CANVAS_EDIT_PAD;
    return { left: Math.ceil(x), right: Math.ceil(x), top: Math.ceil(y), bottom: Math.ceil(y), detached: room.detached };
  }
  for (const side of ['left', 'top', 'right', 'bottom']) room[side] = Math.min(CANVAS_MAX_ROOM, Math.ceil(room[side]));
  return room;
}

// The card sits off centre by half the difference, so the room on each side is where it is needed.
function canvasPlacementRules(values, editing) {
  const room = canvasRoom(values, { editing });
  const rules = [];
  const dx = (room.left - room.right) / 2;
  const dy = (room.top - room.bottom) / 2;
  if (dx || dy) rules.push(`.ach { left: calc(50% + ${dx}px); top: calc(50% + ${dy}px); }`);
  for (const select of room.detached) {
    rules.push(`.ach > .${CANVAS_CLASS} > ${select} { ${editing ? 'opacity: 0.35; outline: 1px dashed rgba(255, 255, 255, 0.6);' : 'display: none;'} }`);
  }
  return rules.join('\n');
}

function buildCustomPresetHtml(options) {
  const values = normalizeOptions(options);
  const box = presetBoxSize(values);
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    '<meta charset="UTF-8" />',
    '<link rel="stylesheet" href="style.css" />',
    `<meta name="duration" content="${values.duration}" />`,
    `<meta width="${box.width}" height="${box.height}" />`,
    '<title>AW Custom Preset</title>',
    '</head><body>',
    markupWithCanvas(values.canvas),
    inlineScript(PRESET_ENGINE),
    '</body></html>',
  ].join('\n');
}

/*
  The same preset as a standalone document for the designer's iframe: real markup/engine/
  stylesheet, plus a stub notification bridge so a draft can be fed a sample payload. `hold` keeps
  the card on screen instead of auto-closing; the designer rebuilds without it to preview the
  entry/exit once.
*/
const PRESET_PREVIEW_BRIDGE = [
  'window.api = {',
  '  onNotification: function (cb) { window.__awRender = cb; },',
  '  notificationRenderReady: function () {},',
  '  closeNotificationWindow: function () {},',
  '};',
  '// Called by the designer on every state change; the engine restarts its own animation.',
  'window.awPreviewApply = function (payload) { if (window.__awRender) window.__awRender(payload || {}); };',
].join('\n');

const PREVIEW_HOLD_MS = 3600000;

// What view/app.html must allow for the designer's preview frame to run at all.
const PREVIEW_SCRIPT_HASHES = [inlineScriptHash(PRESET_PREVIEW_BRIDGE), inlineScriptHash(PRESET_ENGINE)];

// `css` replaces the generated stylesheet: the designer previews a layer over a bundled preset's own.
function buildPresetPreviewHtml(options, { hold = true, assetUrl, css, editing = false, entrances = !editing } = {}) {
  const values = normalizeOptions(options);
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    '<meta charset="UTF-8" />',
    `<meta name="duration" content="${hold ? PREVIEW_HOLD_MS : values.duration}" />`,
    '<style id="aw-preview-css">',
    css != null ? css : buildCustomPresetCss(values, { assetUrl, editing, entrances }),
    '</style>',
    inlineScript(PRESET_PREVIEW_BRIDGE),
    '</head><body>',
    markupWithCanvas(values.canvas),
    inlineScript(PRESET_ENGINE),
    '</body></html>',
  ].join('\n');
}

const FLEX_ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' };

// What the title takes its colour from. `accent` follows the state, so a rare or completion
// notification recolours the title with the rest of the card.
const TITLE_COLOR = { accent: 'var(--accent)', text: 'var(--text)', custom: 'var(--title-color)' };

// Every property that maps straight onto a CSS custom property, plus the values that are looked up
// in a table (font stack, easing, motion offsets) rather than written by the user.
function rootVariables(values, assetUrl) {
  const lines = [];
  for (const property of PRESET_PROPERTIES) {
    if (!property.css) continue;
    lines.push(`  ${property.css}: ${cssValue(property.key, values[property.key])};`);
  }
  // The travel distance multiplies the offsets rather than reaching CSS: the offsets are percentages
  // of the card, so one number keeps every edge consistent and the box below never has to know.
  const travel = (offset) => {
    const number = parseFloat(offset);
    return `${Math.round(number * (values.entryDistance / 100) * 10) / 10}%`;
  };
  const motionIn = MOTION_OFFSETS[values.animIn];
  const motionOut = MOTION_OFFSETS[values.animOut];
  // The user's own font goes first; the chosen stack stays behind it for the instant before the file
  // loads and for a preset whose file went missing.
  lines.push(`  --font: ${values.fontFile ? `'${CUSTOM_FONT_FAMILY}', ` : ''}${FONT_STACKS[values.fontFamily]};`);
  lines.push(`  --ease: ${EASINGS[values.easing]};`);
  // `same` is the exit the preset always had, written out rather than left implicit so one variable
  // drives the animation whichever way it is set.
  lines.push(`  --ease-out: ${values.easingOut === 'same' ? 'ease-in' : EASINGS[values.easingOut]};`);
  lines.push(`  --in-dx: ${travel(motionIn.dx)}; --in-dy: ${travel(motionIn.dy)}; --in-scale: ${motionIn.scale};`);
  lines.push(`  --out-dx: ${travel(motionOut.dx)}; --out-dy: ${travel(motionOut.dy)}; --out-scale: ${motionOut.scale};`);
  // Set by the engine from the payload's artwork; `none` keeps the plain background when a
  // notification carries no image.
  lines.push('  --artwork: none;');
  /*
    The preset's own background picture: a bare filename beside style.css, so a relative url()
    works once installed. The designer's srcdoc preview has nothing relative to the preset folder,
    so it passes a resolver instead.
  */
  lines.push(`  --bg-image: ${values.bgImage ? cssUrl(assetUrl ? assetUrl(values.bgImage) : values.bgImage) : 'none'};`);
  // Scales the glow the design asked for. Only the glow animation moves it, and only downwards, so
  // the window presetBoxSize measured still fits the brightest frame.
  lines.push('  --glow-pulse: 1;');
  lines.push('  --ach-hold: 5000ms;');
  /*
    `--bg-base` is what the designer set; `--bg` is what the card actually paints. A state
    re-points `--bg` the same way it re-points `--accent`, so one stylesheet can wash a rare
    unlock in its own colour without a second background rule.
  */
  lines.push('  --bg: var(--bg-base);');
  // The pattern's ink: the text colour, at the strength the design asked for.
  lines.push('  --pattern-ink: color-mix(in srgb, var(--text) calc(var(--pattern-opacity) * 100%), transparent);');
  return lines;
}

// The card's background, from the four modes the designer offers. Both picture modes paint their
// image in a layer below the text (see below) and keep a flat colour behind it.
function backgroundRule(values) {
  if (values.bgMode === 'gradient') return '  background: linear-gradient(var(--bg-angle), var(--bg) 0%, var(--bg2) 100%);';
  return '  background: var(--bg);';
}

// Accent bar and border. The border is written first so a bar on one edge overrides it there.
function borderRules(values) {
  const rules = [];
  if (values.borderWidth > 0) rules.push('  border: var(--border-width) solid var(--border-color);');
  const side = { left: 'border-left', right: 'border-right', top: 'border-top', bottom: 'border-bottom' }[values.accentBar];
  if (side) rules.push(`  ${side}: var(--bar-size) solid var(--accent);`);
  else if (values.accentBar === 'outline') rules.push('  border: var(--bar-size) solid var(--accent);');
  return rules;
}

// The description line: one line (original behaviour) clips with an ellipsis and scrolls via the
// engine when it overflows. More than one line wraps and clamps instead, which the marquee can't do.
function detailRule(values) {
  const base = '.ach .detail { max-width: 100%; margin: 0; opacity: 0.9; font-size: calc(var(--font-size) * var(--detail-scale));';
  if (values.descriptionLines <= 1) return `${base} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`;
  return `${base} display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--detail-lines); overflow: hidden; }`;
}

function layoutRules(values) {
  const rules = [];
  if (values.layout === 'icon-right') rules.push('  flex-direction: row-reverse;');
  else if (values.layout === 'icon-top') rules.push(`  flex-direction: column; justify-content: center; align-items: ${FLEX_ALIGN[values.align]};`);
  return rules;
}

/*
  The rounded icon shape is the original declaration; every other shape uses a clip path, which
  would cut off a border/radius drawn round it, so those are left out instead. The glow sits on a
  wrapper, since a box-shadow on a clipped element gets clipped away with it.
*/
function iconImageRule(values) {
  const base =
    '.ach .icon img { display: block; box-sizing: border-box; width: var(--icon-size); height: var(--icon-size); object-fit: cover;';
  const clip = ICON_SHAPES[values.iconShape];
  if (!clip) {
    return `${base} border: var(--icon-border) solid var(--accent); border-radius: var(--icon-radius); box-shadow: 0 0 calc(var(--icon-glow) * 26px) color-mix(in srgb, var(--accent) 70%, transparent); }`;
  }
  return `${base} clip-path: ${clip}; filter: drop-shadow(0 0 calc(var(--icon-glow) * 18px) color-mix(in srgb, var(--accent) 70%, transparent)); }`;
}

// A text-only card drops the icon entirely rather than rendering it at zero size: the gap and the
// alignment are measured from the boxes that are actually there, and presetBoxSize measures the same
// card, so the window it is given matches what it paints.
function iconRules(values) {
  return values.layout === 'text-only' ? ['.ach .icon { display: none; }'] : [];
}

/*
  The glow as a multiplier the box-shadow reads. A custom property must be @property-registered
  (and typed as a number, not left untyped) to animate smoothly instead of swapping discretely.
  Both keyframes stay at or below 1, so the window measured for the design's glow still fits.
*/
const GLOW_ANIMATIONS = {
  pulse: { name: 'aw_glow_pulse', css: '@keyframes aw_glow_pulse { 0%, 100% { --glow-pulse: 1; } 50% { --glow-pulse: 0.3; } }', duration: 2200 },
  breathe: { name: 'aw_glow_breathe', css: '@keyframes aw_glow_breathe { 0%, 100% { --glow-pulse: 0.55; } 50% { --glow-pulse: 1; } }', duration: 4200 },
};

// Commas that separate layers, not the ones inside a gradient's own parentheses.
function splitLayers(list) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === '(') depth += 1;
    else if (list[i] === ')') depth -= 1;
    else if (list[i] === ',' && depth === 0) {
      parts.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts;
}

// background-position for a logo anchored to a corner or the middle of a side, `offset` px from it.
function logoPositionCss(position, offset) {
  const [first, second] = String(position).split('-');
  const edge = (side) => `${side} ${offset}px`;
  if (!second) {
    if (first === 'left' || first === 'right') return `${edge(first)} center`;
    return `center ${edge(first)}`;
  }
  return `${edge(second)} ${edge(first)}`;
}

/*
  The logo shares the card's one `::after` layer with the texture, as the top background layer of
  that pseudo-element: it sits under the text, over the picture, and needs no element of its own.
*/
function logoLayerRule(values, assetUrl, withPattern) {
  const images = [cssUrl(assetUrl ? assetUrl(values.logoImage) : values.logoImage)];
  const sizes = [`auto ${values.logoSize}px`];
  const positions = [logoPositionCss(values.logoPosition, values.logoOffset)];
  const repeats = ['no-repeat'];
  if (withPattern) {
    const layers = splitLayers(BG_PATTERNS[values.bgPattern]);
    const tiles = String(BG_PATTERN_SIZES[values.bgPattern] || 'auto').split(',').map((tile) => tile.trim());
    layers.forEach((layer, index) => {
      images.push(layer);
      sizes.push(tiles[index] || tiles[0]);
      positions.push('0 0');
      repeats.push('repeat');
    });
  }
  return (
    `.ach::after { content: ''; position: absolute; inset: 0; z-index: 0; border-radius: inherit; pointer-events: none; ` +
    `background-image: ${images.join(', ')}; background-repeat: ${repeats.join(', ')}; ` +
    `background-position: ${positions.join(', ')}; background-size: ${sizes.join(', ')}; }`
  );
}

// The user's font file, loaded by name from beside the stylesheet (or from a data URI in the preview).
function fontFaceRule(values, assetUrl) {
  if (!values.fontFile) return '';
  const url = cssUrl(assetUrl ? assetUrl(values.fontFile) : values.fontFile);
  return `@font-face { font-family: '${CUSTOM_FONT_FAMILY}'; src: ${url} format('${schema.fontFormat(values.fontFile)}'); font-display: block; }`;
}

function buildCustomPresetCss(options, { assetUrl, editing = false, entrances = !editing } = {}) {
  const values = normalizeOptions(options);
  const flexAlign = FLEX_ALIGN[values.align];
  const artwork = values.bgMode === 'artwork';
  const picture = artwork || values.bgMode === 'image';
  const pattern = Boolean(BG_PATTERNS[values.bgPattern]);
  const glowAnimation = GLOW_ANIMATIONS[values.glowAnim] || null;

  const css = [
    '@property --glow-pulse { syntax: "<number>"; inherits: false; initial-value: 1; }',
    fontFaceRule(values, assetUrl),
    ':root {',
    ...rootVariables(values, assetUrl),
    '}',
    'html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }',
    '.ach {',
    '  position: fixed; left: 50%; top: 50%;',
    '  transform: translate(-50%, -50%) scale(var(--scale, 1)); transform-origin: center center;',
    '  display: flex; align-items: center; gap: var(--gap); box-sizing: border-box;',
    '  width: var(--width); min-height: var(--min-height); padding: var(--pad-y) var(--pad-x);',
    '  color: var(--text); border-radius: var(--radius);',
    '  font-family: var(--font); font-size: var(--font-size); letter-spacing: var(--letter-spacing);',
    // One shadow behind every line, so text stays readable once it sits on artwork instead of a flat
    // colour. Costs nothing at 0, which is the default.
    '  text-shadow: 0 1px calc(var(--text-shadow) * 6px) rgba(0, 0, 0, var(--text-shadow));',
    // Zero-width by default, so the declaration is always present and costs nothing until asked for.
    '  -webkit-text-stroke: var(--text-stroke) var(--text-stroke-color);',
    '  opacity: 0;',
    // The state colour every accent-driven rule reads. The state classes below re-point it, which is
    // how one stylesheet paints a normal, a rare and a completion notification.
    '  --accent: var(--accent-base); --glow-strength: var(--glow);',
    backgroundRule(values),
    ...borderRules(values),
    ...layoutRules(values),
    picture || pattern || values.logoImage ? '  overflow: hidden;' : '',
    '  box-shadow: 0 4px 12px rgba(0, 0, 0, var(--shadow)), 0 0 calc(var(--glow-strength) * var(--glow-pulse) * ' + GLOW_RADIUS_PX + 'px) color-mix(in srgb, var(--accent) 65%, transparent);',
    '}',
    '.ach.state-rare { --accent: var(--rare-accent); --glow-strength: var(--rare-glow); }',
    '.ach.state-rare.tier-silver { --accent: var(--rare-silver); }',
    '.ach.state-rare.tier-bronze { --accent: var(--rare-bronze); }',
    '.ach.state-platinum { --accent: var(--platinum-accent); --glow-strength: var(--platinum-glow); }',
  ];

  // A rare unlock/completion washes the card in its own colour. Written after the state rules so
  // it reads whichever `--accent` they set, and skipped at zero so older presets are unaffected.
  if (values.stateTint > 0) {
    css.push('.ach.state-rare, .ach.state-platinum { --bg: color-mix(in srgb, var(--accent) calc(var(--state-tint) * 100%), var(--bg-base)); }');
  }

  if (picture) {
    // A layer rather than a background-image on the card: the picture can be dimmed and blurred
    // without touching the text drawn on top of it. `--artwork` is the game's, set by the engine on
    // every payload; `--bg-image` is the preset's own and is fixed at generation time.
    const source = artwork ? 'var(--artwork)' : 'var(--bg-image)';
    css.push(
      `.ach::before { content: ''; position: absolute; inset: 0; z-index: 0; border-radius: inherit; background-image: ${source}; background-size: cover; background-position: center ${values.artworkPosition}; filter: blur(var(--artwork-blur)); opacity: calc(1 - var(--artwork-dim)); }`
    );
  }

  const logo = Boolean(values.logoImage);
  if (logo) {
    css.push(logoLayerRule(values, assetUrl, pattern));
  } else if (pattern) {
    // Its own layer above the background and any picture, and below the text.
    const size = BG_PATTERN_SIZES[values.bgPattern];
    css.push(
      `.ach::after { content: ''; position: absolute; inset: 0; z-index: 0; border-radius: inherit; pointer-events: none; background-image: ${BG_PATTERNS[values.bgPattern]};` +
        (size && size !== 'auto' ? ` background-size: ${size};` : '') +
        ' }'
    );
  }

  // An absolutely positioned pseudo-element paints above in-flow content, so once the card has a
  // layer, the text needs its own stacking position or the picture/pattern draw over it.
  if (picture || pattern || logo) css.push('.ach > * { position: relative; z-index: 1; }');

  css.push(
    ...iconRules(values),
    '.ach .icon { flex: 0 0 auto; }',
    iconImageRule(values),
    // `overflow: hidden` is what keeps a scrolling line inside the card: a title too long to fit is
    // animated past its own box, and with nothing clipping the column it was drawn over the icon and
    // out through the side of the popup.
    `.ach .text_wrap { display: flex; flex: 1 1 auto; flex-direction: column; align-items: ${flexAlign}; min-width: 0; overflow: hidden; text-align: ${values.align}; }`,
    `.ach .title { max-width: 100%; margin: 0; color: ${TITLE_COLOR[values.titleColorMode]}; font-weight: var(--title-weight); text-transform: var(--title-case); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`,
    detailRule(values),
    '.ach .title.marquee, .ach .detail.marquee { display: inline-block; white-space: nowrap; overflow: visible; will-change: transform; }',
    // Game name and rarity chip. Hidden by the engine when the payload has nothing for them, and by
    // the stylesheet when the design does not ask for them at all.
    `.ach .meta { display: ${values.showGameName || values.showRarity ? 'flex' : 'none'}; align-items: center; gap: 8px; max-width: 100%; margin-bottom: 2px; font-size: calc(var(--font-size) * 0.66); line-height: 1.2; }`,
    '.ach .meta[hidden] { display: none; }',
    `.ach .game { display: ${values.showGameName ? 'block' : 'none'}; min-width: 0; overflow: hidden; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; text-overflow: ellipsis; }`,
    '.ach .game[hidden] { display: none; }',
    `.ach .rarity { display: ${values.showRarity ? 'block' : 'none'}; flex: 0 0 auto; padding: 1px 6px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 22%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent); color: var(--accent); font-weight: 700; }`,
    '.ach .rarity[hidden] { display: none; }',
    // The padlock a hidden achievement's title wears, drawn in the title's own colour.
    values.hiddenLock
      ? `.ach.is-hidden .title::before { content: ""; display: inline-block; width: 0.8em; height: 0.8em; margin-right: 0.3em; vertical-align: -0.06em; background: currentColor; mask: url("${HIDDEN_LOCK_MASK}") center / contain no-repeat; }`
      : '',
    '@keyframes aw_in { from { transform: translate(calc(-50% + var(--in-dx)), calc(-50% + var(--in-dy))) scale(calc(var(--scale, 1) * var(--in-scale))); opacity: 0; } to { transform: translate(-50%, -50%) scale(var(--scale, 1)); opacity: var(--opacity); } }',
    '@keyframes aw_hold { from, to { transform: translate(-50%, -50%) scale(var(--scale, 1)); opacity: var(--opacity); } }',
    '@keyframes aw_out { from { transform: translate(-50%, -50%) scale(var(--scale, 1)); opacity: var(--opacity); } to { transform: translate(calc(-50% + var(--out-dx)), calc(-50% + var(--out-dy))) scale(calc(var(--scale, 1) * var(--out-scale))); opacity: 0; } }',
    glowAnimation ? glowAnimation.css : '',
    // The glow animation joins the entry/hold/exit list rather than replacing any of it: it only ever
    // writes --glow-pulse, so the three that drive transform and opacity are untouched.
    '.active { animation: aw_in var(--ach-in) var(--ease) forwards, aw_hold var(--ach-hold) forwards, aw_out var(--ach-out) var(--ease-out) forwards' +
      (glowAnimation ? `, ${glowAnimation.name} ${glowAnimation.duration}ms ease-in-out infinite` : '') +
      '; animation-delay: 0s, var(--ach-in), calc(var(--ach-in) + var(--ach-hold))' +
      (glowAnimation ? ', 0s' : '') +
      '; }',
    `.progress_line { display: ${values.showProgress ? 'flex' : 'none'}; align-items: center; justify-content: ${flexAlign}; gap: 8px; width: 100%; margin-top: 8px; min-width: 0; }`,
    '.progress_line[hidden] { display: none; }',
    '.progress_track { display: block; flex: 1 1 auto; min-width: 70px; height: var(--progress-height); overflow: hidden; border-radius: 999px; background: rgba(0, 0, 0, 0.45); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); }',
    '.progress_meter { display: block; width: 0%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 45%, #ffffff) 100%); box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 55%, transparent); transition: width 0.35s ease; }',
    '.progress_label { flex: 0 0 auto; max-width: 110px; overflow: hidden; color: var(--text); font-size: 12px; font-weight: 700; line-height: 1; text-align: right; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }',
    canvasCss(values.canvas, { assetUrl, editing, entrances }),
    canvasPlacementRules(values, editing),
    ''
  );

  return css.filter((line) => line !== '').join('\n');
}

/*
  Written under <userData>, never under the app folder: packaged, app/presets sits inside
  app.asar, and mkdir below a file fails with ENOTDIR - silently breaking Preview/Save on every
  installed build while dev (a real directory) worked. Exported and tested so this can't drift back.
*/
const GENERATED_PRESETS_SUBPATH = ['presets', 'Users Presets'];

function generatedPresetsDir(userDataPath) {
  if (!userDataPath) throw new Error('generatedPresetsDir: userData path is required');
  return path.join(userDataPath, ...GENERATED_PRESETS_SUBPATH);
}

// The builder's own options, stored next to the generated files, and what makes a preset
// re-openable and deletable from the builder.
const PRESET_OPTIONS_FILE = 'aw-preset.json';

// The installed manifest of an imported preset. Owned here, beside the options file, because both
// name a preset's bookkeeping and presetSound() reads whichever one a preset has - util/presetPackage
// imports it from here rather than spelling it a second time.
const PRESET_PACKAGE_FILE = 'aw-package.json';

/*
  The sound a preset asks for, or '' to mean "use the app's Notifications setting" - so a shared
  package sounds as its author intended, and an unreadable or sound-less preset can never be the
  reason a notification goes silent.
*/
function presetSound(presetDir) {
  if (!presetDir) return '';
  /*
    The designer's own options win whenever present, even an empty sound (an explicit "no opinion"
    vs. never having had the chance to say). Only a preset without them falls back to the manifest.
    Both are re-validated, so a hand-edited file can't smuggle in a path.
  */
  try {
    return normalizeOptions(JSON.parse(fs.readFileSync(path.join(presetDir, PRESET_OPTIONS_FILE), 'utf8'))).sound;
  } catch {}
  try {
    return normalizeOptions({ sound: JSON.parse(fs.readFileSync(path.join(presetDir, PRESET_PACKAGE_FILE), 'utf8')).sound }).sound;
  } catch {}
  return '';
}

// Folder-safe, readable preset name. Returns '' for anything unusable. Shared with the package
// importer so a name that arrives from someone else's machine can never resolve differently.
function sanitizePresetName(raw) {
  return String(raw || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 48)
    .trim();
}

module.exports = {
  presetEdge,
  GENERATED_PRESETS_SUBPATH,
  PRESET_OPTIONS_FILE,
  PRESET_PACKAGE_FILE,
  PRESET_ENGINE,
  CUSTOM_FONT_FAMILY,
  PRESET_MARKUP,
  PREVIEW_SCRIPT_HASHES,
  CANVAS_CLASS,
  CANVAS_EDIT_ROOM,
  CANVAS_PART_SELECTORS,
  CANVAS_STYLE_SELECTORS,
  canvasIconMask,
  canvasCss,
  canvasMarkup,
  canvasScript,
  markupWithCanvas,
  // Kept under its original name: init.js and the package format both clamp through it, and an
  // .awpreset written by any build has always been re-validated by whatever this returns.
  customPresetNumbers: normalizeOptions,
  presetBoxSize,
  buildCustomPresetHtml,
  buildCustomPresetCss,
  buildPresetPreviewHtml,
  generatedPresetsDir,
  presetSound,
  sanitizePresetName,
};
