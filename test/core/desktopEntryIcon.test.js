'use strict';

// A native game's icon comes from the desktop entry that launches it.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const { desktopEntryIcon, parseDesktopEntry } = require('../../app/util/desktopEntryIcon.js');

function layout() {
  const root = makeTempDir('aw-desktop-');
  const home = path.join(root, 'home');
  const data = path.join(home, '.local', 'share');
  const game = path.join(home, 'Games', 'AW Test Game');
  const exe = path.join(game, 'awtestgame');
  fs.mkdirSync(path.join(data, 'applications'), { recursive: true });
  fs.mkdirSync(game, { recursive: true });
  fs.writeFileSync(exe, '');
  return { root, home, data, game, exe, env: { XDG_DATA_DIRS: path.join(root, 'usr', 'share') } };
}

function writeEntry(data, name, lines) {
  fs.writeFileSync(path.join(data, 'applications', name), ['[Desktop Entry]', 'Type=Application', ...lines, ''].join('\n'));
}

test('only the [Desktop Entry] group is read', () => {
  const entry = parseDesktopEntry('[Desktop Entry]\nExec=/a/b\nIcon=x\n[Desktop Action play]\nExec=/c/d\n');
  assert.deepEqual(entry, { Exec: '/a/b', Icon: 'x' });
});

test('an entry launching the binary by full path gives its absolute icon', () => {
  const { home, data, game, exe, env } = layout();
  const icon = path.join(game, 'icon.png');
  fs.writeFileSync(icon, 'png');
  writeEntry(data, 'other.desktop', ['Exec=/usr/bin/true', `Icon=${icon}`]);
  writeEntry(data, 'awtestgame.desktop', [`Exec="${exe}" %U`, `Icon=${icon}`]);
  assert.equal(desktopEntryIcon(exe, { env, home }), icon);
});

test('an entry starting it from its own folder resolves a themed icon, largest size first', () => {
  const { root, home, data, game, exe, env } = layout();
  const small = path.join(data, 'icons', 'hicolor', '48x48', 'apps', 'aw-test.png');
  const large = path.join(root, 'usr', 'share', 'icons', 'hicolor', '256x256', 'apps', 'aw-test.png');
  for (const file of [small, large]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'png');
  }
  writeEntry(data, 'aw-test.desktop', [`Path=${game}`, 'Exec=./awtestgame', 'Icon=aw-test']);
  assert.equal(desktopEntryIcon(exe, { env, home }), large);
});

test('no entry for the binary, or an icon that does not exist, gives nothing', () => {
  const { home, data, exe, env } = layout();
  assert.equal(desktopEntryIcon(exe, { env, home }), null);
  writeEntry(data, 'awtestgame.desktop', [`Exec=${exe}`, 'Icon=missing-icon']);
  assert.equal(desktopEntryIcon(exe, { env, home }), null);
});
