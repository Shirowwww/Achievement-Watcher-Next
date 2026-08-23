'use strict';

/*
  A small, fixed picture of the app, painted with a theme. One HTML document built from a sanitized
  theme model and nothing else - the only thing a theme contributes is the real stylesheet
  themeLayers.js generates, so there is no path for a package to put markup, script or a URL of its
  own on the page. It mirrors the whole home screen so every one of the theme's nine layers appears
  at least once, and is used both for the Settings import preview and for the gallery's card picture.
*/

const { buildCustomAppCss, sanitizeCustomTheme } = require('./themeLayers.js');
const { escapeHtml } = require('./escapeHtml.js');

/*
  The sample. Invented titles, no account, no library, no path: nothing here comes from whoever runs
  this or from whoever made the theme. Cover art is drawn from the theme's own accent rather than
  shipped, so the mock stays self-contained - varying only in weight and gradient direction, since
  pushing tiles around the hue wheel read as somebody else's artwork rather than the theme's palette.
*/
const SAMPLE = {
  title: 'Achievement Watcher Next',
  status: 'Watchdog active',
  statusDetail: 'Game and achievement tracking operational',
  player: 'Player',
  pills: [
    { value: '158', label: 'achievements' },
    { value: '1/10', label: 'perfect' },
    { value: '27%', label: 'complete' },
  ],
  games: [
    { name: 'Northern Circuit', percent: 68, weight: 52, angle: 145 },
    { name: 'Harbour Lights', percent: 100, weight: 34, angle: 205 },
    { name: 'Paper Lantern', percent: 11, weight: 20, angle: 120 },
    { name: 'Quiet Season', percent: 46, weight: 44, angle: 60 },
    { name: 'Salt and Iron', percent: 0, weight: 14, angle: 165 },
    { name: 'Tideline', percent: 74, weight: 38, angle: 250 },
    { name: 'Winter Mail', percent: 33, weight: 26, angle: 95 },
    { name: 'Low Tide', percent: 89, weight: 58, angle: 180 },
  ],
  achievements: [
    { name: 'First Light', description: 'Reach the summit before dawn.', state: 'unlocked' },
    { name: 'No Witnesses', description: 'Finish the heist without an alarm.', state: 'rare' },
    { name: 'Collector', description: 'Recover the scattered relics.', state: 'locked' },
  ],
};

const DEFAULT_LABELS = {
  library: 'Library',
  achievements: 'Achievements',
  recent: 'Recently unlocked',
  settings: 'Settings',
  theme: 'Theme',
  apply: 'Apply',
  cancel: 'Cancel',
  unlocked: 'Unlocked',
  locked: 'Locked',
  rare: 'Rare',
  perfect: 'perfect',
  complete: 'complete',
  view: 'Landscape',
  status: 'Watchdog active',
};

// The tokens app.css defines that the generated theme stylesheet does not. Declared before it, so
// a theme still overrides every one it has an opinion about.
const BASE_TOKENS = `
:root {
  --set-scrim: rgba(6, 10, 18, 0.55);
  --radius: 12px;
  --radius-sm: 9px;
  font-size: 15px;
}
`;

