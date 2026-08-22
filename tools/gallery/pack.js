'use strict';

/*
  Builds an `.awpreset` from a preset written by hand.

  Most submissions will not need this: a preset made in Settings > Presets is exported from the app
  itself, and that file is what a submission carries. This is for a preset whose HTML and CSS were
  written directly, which the designer cannot produce and therefore cannot export.

    node tools/gallery/pack.js <source folder> [output file]

  The source folder is:

    meta.json     name, description, author, version, tags, minAppVersion, sound
    preset/       index.html and everything it references, relative paths only
    sounds/       optional, one audio file named by meta.sound

  The package is written by app/util/presetPackage.js, so it is the same file the app writes, and
  it is read back afterwards through the same reader the app imports with. A preset that packs here
  installs there.
*/

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const { exportPreset, readPackage, PRESET_PACKAGE_EXTENSION } = require(path.join(root, 'app', 'util', 'presetPackage.js'));
const appVersion = require(path.join(root, 'app', 'package.json')).version;

function die(message) {
  console.error(message);
  process.exit(1);
}

const source = process.argv[2];
if (!source) die('Usage: node tools/gallery/pack.js <source folder> [output file]');

const sourceDir = path.resolve(source);
const metaFile = path.join(sourceDir, 'meta.json');
const presetDir = path.join(sourceDir, 'preset');

if (!fs.existsSync(metaFile)) die(`${metaFile} is missing`);
if (!fs.existsSync(path.join(presetDir, 'index.html'))) die(`${presetDir}/index.html is missing`);

let meta;
try {
  meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
} catch (err) {
  die(`meta.json is not valid JSON: ${err.message}`);
}

if (!meta.name) die('meta.json needs a name');

// A sound only travels when the file is really there; naming one the recipient already has is a
// separate case the format supports, and it is not what a hand written preset is doing.
let sound = null;
if (meta.sound) {
  const soundFile = path.join(sourceDir, 'sounds', meta.sound);
  if (!fs.existsSync(soundFile)) die(`meta.json names the sound "${meta.sound}", but sounds/${meta.sound} is missing`);
  sound = { name: meta.sound, file: soundFile };
}

const destination = path.resolve(process.argv[3] || path.join(sourceDir, `preset${PRESET_PACKAGE_EXTENSION}`));

const result = exportPreset({
  presetDir,
  name: meta.name,
  destination,
  options: null,
  meta: {
    description: meta.description || '',
    author: meta.author || '',
    version: meta.version || '1.0.0',
    tags: meta.tags || [],
    minAppVersion: meta.minAppVersion || '',
    origin: meta.origin || null,
  },
  sound,
  appVersion,
});

if (!result.ok) die(`The preset could not be packed: ${result.error}`);

const back = readPackage(destination, { appVersion });
if (!back.ok) die(`The package was written but the app's reader refuses it: ${back.error}`);

console.log(`${path.relative(process.cwd(), destination)}: ${result.files} file(s)${result.sound ? ` and ${result.sound}` : ''}, ${Math.round(fs.statSync(destination).size / 1024)} KB`);
