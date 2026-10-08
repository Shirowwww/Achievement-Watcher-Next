'use strict';

/*
  Writes docs/data/release.json: the version, date, installer name, size and SHA-256 the site prints
  under its download buttons, and keeps the places that quote them in step.

  The page could ask api.github.com for this on every visit, but that spends the reader's
  unauthenticated rate limit on something that changes a few times a year and leaves the number
  blank when it runs out. A file in the repository is served from the same origin, costs nothing and
  is still true.

  The VirusTotal address and the version are also written out in the home page, its translations and
  a few guides, because they have to read right with scripting off. They used to be edited by hand in
  a dozen places; a release now rewrites them here, and --check fails when one is left behind.

    node tools/site/release-data.js            # read the latest published release
    node tools/site/release-data.js --check    # is the file present, well formed and quoted everywhere

  GITHUB_TOKEN is used when set (the release workflow has one); it is not required.
*/

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const OUT = path.join(root, 'docs', 'data', 'release.json');
const API = 'https://api.github.com/repos/Shirowwww/Achievement-Watcher-Next/releases/latest';

// The installer is the only asset a reader downloads by hand; latest.yml and the blockmap exist for
// the updater.
const INSTALLER_RE = /^Achievement\.Watcher\.Setup\..*\.exe$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SCAN = 'https://www.virustotal.com/gui/file/';

// Every file that quotes the digest or the version, and what its sentences look like.
function quoting() {
  const i18n = path.join(root, 'docs', 'assets', 'i18n');
  const translations = fs.existsSync(i18n) ? fs.readdirSync(i18n).filter((name) => /^[a-z-]+\.json$/.test(name) && name !== 'languages.json') : [];
  return [
    { file: path.join(root, 'docs', 'index.html'), version: [/"softwareVersion": "([^"]+)"/g] },
    ...translations.map((name) => ({ file: path.join(i18n, name), version: [] })),
    { file: path.join(root, 'docs', 'faq.md'), version: [/The current release is \[([^\]]+)\]\(https:\/\/www\.virustotal/g] },
    { file: path.join(root, 'docs', 'troubleshooting.md'), version: [/\[the ([^\s\]]+) installer\]\(https:\/\/www\.virustotal/g] },
    { file: path.join(root, 'README.md'), version: [/\(\[([^\]]+)\]\(https:\/\/www\.virustotal/g] },
  ];
}

function digestsIn(text) {
  return [...text.matchAll(/(?:virustotal\.com\/gui\/file\/|`)([0-9a-f]{64})\b/g)].map((match) => match[1]);
}

// Problems found by reading every quoting file against the release data.
function mismatches(data) {
  const problems = [];
  for (const entry of quoting()) {
    const text = fs.readFileSync(entry.file, 'utf8');
    const label = path.relative(root, entry.file).replace(/\\/g, '/');
    if (data.sha256) {
      for (const digest of digestsIn(text)) if (digest !== data.sha256) problems.push(`${label} quotes ${digest.slice(0, 12)}..., not the ${data.version} installer`);
    }
    for (const pattern of entry.version) {
      for (const match of text.matchAll(pattern)) if (match[1] !== data.version) problems.push(`${label} says ${match[1]}, the release is ${data.version}`);
    }
  }
  return problems;
}

function rewrite(data, previous) {
  let touched = 0;
  for (const entry of quoting()) {
    let text = fs.readFileSync(entry.file, 'utf8');
    const before = text;
    if (data.sha256) text = text.replace(/(virustotal\.com\/gui\/file\/|`)[0-9a-f]{64}\b/g, `$1${data.sha256}`);
    for (const pattern of entry.version) {
      text = text.replace(pattern, (whole, version) => whole.replace(version, data.version));
    }
    // The command the troubleshooting guide shows names the installer file.
    if (previous && previous.installer && data.installer && previous.installer !== data.installer) text = text.split(previous.installer).join(data.installer);
    if (text !== before) {
      fs.writeFileSync(entry.file, text, 'utf8');
      touched++;
    }
  }
  return touched;
}

function check() {
  if (!fs.existsSync(OUT)) {
    console.error('docs/data/release.json is missing. Run: node tools/site/release-data.js');
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    console.error('docs/data/release.json is not valid JSON');
    process.exitCode = 1;
    return;
  }

  const problems = [];
  if (typeof data.version !== 'string' || !/^\d+\.\d+\.\d+/.test(data.version)) problems.push('version must be a release version');
  if (typeof data.url !== 'string' || !data.url.startsWith('https://github.com/Shirowwww/')) problems.push('url must point at this repository');
  if (data.published && Number.isNaN(Date.parse(data.published))) problems.push('published must be a date');
  if (data.installerBytes != null && !Number.isFinite(data.installerBytes)) problems.push('installerBytes must be a number');
  if (data.installer && !INSTALLER_RE.test(data.installer)) problems.push('installer must be the Setup .exe');
  if (data.sha256 != null && !SHA256_RE.test(data.sha256)) problems.push('sha256 must be 64 lowercase hex digits');
  if (!problems.length) problems.push(...mismatches(data));

  if (problems.length) {
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('Run: node tools/site/release-data.js');
    process.exitCode = 1;
    return;
  }
  console.log(`release data: ${data.version}`);
}

async function build() {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'aw-next-site' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(API, { headers });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const release = await response.json();

  const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const installer = (release.assets || []).find((asset) => INSTALLER_RE.test(asset.name || ''));
  const digest = installer && /^sha256:([0-9a-f]{64})$/i.exec(installer.digest || '');
  const version = String(release.tag_name || '').replace(/^v/i, '');
  const data = {
    note: 'Generated by tools/site/release-data.js. The site reads it for the version, the installer link and the scan link under its download buttons.',
    version,
    published: release.published_at || '',
    url: release.html_url || 'https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest',
    installer: installer ? installer.name : '',
    installerBytes: installer ? installer.size : null,
    // GitHub reports the digest of every asset; the one recorded for the same version is kept if it is ever missing.
    sha256: digest ? digest[1].toLowerCase() : previous && previous.version === version ? previous.sha256 || '' : '',
  };

  if (!data.version) throw new Error('the latest release has no tag');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  const touched = rewrite(data, previous);
  console.log(`release data: ${data.version}${data.installerBytes ? ` (${Math.round(data.installerBytes / 1048576)} MB)` : ''}, ${touched} files updated`);
}

module.exports = { SCAN, mismatches, quoting };

if (require.main === module) {
  if (process.argv.includes('--check')) {
    check();
  } else {
    build().catch((err) => {
      console.error(err && err.message ? err.message : err);
      process.exitCode = 1;
    });
  }
}