const LAYOUT = `
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  font-family: 'Segoe UI', 'Open Sans', system-ui, sans-serif;
  color: var(--text);
  overflow: hidden;
}
.mock { display: grid; grid-template-rows: auto 1fr; height: 100%; }

/* The title bar: a shadow-DOM custom element in the real window, so the generated stylesheet hands
   it colours through custom properties. Reading the same properties here keeps the two in step. */
.mock-header {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 34px;
  padding: 0 8px 0 14px;
  font-size: 12.5px;
  background-color: var(--aw-header-scrim, var(--aw-header));
  background-image: var(--aw-veil-header-layer, none), var(--aw-grad-header, none), var(--aw-img-header, none);
  background-size: auto, 100% 100%, var(--aw-img-header-size, cover);
  background-repeat: no-repeat, no-repeat, var(--aw-img-header-repeat, no-repeat);
  background-position: center;
  border-bottom: 1px solid var(--aw-header-border, transparent);
  box-shadow: var(--aw-header-shadow, none);
}
.mock-header .live { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.mock-header .name { font-weight: 700; }
.mock-header .detail { color: var(--text-muted); }
.mock-header .rule { color: var(--text-muted); opacity: 0.5; }
.mock-header .spacer { flex: 1; }
.mock-header .win { display: flex; gap: 14px; color: var(--text-muted); padding-right: 6px; }
.mock-header .win i { width: 11px; height: 11px; display: block; position: relative; }
.mock-header .win i::before,
.mock-header .win i::after { content: ''; position: absolute; background: currentColor; }
.mock-header .win .cog::before { inset: 1px; border-radius: 50%; background: none; box-shadow: inset 0 0 0 1.5px currentColor; }
.mock-header .win .min::before { left: 0; right: 0; top: 5px; height: 1.5px; }
.mock-header .win .max::before { inset: 1px; background: none; box-shadow: inset 0 0 0 1.5px currentColor; }
.mock-header .win .close::before,
.mock-header .win .close::after { left: 0; right: 0; top: 5px; height: 1.5px; }
.mock-header .win .close::before { transform: rotate(45deg); }
.mock-header .win .close::after { transform: rotate(-45deg); }

/* Profile, toolbar, library, then a bottom row holding the recent list and the Settings surface
   side by side. The library takes the slack, so nothing overflows the window at any height. */
.mock-body { display: grid; grid-template-rows: auto auto 1fr auto; gap: 10px; padding: 10px 16px 12px; min-height: 0; }
.mock-bottom { display: grid; grid-template-columns: 1fr 320px; gap: 12px; align-items: end; }

.mock-profile { display: flex; align-items: center; gap: 14px; justify-content: center; }
.mock-profile .avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  position: relative;
  flex: 0 0 auto;
}
.mock-profile .avatar::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 12px;
  width: 15px;
  height: 15px;
  margin-left: -7.5px;
  border-radius: 50%;
  background: var(--text-muted);
}
.mock-profile .avatar::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 6px;
  width: 27px;
  height: 15px;
  margin-left: -13.5px;
  border-radius: 14px 14px 0 0;
  background: var(--text-muted);
}
.mock-profile .who { display: grid; gap: 6px; }
.mock-profile .who > strong { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; line-height: 1; }
.mock-profile .pills { display: flex; gap: 8px; }
.mock-profile .pill {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 62%, transparent);
  font-size: 11.5px;
}
.mock-profile .pill b { font-weight: 700; }
.mock-profile .pill span { color: var(--text-muted); }

.bar { height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--border) 70%, transparent); overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--accent); }

/* The view toolbar. */
.mock-tools { display: flex; align-items: center; gap: 8px; }
.mock-tools .tool,
.mock-tools .picker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 62%, transparent);
  font-size: 12px;
  color: var(--text-muted);
}
.mock-tools .picker { color: var(--text); }
.mock-tools .tool { width: 30px; padding: 0; justify-content: center; }
.mock-tools .tool.is-on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft, transparent); }
.mock-tools .glyph { width: 12px; height: 12px; border-radius: 3px; background: currentColor; opacity: 0.75; }
.mock-tools .spacer { flex: 1; }
.mock-tools .group { display: flex; gap: 6px; }

/* #game-list and .game-box .info are the selectors the generated stylesheet paints for the panel
   and card layers, so the mock uses the real ones rather than names of its own. */
#game-list {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 10px;
  min-height: 0;
}
.section-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--text-muted); }
.mock-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; align-content: start; }
#game-list .game-box { border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border); }
/* Sample cover art, drawn from the accent rather than shipped, so the document stays
   self-contained and redistributes nobody's artwork. */
#game-list .game-box .cover { height: 42px; position: relative; }
#game-list .game-box .cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(var(--cover-angle, 140deg), var(--cover-a), var(--cover-b));
}
#game-list .game-box .info { padding: 7px 9px; display: grid; gap: 4px; }
#game-list .game-box .info .title { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
#game-list .game-box .info .title span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#game-list .game-box .info .title i { width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid var(--text-muted); flex: 0 0 auto; }
#game-list .game-box .info .meter { display: flex; align-items: center; gap: 8px; }
#game-list .game-box .info .meter .bar { flex: 1; }
#game-list .game-box .info .count { font-size: 10.5px; color: var(--text-muted); min-width: 30px; text-align: right; }

/* The second selector the card layer paints, so a theme that puts an image on its cards shows it
   here as well as on a tile. */
#achievement { display: grid; gap: 6px; }
#achievement .achievement-list ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
#achievement .achievement-list ul > li {
  display: grid;
  grid-template-columns: 26px 1fr auto;
  align-items: center;
  gap: 9px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
#achievement .achievement-list .icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--accent-soft, color-mix(in srgb, var(--accent) 16%, transparent));
}
#achievement .achievement-list .ach-name { font-size: 12.5px; font-weight: 600; }
#achievement .achievement-list .ach-desc { font-size: 11.5px; color: var(--text-muted); }
#achievement .achievement-list .state { font-size: 11px; color: var(--text-muted); }
#achievement .achievement-list li.is-rare .state { color: var(--accent); font-weight: 700; }

/* In the real window this is a modal over the library. It is shown here beside the recent list
   instead, so its colour can be judged against the other layers rather than hiding them. */
#settings .box {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.30);
}
#settings .box .head {
  padding: 9px 13px;
  font-size: 12px;
  font-weight: 700;
  border-bottom: 1px solid var(--border);
}
#settings .box .row { padding: 8px 13px; display: flex; align-items: center; gap: 10px; font-size: 12px; }
#settings .box .row + .row { border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent); }
#settings .box .row .hint { color: var(--text-muted); font-size: 11px; }
#settings .box .row .grow { flex: 1; }
#settings .box .row .value {
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
}
#settings .box .foot { padding: 10px 13px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border); }
.btn-quiet {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
}
.btn-accent {
  border: 0;
  border-radius: 999px;
  padding: 6px 16px;
  font-size: 11.5px;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
}
`;

