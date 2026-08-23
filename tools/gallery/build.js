'use strict';

/*
  The preset gallery: two files per preset, and a listing built from them.

    docs/gallery/community/<name>.awpreset    the file the app exports
    docs/gallery/community/<name>.png         a picture of the popup (webp and jpg work too)
    docs/gallery/community/<name>.json        optional: { "by", "summary", "link" }

  Everything else - the preset's name, its description, its version, its tags, the AW Next version
  it needs, the date - is read from the package itself, because the app already wrote it there.
  There is nothing to fill in and nothing to keep in step.

  The package is validated by app/util/presetPackage.js, the same reader that runs on Import, so a
  file listed here cannot be refused by the app. What this adds is what a public listing needs: a
  name that can be a URL, a size a page can serve, and a preview that is really an image.

    node tools/gallery/build.js            write docs/gallery/index.json
    node tools/gallery/build.js --check    validate without writing (what a pull request runs)
    node tools/gallery/build.js --report   print what is inside each package, for review

  Nothing here unpacks, renders or runs a preset.
*/

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const COMMUNITY = path.join(root, 'docs', 'gallery', 'community');
const INDEX = path.join(root, 'docs', 'gallery', 'index.json');

const { readPackage } = require(path.join(root, 'app', 'util', 'presetPackage.js'));
const appVersion = require(path.join(root, 'app', 'package.json')).version;

// 2 to 48 characters, and it may not end on a dash: this is a file name and a URL.
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/;
const PREVIEW_EXT = ['.png', '.webp', '.jpg', '.jpeg'];

// Gallery limits, well under what the app accepts on a manual import: a file somebody chose to open
// is not the same as one served to everybody from a page.
const LIMITS = {
  packageBytes: 4 * 1024 * 1024,
  previewBytes: 500 * 1024,
  notesBytes: 4 * 1024,
  previewMin: { width: 320, height: 90 },
  previewMax: { width: 2400, height: 1600 },
  summary: 200,
  by: 60,
};

// Bumped only if the shape of index.json changes in a way the page has to know about.
const INDEX_FORMAT = 2;

// Helpers

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/*
  The type and size of an image, from its own bytes. The extension is a claim; this is the fact.
*/
function imageInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
    return { type: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    const chunk = buffer.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8 ' && buffer.length > 30) {
      return { type: 'webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L' && buffer.length > 25) {
      const bits = buffer.readUInt32LE(21);
      return { type: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X' && buffer.length > 30) {
      return {
        type: 'webp',
        width: 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)),
        height: 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)),
      };
    }
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { type: 'jpeg', height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    return null;
  }

  return null;
}

/*
  Who to credit when nobody said. The app's export writes no author - it never asks for one - so the
  name on the card is the person who committed the file, which is exactly who submitted it. An
  optional <name>.json overrides it for anyone who wants to be credited differently.
*/
function committer(file) {
  try {
    const log = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%an', '--', file], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return clean(log.trim().split('\n').filter(Boolean).pop(), LIMITS.by);
  } catch {
    return '';
  }
}

// One preset

