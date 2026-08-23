'use strict';

// Defers a module until something actually touches it - the Watchdog can idle for days without
// unlocking an achievement or fetching a schema, so requiring those paths at startup costs RSS for
// the whole session. The Proxy is callable and forwards property access, covering both
// `request(url)` and `request.getJson(url)`. Use only for occasional dependencies, not ones hit every poll.
function lazyRequire(id) {
  let loaded;
  const load = () => (loaded ||= require(id));
  return new Proxy(function lazy() {}, {
    apply: (target, thisArg, args) => Reflect.apply(load(), thisArg, args),
    get: (target, prop) => {
      const value = load()[prop];
      return typeof value === 'function' ? value.bind(load()) : value;
    },
    has: (target, prop) => prop in load(),
  });
}

module.exports = { lazyRequire };
