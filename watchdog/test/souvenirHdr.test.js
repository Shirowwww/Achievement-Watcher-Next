'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const souvenir = require('../notification/souvenir.js');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('the packaged screenshot helper is resolvable without starting it', () => {
  const helper = souvenir._resolveHdrHelper();
  assert.ok(helper.endsWith(path.join('native', 'aw-next-hdr-screenshot.exe')));
  assert.equal(fs.existsSync(helper), true);
});

test('Automatic lets the helper follow the display, Off asks it for the plain capture', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-souvenir-args-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const run = (helper, args, _options, callback) => {
    calls.push(args);
    fs.writeFileSync(args[args.length - 1], Buffer.concat([PNG_SIGNATURE, Buffer.alloc(64)]));
    callback(null, '', '');
  };

  await souvenir._captureNative(path.join(dir, 'auto.png'), 'auto', { helper: 'helper.exe', run });
  await souvenir._captureNative(path.join(dir, 'off.png'), 'off', { helper: 'helper.exe', run });
  assert.deepEqual(calls, [[path.join(dir, 'auto.png')], ['--sdr', path.join(dir, 'off.png')]]);
});

test('nothing else ever takes the screenshot, and a failure leaves no partial file', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-souvenir-fail-'));
  const file = path.join(dir, 'capture.png');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  await assert.rejects(
    souvenir._captureImage(file, 'auto', {
      platform: 'win32',
      capture: async (output) => {
        fs.writeFileSync(output, 'partial');
        fs.writeFileSync(output + '.tmp', 'partial');
        throw Object.assign(new Error('capture failed'), { code: 'capture-failed' });
      },
    }),
    (error) => error.code === 'capture-failed'
  );
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(file + '.tmp'), false);
});

test('a helper that exits cleanly without a PNG is a failure', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-souvenir-empty-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(
    souvenir._captureNative(path.join(dir, 'capture.png'), 'auto', { helper: 'helper.exe', run: (_h, _a, _o, callback) => callback(null, '', '') }),
    (error) => error.code === 'capture-invalid-output'
  );
});

test('no screen grabber is compiled at run time any more', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'notification', 'souvenir.js'), 'utf8');
  assert.doesNotMatch(source, /require\('screenshot-desktop'\)/);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal((manifest.dependencies || {})['screenshot-desktop'], undefined);
});
