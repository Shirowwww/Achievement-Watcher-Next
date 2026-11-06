'use strict';

const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const assert = require('node:assert/strict');
const test = require('node:test');

// A notification can reach broadcast before the server was ever started; it must stay quiet then.
test('a broadcast with no server running is a quiet no-op, not an error in the log', () => {
  const Logger = require(sharedAppModulePath('util/logger.js'));
  const errors = [];
  const original = Logger.prototype.error;
  Logger.prototype.error = function (...args) {
    errors.push(args.join(' '));
  };
  try {
    const websocket = require('../websocket.js');
    websocket.broadcast({ appid: '480', title: 'Unlocked' });
  } finally {
    Logger.prototype.error = original;
  }
  assert.deepEqual(errors, []);
});
