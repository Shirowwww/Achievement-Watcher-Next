'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { xdgAppDirs } = require('../../app/util/xdgAppDirs.js');

const home = path.join(path.sep, 'home', 'aw');

test('Windows has no XDG folder to add', () => {
  assert.deepEqual(xdgAppDirs('rpcs3', { platform: 'win32', env: {}, home }), []);
});

test('RPCS3 keeps its files in the config folder, natively and under Flatpak', () => {
  assert.deepEqual(xdgAppDirs('rpcs3', { platform: 'linux', env: {}, home }), [
    path.join(home, '.config', 'rpcs3'),
    path.join(home, '.var', 'app', 'net.rpcs3.RPCS3', 'config', 'rpcs3'),
  ]);
});

test('shadPS4 and Xenia keep theirs in the data folder, which XDG_DATA_HOME moves', () => {
  const env = { XDG_DATA_HOME: path.join(path.sep, 'data') };
  assert.deepEqual(xdgAppDirs('shadps4', { platform: 'linux', env, home }), [
    path.join(path.sep, 'data', 'shadPS4'),
    path.join(home, '.var', 'app', 'net.shadps4.shadPS4', 'data', 'shadPS4'),
  ]);
  assert.deepEqual(xdgAppDirs('xenia', { platform: 'linux', env, home }), [path.join(path.sep, 'data', 'Xenia')]);
});

test('an unknown emulator has no folder', () => {
  assert.deepEqual(xdgAppDirs('nope', { platform: 'linux', env: {}, home }), []);
});
