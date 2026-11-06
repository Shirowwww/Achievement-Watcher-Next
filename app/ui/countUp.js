'use strict';

/*
  Numbers that roll to their new value instead of jumping (the profile band). Only the digits of a
  text move; a text whose shape changed or reduced motion just writes the value. Steps run on a
  timer, like app.js countTo: a frame callback never runs in a hidden window, so the value would wait.
*/
(function (root) {
  const DEFAULT_DURATION_MS = 450;
  const STEP_MS = 16;
  const running = new WeakMap();

  // Fast start, soft landing, no overshoot.
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

  const numbersIn = (text) => (String(text).match(/\d+/g) || []).map(Number);
  const shapeOf = (text) => String(text).replace(/\d+/g, '#');

  // The text at progress t (0..1): each number moved from its old value toward its new one.
  function frameText(fromText, toText, t) {
    if (t >= 1 || shapeOf(fromText) !== shapeOf(toText)) return String(toText);
    const from = numbersIn(fromText);
    let index = 0;
    return String(toText).replace(/\d+/g, (digits) => {
      const start = from[index++];
      const end = Number(digits);
      return String(Math.round(start + (end - start) * easeOutQuart(t)));
    });
  }

  function prefersReducedMotion() {
    return Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function countTo(element, toText, options = {}) {
    const {
      duration = DEFAULT_DURATION_MS,
      reducedMotion = prefersReducedMotion(),
      now = () => (root.performance ? root.performance.now() : Date.now()),
      requestFrame = (step) => setTimeout(() => step(now()), STEP_MS),
      cancelFrame = (frame) => clearTimeout(frame),
    } = options;
    if (!element) return;
    const target = String(toText);
    const previous = running.get(element);
    // Asked again for the value it is already rolling to: let that count finish.
    if (previous && previous.target === target) return;
    if (previous) cancelFrame(previous.frame);
    running.delete(element);

    const fromText = element.textContent;
    if (reducedMotion || !requestFrame || fromText === target || shapeOf(fromText) !== shapeOf(target)) {
      element.textContent = target;
      return;
    }
    const started = now();
    const step = (time) => {
      const t = Math.min(1, (time - started) / duration);
      element.textContent = frameText(fromText, target, t);
      if (t < 1) running.set(element, { target, frame: requestFrame(step) });
      else running.delete(element);
    };
    running.set(element, { target, frame: requestFrame(step) });
  }

  const api = { countTo, frameText, easeOutQuart };
  root.awCountUp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