function text(value, fallback) {
  return escapeHtml(typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : fallback);
}

/*
  A tile's sample cover: the theme's accent faded into its own card colour, at the strength and in
  the direction this tile was given. Every cover is therefore the same two colours the theme
  already uses, and the tiles differ in weight and direction rather than in hue.
*/
function coverStyle(game) {
  const weight = Math.max(0, Math.min(100, Number(game.weight) || 0));
  const angle = Math.max(0, Math.min(360, Number(game.angle) || 0));
  return (
    `--cover-a: color-mix(in oklab, var(--accent) ${weight}%, var(--surface));` +
    `--cover-b: color-mix(in oklab, var(--accent) ${Math.round(weight / 4)}%, var(--surface));` +
    `--cover-angle: ${angle}deg;`
  );
}

function gameTile(game) {
  return (
    `<div class="game-box"><div class="cover" style="${coverStyle(game)}"></div>` +
    `<div class="info"><div class="title"><span>${escapeHtml(game.name)}</span><i></i></div>` +
    `<div class="meter"><span class="bar"><span style="width:${game.percent}%"></span></span>` +
    `<span class="count">${game.percent}%</span></div></div></div>`
  );
}

function achievementRow(entry, labels) {
  const state = entry.state === 'rare' ? labels.rare : entry.state === 'locked' ? labels.locked : labels.unlocked;
  return (
    `<li class="${entry.state === 'rare' ? 'is-rare' : ''}"><span class="icon"></span>` +
    `<span><span class="ach-name">${escapeHtml(entry.name)}</span><br /><span class="ach-desc">${escapeHtml(entry.description)}</span></span>` +
    `<span class="state">${escapeHtml(state)}</span></li>`
  );
}

function pill(entry, labels) {
  const label = { achievements: labels.achievements, perfect: labels.perfect, complete: labels.complete }[entry.label] || entry.label;
  return `<span class="pill"><b>${escapeHtml(entry.value)}</b><span>${escapeHtml(label)}</span></span>`;
}

