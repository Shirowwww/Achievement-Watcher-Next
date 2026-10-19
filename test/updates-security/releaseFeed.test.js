'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const { releaseNotesFromFeed } = require(path.join(appRoot, 'util', 'releaseFeed.js'));

const entry = (version, html) =>
  `<entry><link rel="alternate" type="text/html" href="https://github.com/o/r/releases/tag/v${version}"/><content type="html">${html}</content></entry>`;

test('the release feed reads as the newest releases with their notes', () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${entry('3.12.0', '&lt;p&gt;Older&lt;/p&gt;')}${entry('3.12.1', '&lt;p&gt;Newer&lt;/p&gt;')}${entry('3.11.3', 'x')}</feed>`;
  assert.deepEqual(releaseNotesFromFeed(xml, 2), [
    { version: '3.12.1', note: '<p>Newer</p>' },
    { version: '3.12.0', note: '<p>Older</p>' },
  ]);
});

// The offer must never be reachable from an installed copy.
test('a fake update offer is a dev-only switch', () => {
  const init = fs.readFileSync(path.join(appRoot, 'electron', 'init.js'), 'utf8');
  const fake = init.slice(init.indexOf('async function offerFakeUpdate('));
  assert.match(fake, /^async function offerFakeUpdate\(version\) \{\s+if \(app\.isPackaged\) return;/);
  assert.match(init, /if \(args\['fake-update'\] && !app\.isPackaged\)/);
});
