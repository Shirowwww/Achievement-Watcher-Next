'use strict';

function createViewportWork({ IntersectionObserverImpl = globalThis.IntersectionObserver, root = null, rootMargin = '320px' } = {}) {
  const pending = new WeakMap();
  let observer = null;

  const run = (element) => {
    const work = pending.get(element);
    if (!work) return;
    pending.delete(element);
    observer?.unobserve(element);
    work();
  };

  if (typeof IntersectionObserverImpl === 'function') {
    observer = new IntersectionObserverImpl(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) run(entry.target);
      },
      { root, rootMargin }
    );
  }

  return {
    schedule(element, work) {
      if (!element || typeof work !== 'function') return;
      pending.set(element, work);
      if (observer) observer.observe(element);
      else run(element);
    },
    cancel(element) {
      if (!element) return;
      pending.delete(element);
      observer?.unobserve(element);
    },
    disconnect() {
      observer?.disconnect();
      observer = null;
    },
  };
}

module.exports = { createViewportWork };
