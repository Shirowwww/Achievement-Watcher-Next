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

// Records what would be settled, so no test touches a real clip folder.
function stubParts() {
  const calls = { settled: [], swept: [] };
  return {
    calls,
    settlePart: async (file) => calls.settled.push(file),
    settleLeftovers: async (dir) => calls.swept.push(dir),
  };
}

function deps(spawner, clipPart = stubParts()) {
  return { platform: 'win32', run: spawner.run, helper: 'aw-next-clip.exe', clipPart };
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

test('nothing runs while clips are off, without a recorder program, or without a game', () => {
  const spawner = fakeSpawner();
  assert.equal(clip.sync({ clip: false }, game, deps(spawner)), null);
  assert.equal(clip.sync(enabled, game, { ...deps(spawner), platform: 'linux', locate: () => null }), null);
  assert.equal(clip.sync(enabled, game, { ...deps(spawner), platform: 'darwin' }), null);
  assert.equal(clip.sync(enabled, null, deps(spawner)), null);
  assert.equal(spawner.children.length, 0);
});

function linuxDeps(spawner, extra = {}) {
  const signals = [];
  return {
    signals,
    platform: 'linux',
    run: spawner.run,
    locate: () => ({ command: '/usr/bin/gpu-screen-recorder', prefix: [], via: 'path' }),
    replayDir: '/tmp/replay',
    profileDir: '/home/me/.config/aw',
    env: { XDG_SESSION_TYPE: 'x11' },
    kill: (pid, signal) => signals.push(signal),
    ...extra,
  };
}

test('on Linux gpu-screen-recorder keeps the replay buffer, through the portal on Wayland', () => {
  const spawner = fakeSpawner();
  clip.sync(enabled, game, linuxDeps(spawner));
  const args = spawner.children[0].args;
  const value = (name) => args[args.indexOf(name) + 1];
  assert.equal(value('-w'), 'screen');
  assert.equal(value('-r'), '20', 'the buffer holds the whole clip');
  assert.equal(value('-f'), '60');
  assert.equal(value('-q'), 'very_high');
  assert.equal(value('-o'), '/tmp/replay');
  assert.equal(args.includes('-restore-portal-session'), false);

  clip.sync(enabled, game, linuxDeps(spawner, { env: { XDG_SESSION_TYPE: 'wayland' } }));
  const wayland = spawner.children[1].args;
  assert.equal(wayland[wayland.indexOf('-w') + 1], 'portal');
  assert.equal(wayland[wayland.indexOf('-portal-session-token-filepath') + 1], path.join('/home/me/.config/aw', '.aw-next-gsr-portal-token'));
});

test('on Linux an unlock saves the replay half a clip later, renamed into the clip folder', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-clip-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const spawner = fakeSpawner();
  const d = linuxDeps(spawner);
  clip.sync(enabled, game, d);
  const file = clip.trigger({ game: 'Some Game', achievement: 'First Blood', dir });
  assert.match(path.basename(file), / - First Blood\.mp4$/);
  assert.equal(clip.trigger({ game: 'Some Game', achievement: 'Second', dir }), file, 'a close unlock joins the same clip');
  assert.deepEqual(d.signals, []);
  t.mock.timers.tick(10000);
  assert.deepEqual(d.signals, ['SIGUSR1']);

  const saved = path.join(dir, 'Replay_2026-10-14_12-00-00.mp4');
  fs.writeFileSync(saved, 'video');
  spawner.children[0].stdout.write(saved + '\n');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fs.readFileSync(file, 'utf8'), 'video');
  assert.equal(fs.existsSync(saved), false);

  clip.stop();
  assert.deepEqual(d.signals, ['SIGUSR1', 'SIGINT'], 'gpu-screen-recorder is asked to quit');
});

