'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const gsrClip = require('../notification/gsrClip.js');

test('gpu-screen-recorder is found on PATH first, then as its Flathub package', { skip: process.platform === 'win32' && 'Linux-only' }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gsr-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(gsrClip.locate({ env: { PATH: dir }, flatpak: () => true }), null, 'no flatpak command either');

  const flatpak = path.join(dir, 'flatpak');
  fs.writeFileSync(flatpak, '#!/bin/sh\n', { mode: 0o755 });
  assert.deepEqual(gsrClip.locate({ env: { PATH: dir }, flatpak: () => true }), {
    command: 'flatpak',
    prefix: ['run', '--command=gpu-screen-recorder', gsrClip.FLATPAK_ID],
    via: 'flatpak',
  });
  assert.equal(gsrClip.locate({ env: { PATH: dir }, flatpak: () => false }), null, 'flatpak without the package');

  const binary = path.join(dir, 'gpu-screen-recorder');
  fs.writeFileSync(binary, '#!/bin/sh\n', { mode: 0o755 });
  assert.deepEqual(gsrClip.locate({ env: { PATH: dir }, flatpak: () => true }), { command: binary, prefix: [], via: 'path' });
});

test('the clip settings map onto gpu-screen-recorder options', () => {
  const args = gsrClip.replayArgs(
    { clipCodec: 'av1', clipFps: 30, clipQuality: 'low', clipSeconds: 14 },
    { outDir: '/tmp/r', tokenFile: '/tmp/t', wayland: false }
  );
  assert.deepEqual(args, ['-w', 'screen', '-c', 'mp4', '-k', 'av1', '-f', '30', '-q', 'medium', '-r', '14', '-a', 'default_output', '-o', '/tmp/r']);
});
