'use strict';

/*
  The app's own typefaces, as a stylesheet a sandboxed document can carry with it.

  The theme mock is a picture of this application, and half of what makes a window recognisable is
  the lettering: drawn in whatever sans-serif the machine happens to default to, the sample looked
  like a different program wearing the theme. It cannot simply link the font files - the mock is a
  srcdoc frame under `default-src 'none'` in the app, and a page served to a headless browser on the
  gallery server, where the only thing outside its own folder that may load is a `data:` URL. So the
  faces travel inside the document, the way the theme's own images do.

  Read once and cached: the four faces are ~360 KB of file, and building the base64 for every render
  would be paid per preview. A missing or unreadable font file is not an error - the mock falls back
  to the stack `themeMock.js` declares, which is what a checkout without the fonts (the gallery
  service takes only the shared readers) gets today.
*/

const fs = require('fs');
const path = require('path');

// Named exactly as app.css names them, so the same `font-family` values work in both places.
const FACES = [
  { family: 'Open-Sans', weight: '400', file: ['Open_Sans', 'opensans-regular-webfont.woff2'], format: 'woff2' },
  { family: 'Open-Sans-Bold', weight: '700', file: ['Open_Sans', 'opensans-bold-webfont.woff2'], format: 'woff2' },
  { family: 'Raleway', weight: '400', file: ['Raleway', 'Raleway-Regular.ttf'], format: 'truetype' },
  { family: 'Raleway-Bold', weight: '700', file: ['Raleway', 'Raleway-Bold.ttf'], format: 'truetype' },
];

const MIME = { woff2: 'font/woff2', truetype: 'font/ttf' };

function fontDir() {
  return path.join(__dirname, '..', 'resources', 'font');
}

let cached = null;

/*
  `@font-face` rules for every face that is actually on disk, or '' when none are. Deterministic:
  the same install always produces the same bytes, so a render of one theme is the same picture
  twice running.
*/
function themeMockFontCss() {
  if (cached !== null) return cached;
  const rules = [];
  for (const face of FACES) {
    let data;
    try {
      data = fs.readFileSync(path.join(fontDir(), ...face.file));
    } catch {
      continue;
    }
    const mime = MIME[face.format] || 'application/octet-stream';
    rules.push(
      `@font-face { font-family: '${face.family}'; font-style: normal; font-weight: ${face.weight};` +
        ` src: url(data:${mime};base64,${data.toString('base64')}) format('${face.format}'); }`
    );
  }
  cached = rules.join('\n');
  return cached;
}

// Tests build several installs in one process; nothing in the app calls this.
function resetForTests() {
  cached = null;
}

module.exports = { FACES, themeMockFontCss, resetForTests };
