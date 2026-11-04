'use strict';

/*
  The release notes the update window shows, in every bundled language.

  RELEASE_NOTES.md is the English body of the GitHub release. This turns it into blocks (the same
  { kind, text } list the update window draws) and keeps them in docs/data/notes/english.json, the
  source the translators work from. docs/data/notes/<locale>.json holds the same versions in one
  language, <locale> being the app locale id (french, schinese, ...). The app fetches the file of its
  language from the site when an update is offered (app/util/localizedNotes.js) and falls back to the
  English GitHub body for any version a file lacks.

    node tools/site/release-notes.js            add the current RELEASE_NOTES.md to english.json
    node tools/site/release-notes.js --check    report what is stale or untranslated

  Only the latest KEEP versions are kept: an update offer lists the releases between the installed
  version and the new one, and nobody is that far behind.
*/

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const SOURCE = path.join(root, 'RELEASE_NOTES.md');
const NOTES = path.join(root, 'docs', 'data', 'notes');
const LOCALES = path.join(root, 'app', 'locale', 'lang');
const semver = require(path.join(root, 'app', 'node_modules', 'semver'));
const { markdownNoteBlocks } = require(path.join(root, 'app', 'util', 'releaseNotes.js'));

const KEEP = 10;

function targetLocales() {
  return fs
    .readdirSync(LOCALES)
    .filter((name) => name.endsWith('.json') && name !== 'english.json')
    .map((name) => name.slice(0, -5))
    .sort();
}

function readNotes(locale) {
  const file = path.join(NOTES, `${locale}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

function writeNotes(locale, data) {
  const ordered = {};
  for (const version of Object.keys(data).sort(semver.rcompare).slice(0, KEEP)) ordered[version] = data[version];
  fs.mkdirSync(NOTES, { recursive: true });
  fs.writeFileSync(path.join(NOTES, `${locale}.json`), `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}

// The version and blocks of the current RELEASE_NOTES.md.
function currentRelease() {
  const text = fs.readFileSync(SOURCE, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const heading = /^#\s+Achievement Watcher Next (\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\s*$/m.exec(text);
  if (!heading) throw new Error('RELEASE_NOTES.md does not open with "# Achievement Watcher Next <version>"');
  return { version: heading[1], blocks: markdownNoteBlocks(text) };
}

const shape = (blocks) => blocks.map((block) => block.kind).join(',');

// What is wrong with the notes files; an empty list means every language has every kept version.
function problems() {
  const found = [];
  const { version, blocks } = currentRelease();
  const english = readNotes('english');
  if (JSON.stringify(english[version]) !== JSON.stringify(blocks)) {
    found.push(`english.json does not hold the current RELEASE_NOTES.md (${version}). Run: node tools/site/release-notes.js`);
  }
  for (const locale of targetLocales()) {
    const notes = readNotes(locale);
    for (const [id, source] of Object.entries(english)) {
      const translated = notes[id];
      if (!Array.isArray(translated)) found.push(`${locale}.json has no ${id}`);
      else if (shape(translated) !== shape(source)) found.push(`${locale}.json ${id}: blocks do not follow english.json (${translated.length} against ${source.length})`);
      else if (translated.some((block) => typeof block.text !== 'string' || !block.text.trim())) found.push(`${locale}.json ${id}: an empty text`);
    }
    for (const id of Object.keys(notes)) if (!english[id]) found.push(`${locale}.json has ${id}, which english.json no longer keeps`);
  }
  return found;
}

function run({ check = false } = {}) {
  if (check) {
    const found = problems();
    for (const line of found) console.error(line);
    if (found.length) process.exitCode = 1;
    else console.log(`release notes: current (${targetLocales().length} languages)`);
    return !found.length;
  }
  const { version, blocks } = currentRelease();
  const english = readNotes('english');
  english[version] = blocks;
  writeNotes('english', english);
  const kept = new Set(Object.keys(readNotes('english')));
  // A language loses the versions english.json dropped; the new one waits for its translation.
  for (const locale of targetLocales()) {
    const notes = readNotes(locale);
    if (Object.keys(notes).length || fs.existsSync(path.join(NOTES, `${locale}.json`))) {
      writeNotes(locale, Object.fromEntries(Object.entries(notes).filter(([id]) => kept.has(id))));
    }
  }
  console.log(`release notes: ${version} written to english.json (${blocks.length} blocks); translate it into the other languages`);
  return true;
}

if (require.main === module) run({ check: process.argv.includes('--check') });

module.exports = { NOTES, currentRelease, problems, readNotes, run, targetLocales };