test('the software recorder runs in the app, which the Watchdog only drives', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-clip-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sent = [];
  const spawner = fakeSpawner();
  clip.sync({ ...enabled, clipEngine: 'software' }, game, { platform: 'linux', run: spawner.run, send: (msg) => sent.push(msg) });
  assert.equal(spawner.children.length, 0);
  assert.equal(sent[0].clipRecorder.action, 'start');
  assert.equal(sent[0].clipRecorder.settings.clipSeconds, 20);

  const file = clip.trigger({ game: 'Some Game', achievement: 'First Blood', dir });
  assert.match(path.basename(file), / - First Blood\.webm$/);
  assert.deepEqual(sent[1], { clipRecorder: { action: 'trigger', file } });

  clip.sync({ ...enabled, clipEngine: 'software' }, null, {});
  assert.deepEqual(sent[2], { clipRecorder: { action: 'stop' } });
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

// A clock the tests move together with the mocked timers.
function clockedDeps(t, spawner) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const clock = { t: 1000 };
  const advance = (ms) => {
    for (let left = ms; left > 0; left -= 1000) {
      clock.t += Math.min(1000, left);
      t.mock.timers.tick(Math.min(1000, left));
    }
  };
  return { deps: { ...deps(spawner), now: () => clock.t }, advance };
}

async function say(child, line) {
  child.stdout.write(`${line}\n`);
  await new Promise((resolve) => setImmediate(resolve));
}

test('a recorder that dies is restarted with a growing delay, a few times, then left alone', (t) => {
  const spawner = fakeSpawner();
  const { deps: d, advance } = clockedDeps(t, spawner);
  clip.sync(enabled, game, d);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(clip.restartDelay), [5000, 10000, 20000, 40000, 60000, 60000]);

  spawner.children.at(-1).emit('exit', 1);
  advance(4000);
  assert.equal(spawner.children.length, 1, 'the first restart waits 5 s');
  advance(1000);
  assert.equal(spawner.children.length, 2);

  spawner.children.at(-1).emit('exit', 1);
  advance(5000);
  assert.equal(spawner.children.length, 2, 'the second waits twice as long');
  advance(5000);
  assert.equal(spawner.children.length, 3);

  for (let i = 2; i < 5; i++) {
    spawner.children.at(-1).emit('exit', 1);
    advance(clip.restartDelay(i));
  }
  assert.equal(spawner.children.length, 6, 'five restarts at most for one game');
  spawner.children.at(-1).emit('exit', 1);
  advance(120000);
  assert.equal(spawner.children.length, 6);
});

test('a recorder that keeps reporting is left alone, one that goes silent is killed and restarted', async (t) => {
  const spawner = fakeSpawner();
  const { deps: d, advance } = clockedDeps(t, spawner);
  clip.sync(enabled, game, d);
  const first = spawner.children[0];
  let killed = 0;
  const kill = first.kill;
  first.kill = () => {
    killed += 1;
    kill();
  };

  await say(first, 'ready encoder="x" codec=h264 fps=60');
  for (let i = 0; i < 8; i++) {
    advance(5000);
    await say(first, 'stats seconds=5 encoded=300 dropped=0 cpu=1.00% peak-memory=120MB');
  }
  assert.equal(killed, 0, 'forty seconds of regular reports');

  advance(15000);
  assert.equal(killed, 0, 'silent for 15 s is still allowed');
  advance(5000);
  assert.equal(killed, 1, 'silent for 20 s is stuck');
  assert.equal(spawner.children.length, 1);
  advance(5000);
  assert.equal(spawner.children.length, 2, 'and the restart follows the usual delay');
});

test('a recorder gets longer to say its first word, and a log line is not a sign of life', async (t) => {
  const spawner = fakeSpawner();
  const { deps: d, advance } = clockedDeps(t, spawner);
  clip.sync(enabled, game, d);
  const child = spawner.children[0];
  let killed = 0;
  child.kill = () => {
    killed += 1;
    child.emit('exit', null);
  };
  advance(25000);
  await say(child, 'log capture unavailable (1): no output');
  advance(5000);
  assert.equal(killed, 0, 'a cold start may take 30 s');
  advance(5000);
  assert.equal(killed, 1, 'a log line did not count as a report');
});

test('a recorder that stayed up for a while gets its restarts back', async (t) => {
  const spawner = fakeSpawner();
  const { deps: d, advance } = clockedDeps(t, spawner);
  clip.sync(enabled, game, d);
  for (let i = 0; i < 4; i++) {
    spawner.children.at(-1).emit('exit', 1);
    advance(clip.restartDelay(i));
  }
  assert.equal(spawner.children.length, 5);
  const steady = spawner.children.at(-1);
  for (let i = 0; i < 26; i++) {
    await say(steady, 'stats seconds=5 encoded=300 dropped=0 cpu=1.00% peak-memory=120MB');
    advance(5000);
  }
  steady.emit('exit', 1);
  advance(5000);
  assert.equal(spawner.children.length, 6, 'the next death waits the first delay again');
});

