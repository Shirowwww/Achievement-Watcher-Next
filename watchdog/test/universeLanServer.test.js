'use strict';

// The UniverseLAN server the Watchdog keeps running for games with the GOG fix (util/universeLanServer.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { createUniverseLanServer } = require('../util/universeLanServer.js');

const OLD = { gameDir: 'C:/Games/Old', gogAppId: '1', updatedAt: '2026-11-01T00:00:00.000Z' };
const NEW = { gameDir: 'C:/Games/Dishonored', gogAppId: '1701063787', updatedAt: '2026-11-21T00:00:00.000Z' };
const galaxyDir = (gameDir) => path.join(gameDir, 'Binaries', 'Win32');

function fakeChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

function server({ installs = [NEW], running = false, present = null, platform = 'win32' } = {}) {
  const started = [];
  const lines = [];
  const files = present || installs.map((install) => path.join(galaxyDir(install.gameDir), 'UniverseLANServer.exe'));
  const instance = createUniverseLanServer({
    readInstalls: () => installs,
    findGalaxyDlls: (gameDir) => [{ file: path.join(galaxyDir(gameDir), 'Galaxy.dll'), arch: 'x86' }],
    isRunning: () => running,
    exists: (file) => files.includes(file),
    start: (exe) => {
      const child = fakeChild();
      started.push({ exe, child });
      return child;
    },
    platform,
    log: (line) => lines.push(line),
  });
  return { instance, started, lines };
}

test('a game with the fix gets its server started, once', () => {
  const { instance, started } = server();
  instance.ensure('monitor start');
  instance.ensure('library scan');
  assert.equal(started.length, 1);
  assert.equal(started[0].exe, path.join(galaxyDir(NEW.gameDir), 'UniverseLANServer.exe'));
});

test('the server of the newest fix is the one started, its version matching that client', () => {
  const { instance, started } = server({ installs: [OLD, NEW] });
  instance.ensure('monitor start');
  assert.equal(started[0].exe, path.join(galaxyDir(NEW.gameDir), 'UniverseLANServer.exe'));
});

test('nothing starts with no fixed game, with a server already running, or off Windows', () => {
  for (const options of [{ installs: [] }, { running: true }, { platform: 'linux' }]) {
    const { instance, started } = server(options);
    instance.ensure('monitor start');
    assert.equal(started.length, 0, JSON.stringify(options));
  }
});

test('a fixed game whose server is gone is logged, not started', () => {
  const { instance, started, lines } = server({ present: [] });
  instance.ensure('monitor start');
  assert.equal(started.length, 0);
  assert.match(lines.join('\n'), /no UniverseLANServer found/);
});

test('a server that exited is started again, and stop only ends the one this process started', () => {
  const { instance, started } = server();
  instance.ensure('monitor start');
  started[0].child.exitCode = 0;
  instance.ensure('library scan');
  assert.equal(started.length, 2);
  instance.stop();
  assert.equal(started[1].child.killed, true);
  assert.equal(started[0].child.killed, false);
});