/*
  The document. `theme` is any theme model - it is re-sanitized here, so a caller cannot widen a
  range by handing in something the editor would not produce.
*/
function buildThemeMock(theme, options = {}) {
  const clean = sanitizeCustomTheme(theme);
  const labels = { ...DEFAULT_LABELS, ...(options.labels && typeof options.labels === 'object' ? options.labels : {}) };
  const title = text(options.title, SAMPLE.title);

  // The veil the generated stylesheet computes for the header, as a layer this markup can paint.
  const veilHeader = '--aw-veil-header-layer: linear-gradient(var(--aw-veil-header, transparent), var(--aw-veil-header, transparent));';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    // Nothing on this page loads anything: no script, no font, no network. Stated rather than
    // assumed, because this document is also opened by a browser on the gallery server.
    `<meta http-equiv="content-security-policy" content="default-src 'none'; img-src file: data:; style-src 'unsafe-inline'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />`,
    `<title>${title}</title>`,
    `<style>${BASE_TOKENS}</style>`,
    `<style>${buildCustomAppCss(clean)}</style>`,
    `<style>:root { ${veilHeader} }${LAYOUT}</style>`,
    '</head>',
    '<body>',
    '<div class="mock">',

    '<div class="mock-header">',
    '<span class="live"></span>',
    `<span class="name">${escapeHtml(labels.status)}</span>`,
    '<span class="rule">|</span>',
    `<span class="detail">${escapeHtml(SAMPLE.statusDetail)}</span>`,
    '<span class="spacer"></span>',
    '<span class="win"><i class="cog"></i><i class="min"></i><i class="max"></i><i class="close"></i></span>',
    '</div>',

    '<div class="mock-body">',

    '<div class="mock-profile">',
    '<span class="avatar"></span>',
    '<span class="who">',
    `<strong>${escapeHtml(SAMPLE.player)}</strong>`,
    `<span class="pills">${SAMPLE.pills.map((entry) => pill(entry, labels)).join('')}</span>`,
    '</span>',
    '</div>',

    '<div class="mock-tools">',
    `<span class="picker"><span class="glyph"></span>${escapeHtml(labels.view)}</span>`,
    '<span class="tool"><span class="glyph"></span></span>',
    '<span class="tool"><span class="glyph"></span></span>',
    '<span class="spacer"></span>',
    '<span class="group"><span class="tool"><span class="glyph"></span></span>',
    '<span class="tool is-on"><span class="glyph"></span></span>',
    '<span class="tool"><span class="glyph"></span></span>',
    '<span class="tool"><span class="glyph"></span></span></span>',
    '</div>',

    '<div id="game-list">',
    `<div class="section-label">${escapeHtml(labels.library)}</div>`,
    `<div class="mock-grid">${SAMPLE.games.map(gameTile).join('')}</div>`,
    '</div>',

    '<div class="mock-bottom">',

    `<div id="achievement"><div class="section-label">${escapeHtml(labels.recent)}</div>` +
      `<div class="achievement-list"><ul>${SAMPLE.achievements.map((entry) => achievementRow(entry, labels)).join('')}</ul></div></div>`,

    '<div id="settings"><div class="box">',
    `<div class="head">${escapeHtml(labels.settings)}</div>`,
    `<div class="row"><span>${escapeHtml(labels.theme)}</span><span class="grow"></span><span class="value">${escapeHtml(labels.view)}</span></div>`,
    `<div class="row"><span><span>${escapeHtml(labels.achievements)}</span><br /><span class="hint">${escapeHtml(SAMPLE.statusDetail)}</span></span></div>`,
    `<div class="foot"><button type="button" class="btn-quiet">${escapeHtml(labels.cancel)}</button>` +
      `<button type="button" class="btn-accent">${escapeHtml(labels.apply)}</button></div>`,
    '</div></div>',

    '</div>',

    '</div>',
    '</div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/*
  The size the sample is laid out for. Anything showing the mock renders it at exactly this and
  scales the result, rather than letting it re-flow: a frame of its own width would drop a library
  row here that the published picture shows, and then the preview would not be the promise.
*/
const DESIGN = { width: 960, height: 600 };

module.exports = { buildThemeMock, DESIGN, SAMPLE, DEFAULT_LABELS };
