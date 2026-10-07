'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const clip = require('../notification/clip.js');

// A stand-in for aw-next-clip.exe: records what it is told and can print lines or exit.
function fakeSpawner() {
  const children = [];
  const run = (helper, args) => {
    const child = new EventEmitter();
    child.args = args;
    child.stdout = new PassThrough();
    child.input = '';
    child.stdin = {
      write(text) {
        child.input += text;
      },
      end(text) {
        child.input += text || '';
        child.ended = true;
      },
    };
    child.kill = () => child.emit('exit', null);
    children.push(child);
    return child;
  };
  return { run, children };
}

const game = { name: 'Some Game', pids: new Set([4242]) };
const enabled = { clip: true, clipSeconds: 20, clipFps: '60', clipQuality: 'high', hdr: 'auto' };

function deps(spawner) {
  return { platform: 'win32', run: spawner.run, helper: 'aw-next-clip.exe' };
}

test.afterEach(() => clip.stop());

test('the Watchdog keeps the recorder in step with games and settings, and unlocks reach it', () => {
  const watchdogSource = fs.readFileSync(path.join(__dirname, '..', 'watchdog.js'), 'utf8');
  const toasterSource = fs.readFileSync(path.join(__dirname, '..', 'notification', 'toaster.js'), 'utf8');
  // After each change of the running games (launch, exit, source disabled, startup sync)...
  assert.equal(watchdogSource.match(/forwardGameActivity\(\);\n\s+syncClipRecorder\(\);/g).length, 3);
  // ...and after every settings reload.
  assert.match(watchdogSource, /debug\.log\('Options loaded'\);\n\s+syncClipRecorder\(\);/);
  assert.match(toasterSource, /!message\.silent && !message\.progress\) \{\n\s+require\('\.\/clip\.js'\)\.trigger\(/);
});

test('nothing runs while clips are off, off Windows, or without a game', () => {
  const spawner = fakeSpawner();
  assert.equal(clip.sync({ clip: false }, game, deps(spawner)), null);
  assert.equal(clip.sync(enabled, game, { ...deps(spawner), platform: 'linux' }), null);
  assert.equal(clip.sync(enabled, null, deps(spawner)), null);
  assert.equal(spawner.children.length, 0);
});

test('the recorder follows the game and the settings, the unlock in the middle of the clip', () => {
  const spawner = fakeSpawner();
  clip.sync(enabled, game, deps(spawner));
  assert.equal(spawner.children.length, 1);
  const args = spawner.children[0].args;
  const value = (name) => args[args.indexOf(name) + 1];
  assert.equal(value('--pid'), '4242');
  assert.equal(value('--fps'), '60');
  assert.equal(value('--quality'), 'high');
  assert.equal(value('--before'), '10000');
  assert.equal(value('--after'), '10000');

  clip.sync({ ...enabled }, game, deps(spawner));
  assert.equal(spawner.children.length, 1, 'unchanged settings keep the running recorder');

  clip.sync({ ...enabled, clipSeconds: 30 }, game, deps(spawner));
  assert.equal(spawner.children.length, 2, 'new settings start a new recorder');
  assert.equal(spawner.children[0].input, 'quit\n', 'the old one finishes its pending clips and leaves');
  assert.equal(spawner.children[1].args[spawner.children[1].args.indexOf('--before') + 1], '15000');

  clip.sync(enabled, null, deps(spawner));
  assert.equal(spawner.children[1].input, 'quit\n', 'the last game closing stops the recorder');
});

test('clips have their own folder, Videos by default', () => {
  assert.equal(clip.defaultDir(), path.join(os.homedir(), 'Videos', 'Achievement Watcher Next'));
  const toasterSource = fs.readFileSync(path.join(__dirname, '..', 'notification', 'toaster.js'), 'utf8');
  assert.match(toasterSource, /require\('\.\/clip\.js'\)\.trigger\(\{[^}]*dir: options\.souvenir\.clipDir,/);
});

test('an unlock asks for an MP4 in the clip folder', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-clip-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(clip.trigger({ game: 'Some Game', achievement: 'First Blood', dir }), null, 'no recorder, no request');

  const spawner = fakeSpawner();
  clip.sync(enabled, game, deps(spawner));
  const file = clip.trigger({ game: 'Some Game', achievement: 'First Blood', dir });
  assert.equal(path.dirname(file), path.join(dir, 'Some Game'));
  assert.match(path.basename(file), / - First Blood\.mp4$/);
  assert.equal(spawner.children[0].input, `clip 0 ${file}\n`);
});

test('a recorder that dies is restarted a few times, then left alone', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const spawner = fakeSpawner();
  clip.sync(enabled, game, deps(spawner));
  for (let i = 0; i < 3; i++) {
    spawner.children.at(-1).emit('exit', 1);
    t.mock.timers.tick(5000);
  }
  assert.equal(spawner.children.length, 4);
  spawner.children.at(-1).emit('exit', 1);
  t.mock.timers.tick(5000);
  assert.equal(spawner.children.length, 4, 'three restarts at most for one game');
});

test('a GPU without a hardware encoder is not retried until the settings change', async () => {
  const spawner = fakeSpawner();
  clip.sync(enabled, game, deps(spawner));
  const child = spawner.children[0];
  child.stdout.write('error no-encoder no hardware video encoder on this GPU\n');
  await new Promise((resolve) => setImmediate(resolve));
  child.emit('exit', 0);
  clip.sync(enabled, game, deps(spawner));
  assert.equal(spawner.children.length, 1);

  clip.sync({ ...enabled, clipCodec: 'h264', clipFps: 30 }, game, deps(spawner));
  assert.equal(spawner.children.length, 2);
});
