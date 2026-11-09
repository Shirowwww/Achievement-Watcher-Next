'use strict';

/*
  The presets and sounds a build ships must be the ones in the sources, file for file: a stale copy
  or a file the packer dropped would only show on a user's machine as a broken notification.
*/

const fs = require('fs');
const path = require('path');

const BUNDLED_FOLDERS = ['presets', 'sounds'];
// The files a notification page or a sound player loads. Anything else (a README beside a preset)
// is left to the packer's own rules, so this list never has to mirror electron-builder.yml.
const ASSET_FILE = /\.(html|css|js|json|png|jpe?g|gif|webp|svg|ico|wav|mp3|m4a|ogg|flac|ttf|otf|woff2?)$/i;

function listFiles(root, relative = '') {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(root, name));
    else if (ASSET_FILE.test(entry.name)) files.push(name);
  }
  return files.sort();
}

// Returns one line per difference between `sourceDir/<folder>` and `unpackedDir/<folder>`.
function compareBundledAssets(sourceDir, unpackedDir, folders = BUNDLED_FOLDERS) {
  const problems = [];
  for (const folder of folders) {
    const source = path.join(sourceDir, folder);
    const shipped = path.join(unpackedDir, folder);
    if (!fs.existsSync(shipped)) {
      problems.push(`${folder}: missing from the build`);
      continue;
    }
    const expected = listFiles(source);
    const actual = new Set(listFiles(shipped));
    for (const file of expected) {
      if (!actual.has(file)) problems.push(`${folder}/${file}: missing from the build`);
      else if (!fs.readFileSync(path.join(source, file)).equals(fs.readFileSync(path.join(shipped, file)))) {
        problems.push(`${folder}/${file}: differs from the sources`);
      }
      actual.delete(file);
    }
    for (const file of actual) problems.push(`${folder}/${file}: not in the sources`);
  }
  return problems;
}

module.exports = { compareBundledAssets, BUNDLED_FOLDERS };
