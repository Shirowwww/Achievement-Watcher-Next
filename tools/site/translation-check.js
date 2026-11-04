'use strict';

/*
  Checks a translated copy of the guides against the English ones, so a translator (or a reviewer)
  learns what is missing without reading both side by side.

    node tools/site/translation-check.js            every language
    node tools/site/translation-check.js fr de      only these

  A translation keeps the English structure exactly: same headings (each carrying the English
  heading's address as an explicit {#id}, so links and search results still land on it), same code
  blocks, tables, list items, tags, images and link targets. Only the prose changes. Relative links
  gain one "../" because the copy sits one folder down. test/site/translations.test.js runs this.
*/

const fs = require('node:fs');
const path = require('node:path');

const site = require('./languages.js');
const { explicitId, headingId, plain } = require('./search-index.js');
const yaml = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'js-yaml'));

const DOCS = site.DOCS;
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
// Japanese and Chinese say in few characters what other languages need a sentence for.
const COMPACT = new Set(['ja', 'zh-cn']);

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
}

function splitFrontMatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source.replace(/\r\n/g, '\n'));
  if (!match) return { data: null, body: source.replace(/\r\n/g, '\n') };
  return { data: yaml.load(match[1]) || {}, body: source.replace(/\r\n/g, '\n').slice(match[0].length) };
}

// The lines outside code fences, with their heading level when they are one.
function outline(body) {
  const lines = [];
  let fenced = false;
  let fences = 0;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      if (fenced) fences += 1;
      continue;
    }
    if (fenced) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    lines.push({ text: line, level: heading ? heading[1].length : 0, heading: heading ? heading[2] : null });
  }
  return { lines, fences };
}

function counts(body) {
  const { lines, fences } = outline(body);
  const prose = lines.map((line) => line.text);
  const tags = {};
  for (const [, name] of prose.join('\n').matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b/g)) tags[name.toLowerCase()] = (tags[name.toLowerCase()] || 0) + 1;
  return {
    fences,
    tableRows: prose.filter((line) => /^\s*\|/.test(line)).length,
    listItems: prose.filter((line) => /^\s*(?:[-*+]|\d+\.)\s/.test(line)).length,
    headings: lines.filter((line) => line.level).map((line) => line.level).join(''),
    tags: JSON.stringify(Object.entries(tags).sort()),
  };
}

// Every link and image target outside code, in document order.
function targets(body) {
  const { lines } = outline(body);
  const text = lines.map((line) => line.text).join('\n');
  const found = [];
  for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\b(?:href|src)="([^"]+)"/g)) found.push(match[1] || match[2]);
  return found;
}

const isRelative = (target) => !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target);

// The target a link should have in the copy, given the English one.
function expectedTarget(target) {
  if (!isRelative(target)) return target;
  const [file, hash] = target.split('#');
  const stem = file.replace(/\.md$/, '');
  const translated = file.endsWith('.md') && site.translatedGuides().includes(stem);
  return `${translated ? '' : '../'}${file}${hash === undefined ? '' : `#${hash}`}`;
}

// The explicit ids the copy must give its headings: the ones the English headings get from kramdown.
function englishIds(body) {
  const seen = new Map();
  return outline(body)
    .lines.filter((line) => line.level)
    .map((line) => (line.level >= 2 ? headingId(plain(line.heading, { inline: true }), seen) : null));
}

