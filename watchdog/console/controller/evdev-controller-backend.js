'use strict';

const fs = require('fs');
const path = require('path');
const { hasCapabilityBit, loadIoctl } = require('../../util/evdevRumble.js');

/*
  Linux controller input, read from each pad's event device. Like XInput it is a snapshot per poll:
  EVIOCGKEY returns the keys held down and EVIOCGABS each axis, so nothing is consumed from the
  device and the game keeps receiving every event. Pads are readable by the session's user (udev
  `uaccess`), so no focus, helper or extra package is needed.
*/

const SYS_INPUT = '/sys/class/input';
const DEV_INPUT = '/dev/input';
const RESCAN_MS = 2000;
const MAX_PADS = 4;

const BTN_SOUTH = 0x130;
const BTN_MODE = 0x13c;
// xpad's codes, which Steam Input's virtual pad and most drivers follow: BTN_X is the left face button.
const BUTTON_CODES = [
  [0x130, 'A'],
  [0x131, 'B'],
  [0x133, 'X'],
  [0x134, 'Y'],
  [0x136, 'LEFT_SHOULDER'],
  [0x137, 'RIGHT_SHOULDER'],
  [0x13a, 'BACK'],
  [0x13b, 'START'],
  [0x13d, 'LEFT_THUMB'],
  [0x13e, 'RIGHT_THUMB'],
  [0x220, 'DPAD_UP'],
  [0x221, 'DPAD_DOWN'],
  [0x222, 'DPAD_LEFT'],
  [0x223, 'DPAD_RIGHT'],
];
const ABS = { X: 0x00, Y: 0x01, Z: 0x02, RX: 0x03, RY: 0x04, RZ: 0x05, HAT0X: 0x10, HAT0Y: 0x11 };

const KEY_BYTES = 96; // (KEY_MAX + 1) / 8
const ABSINFO_SIZE = 24; // struct input_absinfo: value, minimum, maximum, fuzz, flat, resolution
const iocRead = (nr, size) => ((2 << 30) | (size << 16) | (0x45 << 8) | nr) >>> 0;
const EVIOCGKEY = iocRead(0x18, KEY_BYTES);
const eviocgabs = (axis) => iocRead(0x40 + axis, ABSINFO_SIZE);

function isKeyDown(keys, code) {
  return (keys[code >> 3] & (1 << (code & 7))) !== 0;
}

function axisUnit(info) {
  if (!info || info.max <= info.min) return 0;
  return ((info.value - info.min) / (info.max - info.min)) * 2 - 1;
}

function triggerByte(info) {
  if (!info || info.max <= info.min) return 0;
  return Math.round((255 * (info.value - info.min)) / (info.max - info.min));
}

// Many pads report the d-pad as a hat rather than as buttons.
function hatButtons(axes, masks) {
  const x = axes.get(ABS.HAT0X)?.value || 0;
  const y = axes.get(ABS.HAT0Y)?.value || 0;
  return (
    (x < 0 ? masks.DPAD_LEFT : 0) |
    (x > 0 ? masks.DPAD_RIGHT : 0) |
    (y < 0 ? masks.DPAD_UP : 0) |
    (y > 0 ? masks.DPAD_DOWN : 0)
  );
}

// Raw state in XInput's shape; evdev's Y axes grow downwards, XInput's upwards.
function stateFromReadings(keys, axes, { buttonMasks, guideMask, deviceKey }) {
  let buttons = hatButtons(axes, buttonMasks);
  for (const [code, name] of BUTTON_CODES) {
    if (isKeyDown(keys, code)) buttons |= buttonMasks[name];
  }
  return {
    buttons: buttons >>> 0,
    systemButtons: isKeyDown(keys, BTN_MODE) ? guideMask : 0,
    leftTrigger: triggerByte(axes.get(ABS.Z)),
    rightTrigger: triggerByte(axes.get(ABS.RZ)),
    leftStickX: axisUnit(axes.get(ABS.X)),
    leftStickY: -axisUnit(axes.get(ABS.Y)),
    rightStickX: axisUnit(axes.get(ABS.RX)),
    rightStickY: -axisUnit(axes.get(ABS.RY)),
    deviceKey,
  };
}

// Event devices that have a gamepad's south button, lowest number first.
function listPads(sysInput = SYS_INPUT) {
  let names = [];
  try {
    names = fs.readdirSync(sysInput).filter((name) => /^event\d+$/.test(name));
  } catch {
    return [];
  }
  const pads = [];
  for (const name of names) {
    const caps = path.join(sysInput, name, 'device', 'capabilities');
    try {
      if (!hasCapabilityBit(fs.readFileSync(path.join(caps, 'key'), 'utf8'), BTN_SOUTH)) continue;
      const abs = fs.readFileSync(path.join(caps, 'abs'), 'utf8');
      pads.push({ name, axes: Object.values(ABS).filter((axis) => hasCapabilityBit(abs, axis)) });
    } catch {
      continue;
    }
  }
  return pads.sort((a, b) => Number(a.name.slice(5)) - Number(b.name.slice(5))).slice(0, MAX_PADS);
}

function createEvdevPollingBackend(logger, options = {}) {
  const { buttonMasks, guideMask } = options;
  const sysInput = options.sysInput || SYS_INPUT;
  const devInput = options.devInput || DEV_INPUT;
  const ioctl = options.ioctl || loadIoctl();
  const opened = new Map();
  const refused = new Set();
  let scannedAt = 0;

  function close(name) {
    try {
      fs.closeSync(opened.get(name).fd);
    } catch {}
    opened.delete(name);
  }

  function rescan() {
    scannedAt = Date.now();
    const pads = listPads(sysInput);
    const present = new Set(pads.map((pad) => pad.name));
    for (const name of opened.keys()) {
      if (!present.has(name)) close(name);
    }
    for (const pad of pads) {
      if (opened.has(pad.name)) continue;
      try {
        opened.set(pad.name, { fd: fs.openSync(path.join(devInput, pad.name), 'r'), axes: pad.axes });
        refused.delete(pad.name);
        logger.info('controller:evdev:opened', { device: pad.name });
      } catch (err) {
        if (!refused.has(pad.name)) {
          refused.add(pad.name);
          logger.warn('controller:evdev:open-failed', { device: pad.name, error: err.message || String(err) });
        }
      }
    }
  }

  function read(name, { fd, axes }) {
    const keys = Buffer.alloc(KEY_BYTES);
    if (ioctl(fd, EVIOCGKEY, keys) < 0) throw new Error(`EVIOCGKEY refused by ${name}`);
    const values = new Map();
    for (const axis of axes) {
      const info = Buffer.alloc(ABSINFO_SIZE);
      if (ioctl(fd, eviocgabs(axis), info) < 0) throw new Error(`EVIOCGABS refused by ${name}`);
      values.set(axis, { value: info.readInt32LE(0), min: info.readInt32LE(4), max: info.readInt32LE(8) });
    }
    return stateFromReadings(keys, values, { buttonMasks, guideMask, deviceKey: `evdev:${name}` });
  }

  return {
    type: 'evdev',
    poll() {
      if (Date.now() - scannedAt >= RESCAN_MS) rescan();
      const states = [];
      for (const [name, pad] of opened) {
        try {
          states.push(read(name, pad));
        } catch (err) {
          logger.warn('controller:evdev:read-failed', { device: name, error: err.message || String(err) });
          close(name);
        }
      }
      return states;
    },
    shutdown() {
      for (const name of opened.keys()) close(name);
    },
  };
}

module.exports = { createEvdevPollingBackend, listPads, stateFromReadings, EVIOCGKEY, eviocgabs, ABS };
