'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { frameText, easeOutQuart, countTo } = require('../../app/ui/countUp.js');

test('the curve starts fast and settles without overshooting', () => {
  assert.equal(easeOutQuart(0), 0);
  assert.equal(easeOutQuart(1), 1);
  assert.ok(easeOutQuart(0.25) > 0.6, 'most of the way after a quarter of the time');
  for (let t = 0; t <= 1; t += 0.05) assert.ok(easeOutQuart(t) <= 1);
});

test('every number in the text moves toward its target, the rest of the text stays', () => {
  assert.equal(frameText('0', '120', 0), '0');
  assert.equal(frameText('0', '120', 1), '120');
  assert.equal(frameText('2/10', '12/40', 1), '12/40');
  const middle = frameText('0/0', '12/40', 0.5);
  assert.match(middle, /^\d+\/\d+$/);
  const [done, total] = middle.split('/').map(Number);
  assert.ok(done > 0 && done < 12 && total > 0 && total < 40);
});

test('text whose shape changed is not tweened', () => {
  assert.equal(frameText('0', '1,204', 0.5), '1,204');
  assert.equal(frameText('-', '12', 0.5), '12');
});

function fakeElement(text) {
  return { textContent: text };
}

test('with reduced motion, or when nothing can animate, the value is written at once', () => {
  const el = fakeElement('0');
  countTo(el, '42', { reducedMotion: true });
  assert.equal(el.textContent, '42');

  const other = fakeElement('0');
  countTo(other, '42', { requestFrame: null });
  assert.equal(other.textContent, '42');
});

test('a count runs frame by frame to the exact target, and a new target restarts from what is shown', () => {
  const frames = [];
  const requestFrame = (fn) => frames.push(fn) && frames.length;
  const cancelFrame = () => {};
  const el = fakeElement('0');
  countTo(el, '100', { duration: 100, requestFrame, cancelFrame, now: () => 0 });
  frames.shift()(50);
  const shown = Number(el.textContent);
  assert.ok(shown > 0 && shown < 100, `half way shows ${shown}`);

  countTo(el, '200', { duration: 100, requestFrame, cancelFrame, now: () => 50 });
  // Asking again for the same target while it rolls must not restart it.
  let restarted = false;
  countTo(el, '200', { duration: 100, requestFrame: () => (restarted = true), cancelFrame, now: () => 60 });
  assert.equal(restarted, false);
});

test('a count reaches its exact target on its last frame', () => {
  const frames = [];
  const el = fakeElement('3');
  countTo(el, '250', { duration: 100, requestFrame: (fn) => frames.push(fn), cancelFrame: () => {}, now: () => 0 });
  frames.shift()(40);
  frames.shift()(500);
  assert.equal(el.textContent, '250');
  assert.equal(frames.length, 0, 'no frame is asked for once the target is shown');
});

// The profile band lives in a window that is often hidden, where frame callbacks never run.
test('by default the count steps on timers and lands on its target', async () => {
  const el = fakeElement('10');
  countTo(el, '20', { duration: 40, reducedMotion: false });
  assert.notEqual(el.textContent, '20', 'the count rolls rather than jumping');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(el.textContent, '20');
});
