'use strict';

// The Consoles & ports page counts the games each switch brought in and says what to do when one found none (#226).

const test = require('node:test');
const assert = require('node:assert/strict');

const { portGameCounts, portStatus, PORT_SOURCES } = require('../../app/util/portSources.js');

test('each switch counts the games its sources brought in, merged save sources included', () => {
  const counts = portGameCounts([
    { appid: 'CUSA00900', source: 'PS4 Recomp' },
    { appid: 'CUSA00341', source: 'PS4 Recomp' },
    { appid: 'BLUS30443', source: 'RPCS3 Emulator' },
    { appid: '4D5307E6', source: 'Xenia Emulator', dataPaths: [{ source: 'Xbox 360 Recomp' }] },
    { appid: 'dead-space-2', source: 'MarkerPatch' },
    { appid: 'ladxhd', source: 'PC Port' },
    { appid: '480', source: 'Goldberg' },
    null,
  ]);
  assert.equal(counts.ps4recomp, 2);
  assert.equal(counts.rpcs3, 1);
  assert.equal(counts.xenia, 1);
  assert.equal(counts.x360recomp, 1);
  assert.equal(counts.markerpatch, 2);
  assert.equal(counts.shadps4, 0);
  assert.deepEqual(Object.keys(counts), Object.keys(PORT_SOURCES));
});

test('a switch that is on and found nothing says so; one that is off says nothing', () => {
  assert.deepEqual(portStatus(true, 3), { kind: 'found', count: 3 });
  assert.deepEqual(portStatus(true, 0), { kind: 'none', count: 0 });
  assert.deepEqual(portStatus(false, 5), { kind: '', count: 0 });
});

test('no library yet counts zero everywhere', () => {
  assert.ok(Object.values(portGameCounts(undefined)).every((count) => count === 0));
});
