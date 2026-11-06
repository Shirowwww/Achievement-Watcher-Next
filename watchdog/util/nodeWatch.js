'use strict';

/*
  node-watch probes for recursive support by watching a folder under os.tmpdir(), read once when it
  loads. With TEMP in 8.3 form (C:\Users\JEAN-P~1\...) libuv aborts the whole process on that
  probe's first event, so hand it the long form before it loads.
*/
const fs = require('fs');

if (process.platform === 'win32') {
  for (const key of ['TEMP', 'TMP']) {
    const value = process.env[key];
    if (!value || !value.includes('~')) continue;
    try {
      process.env[key] = fs.realpathSync.native(value);
    } catch {
      /* missing folder: leave it to node-watch */
    }
  }
}

/*
  node-watch decides once whether fs.watch recurses natively, by timing a probe watch for 200 ms. A
  Watchdog busy starting up misses that window and falls back to one watcher per folder for good,
  and that fallback never sees a save written in the same burst as its new appid folder: a game's
  first unlock went unnotified. Windows recurses natively, and so does Linux since Node 20 (19 first
  saves out of 20 missed by the fallback, none natively), so the answer is given up front.
*/
if (process.platform === 'win32' || process.platform === 'linux') {
  const probe = require.resolve('node-watch/lib/has-native-recursive');
  require.cache[probe] = { id: probe, filename: probe, loaded: true, exports: (fn) => (typeof fn === 'function' ? fn(true) : false) };
}

const nodeWatch = require('node-watch');

/*
  node-watch prints a deprecation warning, once per process, for any callback declared with one
  parameter. Every callback reaches it with the two it expects, whatever its caller declared. The
  arguments keep their count: node-watch fills in the options only when given fewer than two.
*/
module.exports = function watch(fpath, ...rest) {
  const callback = rest[rest.length - 1];
  if (typeof callback === 'function') rest[rest.length - 1] = (evt, name) => callback(evt, name);
  return nodeWatch(fpath, ...rest);
};
