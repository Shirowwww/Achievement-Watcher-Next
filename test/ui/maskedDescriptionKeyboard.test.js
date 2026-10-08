'use strict';

// A hidden achievement's description is revealed by clicking it, so it has to be reachable and
// pressable from the keyboard, and must not lose focus the moment it is revealed.

const assert = require('node:assert/strict');
const test = require('node:test');
const { rendererSource } = require('../helpers/rendererSource');

test('a masked description is a focusable button until it is revealed', () => {
  const source = rendererSource();
  assert.match(source, /class="description masked-desc" role="button" tabindex="0" data-desc=/);
  assert.match(source, /removeClass\('masked-desc'\)\.removeAttr\('role'\)\.attr\('tabindex', '-1'\)/, 'revealed text stays the focused element');
});
