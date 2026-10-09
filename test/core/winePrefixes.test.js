'use strict';

/*
  Prefix locations that depend on how a launcher was set up: a Lutris without ~/.config/lutris keeps
  its game configs in its data folder, and Bottles can live in a custom folder or be moved elsewhere.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { discoverPrefixes } = require('../../app/util/winePrefixes.js');

const LINUX_ONLY = { skip: process.platform === 'win32' && 'Linux-only' };

function makePrefix(dir) {
  fs.mkdirSync(path.join(dir, 'drive_c', 'users', 'player'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'user.reg'), 'WINE REGISTRY Version 2\n');
  return fs.realpathSync(dir);
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('a Lutris that keeps its game configs in its data folder still names its prefixes', LINUX_ONLY, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-lutris-data-'));
  const prefix = makePrefix(path.join(home, 'Games', 'gog-galaxy'));
  write(path.join(home, '.local', 'share', 'lutris', 'games', 'gog-galaxy-1.yml'), `game:\n  exe: x.exe\n  prefix: ${prefix}\n`);

  const found = discoverPrefixes({ env: {}, home }).filter((p) => p.kind === 'lutris');
  assert.deepEqual(found.map((p) => p.path), [prefix]);
});

test('Bottles in a custom folder and a bottle moved elsewhere are both found', LINUX_ONLY, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-bottles-custom-'));
  const base = path.join(home, '.local', 'share', 'bottles');
  const custom = path.join(home, 'BottlesLibrary');
  const inCustom = makePrefix(path.join(custom, 'Launchers'));
  write(path.join(base, 'data.yml'), `custom_bottles_path: ${custom}\nnotes: true\n`);
  const moved = makePrefix(path.join(home, 'external', 'Moved'));
  write(path.join(base, 'bottles', 'Moved', 'placeholder.yml'), `Path: ${moved}\n`);

  const found = discoverPrefixes({ env: {}, home }).filter((p) => p.kind === 'bottles');
  assert.deepEqual(found.map((p) => p.path).sort(), [inCustom, moved].sort());
});
