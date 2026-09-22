'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { immediateChildDirOf, deriveAppIdFromDir } = require('../util/appidFolder.js');

test('immediateChildDirOf resolves a nested file to the root-level folder that holds it', () => {
  const root = path.join('C:', 'Users', 'X', 'AppData', 'Roaming', 'GSE Saves');
  const nested = path.join(root, '730', 'stats');
  assert.equal(immediateChildDirOf(root, nested), path.join(root, '730'));
  assert.equal(immediateChildDirOf(root, path.join(root, '730')), path.join(root, '730'));
});

test('immediateChildDirOf falls back to the target itself when it is not under the root', () => {
  const root = path.join('C:', 'GSE Saves');
  const outside = path.join('C:', 'Other', '730');
  assert.equal(immediateChildDirOf(root, outside), outside);
  assert.equal(immediateChildDirOf(root, root), root);
});

test('deriveAppIdFromDir strips the known ALI213-family leaf subfolders before matching', () => {
  assert.equal(deriveAppIdFromDir(path.join('C:', 'Save', '339230', 'stats')), '339230');
  assert.equal(deriveAppIdFromDir(path.join('C:', 'Save', '339230', 'SteamEmu')), '339230');
  assert.equal(deriveAppIdFromDir(path.join('C:', 'Save', '339230', 'SteamEmu', 'UserStats')), '339230');
});

test('deriveAppIdFromDir strips UniverseLANData so the GOG product id folder above it is matched', () => {
  const dir = path.join('C:', 'Users', 'X', 'AppData', 'Local', 'UniverseLAN', '1423049311', 'UniverseLANData');
  assert.equal(deriveAppIdFromDir(dir), '1423049311');
});

test('deriveAppIdFromDir matches a bare trailing appid folder with no known leaf subfolder', () => {
  assert.equal(deriveAppIdFromDir(path.join('C:', 'GSE Saves', '730')), '730');
});

test('deriveAppIdFromDir returns null rather than throwing when no digits are found', () => {
  assert.equal(deriveAppIdFromDir(path.join('C:', 'GSE Saves', 'not-a-number')), null);
  assert.equal(deriveAppIdFromDir(''), null);
});
