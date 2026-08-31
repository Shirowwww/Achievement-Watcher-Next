'use strict';

// Defers a module until something actually touches it - the Watchdog can idle for days without
// unlocking an achievement or fetching a schema, so requiring those paths at startup costs RSS for
// the whole session. The Proxy is callable and forwards property access, covering both
// `request(url)` and `request.getJson(url)`. Use only for occasional dependencies, not ones hit every poll.
function lazyRequire(id) {
  let loaded;
  const load = () => (loaded ||= require(id));
  // One stable forwarder per property so `mod.fn === mod.fn`: a fresh bound function per access
  // silently breaks `emitter.off('x', mod.handler)`. It forwards to the module's current export
  // rather than caching a bound snapshot, because some modules replace theirs after load.
  const forwarders = new Map();
  return new Proxy(function lazy() {}, {
    apply: (target, thisArg, args) => Reflect.apply(load(), thisArg, args),
    get: (target, prop) => {
      const module = load();
      if (typeof module[prop] !== 'function') return module[prop];
      if (!forwarders.has(prop)) {
        forwarders.set(prop, function forwarded(...args) {
          const current = load();
          return current[prop].apply(current, args);
        });
      }
      return forwarders.get(prop);
    },
    has: (target, prop) => prop in load(),
  });
}

module.exports = { lazyRequire };
