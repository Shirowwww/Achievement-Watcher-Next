'use strict';

/*
  init.js cannot be required outside Electron, so a lot of main-process behaviour is pinned by
  matching its source text. init.js is not the whole main process any more - ipc.js and
  presetLibrary.js register handlers of their own - so read through this helper rather than opening
  init.js directly, and moving a handler between those files stays a code move instead of looking
  like a channel that stopped being answered.
*/

const fs = require('node:fs');
const path = require('node:path');

const appDir = path.join(__dirname, '..', '..', 'app');
const electronDir = path.join(appDir, 'electron');

// Every file of the main process, init.js first so an assertion that slices forward from a marker
// declared there still finds what follows it.
function mainProcessFiles() {
  const rest = fs
    .readdirSync(electronDir)
    .filter((name) => name.endsWith('.js') && name !== 'init.js')
    .sort((a, b) => a.localeCompare(b, 'en'));
  return ['init.js', ...rest].map((name) => path.join(electronDir, name));
}

let cached = null;

// Every main-process file concatenated, with a banner naming each one so an assertion failure still
// says which file it was looking at.
function mainProcessSource() {
  if (cached === null) {
    cached = mainProcessFiles()
      .map((file) => `\n/* ===== electron/${path.basename(file)} ===== */\n${fs.readFileSync(file, 'utf8')}`)
      .join('\n');
  }
  return cached;
}

module.exports = { electronDir, mainProcessFiles, mainProcessSource };