function validate(name, files) {
  const problems = [];
  const packageFile = path.join(COMMUNITY, `${name}.awpreset`);

  if (!NAME_RE.test(name)) {
    problems.push(`"${name}": a preset file is named in lower case letters, digits and dashes, 2 to 48 characters`);
    return { problems };
  }

  const preview = PREVIEW_EXT.map((extension) => `${name}${extension}`).find((candidate) => files.has(candidate));
  if (!preview) {
    problems.push(`${name}.awpreset has no picture beside it: add ${name}.png (or .webp, .jpg)`);
    return { problems };
  }

  const packageBytes = fs.statSync(packageFile).size;
  if (packageBytes > LIMITS.packageBytes) {
    problems.push(`${name}.awpreset is ${Math.round(packageBytes / 1024)} KB; the gallery limit is ${LIMITS.packageBytes / 1024 / 1024} MB`);
  }

  const previewBuffer = fs.readFileSync(path.join(COMMUNITY, preview));
  const image = imageInfo(previewBuffer);
  if (!image) {
    problems.push(`${preview} is not a PNG, WebP or JPEG image`);
  } else {
    const claimed = path.extname(preview).slice(1).toLowerCase().replace('jpg', 'jpeg');
    if (claimed !== image.type) problems.push(`${preview} is really a ${image.type} file`);
    if (previewBuffer.length > LIMITS.previewBytes) {
      problems.push(`${preview} is ${Math.round(previewBuffer.length / 1024)} KB; the limit is ${LIMITS.previewBytes / 1024} KB`);
    }
    if (image.width < LIMITS.previewMin.width || image.height < LIMITS.previewMin.height) {
      problems.push(`${preview} is ${image.width}x${image.height}; at least ${LIMITS.previewMin.width}x${LIMITS.previewMin.height} is needed to read the popup`);
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

  const read = readPackage(packageFile, { appVersion });
  if (!read.ok) {
    const detail = read.requires ? ` (it needs AW Next ${read.requires})` : '';
    problems.push(`${name}.awpreset was refused by the app's own reader: ${read.error}${detail}`);
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
      by: clean(notes.by || manifest.author, LIMITS.by) || committer(`docs/gallery/community/${name}.awpreset`),
      link: notes.link || '',
      version: manifest.version,
      tags: manifest.tags,
      added: (manifest.createdAt || '').slice(0, 10),
      minAppVersion: (manifest.app && manifest.app.minVersion) || '',
      editable: Boolean(manifest.options),
      sound: manifest.sound || '',
      preview: { file: `community/${preview}`, width: image.width, height: image.height },
      file: {
        path: `community/${name}.awpreset`,
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
    if (!entry.isFile()) problems.push(`docs/gallery/community/${entry.name} is a folder; the gallery is a flat list of files`);
  }

  // Anything that is not a package, its picture or its notes has no business being served.
  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    const stem = path.basename(file, path.extname(file));
    const known = extension === '.awpreset' || PREVIEW_EXT.includes(extension) || extension === '.json';
    if (!known) {
      problems.push(`docs/gallery/community/${file} is not part of the gallery (a preset is <name>.awpreset plus a picture)`);
      continue;
    }
    if (extension !== '.awpreset' && !files.has(`${stem}.awpreset`)) {
      problems.push(`docs/gallery/community/${file} has no ${stem}.awpreset beside it`);
    }
  }

  for (const file of [...files].sort()) {
    if (path.extname(file) !== '.awpreset') continue;
    const result = validate(path.basename(file, '.awpreset'), files);
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
      note: 'Generated by tools/gallery/build.js from docs/gallery/community/. Do not edit by hand.',
      format: INDEX_FORMAT,
      count: records.length,
      presets: records,
    },
    null,
    2
  )}\n`;
}

// Review sheet

// A package is a zip, so a diff shows it as a binary blob. This prints what is inside one.
function report(records) {
  const AdmZip = require(path.join(root, 'app', 'node_modules', 'adm-zip'));
  const only = (process.argv.find((arg) => arg.startsWith('--only=')) || '').slice('--only='.length).split(',').filter(Boolean);
  const wanted = records.filter((record) => !only.length || only.includes(record.slug));

  const lines = ['## Preset gallery review', ''];
  if (!wanted.length) {
    console.log(`${lines.join('\n')}\nNo preset submission in this change.`);
    return;
  }

  lines.push('| Preset | By | Version | Package | Preview |', '| --- | --- | --- | ---: | --- |');
  for (const record of wanted) {
    lines.push(
      `| ${record.name} | ${record.by || 'not stated'} | ${record.version} | ${Math.round(record.file.bytes / 1024)} KB | ${record.preview.width}x${record.preview.height} |`
    );
  }
  lines.push('', 'The markup below is what the app would render, in its sandboxed notification window.', '');

  for (const record of wanted) {
    lines.push(`### ${record.slug}`, '');
    for (const entry of new AdmZip(path.join(COMMUNITY, `${record.slug}.awpreset`)).getEntries()) {
      if (entry.isDirectory) continue;
      const text = /\.(?:html|css|json)$/i.test(entry.entryName) ? entry.getData().toString('utf8') : null;
      if (!text) {
        lines.push(`- \`${entry.entryName}\` (${entry.header.size} bytes)`);
        continue;
      }
      lines.push(`<details><summary><code>${entry.entryName}</code></summary>`, '', '```' + (entry.entryName.endsWith('.css') ? 'css' : 'html'));
      lines.push(text.length > 16000 ? `${text.slice(0, 16000)}\n... truncated` : text);
      lines.push('```', '', '</details>', '');
    }
    lines.push(`Checksum: \`${record.file.sha256}\``, '');
  }

  console.log(lines.join('\n'));
}

// Entry point

function main() {
  const { records, problems } = collect();

  if (problems.length) {
    console.error('The preset gallery has submissions that cannot be listed:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nWhat a submission is: docs/preset-gallery.md');
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
    console.log(`preset gallery: ${records.length} preset${plural} validate`);
    return;
  }

  fs.mkdirSync(path.dirname(INDEX), { recursive: true });
  const current = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';
  if (current !== document) fs.writeFileSync(INDEX, document, 'utf8');
  console.log(`preset gallery: ${records.length} preset${plural} indexed${current === document ? ' (unchanged)' : ''}`);
}

if (require.main === module) main();

module.exports = { LIMITS, NAME_RE, INDEX_FORMAT, clean, collect, imageInfo, serialize, validate };