test('a recorder that exits with the code of an unsupported machine is not restarted', (t) => {
  const spawner = fakeSpawner();
  const { deps: d, advance } = clockedDeps(t, spawner);
  clip.sync(enabled, game, d);
  spawner.children[0].emit('exit', 4);
  advance(120000);
  assert.equal(spawner.children.length, 1);
  assert.equal(clip.sync(enabled, game, d), null, 'and stays off until the settings change');
  assert.equal(spawner.children.length, 1);

  clip.sync({ ...enabled, clipFps: 30 }, game, d);
  assert.equal(spawner.children.length, 2);
  spawner.children[1].emit('exit', 137);
  advance(5000);
  assert.equal(spawner.children.length, 3, 'any other code is retried');
});

test('the screen rate is passed to the recorder as a word', () => {
  const spawner = fakeSpawner();
  clip.sync({ ...enabled, clipFps: 'unlocked' }, game, deps(spawner));
  const args = spawner.children[0].args;
  assert.equal(args[args.indexOf('--fps') + 1], 'unlocked');
});

test('a recorder that dies while writing a clip has that file settled, not the one it finished', async () => {
  const spawner = fakeSpawner();
  const parts = stubParts();
  clip.sync(enabled, game, deps(spawner, parts));
  const child = spawner.children[0];
  await say(child, 'writing C:\\Clips\\Game\\a.mp4');
  await say(child, 'saved C:\\Clips\\Game\\a.mp4');
  await say(child, 'writing C:\\Clips\\Game\\b.mp4');
  child.emit('exit', null);
  assert.deepEqual(parts.calls.settled, ['C:\\Clips\\Game\\b.mp4.part']);
});

test('quitting waits for the clip being written, unless its writing hung', async (t) => {
  const spawner = fakeSpawner();
  const { deps: d, advance } = clockedDeps(t, spawner);
  let killed = 0;
  const watch = (child) => {
    child.kill = () => {
      killed += 1;
    };
    return child;
  };

  clip.sync(enabled, game, d);
  const first = watch(spawner.children[0]);
  await say(first, 'writing C:\\Clips\\Game\\a.mp4');
  clip.stop();
  advance(45000);
  assert.equal(killed, 0, 'past the quit timeout, the clip is still being written');
  await say(first, 'saved C:\\Clips\\Game\\a.mp4');
  advance(1000);
  assert.equal(killed, 1, 'killed once the clip is safe');

  clip.sync(enabled, game, d);
  const second = watch(spawner.children[1]);
  await say(second, 'writing C:\\Clips\\Game\\b.mp4');
  clip.stop();
  advance(58000);
  assert.equal(killed, 1);
  advance(2000);
  assert.equal(killed, 2, 'a write that hangs for a minute does not hold the recorder forever');
});

test('a silent recorder is not killed in the middle of a clip', async (t) => {
  const spawner = fakeSpawner();
  const { deps: d, advance } = clockedDeps(t, spawner);
  clip.sync(enabled, game, d);
  const child = spawner.children[0];
  let killed = 0;
  child.kill = () => {
    killed += 1;
    child.emit('exit', null);
  };
  await say(child, 'ready encoder="x" codec=h264 fps=60');
  await say(child, 'writing C:\\Clips\\Game\\a.mp4');
  advance(55000);
  assert.equal(killed, 0);
  advance(10000);
  assert.equal(killed, 1);
});

test('a Windows recorder settles what earlier ones left in the clip folder it records into; a Linux one does not', () => {
  const spawner = fakeSpawner();
  const parts = stubParts();
  clip.sync({ ...enabled, clipDir: ' D:\\Clips ' }, game, deps(spawner, parts));
  clip.stop();
  clip.sync(enabled, game, deps(spawner, parts));
  clip.stop();
  clip.sync(enabled, game, { ...linuxDeps(spawner), clipPart: parts });
  assert.deepEqual(parts.calls.swept, ['D:\\Clips', clip.defaultDir()]);
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
