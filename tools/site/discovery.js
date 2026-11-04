'use strict';

/*
  Build the files search engines and feed readers use to discover the site.

    node tools/site/discovery.js
    node tools/site/discovery.js --check
*/

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const DOCS = path.join(root, 'docs');
const CHANGELOG = path.join(root, 'CHANGELOG.md');
const BASE = 'https://shirowwww.github.io/Achievement-Watcher-Next/';
const REPOSITORY = 'https://github.com/Shirowwww/Achievement-Watcher-Next';
const SITEMAP = path.join(DOCS, 'sitemap.xml');
const FEED = path.join(DOCS, 'releases.xml');
const PAGE_DATES = path.join(DOCS, '_data', 'pagedates.json');
const site = require('./languages.js');

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function publicPages() {
  const guides = fs
    .readdirSync(DOCS, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${entry.name.slice(0, -3)}.html`)
    .sort((left, right) => left.localeCompare(right));

  // Each translated language has a copy of the public guides in its own folder.
  const translated = site.languages().flatMap((code) => site.translatedGuides().map((guide) => `${code}/${guide}.html`));
  return ['', 'gallery/', 'gallery/themes/', ...guides, ...translated];
}

// Author date of the last commit that touched any of the files, as YYYY-MM-DD; null when git has none.
function lastCommitDate(files) {
  const args = ['log', '-1', '--format=%as', '--', ...files.map((file) => path.relative(root, file))];
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

// The files that make up a page; the galleries also render their index.json.
function sourcesOf(page) {
  if (page === '') return [path.join(DOCS, 'index.html')];
  if (page.endsWith('/')) return ['index.html', 'index.json'].map((name) => path.join(DOCS, page, name));
  return [path.join(DOCS, `${page.slice(0, -5)}.md`)];
}

function pageDates() {
  const dates = {};
  for (const page of publicPages()) {
    const date = lastCommitDate(sourcesOf(page));
    if (date) dates[page] = date;
  }
  return dates;
}

function sitemapContent() {
  const dates = pageDates();
  const urls = publicPages()
    .map((page) => `  <url><loc>${xml(BASE + page)}</loc>${dates[page] ? `<lastmod>${dates[page]}</lastmod>` : ''}</url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// Read by the guide footer as site.data.pagedates[page.name]: the Pages build has no git history.
function pageDatesContent() {
  const dates = pageDates();
  const byName = {};
  for (const page of publicPages()) {
    if (page.endsWith('.html') && dates[page]) byName[`${page.slice(0, -5)}.md`] = dates[page];
  }
  return `${JSON.stringify(byName, null, 2)}\n`;
}

function releases() {
  const source = fs.readFileSync(CHANGELOG, 'utf8').replace(/\r\n/g, '\n');
  const matches = [...source.matchAll(/^## (\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?) - (\d{4}-\d{2}-\d{2})$/gm)];
  return matches.map((match) => ({ version: match[1], date: match[2] }));
}

function feedContent() {
  const entries = releases();
  if (!entries.length) throw new Error('CHANGELOG.md contains no dated releases');

  const items = entries
    .map(({ version, date }) => {
      const link = `${REPOSITORY}/releases/tag/v${version}`;
      return [
        '    <item>',
        `      <title>Achievement Watcher Next ${xml(version)}</title>`,
        `      <link>${xml(link)}</link>`,
        `      <guid isPermaLink="true">${xml(link)}</guid>`,
        `      <pubDate>${new Date(`${date}T00:00:00Z`).toUTCString()}</pubDate>`,
        `      <description>Release notes for Achievement Watcher Next ${xml(version)}.</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const latest = new Date(`${entries[0].date}T00:00:00Z`).toUTCString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Achievement Watcher Next releases</title>',
    `    <link>${xml(BASE + 'changelog.html')}</link>`,
    '    <description>New versions of Achievement Watcher Next.</description>',
    '    <language>en</language>',
    `    <lastBuildDate>${latest}</lastBuildDate>`,
    `    <atom:link href="${xml(BASE + 'releases.xml')}" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

// shortcut: a page date comes from a commit that cannot exist before the file is committed, and a
// shallow CI clone has none, so --check compares everything but the dates. Regenerate after committing.
function withoutDates(text) {
  return text.replace(/<lastmod>[^<]*<\/lastmod>/g, '').replace(/"(\d{4}-\d{2}-\d{2})"/g, '"DATE"');
}

function run({ check = false } = {}) {
  const outputs = [
    [SITEMAP, sitemapContent()],
    [FEED, feedContent()],
    [PAGE_DATES, pageDatesContent()],
  ];

  let current = true;
  for (const [file, wanted] of outputs) {
    if (check) {
      const present = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
      if (withoutDates(present) !== withoutDates(wanted)) {
        console.error(`${path.relative(root, file).replace(/\\/g, '/')} is stale. Run: node tools/site/discovery.js`);
        current = false;
      }
    } else {
      fs.writeFileSync(file, wanted, 'utf8');
    }
  }

  if (!current) process.exitCode = 1;
  else console.log(`site discovery: ${check ? 'current' : 'generated'} (${publicPages().length} pages, ${releases().length} releases)`);
  return current;
}

if (require.main === module) run({ check: process.argv.includes('--check') });

module.exports = { BASE, FEED, SITEMAP, feedContent, publicPages, releases, run, sitemapContent };
