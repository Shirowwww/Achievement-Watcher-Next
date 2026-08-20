'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const souvenir = require('../notification/souvenir.js');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('the packaged HDR helper is resolvable without starting it', () => {
  const helper = souvenir._resolveHdrHelper();
  assert.ok(helper.endsWith(path.join('native', 'aw-next-hdr-screenshot.exe')));
  assert.equal(fs.existsSync(helper), true);
});

test('Automatic uses HDR capture without loading the SDR fallback when it succeeds', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-hdr-success-'));
  const file = path.join(dir, 'capture.png');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let sdrCalls = 0;

  const mode = await souvenir._captureImage(file, 'auto', {
    platform: 'win32',
    hdr: async (output) => fs.writeFileSync(output, Buffer.concat([PNG_SIGNATURE, Buffer.alloc(64)])),
    sdr: async () => {
      sdrCalls += 1;
    },
  });

  assert.equal(mode, 'hdr');
  assert.equal(sdrCalls, 0);
});

test('Automatic removes failed HDR output and safely falls back to the current SDR capture', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-hdr-fallback-'));
  const file = path.join(dir, 'capture.png');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];

  const mode = await souvenir._captureImage(file, 'auto', {
    platform: 'win32',
    hdr: async (output) => {
      calls.push('hdr');
      fs.writeFileSync(output, 'partial');
      fs.writeFileSync(output + '.tmp', 'partial');
      const error = new Error('hdr-inactive');
      error.code = 'hdr-inactive';
      throw error;
    },
    sdr: async (output) => {
      calls.push('sdr');
      assert.equal(fs.existsSync(output + '.tmp'), false);
      fs.writeFileSync(output, 'existing-sdr-path');
    },
  });

  assert.equal(mode, 'sdr');
  assert.deepEqual(calls, ['hdr', 'sdr']);
  assert.equal(fs.readFileSync(file, 'utf8'), 'existing-sdr-path');
});

test('Off and non-Windows platforms bypass the HDR helper', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-hdr-off-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let hdrCalls = 0;
  let sdrCalls = 0;
  const dependencies = {
    hdr: async () => {
      hdrCalls += 1;
    },
    sdr: async () => {
      sdrCalls += 1;
    },
  };

  assert.equal(await souvenir._captureImage(path.join(dir, 'off.png'), 'off', { ...dependencies, platform: 'win32' }), 'sdr');
  assert.equal(await souvenir._captureImage(path.join(dir, 'linux.png'), 'auto', { ...dependencies, platform: 'linux' }), 'sdr');
  assert.equal(hdrCalls, 0);
  assert.equal(sdrCalls, 2);
});

test('helper exit code 2 is recognized as normal SDR state', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-hdr-inactive-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  await assert.rejects(
    souvenir._captureHdr(path.join(dir, 'capture.png'), {
      helper: 'synthetic-helper.exe',
      run: (_helper, _args, _options, callback) => {
        const error = new Error('process exited');
        error.code = 2;
        callback(error, '', 'hdr-inactive');
      },
    }),
    (error) => error.code === 'hdr-inactive'
  );
});
