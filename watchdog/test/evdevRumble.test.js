'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const evdev = require('../util/evdevRumble.js');

test('FF_RUMBLE is read from the capabilities bitmap, whatever the number of words', () => {
  // xpad reports "107030000 0": FF_RUMBLE (80) is bit 16 of the second 64-bit word.
  assert.equal(evdev.hasRumbleBit('107030000 0'), true);
  assert.equal(evdev.hasRumbleBit('10000 0'), true);
  assert.equal(evdev.hasRumbleBit('20000 0'), false);
  assert.equal(evdev.hasRumbleBit('7030000 0 0'), false);
  assert.equal(evdev.hasRumbleBit('0'), false);
  assert.equal(evdev.hasRumbleBit(''), false);
});

test('the rumble effect and its play event have the kernel layout', () => {
  const effect = evdev.rumbleEffect(600);
  assert.equal(effect.length, 48);
  assert.equal(effect.readUInt16LE(0), 0x50);
  assert.equal(effect.readInt16LE(2), -1);
  assert.equal(effect.readUInt16LE(10), 600);
  assert.equal(effect.readUInt16LE(16), 0xffff);
  assert.equal(effect.readUInt16LE(18), 0xffff);
  assert.equal(evdev.EVIOCSFF, (1 << 30) | (48 << 16) | (0x45 << 8) | 0x80);

  const play = evdev.playEvent(3);
  assert.equal(play.length, 24);
  assert.deepEqual([play.readUInt16LE(16), play.readUInt16LE(18), play.readInt32LE(20)], [0x15, 3, 1]);
});

test('only joystick event devices that can rumble are used', { skip: process.platform === 'win32' && 'Linux-only' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-evdev-'));
  try {
    const byId = path.join(root, 'by-id');
    const sys = path.join(root, 'sys');
    fs.mkdirSync(byId);
    for (const [event, ff] of [['event5', '10000 0'], ['event6', '0']]) {
      fs.writeFileSync(path.join(root, event), '');
      fs.mkdirSync(path.join(sys, event, 'device', 'capabilities'), { recursive: true });
      fs.writeFileSync(path.join(sys, event, 'device', 'capabilities', 'ff'), `${ff}\n`);
    }
    fs.symlinkSync(path.join(root, 'event5'), path.join(byId, 'usb-Pad-event-joystick'));
    fs.symlinkSync(path.join(root, 'event6'), path.join(byId, 'usb-Wheel-event-joystick'));
    fs.symlinkSync(path.join(root, 'event5'), path.join(byId, 'usb-Pad-joystick'));
    assert.deepEqual(evdev.rumblePads({ byId, sysInput: sys }), [fs.realpathSync(path.join(root, 'event5'))]);
    assert.deepEqual(evdev.rumblePads({ byId: path.join(root, 'missing'), sysInput: sys }), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rumble asks every pad, fails only when none could rumble', async () => {
  const asked = [];
  assert.equal(await evdev.rumble({ pads: ['/a', '/b'], play: (device, ms) => asked.push([device, ms]) }), 2);
  assert.deepEqual(asked, [['/a', 600], ['/b', 600]]);
  const failing = () => {
    throw new Error('EVIOCSFF refused');
  };
  await assert.rejects(evdev.rumble({ pads: [] }), /no gamepad/);
  await assert.rejects(evdev.rumble({ pads: ['/a'], play: failing }), /EVIOCSFF refused/);
  assert.equal(await evdev.rumble({ pads: ['/a', '/b'], play: (device) => device === '/a' && failing() }), 1);
});
