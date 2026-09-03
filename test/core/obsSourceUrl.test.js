'use strict';

/*
  The address Settings hands out has to be the one the Watchdog actually answers on.

  Settings writes it out as a literal rather than asking the Watchdog for it: the renderer cannot
  require watchdog modules, and a second setting for a port nobody changes would be one more thing
  to get wrong. That is only safe while something checks the two agree, which is this - the port
  comes from websocket.js's own defaults and the path from the browser source module itself.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rendererSource } = require('../helpers/rendererSource.js');

const watchdogDir = path.join(__dirname, '..', '..', 'watchdog');
const websocket = require(path.join(watchdogDir, 'websocket.js'));
const obsSource = require(path.join(watchdogDir, 'notification', 'obsSource.js'));

test('the browser source URL in Settings is the one the Watchdog serves', () => {
  const found = rendererSource().match(/const OBS_SOURCE_URL = '([^']+)'/);
  assert.ok(found, 'Settings must name the browser source address somewhere the user can copy it');

  const url = new URL(found[1]);
  const options = websocket.resolveOptions();
  assert.equal(url.hostname, websocket.LOOPBACK, 'the feed is bound to loopback, so the address must be too');
  assert.equal(Number(url.port), options.port);
  assert.equal(url.pathname, obsSource.ROUTE);
});

test('the row that carries it is wired to a label the loader can translate', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'view', 'app.html'), 'utf8');
  assert.ok(html.includes('id="btn-copy-obs-url"'));
  assert.ok(html.includes('id="btn-preview-obs-url"'));
  assert.ok(html.includes('id="lbl-obsSource"'));
  assert.ok(html.includes('id="obs-source-help"'));

  const loader = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'locale', 'loader.js'), 'utf8');
  for (const key of ['obsSource.name', 'obsSource.copy', 'obsSource.copied', 'obsSource.preview', 'obsSource.description']) {
    assert.ok(loader.includes(key), `the loader must bind ${key}, or the row ships blank`);
  }
});

/*
  Preview exists to answer "is any of this working" before OBS is involved, so it has to open the
  page in test mode, and its address has to be the same one Copy hands out rather than a second
  literal that can drift from it.
*/
test('Preview opens the browser source itself, in the mode that shows a sample unlock', () => {
  const source = rendererSource();
  const found = source.match(/#btn-preview-obs-url'\)\.attr\('href', `\$\{OBS_SOURCE_URL\}([^`]*)`\)/);
  assert.ok(found, 'Preview must build its address from OBS_SOURCE_URL');

  const base = source.match(/const OBS_SOURCE_URL = '([^']+)'/)[1];
  const preview = new URL(`${base}${found[1]}`);
  assert.equal(preview.pathname, `${obsSource.ROUTE}/`, 'a preset loads its files relative to the directory URL');
  assert.equal(preview.searchParams.get('test'), '1');
});

/*
  The regression this guards is the one that shipped: Settings has two test paths, and only one of
  them went through the Watchdog. "Windows notification" ran a real test there and reached the feed;
  every other mode drew the preview in this app's own main process, so the browser source - the very
  thing the user pressed Test to check - stayed empty.
*/
test('the Test buttons reach the feed in every mode, not only Windows notification', () => {
  const source = rendererSource();

  const branch = source.match(/if \(mode === 'toast'\)[\s\S]{0,900}?await new Promise/);
  assert.ok(branch, 'the notification test still branches on the transport');
  assert.match(
    branch[0],
    /broadcastNotificationTest\(kind, game\)/,
    'the branch that previews the overlay itself must still put the sample on the feed'
  );

  const sender = source.match(/function broadcastNotificationTest\([\s\S]{0,900}?setTimeout\(close, 5000\)/);
  assert.ok(sender, 'the sender must exist');
  assert.match(sender[0], /cmd: 'broadcast-test'/, 'and speak the command the Watchdog answers');
  // A preview that already appeared must not raise an error dialog because nothing was listening.
  assert.doesNotMatch(sender[0], /showMessageBox/, 'a feed nobody listens to is not a failed test');
});
