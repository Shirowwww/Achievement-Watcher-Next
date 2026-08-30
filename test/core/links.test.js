'use strict';

/*
  The external-address registry: these are the addresses the app hands to a browser, so a wrong one
  is a dead end a user reaches from a button, not a build failure. The repository has already been
  renamed once; these assertions prove a rename stays a single edit that lands everywhere.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const links = require(path.join(root, 'app', 'util', 'links.js'));

test('every address is https and belongs to this project', () => {
  const flat = [];
  const collect = (value, trail) => {
    if (typeof value === 'string' && /^https?:/i.test(value)) flat.push([trail, value]);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) collect(child, trail ? `${trail}.${key}` : key);
    }
  };
  collect(links, '');
  assert.ok(flat.length >= 15, 'the registry must actually hold the app addresses');

  for (const [key, url] of flat) {
    assert.match(url, /^https:\/\//, `${key} must be https`);
    assert.doesNotMatch(url, /\s/, `${key} must not contain whitespace`);
    // The upstream credits are the only entries that legitimately name another project.
    if (key.startsWith('upstream.')) continue;
    assert.match(url, /^https:\/\/(github\.com\/Shirowwww\/Achievement-Watcher-Next|shirowwww\.github\.io\/Achievement-Watcher-Next)/, `${key} must point at this project`);
  }
});

test('the named destinations are the pages they claim to be', () => {
  assert.equal(links.home, 'https://github.com/Shirowwww/Achievement-Watcher-Next');
  assert.equal(links.releases, 'https://github.com/Shirowwww/Achievement-Watcher-Next/releases');
  assert.equal(links.download, 'https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest');
  assert.equal(links.issues, 'https://github.com/Shirowwww/Achievement-Watcher-Next/issues');
  // The root of the site is the project home page; the guides hub is README.html beside it.
  assert.equal(links.documentation, 'https://shirowwww.github.io/Achievement-Watcher-Next/README.html');
  assert.equal(links.website, 'https://shirowwww.github.io/Achievement-Watcher-Next/');
  assert.equal(links.presetGallery, 'https://shirowwww.github.io/Achievement-Watcher-Next/gallery/');
  assert.equal(links.presets, 'https://shirowwww.github.io/Achievement-Watcher-Next/presets.html');
  assert.equal(links.troubleshooting, 'https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html');
  assert.equal(links.upstream.original, 'https://github.com/xan105/Achievement-Watcher');
});

test('a version resolves to its own release page, and a bad one to the release index', () => {
  // The release page is where the update prompt sends someone to read the changelog before saying
  // yes, so a version the updater reports must never land on a 404.
  assert.equal(links.releaseTag('3.10.3'), 'https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.3');
  assert.equal(links.releaseTag('v3.10.3'), links.releaseTag('3.10.3'));
  assert.equal(links.releaseTag(' 3.11.0-beta.1 '), 'https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.11.0-beta.1');
  for (const bad of [undefined, '', 'latest/../../evil', 'https://example.com', '3.10.3 x']) {
    assert.equal(links.releaseTag(bad), links.releases, `${String(bad)} must fall back to the release index`);
  }
});

test('the old repository name is never handed to a user', () => {
  // The rename left a permanent redirect that pre-3.9 updater clients still depend on, so the old
  // slug must keep working - but nothing new may point a user at it.
  const source = fs.readFileSync(path.join(root, 'app', 'util', 'links.js'), 'utf8');
  assert.doesNotMatch(source, /Achievement-Watcher-3\.0/i);
});

test('every documentation slug resolves to a page the site publishes', () => {
  // GitHub Pages serves docs/ (docs/_config.yml), so docs/<slug>.md is what becomes <slug>.html.
  for (const [name, slug] of Object.entries(links.DOCS)) {
    const file = path.join(root, 'docs', `${slug}.md`);
    assert.ok(fs.existsSync(file), `links.DOCS.${name} points at ${path.relative(root, file)}, which does not exist`);
  }
  assert.equal(links.docs('home'), 'https://shirowwww.github.io/Achievement-Watcher-Next/README.html');
  assert.equal(links.docs('gettingStarted'), 'https://shirowwww.github.io/Achievement-Watcher-Next/getting-started.html');
  // An unknown page is the home page, never a 404.
  assert.equal(links.docs('no-such-page'), links.docs('home'));
  assert.equal(links.docs(), links.docs('home'));
});

test('a repository file link targets a file that is actually tracked at the root', () => {
  for (const [key, url] of Object.entries(links)) {
    if (typeof url !== 'string') continue;
    const match = /\/blob\/main\/(.+)$/.exec(url);
    if (!match) continue;
    assert.ok(fs.existsSync(path.join(root, match[1])), `links.${key} points at ${match[1]}, which is not in the repository`);
  }
});

test('the app resolves its markup links through the registry rather than through markup', () => {
  const appJs = fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8');
  assert.match(appJs, /function applyExternalLinks\(/, 'the binder must exist');
  assert.match(appJs, /\[data-aw-link\]/, 'it must address the markup by attribute');
  assert.match(appJs, /applyExternalLinks\(\);/, 'and it must run at startup');
});