function checkGuide(lang, stem) {
  const found = [];
  const name = `docs/${lang}/${stem}.md`;
  const file = path.join(DOCS, lang, `${stem}.md`);
  const englishFile = path.join(DOCS, `${stem}.md`);
  if (!fs.existsSync(file)) return [`${name} is missing`];

  const raw = read(file);
  if (raw.includes('\r')) found.push(`${name} has CR bytes; the repository is LF only`);
  if (!raw.endsWith('\n')) found.push(`${name} does not end with a newline`);
  if (DASH.test(raw)) found.push(`${name} has an em or en dash; use a hyphen or rephrase`);

  const { data, body } = splitFrontMatter(raw);
  const english = splitFrontMatter(read(englishFile)).body;
  if (!data) return [...found, `${name} has no front matter (title and description)`];

  const compact = COMPACT.has(lang);
  if (typeof data.title !== 'string' || data.title.length < 3 || data.title.length > 90) found.push(`${name}: front matter needs a title of 3 to 90 characters`);
  const description = typeof data.description === 'string' ? data.description : '';
  if (description.length < (compact ? 20 : 60) || description.length > 200) found.push(`${name}: the description must be ${compact ? 20 : 60} to 200 characters (it is ${description.length})`);

  const want = counts(english);
  const got = counts(body);
  for (const key of Object.keys(want)) {
    if (want[key] !== got[key]) found.push(`${name}: ${key} differ from the English (english ${want[key]}, copy ${got[key]})`);
  }

  // Headings: level 2 and up carry the English id.
  const ids = englishIds(english);
  const copyHeadings = outline(body).lines.filter((line) => line.level);
  if (copyHeadings.length === ids.length) {
    copyHeadings.forEach((heading, index) => {
      if (ids[index] === null) return;
      const explicit = explicitId(heading.heading).id;
      if (explicit !== ids[index]) found.push(`${name}: heading "${heading.heading.slice(0, 50)}" must end with {#${ids[index]}} (has ${explicit ? `{#${explicit}}` : 'none'})`);
    });
  }

  // Links: same targets in the same order, relative ones one folder deeper, all of them real.
  const wantedTargets = targets(english).map(expectedTarget);
  const gotTargets = targets(body);
  if (wantedTargets.join('\n') !== gotTargets.join('\n')) {
    const missing = wantedTargets.filter((target) => !gotTargets.includes(target));
    const extra = gotTargets.filter((target) => !wantedTargets.includes(target));
    found.push(`${name}: link targets differ from the English${missing.length ? `; missing ${missing.slice(0, 3).join(', ')}` : ''}${extra.length ? `; unexpected ${extra.slice(0, 3).join(', ')}` : ''}`);
  }
  for (const target of gotTargets.filter(isRelative)) {
    const resolved = path.join(DOCS, lang, target.split('#')[0]);
    if (target.split('#')[0] && !fs.existsSync(resolved)) found.push(`${name}: ${target} points at nothing`);
  }

  // A copy that kept the English prose is not a translation.
  const prose = (text) =>
    outline(text)
      .lines.filter((line) => !line.level && !/^\s*[|<]/.test(line.text) && line.text.trim().length > 50 && line.text.includes(' '))
      .map((line) => line.text.trim());
  const englishProse = prose(english);
  const copyProse = new Set(prose(body));
  const kept = englishProse.filter((line) => copyProse.has(line)).length;
  if (englishProse.length >= 5 && kept / englishProse.length > 0.2) found.push(`${name}: ${kept} of ${englishProse.length} English paragraphs are still in English`);

  // Cut short or padded.
  const ratio = Buffer.byteLength(body) / Math.max(1, Buffer.byteLength(english));
  if (ratio < (compact ? 0.25 : 0.45) || ratio > 2.6) found.push(`${name}: its length is ${Math.round(ratio * 100)}% of the English, so something was dropped or repeated`);
  return found;
}

function problems(lang) {
  const found = site.translatedGuides().flatMap((stem) => checkGuide(lang, stem));
  const folder = path.join(DOCS, lang);
  if (fs.existsSync(folder)) {
    const wanted = new Set(site.translatedGuides().map((stem) => `${stem}.md`));
    for (const name of fs.readdirSync(folder)) if (!wanted.has(name)) found.push(`docs/${lang}/${name} is not a translated guide`);
  }
  const titles = site.translatedGuides().map((stem) => {
    const file = path.join(DOCS, lang, `${stem}.md`);
    return fs.existsSync(file) ? (splitFrontMatter(read(file)).data || {}).description : null;
  });
  const seen = titles.filter(Boolean);
  if (new Set(seen).size !== seen.length) found.push(`docs/${lang}/: two guides share a description`);
  return found;
}

if (require.main === module) {
  const wanted = process.argv.slice(2);
  const codes = wanted.length ? wanted : site.languages();
  let failed = false;
  for (const lang of codes) {
    const found = problems(lang);
    for (const line of found) console.error(line);
    console.log(`${lang}: ${found.length ? `${found.length} problem(s)` : 'ok'}`);
    if (found.length) failed = true;
  }
  if (failed) process.exitCode = 1;
}

module.exports = { checkGuide, expectedTarget, problems, splitFrontMatter };
