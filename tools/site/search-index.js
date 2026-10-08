'use strict';

/*
  Writes docs/data/search.json: the guides cut into sections, for the search box beside them.

  Each ## and ### heading starts a section, and its anchor is the id Jekyll gives that heading
  (kramdown's GFM rule), so a result lands on the heading itself. GitHub Pages builds the site
  without plugins of our own, which is why the index is generated here and committed.

    node tools/site/search-index.js
    node tools/site/search-index.js --check
*/

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const DOCS = path.join(root, 'docs');
const OUT = path.join(DOCS, 'data', 'search.json');
const yaml = require(path.join(root, 'app', 'node_modules', 'js-yaml'));

// Enough of a section to match on and to quote from; the changelog is long and only needs its
// version headings and a start.
const TEXT_LIMIT = 900;
const CHANGELOG_TEXT_LIMIT = 300;

const TAGS = new Set('a b br code dd details div dl dt em i img kbd li ol p picture source span strong sub summary sup table tbody td th thead tr ul'.split(' '));

// Comments and real HTML tags out, in one left-to-right pass, so nothing removed can join two halves
// into a new tag. Anything else in angle brackets, such as the <version> placeholders, is text.
function stripMarkup(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('<', i);
    if (open === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, open);
    if (text.startsWith('<!--', open)) {
      const close = text.indexOf('-->', open + 4);
      out += ' ';
      i = close === -1 ? text.length : close + 3;
      continue;
    }
    const close = text.indexOf('>', open + 1);
    const name = close === -1 ? '' : text.slice(open + 1, close).replace(/^\//, '').split(/[\s/]/)[0].toLowerCase();
    if (TAGS.has(name)) {
      out += ' ';
      i = close + 1;
    } else {
      out += '<';
      i = open + 1;
    }
  }
  return out;
}

// What a reader sees of a Markdown run: link text without the address, no emphasis, no code ticks.
// A heading is one inline run, so list and quote markers are only stripped from a body.
function plain(markdown, { inline = false } = {}) {
  let text = inline ? markdown : markdown.replace(/^\s*(?:[-*+]|\d+\.|>|\|)\s*/gm, '');
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  return stripMarkup(text)
    .replace(/\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/g, '')
    .replace(/\|/g, ' ')
    .replace(/[*_`]+/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// kramdown-parser-gfm: lower case, drop everything but word characters, dashes and spaces, spaces
// become dashes, and a repeated id gets -1, -2.
function headingId(text, seen) {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{Nd}\p{Pc}\- \t]/gu, '')
    .replace(/[ \t]/g, '-');
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

function guides() {
  const groups = yaml.load(fs.readFileSync(path.join(DOCS, '_data', 'guides.yml'), 'utf8'));
  const config = yaml.load(fs.readFileSync(path.join(DOCS, '_config.yml'), 'utf8'));
  const titles = new Map();
  for (const entry of config.defaults || []) {
    if (entry.scope && entry.scope.path && entry.values && entry.values.title) titles.set(entry.scope.path, entry.values.title);
  }
  const files = ['README', ...groups.flatMap((group) => group.items.map((item) => item.file))];
  return files.map((file) => {
    const label = groups.flatMap((group) => group.items).find((item) => item.file === file);
    return { file, title: titles.get(`${file}.md`) || (label && label.label) || file };
  });
}

function sectionsOf(guide) {
  let source = fs.readFileSync(path.join(DOCS, `${guide.file}.md`), 'utf8').replace(/\r\n/g, '\n');
  // A generated page carries front matter, which is not part of what the reader sees.
  const front = /^---\n([\s\S]*?)\n---\n/.exec(source);
  let title = guide.title;
  if (front) {
    const data = yaml.load(front[1]) || {};
    if (data.title) title = data.title;
    source = source.slice(front[0].length);
  }

  const limit = guide.file === 'changelog' ? CHANGELOG_TEXT_LIMIT : TEXT_LIMIT;
  const seen = new Map();
  const sections = [];
  let current = { heading: '', anchor: '', body: [] };
  let fenced = false;

  const flush = () => {
    const text = plain(current.body.join('\n'));
    if (current.heading || text) sections.push({ h: current.heading, a: current.anchor, x: text.slice(0, limit) });
  };

  for (const line of source.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const match = !fenced && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) {
      if (!fenced) current.body.push(line);
      continue;
    }
    const text = plain(match[2], { inline: true });
    const anchor = headingId(text, seen);
    if (match[1].length === 2 || match[1].length === 3) {
      flush();
      current = { heading: text, anchor, body: [] };
    } else if (match[1].length > 3) {
      current.body.push(text);
    }
  }
  flush();
  return { title, sections };
}

function content() {
  const pages = [];
  const sections = [];
  for (const guide of guides()) {
    const { title, sections: found } = sectionsOf(guide);
    const index = pages.length;
    pages.push({ u: `${guide.file}.html`, t: title });
    for (const section of found) sections.push({ p: index, ...section });
  }
  return `${JSON.stringify({ note: 'Generated by tools/site/search-index.js from the guides.', pages, sections })}\n`;
}

function run({ check = false } = {}) {
  const wanted = content();
  const count = JSON.parse(wanted).sections.length;
  if (check) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== wanted) {
      console.error('docs/data/search.json is stale. Run: node tools/site/search-index.js');
      process.exitCode = 1;
      return false;
    }
    console.log(`site search: current (${count} sections)`);
    return true;
  }
  fs.writeFileSync(OUT, wanted, 'utf8');
  console.log(`site search: generated (${count} sections, ${Math.round(wanted.length / 1024)} KB)`);
  return true;
}

if (require.main === module) run({ check: process.argv.includes('--check') });

module.exports = { OUT, content, headingId, plain, run };
