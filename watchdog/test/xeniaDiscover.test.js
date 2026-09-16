'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { discover } = require('../console/xeniaWatch.js')._internal;

function tree(root, files) {
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), Buffer.alloc(4));
  }
}

function config(root, dirs) {
  const file = path.join(root, 'userdir.db');
  fs.writeFileSync(file, JSON.stringify(dirs.map((dir) => ({ path: dir }))));
  return file;
}

test('both Xenia layouts are watched, dashboard GPDs are not', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xenia-watch-'));
  const profile = path.join('content', 'E0300000DEADBEEF', 'FFFE07D1', '00010000', 'E0300000DEADBEEF');
  tree(root, [
    path.join(profile, 'FFFE07D1.gpd'),
    path.join(profile, '4D5307E6.gpd'),
    path.join('content', '0009041500000000', 'ABCD1234', '00000001', 'ABCD1234.gpd'),
  ]);

  const targets = discover(config(root, [root]));
  assert.deepEqual(targets.map((t) => t.titleId).sort(), ['4D5307E6', 'ABCD1234']);
});

test('the profile folder holding the .gpd files can be the saved folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xenia-watch-'));
  const profile = path.join(root, 'E0300000DEADBEEF');
  tree(root, [path.join('E0300000DEADBEEF', 'FFFE07D1.gpd'), path.join('E0300000DEADBEEF', '4D5307E6.gpd')]);

  const targets = discover(config(root, [profile]));
  assert.deepEqual(targets.map((t) => [t.titleId, t.dataDir]), [['4D5307E6', profile]]);
});
