'use strict';

/*
  Generates the binary and copied assets the website serves, from the files the app already owns.

  GitHub Pages publishes docs/ and nothing above it, so anything the site shows has to exist under
  that folder. Rather than maintaining a second copy by hand, this script derives it:

    docs/screenshot/*.png            -> docs/assets/shot/<name>.webp (and a narrow one for phones)
    docs/screenshot/home.png         -> docs/assets/img/social.png (the link preview card)
    app/build/brandMark.png          -> docs/assets/img/brand-mark.png (tinted through a CSS mask)
    app/presets/Default Presets/*    -> docs/assets/preset/<slug>/ plus a preview shim

  Outputs are committed, because Pages builds the repository as it is checked in. `--check` proves
  they still match their sources without needing sharp, so CI can run it on a bare install.

    node tools/site/build-assets.js
    node tools/site/build-assets.js --check
*/

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const SHOTS_IN = path.join(root, 'docs', 'screenshot');
const SHOTS_OUT = path.join(root, 'docs', 'assets', 'shot');
const PRESETS_IN = path.join(root, 'app', 'presets', 'Default Presets');
const PRESETS_OUT = path.join(root, 'docs', 'assets', 'preset');
const MANIFEST = path.join(root, 'docs', 'assets', 'generated.json');

// The wide app captures are 1627px; anything above this is downscaled for the page, and the phone
// variant is what a 400px column actually needs at 2x.
const SHOT_WIDTH = 1280;
const SHOT_WIDTH_SMALL = 800;
const WEBP_QUALITY = 82;

// A preset folder is HTML, CSS and its own assets. Nothing else is copied out of it.
const PRESET_ASSET_RE = /\.(?:html|css|png|jpe?g|gif|webp|bmp|svg|ttf|otf|woff2?)$/i;

// The line that turns a preset page into something a browser can show on its own: the preset waits
// for window.api, which only exists inside the app, so the copy gets a shim that plays a demo
// unlock instead. Injected here rather than kept in the preset, which must stay what the app ships.
const SHIM_TAG = '<script src="../../js/preset-preview.js"></script>';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
}

function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) out.push(relative);
  }
  return out;
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// --- sources ----------------------------------------------------------------------------------

// Every source file the outputs are derived from, with the output paths it produces. The manifest
// stores this shape, so --check is a comparison rather than a rebuild.
function plan() {
  const entries = [];

  for (const file of fs.readdirSync(SHOTS_IN).sort()) {
    if (!file.endsWith('.png')) continue;
    const stem = path.basename(file, '.png');
    entries.push({
      kind: 'shot',
      source: `docs/screenshot/${file}`,
      outputs: [`docs/assets/shot/${stem}.webp`, `docs/assets/shot/${stem}-800.webp`],
      stem,
    });
  }

  entries.push({
    kind: 'brand',
    source: 'app/build/brandMark.png',
    outputs: ['docs/assets/img/brand-mark.png'],
  });

  entries.push({
    kind: 'social',
    source: 'docs/screenshot/home.png',
    outputs: ['docs/assets/img/social.png'],
  });

  for (const name of fs.readdirSync(PRESETS_IN).sort()) {
    const dir = path.join(PRESETS_IN, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const slug = slugify(name);
    for (const relative of listFiles(dir)) {
      if (!PRESET_ASSET_RE.test(relative)) continue;
      entries.push({
        kind: 'preset',
        source: `app/presets/Default Presets/${name}/${relative}`,
        outputs: [`docs/assets/preset/${slug}/${relative}`],
        slug,
        preset: name,
        relative,
      });
    }
  }

  return entries;
}

// --- build ------------------------------------------------------------------------------------

async function buildShot(entry) {
  const sharp = require(path.join(root, 'app', 'node_modules', 'sharp'));
  const source = path.join(root, entry.source);
  fs.mkdirSync(SHOTS_OUT, { recursive: true });
  for (const [width, out] of [[SHOT_WIDTH, entry.outputs[0]], [SHOT_WIDTH_SMALL, entry.outputs[1]]]) {
    await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 6 })
      .toFile(path.join(root, out));
  }
}

