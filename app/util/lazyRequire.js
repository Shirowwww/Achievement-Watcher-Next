'use strict';

/*
  Defers a dependency until something actually touches it.

  The renderer requires the whole parser tree at page load, and that tree pulls in the glob engine and
  the HTTP client through a dozen modules - roughly two hundred files read from the asar before the
  first tile is painted, for work that only happens during a scan. A launch that reuses the stored
  library (see util/libraryReuse.js) never scans at all, so it never needs either of them.

  The Proxy is callable and forwards property access, which covers both shapes these are used in:
  `glob(pattern, options)` and `request.getJson(url)`. Use it for a dependency a scan needs, never for
  one the module uses at load time - the indirection is only worth it for what may go untouched.

  The Watchdog has its own copy (watchdog/util/lazyRequire.js): the two processes ship separate
  dependency trees, and neither may require across that boundary.
*/
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
