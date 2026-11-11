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

// The Watchdog no longer creates a clip's folder up front, so the move into it must.
test('a saved replay is moved into a game folder that does not exist yet', async (t) => {
  const { PassThrough } = require('node:stream');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gsr-move-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const replay = path.join(dir, 'replay.mp4');
  fs.writeFileSync(replay, 'mp4');
  const target = path.join(dir, 'Videos', 'Brothers', 'Wishing Well.mp4');
  const stdout = new PassThrough();
  const logs = [];
  const log = { log: (line) => logs.push(line), warn: (line) => logs.push(line) };
  const recorder = gsrClip.createRecorder({ child: { stdout, pid: 1 }, afterMs: 0, log, kill: () => {} });
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

  recorder.save(target);
  await tick();
  stdout.write(replay + '\n');
  await tick();

  assert.equal(fs.readFileSync(target, 'utf8'), 'mp4', logs.join('\n'));
});
