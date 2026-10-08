'use strict';

/*
  Generates the binary and copied assets the website serves, from the files the app already owns.

  GitHub Pages publishes docs/ and nothing above it, so anything the site shows has to exist under
  that folder. Rather than maintaining a second copy by hand, this script derives it:

    docs/screenshot/*.png            -> docs/assets/shot/<name>.webp (and a narrow one for phones)
    docs/*.md                        -> each <img src="screenshot/..."> is kept as a <picture> that
                                        serves those webp files, with its width and height
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

// A PNG states its size in the first chunk, so the plan knows a screenshot's dimensions without
// sharp, which --check must not need.
function pngSize(file) {
  const head = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, head, 0, 24, 0);
  } finally {
    fs.closeSync(fd);
  }
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Sources

// Every source file the outputs are derived from, with the output paths it produces. The manifest
// stores this shape, so --check is a comparison rather than a rebuild.
function plan() {
  const entries = [];

  for (const file of fs.readdirSync(SHOTS_IN).sort()) {
    if (!file.endsWith('.png')) continue;
    const stem = path.basename(file, '.png');
    const { width, height } = pngSize(path.join(SHOTS_IN, file));
    // A capture no wider than the phone size needs no second copy.
    const outputs = [`docs/assets/shot/${stem}.webp`];
    if (width > SHOT_WIDTH_SMALL) outputs.push(`docs/assets/shot/${stem}-800.webp`);
    entries.push({ kind: 'shot', source: `docs/screenshot/${file}`, outputs, stem, width, height });
  }

  // An animated WebP is authored whole, so it is published as it is rather than re-encoded.
  for (const file of fs.readdirSync(SHOTS_IN).sort()) {
    if (!file.endsWith('.webp')) continue;
    entries.push({ kind: 'animation', source: `docs/screenshot/${file}`, outputs: [`docs/assets/shot/${file}`] });
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

// Build

async function buildShot(entry) {
  const sharp = require(path.join(root, 'app', 'node_modules', 'sharp'));
  const source = path.join(root, entry.source);
  fs.mkdirSync(SHOTS_OUT, { recursive: true });
  const sizes = [[SHOT_WIDTH, entry.outputs[0]]];
  if (entry.outputs[1]) sizes.push([SHOT_WIDTH_SMALL, entry.outputs[1]]);
  for (const [width, out] of sizes) {
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
// The link preview: the name and the promise on the left, the library on the right. A bare
// screenshot said nothing about what the app is once shrunk to a chat thumbnail.
const SOCIAL = { width: 1200, height: 630, accent: '#6c91ff', text: '#e7edf6', muted: '#9bacc2' };
const SOCIAL_FONT = path.join(root, 'app', 'resources', 'font', 'Raleway', 'Raleway-Bold.ttf');

// Pango markup: one span per colour, so a block can mix them and still wrap as one paragraph.
function socialText(sharp, parts, size, width) {
  const markup = parts
    .map(([words, color]) => `<span foreground="${color}">${words.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`)
    .join('');
  return sharp({
    text: {
      text: markup,
      font: `Raleway Bold ${size}px`,
      fontfile: SOCIAL_FONT,
      width,
      rgba: true,
      spacing: Math.round(size * 0.08),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

async function buildSocial(entry) {
  const sharp = require(path.join(root, 'app', 'node_modules', 'sharp'));
  const out = path.join(root, entry.outputs[0]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { width, height, accent, text, muted } = SOCIAL;

  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      '<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#0c1322"/><stop offset="1" stop-color="#16223a"/></linearGradient>' +
      '<radialGradient id="g" cx="0.78" cy="0.35" r="0.6">' +
      `<stop offset="0" stop-color="${accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>` +
      '</radialGradient></defs>' +
      `<rect width="${width}" height="${height}" fill="url(#b)"/><rect width="${width}" height="${height}" fill="url(#g)"/></svg>`
  );

  // The mark is black on transparent; its alpha cuts an accent-coloured square into its shape.
  const markSize = 76;
  const markAlpha = await sharp(path.join(root, 'app', 'build', 'brandMark.png'))
    .resize(markSize, markSize)
    .extractChannel('alpha')
    .toBuffer();
  const mark = await sharp({ create: { width: markSize, height: markSize, channels: 3, background: accent } })
    .joinChannel(markAlpha)
    .png()
    .toBuffer();

  // The library runs off the right and bottom edges, so only its top-left corner is rounded.
  const shotLeft = 620;
  const shotTop = 96;
  const shotWidth = width - shotLeft;
  const shotHeight = height - shotTop;
  const radius = 18;
  const shot = await sharp(path.join(root, entry.source))
    .resize({ width: 900 })
    .extract({ left: 0, top: 0, width: shotWidth, height: shotHeight })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${shotWidth}" height="${shotHeight}">` +
            `<rect width="${shotWidth + radius}" height="${shotHeight + radius}" rx="${radius}" fill="#fff"/></svg>`
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  const title = await socialText(sharp, [['Achievement Watcher ', text], ['Next', accent]], 60, 500);
  const tagline = await socialText(sharp, [['Every achievement. One experience.', text]], 27, 520);
  const sources = await socialText(
    sharp,
    [['Steam, GOG, Epic, Ubisoft, EA, Xbox PC, emulators and RetroAchievements in one library, with a popup over the game at every unlock.', muted]],
    21,
    470
  );

  const left = 72;
  let top = 176;
  const layers = [{ input: mark, left, top: 72 }];
  for (const [part, gap] of [
    [title, 30],
    [tagline, 20],
    [sources, 0],
  ]) {
    layers.push({ input: part.data, left, top });
    top += part.info.height + gap;
  }
  layers.push({ input: shot, left: shotLeft, top: shotTop });

  await sharp(background).composite(layers).png({ compressionLevel: 9, quality: 90 }).toFile(out);
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

// Guide images

const DOCS = path.join(root, 'docs');

// How the guides carry a screenshot. The Markdown is also what GitHub shows when browsing the
// repository, so it stays plain HTML with the PNG as the fallback; the <picture> only adds the webp
// files and the dimensions a browser needs to reserve the space before the image arrives.
const IMG_RE = /(?:<picture>\s*<source[^>]*>\s*)?<img src="screenshot\/([a-z0-9-]+)\.png"([^>]*)>(?:\s*<\/picture>)?/g;

function pictureFor(entry, attributes, index) {
  const alt = /\balt="([^"]*)"/.exec(attributes);
  const wanted = /\bwidth="(\d+)"/.exec(attributes);
  const shown = Math.min(wanted ? Number(wanted[1]) : entry.width, entry.width);
  const height = Math.round((shown * entry.height) / entry.width);
  const fullWidth = Math.min(entry.width, SHOT_WIDTH);
  const srcset =
    entry.outputs.length > 1
      ? `assets/shot/${entry.stem}-800.webp ${SHOT_WIDTH_SMALL}w, assets/shot/${entry.stem}.webp ${fullWidth}w`
      : `assets/shot/${entry.stem}.webp ${fullWidth}w`;
  const lazy = index > 0 ? ' loading="lazy" decoding="async"' : '';
  return (
    `<picture><source srcset="${srcset}" sizes="(max-width: 700px) 100vw, ${shown}px">` +
    `<img src="screenshot/${entry.stem}.png" width="${shown}" height="${height}" alt="${alt ? alt[1] : ''}"${lazy}></picture>`
  );
}

// The guide as it should be written, or the problem with it.
function guideText(file, entries) {
  const text = fs.readFileSync(file, 'utf8');
  const problems = [];
  let index = 0;
  const next = text.replace(IMG_RE, (whole, stem, attributes) => {
    const entry = entries.find((candidate) => candidate.kind === 'shot' && candidate.stem === stem);
    if (!entry) {
      problems.push(`${path.relative(root, file)} shows screenshot/${stem}.png, which does not exist`);
      return whole;
    }
    return pictureFor(entry, attributes.replace(/\bheight="\d+"\s*/, '').replace(/\s*loading="[^"]*"|\s*decoding="[^"]*"/g, ''), index++);
  });
  return { text, next, problems };
}

