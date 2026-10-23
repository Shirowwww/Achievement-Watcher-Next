'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Logger.log reads `this`, so `log: debug.log` handed to another module throws on its first call.
// presetInsets did that: its log line threw inside the catch that ends its queue, which stayed
// rejected, and only the first preset of a launch was ever measured.

const root = path.join(__dirname, '..', '..');
const BARE_METHOD = /(?:[:=,(]|=>)\s*(?!console\b)([A-Za-z_$][\w$]*)\.(?:log|info|warn|error)\s*(?:[,)};\]]|$)/;

function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(target);
    return entry.name.endsWith('.js') ? [target] : [];
  });
}

test('no Logger method is passed around without its logger', () => {
  const offenders = [];
  for (const file of [...sources(path.join(root, 'app')), ...sources(path.join(root, 'watchdog'))]) {
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const match = BARE_METHOD.exec(line);
        if (match && /^(?:debug|logger|log|\w*Log(?:ger)?)$/.test(match[1])) offenders.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(offenders, [], 'wrap it: (line) => logger.log(line)');
});
