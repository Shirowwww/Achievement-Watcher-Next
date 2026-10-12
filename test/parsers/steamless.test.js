'use strict';

// Steamless is a .NET Framework CLI: Windows runs it as it is, Linux runs it under the system's Mono.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const steamless = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steamless.js'));

const LINUX_ONLY = { skip: process.platform === 'win32' && 'Linux-only' };
const tool = { cli: path.join('/cache', 'v3', 'Steamless.CLI.exe'), dir: path.join('/cache', 'v3') };

test('Windows starts Steamless.CLI.exe directly', () => {
  const command = steamless.cliCommand(tool, ['--quiet', 'game.exe'], 'win32');
  assert.equal(command.file, tool.cli);
  assert.deepEqual(command.args, ['--quiet', 'game.exe']);
});

test('Linux runs the CLI under mono with the plugins folder on MONO_PATH', () => {
  const command = steamless.cliCommand(tool, ['--quiet', 'game.exe'], 'linux');
  assert.equal(command.file, 'mono');
  assert.deepEqual(command.args, [tool.cli, '--quiet', 'game.exe']);
  assert.equal(command.env.MONO_PATH, path.join(tool.dir, 'Plugins'));
});

test('without Mono the user is told to install it', LINUX_ONLY, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-steamless-'));
  const savedPath = process.env.PATH;
  t.after(() => {
    process.env.PATH = savedPath;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const exePath = path.join(dir, 'game.exe');
  fs.writeFileSync(exePath, 'MZ');
  process.env.PATH = dir;
  await assert.rejects(
    () => steamless.stripDrm({ steamless: { cli: path.join(dir, 'Steamless.CLI.exe'), dir }, exePath }),
    (err) => err.code === 'MONO_MISSING' && /install the Mono package of your distribution/.test(err.message)
  );
});
