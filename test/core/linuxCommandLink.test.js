'use strict';

// ~/.local/bin/achievement-watcher: the command a desktop shortcut keeps across AppImage updates.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const commandLink = require('../../app/util/linuxCommandLink.js');

const linuxOnly = { skip: process.platform !== 'linux' && 'symlinks need Linux' };

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-link-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('the link follows the AppImage from one version to the next', linuxOnly, (t) => {
  const home = tempHome(t);
  const file = commandLink.linkFile({ home });

  assert.equal(commandLink.refresh({ env: { APPIMAGE: '/apps/AW.3.12.0.AppImage' }, home }).changed, true);
  assert.equal(fs.readlinkSync(file), '/apps/AW.3.12.0.AppImage');
  assert.equal(commandLink.refresh({ env: { APPIMAGE: '/apps/AW.3.12.0.AppImage' }, home }).changed, false);

  assert.equal(commandLink.refresh({ env: { APPIMAGE: '/apps/AW.3.13.0.AppImage' }, home }).changed, true);
  assert.equal(fs.readlinkSync(file), '/apps/AW.3.13.0.AppImage');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['achievement-watcher']);
});

test('a file there that is not a link is left alone', linuxOnly, (t) => {
  const home = tempHome(t);
  const file = commandLink.linkFile({ home });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\n');

  assert.equal(commandLink.refresh({ env: { APPIMAGE: '/apps/AW.AppImage' }, home }).changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), '#!/bin/sh\n');
});

test('outside an AppImage nothing is written', (t) => {
  const home = tempHome(t);
  assert.deepEqual(commandLink.refresh({ env: {}, home }), { file: null, changed: false });
  assert.equal(fs.existsSync(path.join(home, '.local')), false);
});
