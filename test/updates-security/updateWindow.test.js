'use strict';

/*
  The update window: what it shows in each updater state, and how the release notes reach it.
  The notes come from the network outside the installer's signature, so they must arrive as plain
  text blocks and never as markup.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { releaseNoteBlocks } = require(path.join(__dirname, '..', '..', 'app', 'util', 'releaseNotes.js'));
const { buildUpdateWindowView, formatBytes } = require(path.join(__dirname, '..', '..', 'app', 'util', 'updateWindowView.js'));
const updateStatus = require(path.join(__dirname, '..', '..', 'app', 'util', 'updateStatus.js'));

const STRINGS = {
  available: 'Update available',
  updateNow: 'Update now',
  later: 'Later',
  skip: 'Skip this version',
  whatsNew: "What's new",
  notesUnavailable: 'No notes',
  fullNotes: 'Full notes',
  downloadingTitle: 'Downloading version {version}',
  downloadDetail: '{done} of {total} · {speed}/s',
  background: 'Continue in the background',
  cancel: 'Cancel',
  installingTitle: 'Installing version {version}',
  installingDetail: 'AW Next restarts ({version})',
  ready: 'Update ready',
  readyAfterGame: 'After the game ({version})',
  installNow: 'Install now',
  failedTitle: 'The update did not complete',
  failedDetail: 'Failed: {message}',
  failedSignature: 'Not signed by the publisher',
  failedDownload: 'The download did not finish',
  openReleasePage: 'Open release page',
  portableDetail: 'Portable copy',
  close: 'Close',
};

const OFFER = { version: '3.12.0', currentVersion: '3.11.3', size: 128 * 1024 * 1024, notes: [{ kind: 'item', text: 'Faster installer' }] };

const ids = (view) => view.actions.map((entry) => entry.id);

test('release notes keep headings, items and paragraphs as plain text', () => {
  const html = '<h1>Achievement Watcher Next 3.12.0</h1><p>A <b>new</b> installer &amp; updater.</p><h2>Highlights</h2><ul><li>Faster<ul><li>nested</li></ul></li><li>Cleaner</li></ul>';
  assert.deepEqual(releaseNoteBlocks(html), [
    { kind: 'text', text: 'A new installer & updater.' },
    { kind: 'heading', text: 'Highlights' },
    { kind: 'item', text: 'Faster' },
    { kind: 'item', text: 'nested' },
    { kind: 'item', text: 'Cleaner' },
  ]);
});

test('release notes drop scripts, styles and every attribute', () => {
  const html = '<p onclick="steal()">Hello<script>alert(1)</script><style>p{}</style> <a href="javascript:x">world</a><img src=x onerror=y></p>';
  const blocks = releaseNoteBlocks(html);
  assert.deepEqual(blocks, [{ kind: 'text', text: 'Hello world' }]);
  assert.ok(!JSON.stringify(blocks).includes('<'), 'no markup survives');
});

test('release notes in Markdown and in the fullChangelog list form are read too', () => {
  assert.deepEqual(releaseNoteBlocks('## Fixes\n- **Faster** install\n* Cleaner'), [
    { kind: 'heading', text: 'Fixes' },
    { kind: 'item', text: 'Faster install' },
    { kind: 'item', text: 'Cleaner' },
  ]);
  assert.deepEqual(releaseNoteBlocks([{ version: '3.12.0', note: '<li>One</li>' }, { version: '3.11.9', note: null }]), [{ kind: 'item', text: 'One' }]);
  assert.deepEqual(releaseNoteBlocks(undefined), []);
});

// Someone several releases behind reads every release they missed, each under its own version.
test('the notes of every skipped release are shown, newest first, each under its version', () => {
  const missed = [
    { version: '3.12.2', note: '<h1>Achievement Watcher Next 3.12.2</h1><ul><li>B</li></ul>' },
    { version: '3.12.1', note: '<h2>Fixed</h2><ul><li>A</li></ul><h2>Install</h2><table><tr><td>Setup.exe</td></tr></table>' },
  ];
  assert.deepEqual(releaseNoteBlocks(missed), [
    { kind: 'version', text: '3.12.2' },
    { kind: 'item', text: 'B' },
    { kind: 'version', text: '3.12.1' },
    { kind: 'heading', text: 'Fixed' },
    { kind: 'item', text: 'A' },
  ]);
  const init = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron', 'init.js'), 'utf8');
  assert.match(init, /autoUpdater\.fullChangelog = true/, 'electron-updater only lists the skipped releases when asked to');
});

test('the download table and the footer of links stay on the release page', () => {
  const html = '<p>Intro</p><table><tr><td>Setup.exe</td><td>The installer</td></tr></table><ul><li>Fix</li></ul><hr><p><a href="x">Full changelog</a></p>';
  assert.deepEqual(releaseNoteBlocks(html), [
    { kind: 'text', text: 'Intro' },
    { kind: 'item', text: 'Fix' },
  ]);
  const markdown = 'Intro\n| File | What |\n|---|---|\n- See the [changelog](https://x) here\n---\n[Docs](https://y)';
  assert.deepEqual(releaseNoteBlocks(markdown), [
    { kind: 'text', text: 'Intro' },
    { kind: 'item', text: 'See the changelog here' },
  ]);
});

test('an offer shows the versions, the size and the three answers', () => {
  const view = buildUpdateWindowView({ status: updateStatus.reduce(updateStatus.initialState(), { type: 'available', version: '3.12.0' }), offer: OFFER, strings: STRINGS, portable: false });
  assert.equal(view.phase, 'available');
  assert.equal(view.meta, '3.11.3 → 3.12.0 · 128 MB');
  assert.deepEqual(ids(view), ['skip', 'later', 'install']);
  assert.equal(view.notes.blocks[0].text, 'Faster installer');
});

test('a portable copy is offered the release page instead of an install', () => {
  const view = buildUpdateWindowView({ status: updateStatus.initialState(), offer: OFFER, strings: STRINGS, portable: true });
  assert.equal(view.phase, 'portable');
  assert.deepEqual(ids(view), ['skip', 'later', 'release']);
  assert.equal(view.message, 'Portable copy');
});

test('a download shows its progress and can go to the background or stop', () => {
  let status = updateStatus.reduce(updateStatus.initialState(), { type: 'download-started', version: '3.12.0' });
  status = updateStatus.reduce(status, { type: 'progress', percent: 42.4, transferred: 52 * 1048576, total: 128 * 1048576, bytesPerSecond: 6.1 * 1048576 });
  const view = buildUpdateWindowView({ status, offer: OFFER, strings: STRINGS, portable: false });
  assert.equal(view.title, 'Downloading version 3.12.0');
  assert.equal(view.progress.percent, 42.4);
  assert.equal(view.progress.detail, '52.0 MB of 128 MB · 6.1 MB/s');
  assert.deepEqual(ids(view), ['cancel', 'background']);
});

test('a finished download is shown as being checked, with nothing left to cancel', () => {
  let status = updateStatus.reduce(updateStatus.initialState(), { type: 'download-started', version: '3.12.0' });
  status = updateStatus.reduce(status, { type: 'progress', percent: 100, transferred: 2, total: 2, bytesPerSecond: 1 });
  const view = buildUpdateWindowView({ status, offer: OFFER, strings: { ...STRINGS, verifyingTitle: 'Checking the download' }, portable: false });
  assert.equal(view.phase, 'verifying');
  assert.equal(view.title, 'Checking the download');
  assert.equal(view.progress.indeterminate, true);
  assert.deepEqual(ids(view), ['background']);
});

test('the hand-over to the installer offers nothing to click', () => {
  const status = updateStatus.reduce(updateStatus.initialState(), { type: 'installing', version: '3.12.0' });
  const view = buildUpdateWindowView({ status, offer: OFFER, strings: STRINGS, portable: false });
  assert.equal(view.phase, 'installing');
  assert.equal(view.progress.indeterminate, true);
  assert.deepEqual(view.actions, []);
});

test('an update held back by a game can still be installed on request', () => {
  const status = updateStatus.reduce(updateStatus.initialState(), { type: 'held', version: '3.12.0' });
  const view = buildUpdateWindowView({ status, offer: OFFER, strings: STRINGS, portable: false });
  assert.equal(view.message, 'After the game (3.12.0)');
  assert.deepEqual(ids(view), ['background', 'install-now']);
});

test('a failure names the problem and points to a manual download', () => {
  const status = updateStatus.reduce(updateStatus.initialState(), { type: 'error', message: 'signature refused' });
  const view = buildUpdateWindowView({ status, offer: null, strings: STRINGS, portable: false });
  assert.equal(view.message, 'Failed: signature refused');
  assert.equal(view.meta, '');
  assert.deepEqual(ids(view), ['close', 'release']);
});

test('a refused signature is explained in words, with only the error code left visible', () => {
  const message = 'download failed: ERR_UPDATER_INVALID_SIGNATURE: New version 3.12.3 is not signed by the application owner';
  const status = updateStatus.reduce(updateStatus.initialState(), { type: 'error', message });
  const view = buildUpdateWindowView({ status, offer: OFFER, strings: STRINGS, portable: false });
  assert.equal(view.message, 'Not signed by the publisher');
  assert.equal(view.meta, 'ERR_UPDATER_INVALID_SIGNATURE');
  assert.deepEqual(ids(view), ['close', 'release']);
});

test('a broken download says the update will be offered again', () => {
  const status = updateStatus.reduce(updateStatus.initialState(), { type: 'error', message: 'download failed: net::ERR_CONNECTION_RESET' });
  const view = buildUpdateWindowView({ status, offer: OFFER, strings: STRINGS, portable: false });
  assert.equal(view.message, 'The download did not finish');
  assert.ok(!view.message.includes('net::'), 'the raw network error stays in the log');
});

test('nothing to show without an offer or an update in flight', () => {
  assert.equal(buildUpdateWindowView({ status: updateStatus.initialState(), offer: null, strings: STRINGS, portable: false }), null);
});

test('sizes read in whole bytes, then one decimal up to 100 of a unit', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(130 * 1048576), '130 MB');
});

test('numbers follow the app language', () => {
  assert.equal(formatBytes(53.4 * 1048576, 'french'), '53,4 MB');
  let status = updateStatus.reduce(updateStatus.initialState(), { type: 'download-started', version: '3.12.0' });
  status = updateStatus.reduce(status, { type: 'progress', percent: 41.7, transferred: 1, total: 2, bytesPerSecond: 1 });
  const view = buildUpdateWindowView({ status, offer: OFFER, strings: STRINGS, portable: false, lang: 'french' });
  assert.match(view.progress.percentText, /^41\s%$/u);
});

test('an offer can turn on automatic installs, a portable copy cannot', () => {
  const strings = { ...STRINGS, autoInstall: 'Install future updates automatically' };
  const view = buildUpdateWindowView({ status: updateStatus.initialState(), offer: OFFER, strings, portable: false });
  assert.deepEqual(view.autoOption, { label: 'Install future updates automatically' });
  const portable = buildUpdateWindowView({ status: updateStatus.initialState(), offer: OFFER, strings, portable: true });
  assert.equal(portable.autoOption, null);
  let status = updateStatus.reduce(updateStatus.initialState(), { type: 'download-started', version: '3.12.0' });
  assert.equal(buildUpdateWindowView({ status, offer: OFFER, strings, portable: false }).autoOption, undefined);
});
