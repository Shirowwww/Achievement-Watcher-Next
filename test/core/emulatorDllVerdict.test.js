'use strict';

/*
  isEmulatorDll read the whole dll every time it was asked, and one scan asks about the same dll
  several times. It now remembers its answer per file - which must never outlive the file: a repair
  that swaps Valve's dll for an emulator (or back) has to be seen at once.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isEmulatorDll, EMULATOR_DLL_MARKER } = require('../../app/util/crackLoaderDetect.js');
const { makeTempDir } = require('../helpers/tempDir');

test('a replaced dll is read again, an untouched one is answered from memory', (t) => {
  const dll = path.join(makeTempDir('aw-emulator-dll-'), 'steam_api64.dll');
  fs.writeFileSync(dll, Buffer.from('MZ valve original'));
  assert.equal(isEmulatorDll(dll), false);

  fs.writeFileSync(dll, Buffer.concat([Buffer.from('MZ emulator '), EMULATOR_DLL_MARKER]));
  assert.equal(isEmulatorDll(dll), true, 'the swap to an emulator is seen');

  const reads = t.mock.method(fs, 'readFileSync');
  assert.equal(isEmulatorDll(dll), true);
  assert.equal(isEmulatorDll(dll), true);
  assert.equal(reads.mock.callCount(), 0, 'an untouched dll is not read again');
  reads.mock.restore();

  fs.writeFileSync(dll, Buffer.from('MZ valve original again'));
  assert.equal(isEmulatorDll(dll), false, 'and so is the swap back');
  assert.equal(isEmulatorDll(path.join(path.dirname(dll), 'missing.dll')), false);
});
