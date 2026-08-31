'use strict';

/*
  The main window loads app.js next to the ui/*.js scripts as classic <script>s that share one
  global lexical scope, so a helper moved from one of those files to another is still the very same
  program. Dozens of tests pin renderer behaviour by matching its source text; read through this
  helper rather than opening app.js directly, and splitting that file stays a code move instead of
  looking like a deleted behaviour.
*/

const fs = require('node:fs');
const path = require('node:path');

const appDir = path.join(__dirname, '..', '..', 'app');

// The scripts the page loads, in load order - the same list rendererScope.test.js pins.
function rendererScriptFiles() {
  const viewHtml = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
  return [...viewHtml.matchAll(/<script src="\.\.\/(ui\/[^"]+\.js|app\.js)"/g)]
    .map((match) => match[1])
    .filter((file) => !file.startsWith('ui/lib/'));
}

let cached = null;

// Every classic page script concatenated in load order, with a banner naming each file so an
// assertion failure still says which one it was looking at.
function rendererSource() {
  if (cached === null) {
    cached = rendererScriptFiles()
      .map((file) => `\n/* ===== ${file} ===== */\n${fs.readFileSync(path.join(appDir, file), 'utf8')}`)
      .join('\n');
  }
  return cached;
}

module.exports = { appDir, rendererScriptFiles, rendererSource };
