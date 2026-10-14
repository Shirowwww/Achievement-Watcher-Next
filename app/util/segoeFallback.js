'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

/*
  The overlay and most notification presets ask for Segoe UI, a Windows font. Off Windows it is
  replaced by Selawik, Microsoft's free fallback drawn on the same metrics, so the text keeps the
  width and line breaks it has on Windows. A Segoe UI the user installed still wins through local().
*/
const FACES = [
  { weight: 300, local: 'Segoe UI Light', file: 'selawkl.woff2' },
  { weight: 350, local: 'Segoe UI Semilight', file: 'selawksl.woff2' },
  { weight: 400, local: 'Segoe UI', file: 'selawk.woff2' },
  { weight: 600, local: 'Segoe UI Semibold', file: 'selawksb.woff2' },
  { weight: 700, local: 'Segoe UI Bold', file: 'selawkb.woff2' },
];

// Selawik matches the widths but not the line height: Segoe UI's own ascent and descent (2210 and
// 514 per 2048 units) keep a "normal" line as tall as on Windows.
const SEGOE_LINE = 'ascent-override: 107.91%; descent-override: 25.1%; line-gap-override: 0%;';

const FONT_DIR = path.join(__dirname, '../resources/font/Selawik');

function segoeFallbackCss() {
  return FACES.map(
    ({ weight, local, file }) =>
      `@font-face { font-family: 'Segoe UI'; font-weight: ${weight}; src: local('${local}'), url('${pathToFileURL(path.join(FONT_DIR, file)).href}') format('woff2'); ${SEGOE_LINE} }`
  ).join('\n');
}

// Windows has the real font: nothing to add there.
function insertSegoeFallback(webContents, { platform = process.platform, log = () => {} } = {}) {
  if (platform === 'win32') return;
  webContents.insertCSS(segoeFallbackCss()).catch((err) => log(`[fonts] Segoe UI fallback failed: ${err.message || err}`));
}

module.exports = { segoeFallbackCss, insertSegoeFallback, FACES, FONT_DIR };
