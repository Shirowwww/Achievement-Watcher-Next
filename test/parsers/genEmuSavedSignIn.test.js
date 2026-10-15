'use strict';

/*
  #125: "Fetch progress counters" asked for the Steam account every time. The generator saves a
  sign-in beside itself, but each release is cached in its own folder, so a newer release, or the one
  matched to a game's emulator, started without it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const gen = require(path.join(__dirname, '..', '..', 'app', 'parser', 'genEmuConfig.js'));
const { TOOL_NAME } = gen._internal;

// A cache whose newest release is `latest`, checked just now, so nothing reaches the network.
function cacheWith(tags, latest) {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-genemu-signin-'));
  for (const [tag, token] of Object.entries(tags)) {
    const dir = path.join(cacheDir, tag, 'generate_emu_config');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, TOOL_NAME), 'MZ');
    if (token) fs.writeFileSync(path.join(dir, 'refresh_tokens.json'), token);
  }
  fs.writeFileSync(path.join(cacheDir, 'latest.txt'), latest);
  fs.writeFileSync(path.join(cacheDir, '.last-check'), String(Date.now()));
  return cacheDir;
}

const tokenOf = (tool) => fs.readFileSync(path.join(tool.dir, 'refresh_tokens.json'), 'utf8');

test('a newer release reuses the sign-in an older one saved', async () => {
  const cacheDir = cacheWith({ old: '{"jane":"saved"}', new: null }, 'new');
  try {
    const tool = await gen.ensureGenerateEmuConfig({ cacheDir });
    assert.equal(tool.tag, 'new');
    assert.equal(tokenOf(tool), '{"jane":"saved"}');
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('the release matched to an emulator reuses it too', async () => {
  const cacheDir = cacheWith({ matched: null, latest: '{"jane":"saved"}' }, 'latest');
  try {
    const tool = await gen.ensureGenerateEmuConfig({ cacheDir, preferredTag: 'matched' });
    assert.equal(tool.tag, 'matched');
    assert.equal(tokenOf(tool), '{"jane":"saved"}');
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('a release keeps its own sign-in, and an empty one is never copied', async () => {
  const cacheDir = cacheWith({ old: '{"jane":"older"}', new: '{"jane":"own"}', other: '{}' }, 'new');
  try {
    assert.equal(tokenOf(await gen.ensureGenerateEmuConfig({ cacheDir })), '{"jane":"own"}');
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
  const empty = cacheWith({ old: '{}', new: null }, 'new');
  try {
    const tool = await gen.ensureGenerateEmuConfig({ cacheDir: empty });
    assert.equal(fs.existsSync(path.join(tool.dir, 'refresh_tokens.json')), false);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
