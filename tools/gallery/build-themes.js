'use strict';

/*
  The theme gallery: two files per theme, and a listing built from them.

    docs/gallery/themes/community/<name>.awtheme   the file the app exports
    docs/gallery/themes/community/<name>.jpg       the picture, rendered from the theme itself
    docs/gallery/themes/community/<name>.json      optional: { "by", "summary", "link" }

  Everything else - the theme's name, its description, its version, its tags, the AW Next version
  it needs, the palette, how many images it carries - is read out of the package, because the app
  already wrote it there. There is nothing to fill in and nothing to keep in step.

  The picture is not a screenshot somebody took: it is what
  `node tools/gallery/render-theme-preview.js <file>.awtheme <file>.jpg` produces, the app's own
  sample interface painted with the theme. This validates that the committed picture really is a
  JPEG of the right size; the gallery server renders its own and never needs one committed.

    node tools/gallery/build-themes.js            write docs/gallery/themes/index.json
    node tools/gallery/build-themes.js --check    validate without writing (what CI runs)
    node tools/gallery/build-themes.js --report   print what is inside each package, for review

  Nothing here unpacks, renders or runs a theme.
*/

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const COMMUNITY = path.join(root, 'docs', 'gallery', 'themes', 'community');
const INDEX = path.join(root, 'docs', 'gallery', 'themes', 'index.json');

const { readThemePackage } = require(path.join(root, 'app', 'util', 'themePackage.js'));
const { imageInfo } = require(path.join(root, 'app', 'util', 'imageSize.js'));
const { clean, NAME_RE, INDEX_FORMAT } = require(path.join(__dirname, 'build.js'));
const appVersion = require(path.join(root, 'app', 'package.json')).version;

const PREVIEW_EXT = ['.jpg', '.jpeg', '.webp', '.png'];

// Gallery limits, well under what the app accepts on a manual import: a file somebody chose to open
// is not the same as one served to everybody from a page.
const LIMITS = {
  packageBytes: 8 * 1024 * 1024,
  previewBytes: 900 * 1024,
  notesBytes: 4 * 1024,
  previewMin: { width: 640, height: 400 },
  previewMax: { width: 2400, height: 1600 },
  summary: 200,
  by: 60,
};

// One theme

function validate(name, files) {
  const problems = [];
  const packageFile = path.join(COMMUNITY, `${name}.awtheme`);

  if (!NAME_RE.test(name)) {
    problems.push(`"${name}": a theme file is named in lower case letters, digits and dashes, 2 to 48 characters`);
    return { problems };
  }

  const preview = PREVIEW_EXT.map((extension) => `${name}${extension}`).find((candidate) => files.has(candidate));
  if (!preview) {
    problems.push(`${name}.awtheme has no picture beside it: run tools/gallery/render-theme-preview.js to make ${name}.jpg`);
    return { problems };
  }

  const packageBytes = fs.statSync(packageFile).size;
  if (packageBytes > LIMITS.packageBytes) {
    problems.push(`${name}.awtheme is ${Math.round(packageBytes / 1024)} KB; the gallery limit is ${LIMITS.packageBytes / 1024 / 1024} MB`);
  }

  const previewBuffer = fs.readFileSync(path.join(COMMUNITY, preview));
  const image = imageInfo(previewBuffer);
  if (!image) {
    problems.push(`${preview} is not a JPEG, WebP or PNG image`);
  } else {
    const claimed = path.extname(preview).slice(1).toLowerCase().replace('jpg', 'jpeg');
    if (claimed !== image.type) problems.push(`${preview} is really a ${image.type} file`);
    if (previewBuffer.length > LIMITS.previewBytes) {
      problems.push(`${preview} is ${Math.round(previewBuffer.length / 1024)} KB; the limit is ${LIMITS.previewBytes / 1024} KB`);
    }
    if (image.width < LIMITS.previewMin.width || image.height < LIMITS.previewMin.height) {
      problems.push(`${preview} is ${image.width}x${image.height}; at least ${LIMITS.previewMin.width}x${LIMITS.previewMin.height} is needed to read the window`);
    }
    if (image.width > LIMITS.previewMax.width || image.height > LIMITS.previewMax.height) {
      problems.push(`${preview} is ${image.width}x${image.height}; the limit is ${LIMITS.previewMax.width}x${LIMITS.previewMax.height}`);
    }
  }

  // Optional, and every field in it is optional too.
  let notes = {};
  const notesFile = path.join(COMMUNITY, `${name}.json`);
  if (files.has(`${name}.json`)) {
    if (fs.statSync(notesFile).size > LIMITS.notesBytes) problems.push(`${name}.json is larger than a few lines of text`);
    try {
      notes = JSON.parse(fs.readFileSync(notesFile, 'utf8'));
      if (!notes || typeof notes !== 'object' || Array.isArray(notes)) throw new Error('not an object');
      for (const key of Object.keys(notes)) {
        if (!['by', 'summary', 'link'].includes(key)) problems.push(`${name}.json: "${key}" is not one of by, summary, link`);
      }
      if (notes.link && !/^https:\/\/\S+$/.test(notes.link)) problems.push(`${name}.json: link must be an https address`);
    } catch (err) {
      problems.push(`${name}.json is not valid JSON: ${err.message}`);
      notes = {};
    }
  }

  const read = readThemePackage(packageFile, { appVersion });
  if (!read.ok) {
    const detail = read.requires ? ` (it needs AW Next ${read.requires})` : '';
    problems.push(`${name}.awtheme was refused by the app's own reader: ${read.error}${detail}`);
    return { problems };
  }
  if (problems.length) return { problems };

  const manifest = read.manifest;
  return {
    problems: [],
    record: {
      slug: name,
      name: manifest.name,
      summary: clean(notes.summary || manifest.description, LIMITS.summary),
      by: clean(notes.by || manifest.author, LIMITS.by),
      link: notes.link || '',
      version: manifest.version,
      tags: manifest.tags,
      added: (manifest.createdAt || '').slice(0, 10),
      minAppVersion: (manifest.app && manifest.app.minVersion) || '',
      base: manifest.base || '',
      images: manifest.assets.length,
      accent: read.theme.accent.color,
      swatches: ['bg', 'header', 'panel', 'card', 'accent'].map((id) => read.theme[id].color),
      preview: { file: `community/${preview}`, width: image.width, height: image.height },
      file: {
        path: `community/${name}.awtheme`,
        bytes: packageBytes,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(packageFile)).digest('hex'),
      },
    },
  };
}

