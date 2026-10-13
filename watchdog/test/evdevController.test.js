'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const evdev = require('../console/controller/evdev-controller-backend.js');
const { XINPUT_BUTTONS } = require('../console/controller/controller-input-manager.js');

const masks = { ...XINPUT_BUTTONS };
const GUIDE = 1;

function keysDown(...codes) {
  const keys = Buffer.alloc(96);
  for (const code of codes) keys[code >> 3] |= 1 << (code & 7);
  return keys;
}

function fakeSysfs(pads) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-evdev-pad-'));
  const sys = path.join(root, 'sys');
  const dev = path.join(root, 'dev');
  fs.mkdirSync(dev);
  for (const [name, key, abs] of pads) {
    const caps = path.join(sys, name, 'device', 'capabilities');
    fs.mkdirSync(caps, { recursive: true });
    fs.writeFileSync(path.join(caps, 'key'), `${key}\n`);
    fs.writeFileSync(path.join(caps, 'abs'), `${abs}\n`);
    fs.writeFileSync(path.join(dev, name), '');
  }
  return { root, sys, dev };
}

// An xpad bitmap: BTN_SOUTH (0x130) is bit 48 of the fifth 64-bit word.
const PAD_KEYS = '7cdb000000000000 0 0 0 0';
const KEYBOARD_KEYS = '0 0 0 0 fffffffffffffffe';
const PAD_ABS = '3003f';

test('the request numbers match the kernel headers', () => {
  assert.equal(evdev.EVIOCGKEY, 0x80604518);
  assert.equal(evdev.eviocgabs(evdev.ABS.RY), 0x80184544);
});

test('face buttons, shoulders, guide and the d-pad hat become XInput masks', () => {
  const axes = new Map([
    [evdev.ABS.HAT0X, { value: -1, min: -1, max: 1 }],
    [evdev.ABS.HAT0Y, { value: 1, min: -1, max: 1 }],
  ]);
  const state = evdev.stateFromReadings(keysDown(0x130, 0x134, 0x136, 0x13a, 0x13c), axes, {
    buttonMasks: masks,
    guideMask: GUIDE,
    deviceKey: 'evdev:event3',
  });
  assert.equal(
    state.buttons,
    XINPUT_BUTTONS.A | XINPUT_BUTTONS.Y | XINPUT_BUTTONS.LEFT_SHOULDER | XINPUT_BUTTONS.BACK |
      XINPUT_BUTTONS.DPAD_LEFT | XINPUT_BUTTONS.DPAD_DOWN,
  );
  assert.equal(state.systemButtons, GUIDE);
  assert.equal(state.deviceKey, 'evdev:event3');
});

test('sticks are scaled to -1..1 with up positive, triggers to 0..255', () => {
  const axes = new Map([
    [evdev.ABS.X, { value: 32767, min: -32768, max: 32767 }],
    [evdev.ABS.Y, { value: -32768, min: -32768, max: 32767 }],
    [evdev.ABS.RX, { value: 0, min: 0, max: 255 }],
    [evdev.ABS.RY, { value: 255, min: 0, max: 255 }],
    [evdev.ABS.Z, { value: 1023, min: 0, max: 1023 }],
    [evdev.ABS.RZ, { value: 0, min: 0, max: 1023 }],
  ]);
  const state = evdev.stateFromReadings(keysDown(), axes, { buttonMasks: masks, guideMask: GUIDE });
  assert.equal(state.leftStickX, 1);
  assert.equal(state.leftStickY, 1);
  assert.equal(state.rightStickX, -1);
  assert.equal(state.rightStickY, -1);
  assert.equal(state.leftTrigger, 255);
  assert.equal(state.rightTrigger, 0);
  assert.equal(state.buttons, 0);
});

test('only event devices with a gamepad south button are pads, in device order', () => {
  const { root, sys } = fakeSysfs([
    ['event12', PAD_KEYS, PAD_ABS],
    ['event4', KEYBOARD_KEYS, '0'],
    ['event9', PAD_KEYS, '3'],
  ]);
  try {
    assert.deepEqual(evdev.listPads(sys), [
      { name: 'event9', axes: [evdev.ABS.X, evdev.ABS.Y] },
      { name: 'event12', axes: [0, 1, 2, 3, 4, 5, 0x10, 0x11] },
    ]);
    assert.deepEqual(evdev.listPads(path.join(root, 'missing')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the backend polls every pad through the ioctls and drops one that stops answering', () => {
  const { root, sys, dev } = fakeSysfs([['event7', PAD_KEYS, '3']]);
  const logs = [];
  const logger = { info: () => {}, warn: (event) => logs.push(event) };
  let broken = false;
  const ioctl = (fd, request, buffer) => {
    if (broken) return -1;
    if (request === evdev.EVIOCGKEY) {
      keysDown(0x131).copy(buffer);
      return 0;
    }
    buffer.writeInt32LE(request === evdev.eviocgabs(evdev.ABS.X) ? 100 : 0, 0);
    buffer.writeInt32LE(-100, 4);
    buffer.writeInt32LE(100, 8);
    return 0;
  };
  const backend = evdev.createEvdevPollingBackend(logger, { buttonMasks: masks, guideMask: GUIDE, sysInput: sys, devInput: dev, ioctl });
  try {
    const [state] = backend.poll();
    assert.equal(backend.type, 'evdev');
    assert.equal(state.buttons, XINPUT_BUTTONS.B);
    assert.equal(state.leftStickX, 1);
    assert.equal(state.deviceKey, 'evdev:event7');
    broken = true;
    assert.deepEqual(backend.poll(), []);
    assert.deepEqual(logs, ['controller:evdev:read-failed']);
  } finally {
    backend.shutdown();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
