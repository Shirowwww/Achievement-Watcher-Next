'use strict';

/*
  One function, loaded when it is first called.

  `crc` is 39 files, required by four parser modules, and everything that hashes with it happens
  during a scan or a blacklist lookup - never while the app starts. On a launch that reuses its
  stored library nothing here is ever touched, so the cost of reading those files belonged nowhere
  near the startup path. The memo means a scan still pays for the require exactly once.
*/
let crc32Impl = null;

function crc32(value) {
  if (!crc32Impl) crc32Impl = require('crc').crc32;
  return crc32Impl(value);
}

module.exports = { crc32 };
