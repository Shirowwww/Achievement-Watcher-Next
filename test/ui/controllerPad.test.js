'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createPadPicker, isNeutralPad } = require('../../app/ui/controller.js');

function pad(index, { id = `pad ${index}`, mapping = 'standard', pressed = [], axes = [0, 0, 0, 0] } = {}) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  return { index, id, mapping, connected: true, buttons, axes };
}

test('a wheel or any pad without the standard layout is never read', () => {
  const pick = createPadPicker();
  const wheel = pad(0, { id: 'Racing wheel', mapping: '', pressed: [0] });
  assert.equal(pick([wheel]), null);
  const real = pad(1);
  assert.equal(pick([wheel, real]), real);
});

test('the pad in use is kept until another one is pressed', () => {
  const pick = createPadPicker();
  const idleVirtual = pad(0, { id: 'virtual' });
  assert.equal(pick([idleVirtual, pad(1)]), idleVirtual);
  assert.equal(pick([idleVirtual, pad(1, { pressed: [0] })]).index, 1, 'a press elsewhere takes over');
  assert.equal(pick([idleVirtual, pad(1)]).index, 1, 'the chosen pad stays chosen while idle');
});

test('a virtual pad with a button stuck down loses to the pad being pressed', () => {
  const pick = createPadPicker();
  const stuck = pad(0, { id: 'virtual', pressed: [0] });
  assert.equal(pick([stuck, pad(1)]), stuck, 'nothing else has moved yet');
  assert.equal(pick([stuck, pad(1)]), stuck);
  assert.equal(pick([stuck, pad(1, { pressed: [12] })]).index, 1);
  assert.equal(pick([stuck, pad(1)]).index, 1, 'the stuck button never takes it back');
});

test('empty slots and disconnected pads are skipped', () => {
  const pick = createPadPicker();
  const gone = { ...pad(0), connected: false };
  assert.equal(pick([null, gone]), null);
  assert.equal(pick(undefined), null);
});

test('a pad is neutral only with no button held and the left stick at rest', () => {
  assert.equal(isNeutralPad(pad(0)), true);
  assert.equal(isNeutralPad(pad(0, { pressed: [0] })), false);
  assert.equal(isNeutralPad(pad(0, { axes: [0.9, 0, 0, 0] })), false);
  assert.equal(isNeutralPad(pad(0, { axes: [0.2, -0.3, 0, 0] })), true);
});
