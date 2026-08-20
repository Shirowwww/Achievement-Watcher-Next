'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createViewportWork } = require('../../app/util/viewportWork.js');

class FakeIntersectionObserver {
  static instances = [];

  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observed = new Set();
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element) {
    this.observed.add(element);
  }

  unobserve(element) {
    this.observed.delete(element);
  }

  disconnect() {
    this.observed.clear();
  }
}

test('artwork work starts only near the viewport and is deduplicated per tile', () => {
  FakeIntersectionObserver.instances = [];
  const queue = createViewportWork({ IntersectionObserverImpl: FakeIntersectionObserver, rootMargin: '400px' });
  const observer = FakeIntersectionObserver.instances[0];
  const tile = {};
  const calls = [];

  queue.schedule(tile, () => calls.push('old'));
  queue.schedule(tile, () => calls.push('latest'));
  assert.deepEqual(calls, []);
  assert.equal(observer.observed.size, 1);
  assert.equal(observer.options.rootMargin, '400px');

  observer.callback([{ target: tile, isIntersecting: true }]);
  observer.callback([{ target: tile, isIntersecting: true }]);
  assert.deepEqual(calls, ['latest']);
  assert.equal(observer.observed.size, 0);
});

test('artwork work runs immediately when IntersectionObserver is unavailable', () => {
  const calls = [];
  const queue = createViewportWork({ IntersectionObserverImpl: null });
  queue.schedule({}, () => calls.push('ran'));
  assert.deepEqual(calls, ['ran']);
});
