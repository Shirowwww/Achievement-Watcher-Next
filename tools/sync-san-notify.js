'use strict';
/*
  Copies Steam Achievement Notifier's notification page files into app/util/sanEngine, adapted for
  AW Next as app/util/sanEngine/SOURCES.md describes.

  node tools/sync-san-notify.js <SteamAchievementNotifier checkout>
*/
const fs = require('fs');
const path = require('path');

// SAN's window is the card plus 25px of glow room on each side, and its viewport units measure that
// window; base.css defines --sanvw and --sanvh as one hundredth of it.
const CARD_UNITS = {
  vw: 'var(--sanvw)',
  vh: 'var(--sanvh)',
  vmax: 'max(var(--sanvw), var(--sanvh))',
  vmin: 'min(var(--sanvw), var(--sanvh))',
};
const toCardUnits = (css) =>
  css.replace(/(-?\d*\.?\d+)(vmax|vmin|vw|vh)\b/g, (m, value, unit) => `calc(${value} * ${CARD_UNITS[unit]})`);

if (require.main !== module) {
  module.exports = { toCardUnits };
  return;
}

const sanRoot = process.argv[2];
const awRoot = path.join(__dirname, '..');
if (!sanRoot || !fs.existsSync(path.join(sanRoot, 'notify', 'presets'))) {
  console.error('usage: node tools/sync-san-notify.js <SteamAchievementNotifier checkout>');
  process.exit(2);
}
const notify = path.join(sanRoot, 'notify');
const engineDir = path.join(awRoot, 'app', 'util', 'sanEngine');
const LAYOUT_IDS = require(path.join(engineDir, 'engine.js')).LAYOUT_IDS;

const lf = (text) => text.replace(/\r\n?/g, '\n');
const read = (...parts) => lf(fs.readFileSync(path.join(...parts), 'utf8'));
const dataUri = (file) => {
  const mime = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
};
const asciiOnly = (name, text) => {
  const bad = /[^\x09\x0a\x20-\x7e]/.exec(text);
  if (bad) throw new Error(`${name}: non-ASCII character U+${bad[0].charCodeAt(0).toString(16)}`);
  return text;
};

// AW Next ships these faces in fonts.css (WOFF2), so the per-card @font-face rules go.
const withoutFontFaces = (css) => css.replace(/@font-face\s*\{[^}]*\}\s*/g, '');

for (const id of LAYOUT_IDS) {
  const html = read(notify, 'presets', id, 'index.html').replace(/\s+src="\.\.\/img\/achicon\.png"/g, '');
  if (/\.\.\//.test(html)) throw new Error(`${id}.html still names a SAN file`);
  let css = withoutFontFaces(read(notify, 'presets', id, 'styles.css'));
  css = css.replace(/url\("\.\.\/\.\.\/\.\.\/img\/([a-z0-9_]+\.(?:svg|png))"\)/g, (m, file) => `url("${dataUri(path.join(sanRoot, 'img', file))}")`);
  if (/\.\.\//.test(css)) throw new Error(`${id}.css still names a SAN file`);
  css = toCardUnits(css);
  const cardHeader = `/* Steam Achievement Notifier's "${id}" card (notify/presets/${id}/styles.css), see app/util/sanEngine/SOURCES.md. */\n`;
  fs.writeFileSync(path.join(engineDir, 'layouts', `${id}.html`), asciiOnly(id, html.trimEnd() + '\n'));
  fs.writeFileSync(path.join(engineDir, 'layouts', `${id}.css`), asciiOnly(id, cardHeader + css.trimEnd() + '\n'));
}

// The parts of SAN's app-wide stylesheet its notification page relies on.
const globalPart = `:root {
    --darkgrey: #101010;
    --mediumgrey: #2b2b2b;
    --transition: 0.2s;
}

body[noanim] {
    --transition: 0s;
}

html,
body {
    display: grid;
    width: 100vw;
    height: 100vh;
    font-family: "Titillium Web","Roboto";
    background-color: transparent;
    color: white;
    overflow: hidden;
    color-scheme: dark;
}

.wrapper {
    display: grid;
}
`;

let base = read(notify, 'base.css')
  .replace('url("../img/base64.png")', `url("${dataUri(path.join(sanRoot, 'img', 'base64.png'))}")`)
  // The screenshot overlay is a SAN feature AW Next does not have; its 1.2 MB picture stays out.
  .replace('--ssimg: url("../img/santextlogobg.png");', '--ssimg: none;');
if (/\.\.\//.test(base)) throw new Error('base.css still names a SAN file');
const anim = read(notify, 'baseanim.css');

const adapter = `
/* ---- AW Next ----------------------------------------------------------------------------------- */

/*
  SAN sizes each popup window to its card plus 25px of glow room on each side. AW Next sizes one
  window for every state of a theme, so the card is drawn in a body of its own size, and SAN's
  viewport units (the text scale among them) measure the window SAN would have opened for it.
*/
:root {
    --sanvw: calc((var(--notifywidth) + 50px) / 100);
    --sanvh: calc((var(--notifyheight) + 50px) / 100);
    font-size: clamp(0.05rem, 0.05rem + 3 * max(var(--sanvw), var(--sanvh)), 12.5rem);
}

body {
    width: var(--notifywidth);
    height: var(--notifyheight);
    container-type: size;
}
`;

const header = `/*
  Steam Achievement Notifier's notification page stylesheets (notify/base.css, notify/baseanim.css and
  the parts of dist/app/global.css the page uses), see SOURCES.md. AW Next's changes are at the end.
*/
`;
fs.writeFileSync(path.join(engineDir, 'base.css'), asciiOnly('base.css', header + globalPart + '\n' + base.trimEnd() + '\n\n' + anim.trimEnd() + '\n' + adapter));
console.log(`Copied ${LAYOUT_IDS.length} cards and base.css into ${path.relative(awRoot, engineDir)}.`);