// The mark is drawn through a CSS mask, so only its alpha matters: 96px is as large as the header
// ever draws it on a 2x display.
async function buildBrand(entry) {
  const sharp = require(path.join(root, 'app', 'node_modules', 'sharp'));
  const out = path.join(root, entry.outputs[0]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(path.join(root, entry.source)).resize({ width: 96 }).png({ compressionLevel: 9 }).toFile(out);
}

// The link preview card every chat app and social site asks for: 1200x630, cropped from the
// library shot rather than drawn, so it shows the actual product.
async function buildSocial(entry) {
  const sharp = require(path.join(root, 'app', 'node_modules', 'sharp'));
  const out = path.join(root, entry.outputs[0]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(path.join(root, entry.source))
    .resize({ width: 1200, height: 630, fit: 'cover', position: 'top' })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(out);
}

function buildPresetFile(entry) {
  const source = path.join(root, entry.source);
  const out = path.join(root, entry.outputs[0]);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (entry.relative !== 'index.html') {
    fs.copyFileSync(source, out);
    return;
  }

  let html = fs.readFileSync(source, 'utf8');
  if (!html.includes(SHIM_TAG)) {
    if (!html.includes('</head>')) throw new Error(`${entry.source} has no </head> to inject the shim into`);
    html = html.replace('</head>', `${SHIM_TAG}\n</head>`);
  }
  fs.writeFileSync(out, html, 'utf8');
}

async function build(entries) {
  // A preset removed upstream must not keep being served, so the generated folders are rebuilt
  // from nothing rather than merged into.
  fs.rmSync(PRESETS_OUT, { recursive: true, force: true });
  fs.rmSync(SHOTS_OUT, { recursive: true, force: true });

  for (const entry of entries) {
    if (entry.kind === 'shot') await buildShot(entry);
    else if (entry.kind === 'brand') await buildBrand(entry);
    else if (entry.kind === 'social') await buildSocial(entry);
    else buildPresetFile(entry);
  }

  const manifest = {
    note: 'Generated by tools/site/build-assets.js. Run it again after changing a screenshot or a bundled preset.',
    sources: {},
  };
  for (const entry of entries) manifest.sources[entry.source] = sha256(path.join(root, entry.source));
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const presets = [...new Set(entries.filter((e) => e.kind === 'preset').map((e) => e.slug))];
  const shots = entries.filter((e) => e.kind === 'shot').length;
  console.log(`site assets: ${shots} screenshots, ${presets.length} presets`);
}

// --- check ------------------------------------------------------------------------------------

function check(entries) {
  const problems = [];

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return ['docs/assets/generated.json is missing or unreadable'];
  }

  const recorded = manifest.sources || {};
  for (const entry of entries) {
    const digest = sha256(path.join(root, entry.source));
    if (recorded[entry.source] !== digest) problems.push(`${entry.source} changed since the site assets were built`);
    for (const out of entry.outputs) {
      if (!fs.existsSync(path.join(root, out))) problems.push(`${out} is missing`);
    }
  }
  for (const source of Object.keys(recorded)) {
    if (!entries.some((entry) => entry.source === source)) problems.push(`${source} is recorded but no longer a source`);
  }

  return problems;
}

// --- entry point ------------------------------------------------------------------------------

async function main() {
  const entries = plan();

  if (process.argv.includes('--check')) {
    const problems = check(entries);
    if (problems.length) {
      console.error('Site assets are out of date. Run: node tools/site/build-assets.js\n');
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
      return;
    }
    console.log(`site assets: up to date (${entries.length} sources)`);
    return;
  }

  await build(entries);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exitCode = 1;
});
