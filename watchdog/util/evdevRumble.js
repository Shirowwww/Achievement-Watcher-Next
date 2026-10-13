'use strict';

const fs = require('fs');
const path = require('path');

/*
  Gamepad rumble on Linux through the kernel's force feedback: every pad whose event device offers
  FF_RUMBLE gets one rumble effect, uploaded with the EVIOCSFF ioctl and started by writing an EV_FF
  event. Pads are readable and writable by the session's user (udev `uaccess`), so no helper and no
  extra package is needed: koffi, already loaded for the controller input, makes the one ioctl call.
  Closing the device erases the effect.
*/

const BY_ID = '/dev/input/by-id';
const SYS_INPUT = '/sys/class/input';
const EV_FF = 0x15;
const FF_RUMBLE = 0x50;
// struct ff_effect is 48 bytes on 64-bit Linux: _IOW('E', 0x80, struct ff_effect).
const FF_EFFECT_SIZE = 48;
const EVIOCSFF = 0x40304580;
const INPUT_EVENT_SIZE = 24;
const DEFAULT_MS = 600;
const MAX_MAGNITUDE = 0xffff;

// A sysfs `capabilities/*` bitmap: hex words, most significant first, each the width of a long.
function hasCapabilityBit(bitmap, bit) {
  const words = String(bitmap || '').trim().split(/\s+/).filter(Boolean).toReversed();
  const bitsPerWord = 64;
  const word = words[Math.floor(bit / bitsPerWord)];
  if (!word) return false;
  return ((BigInt(`0x${word}`) >> BigInt(bit % bitsPerWord)) & 1n) === 1n;
}

function hasRumbleBit(bitmap) {
  return hasCapabilityBit(bitmap, FF_RUMBLE);
}

// /dev/input/by-id/*-event-joystick resolves to /dev/input/eventN; sysfs says if it can rumble.
function rumblePads({ byId = BY_ID, sysInput = SYS_INPUT } = {}) {
  let names = [];
  try {
    names = fs.readdirSync(byId).filter((name) => name.endsWith('-event-joystick'));
  } catch {
    return [];
  }
  const pads = new Set();
  for (const name of names) {
    let device;
    try {
      device = fs.realpathSync(path.join(byId, name));
    } catch {
      continue;
    }
    let bitmap = '';
    try {
      bitmap = fs.readFileSync(path.join(sysInput, path.basename(device), 'device', 'capabilities', 'ff'), 'utf8');
    } catch {
      continue;
    }
    if (hasRumbleBit(bitmap)) pads.add(device);
  }
  return [...pads];
}

// struct ff_effect: type, id (-1 asks for a new one), direction, trigger, replay { length, delay },
// then the union, whose ff_rumble_effect is { strong_magnitude, weak_magnitude } at offset 16.
function rumbleEffect(durationMs, strong = MAX_MAGNITUDE, weak = MAX_MAGNITUDE) {
  const effect = Buffer.alloc(FF_EFFECT_SIZE);
  effect.writeUInt16LE(FF_RUMBLE, 0);
  effect.writeInt16LE(-1, 2);
  effect.writeUInt16LE(Math.min(durationMs, 0xffff), 10);
  effect.writeUInt16LE(strong, 16);
  effect.writeUInt16LE(weak, 18);
  return effect;
}

function playEvent(effectId) {
  const event = Buffer.alloc(INPUT_EVENT_SIZE);
  event.writeUInt16LE(EV_FF, 16);
  event.writeUInt16LE(effectId, 18);
  event.writeInt32LE(1, 20);
  return event;
}

let ioctl = null;
function loadIoctl() {
  if (!ioctl) {
    const koffi = require('koffi');
    ioctl = koffi.load('libc.so.6').func('int ioctl(int fd, unsigned long request, _Inout_ uint8_t *arg)');
  }
  return ioctl;
}

function rumblePad(device, durationMs, { call = loadIoctl } = {}) {
  const fd = fs.openSync(device, 'r+');
  try {
    const effect = rumbleEffect(durationMs);
    if (call()(fd, EVIOCSFF, effect) < 0) throw new Error(`EVIOCSFF refused by ${device}`);
    fs.writeSync(fd, playEvent(effect.readInt16LE(2)));
  } catch (err) {
    fs.closeSync(fd);
    throw err;
  }
  setTimeout(() => fs.closeSync(fd), durationMs + 100).unref();
}

// Same contract as xinput-ffi's rumble(): resolves once every pad was asked, rejects when none could be.
async function rumble({ durationMs = DEFAULT_MS, pads = rumblePads(), play = rumblePad } = {}) {
  if (!pads.length) throw new Error('no gamepad with force feedback');
  const failures = [];
  for (const device of pads) {
    try {
      play(device, durationMs);
    } catch (err) {
      failures.push(`${device}: ${err.message || err}`);
    }
  }
  if (failures.length === pads.length) throw new Error(failures.join('; '));
  return pads.length - failures.length;
}

module.exports = { rumble, rumblePads, hasRumbleBit, hasCapabilityBit, loadIoctl, rumbleEffect, playEvent, EVIOCSFF };
