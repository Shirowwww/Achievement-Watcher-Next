'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { reconcileLocalInstalls } = require('../../app/parser/steam.js');

const record = (appid, installed) => ({ appid, source: 'Steam (me)', data: { type: 'steamAPI', installed } });
const onDisk = new Set(['/steam/common/Present']);
const exists = (dir) => onDisk.has(dir);
const installs = new Map([
  ['10', { name: 'Present', gameDir: '/steam/common/Present' }],
  ['20', { name: 'Folder deleted', gameDir: '/steam/common/Gone' }],
]);

test('a manifest whose folder is on disk makes the game installed and gives it its folder', () => {
  const { records, attached } = reconcileLocalInstalls([record('10', false)], installs, { exists });

  assert.equal(attached, 1);
  assert.equal(records[0].data.installed, true);
  assert.equal(records[0].data.gameDir, '/steam/common/Present');
});

test('a registry flag with no manifest, or a manifest with no folder, is corrected to not installed', () => {
  const { records, corrected } = reconcileLocalInstalls([record('20', true), record('30', true)], installs, { exists });

  assert.equal(corrected, 2);
  assert.deepEqual(
    records.map((r) => r.data.installed),
    [false, false]
  );
});

// Content Warning on the maintainer's PC: Installed=1 in the registry, no appmanifest anywhere, and
// still listed under "installed only" because the listing trusted the flag before this check ran.
test('under "installed", a game the manifests prove missing leaves the list', () => {
  const { records } = reconcileLocalInstalls([record('10', true), record('20', true), record('30', true)], installs, { exists, installedOnly: true });

  assert.deepEqual(
    records.map((r) => r.appid),
    ['10']
  );
});

test('under "owned", a game that is not installed stays listed', () => {
  const { records } = reconcileLocalInstalls([record('10', true), record('30', false)], installs, { exists, installedOnly: false });

  assert.deepEqual(
    records.map((r) => r.appid),
    ['10', '30']
  );
});