function guideFiles() {
  return fs
    .readdirSync(DOCS)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(DOCS, name));
}

function syncGuides(entries, { write }) {
  const problems = [];
  for (const file of guideFiles()) {
    const result = guideText(file, entries);
    problems.push(...result.problems);
    if (result.next === result.text) continue;
    if (write) fs.writeFileSync(file, result.next, 'utf8');
    else problems.push(`${path.relative(root, file)} carries screenshots without their webp and dimensions`);
  }
  return problems;
}

function copyAnimation(entry) {
  const target = path.join(root, entry.outputs[0]);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, entry.source), target);
}

async function build(entries) {
  // A preset removed upstream must not keep being served, so the generated folders are rebuilt
  // from nothing rather than merged into.
  fs.rmSync(PRESETS_OUT, { recursive: true, force: true });
  fs.rmSync(SHOTS_OUT, { recursive: true, force: true });

  for (const entry of entries) {
    if (entry.kind === 'shot') await buildShot(entry);
    else if (entry.kind === 'animation') copyAnimation(entry);
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

  const guideProblems = syncGuides(entries, { write: true });
  if (guideProblems.length) throw new Error(guideProblems.join('\n'));

  const presets = [...new Set(entries.filter((e) => e.kind === 'preset').map((e) => e.slug))];
  const shots = entries.filter((e) => e.kind === 'shot').length;
  console.log(`site assets: ${shots} screenshots, ${presets.length} presets`);
}

// Check

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

  problems.push(...syncGuides(entries, { write: false }));
  return problems;
}

// Entry point

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