// The whole folder

function collect() {
  const problems = [];
  const records = [];
  if (!fs.existsSync(COMMUNITY)) return { records, problems };

  const entries = fs.readdirSync(COMMUNITY, { withFileTypes: true });
  const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));

  for (const entry of entries) {
    if (!entry.isFile()) problems.push(`docs/gallery/themes/community/${entry.name} is a folder; the gallery is a flat list of files`);
  }

  // Anything that is not a package, its picture or its notes has no business being served.
  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    const stem = path.basename(file, path.extname(file));
    const known = extension === '.awtheme' || PREVIEW_EXT.includes(extension) || extension === '.json';
    if (!known) {
      problems.push(`docs/gallery/themes/community/${file} is not part of the gallery (a theme is <name>.awtheme plus a picture)`);
      continue;
    }
    if (extension !== '.awtheme' && !files.has(`${stem}.awtheme`)) {
      problems.push(`docs/gallery/themes/community/${file} has no ${stem}.awtheme beside it`);
    }
  }

  for (const file of [...files].sort()) {
    if (path.extname(file) !== '.awtheme') continue;
    const result = validate(path.basename(file, '.awtheme'), files);
    if (result.record) records.push(result.record);
    problems.push(...result.problems);
  }

  // Newest first, then by name, so the order is stable between builds.
  records.sort((a, b) => (a.added === b.added ? a.name.localeCompare(b.name, 'en') : b.added.localeCompare(a.added)));

  const names = new Map();
  for (const record of records) {
    const key = record.name.toLowerCase();
    if (names.has(key)) problems.push(`${record.slug} and ${names.get(key)} both install as "${record.name}"; one has to be renamed`);
    names.set(key, record.slug);
  }

  return { records, problems };
}

function serialize(records) {
  return `${JSON.stringify(
    {
      note: 'Generated by tools/gallery/build-themes.js from docs/gallery/themes/community/. Do not edit by hand.',
      format: INDEX_FORMAT,
      count: records.length,
      themes: records,
    },
    null,
    2
  )}\n`;
}

// Review sheet

/*
  A package is a zip, so a diff shows it as a binary blob. This prints what is inside one -
  which for a theme is the whole thing, since a theme is a small JSON document and some pictures.
*/
function report(records) {
  const only = (process.argv.find((arg) => arg.startsWith('--only=')) || '').slice('--only='.length).split(',').filter(Boolean);
  const wanted = records.filter((record) => !only.length || only.includes(record.slug));

  const lines = ['## Theme gallery review', ''];
  if (!wanted.length) {
    console.log(`${lines.join('\n')}\nNo theme submission in this change.`);
    return;
  }

  lines.push('| Theme | By | Version | Package | Images | Accent |', '| --- | --- | --- | ---: | ---: | --- |');
  for (const record of wanted) {
    lines.push(
      `| ${record.name} | ${record.by || 'not stated'} | ${record.version} | ${Math.round(record.file.bytes / 1024)} KB | ${record.images} | \`${record.accent}\` |`
    );
  }
  lines.push('', 'A theme carries no markup, no stylesheet and no script: the app builds its CSS from these values.', '');

  for (const record of wanted) {
    const read = readThemePackage(path.join(COMMUNITY, `${record.slug}.awtheme`), { appVersion });
    lines.push(`### ${record.slug}`, '');
    if (!read.ok) {
      lines.push(`The package could not be read: ${read.error}`, '');
      continue;
    }
    lines.push('<details><summary><code>theme.json</code></summary>', '', '```json', JSON.stringify(read.theme, null, 2), '```', '', '</details>', '');
    for (const asset of read.assets) {
      lines.push(`- \`assets/${asset.name}\` (${asset.info.type}, ${asset.info.width}x${asset.info.height}, ${asset.data.length} bytes)`);
    }
    lines.push('', `Checksum: \`${record.file.sha256}\``, '');
  }

  console.log(lines.join('\n'));
}

// Entry point

function main() {
  const { records, problems } = collect();

  if (problems.length) {
    console.error('The theme gallery has submissions that cannot be listed:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nWhat a submission is: docs/community-galleries.md');
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--report')) {
    report(records);
    return;
  }

  const document = serialize(records);
  const plural = records.length === 1 ? '' : 's';

  if (process.argv.includes('--check')) {
    console.log(`theme gallery: ${records.length} theme${plural} validate`);
    return;
  }

  fs.mkdirSync(path.dirname(INDEX), { recursive: true });
  const current = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';
  if (current !== document) fs.writeFileSync(INDEX, document, 'utf8');
  console.log(`theme gallery: ${records.length} theme${plural} indexed${current === document ? ' (unchanged)' : ''}`);
}

if (require.main === module) main();

module.exports = { LIMITS, collect, serialize, validate };
