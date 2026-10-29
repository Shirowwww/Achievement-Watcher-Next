'use strict';

// Preloaded (node --require) into a forked process to make it see what a packaged build's
// ELECTRON_RUN_AS_NODE child sees: no 'electron' module and no '@electron/remote' to load.
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function withoutElectron(request, parent, isMain) {
  if (request === 'electron' || request === '@electron/remote' || request.startsWith('@electron/remote/')) {
    throw Object.assign(new Error(`Cannot find module '${request}'`), { code: 'MODULE_NOT_FOUND' });
  }
  return originalLoad.call(this, request, parent, isMain);
};
