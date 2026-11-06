'use strict';

/*
  The app's main process and the Watchdog child talk over the fork IPC channel with one-key messages
  ({ playSound: {...} }). Nothing ties a sender to its handler, so a key renamed on one side is
  dropped by the other without an error. Both directions are read from the sources here.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function watchdogSources(dir = path.join(root, 'watchdog')) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'test') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...watchdogSources(full));
    else if (entry.name.endsWith('.js')) out.push(fs.readFileSync(full, 'utf8'));
  }
  return out;
}

// The keys of the objects a call sends, comments between the brace and the key allowed.
function sentKeys(source, callee) {
  const re = new RegExp(`${callee}\\(\\{\\s*(?:\\/\\/[^\\n]*\\n\\s*)*(\\w+)\\s*:`, 'g');
  return new Set([...source.matchAll(re)].map((m) => m[1]));
}

function handledKeys(body) {
  return new Set([...body.matchAll(/\bmsg\.(\w+)/g)].map((m) => m[1]));
}

function bodyAfter(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${marker} must be findable`);
  // Up to the next top-level statement: the handler is a single block at the left margin.
  const end = source.indexOf('\n}', start);
  return source.slice(start, end > start ? end : undefined);
}

// Read by the Watchdog without the app setting them: switches for a manual or test run.
const WATCHDOG_ONLY_ENV = new Set(['AW_PROCESS_MONITOR']);

function envReadIn(sources) {
  const keys = new Set();
  for (const source of sources) for (const m of source.matchAll(/process\.env\.(AW_[A-Z_]+)/g)) keys.add(m[1]);
  return keys;
}

test('the Watchdog reads every variable the app spawns it with, and only those', () => {
  const init = read('app', 'electron', 'init.js');
  const spawn = init.slice(init.indexOf("ELECTRON_RUN_AS_NODE: '1',"), init.indexOf('};', init.indexOf("ELECTRON_RUN_AS_NODE: '1',")));
  const passed = new Set([...spawn.matchAll(/^\s+(AW_[A-Z_]+):/gm)].map((m) => m[1]));
  assert.ok(passed.size >= 5, 'the spawn environment must be findable');
  // The Watchdog also loads app modules (aes.js reads AW_SECRET), so both trees count as readers.
  const appSources = fs.readdirSync(path.join(root, 'app', 'util')).filter((f) => f.endsWith('.js')).map((f) => read('app', 'util', f));
  const read_ = envReadIn([...watchdogSources(), ...appSources]);
  for (const key of passed) assert.ok(read_.has(key), `${key} is passed to the Watchdog but never read`);
  for (const key of envReadIn(watchdogSources())) {
    assert.ok(passed.has(key) || WATCHDOG_ONLY_ENV.has(key), `the Watchdog reads ${key}, which the app never passes`);
  }
});

// Off Windows the presence pipe is a Unix socket: a side that spells the Windows name never finds it.
test('the app looks for the Watchdog pipe where the Watchdog listens', () => {
  const pipeName = 'AchievementWatchdogPipe';
  for (const parts of [['app', 'electron', 'init.js'], ['watchdog', 'watchdog.js'], ['app', 'util', 'staleWatchdog.js']]) {
    const source = read(...parts);
    assert.match(source, /watchdogPipePath\(\)/, `${parts.join('/')} must ask watchdogPipe.js for the pipe path`);
    assert.doesNotMatch(source, new RegExp(pipeName), `${parts.join('/')} spells the Windows pipe name itself`);
  }
});

test('every message the app sends to the Watchdog has a handler there', () => {
  const sent = sentKeys(read('app', 'electron', 'init.js'), 'monitorProc\\.send');
  assert.ok(sent.size >= 5, 'the app sends messages to the Watchdog');
  const handled = handledKeys(bodyAfter(read('watchdog', 'watchdog.js'), "process.on('message'"));
  for (const key of sent) assert.ok(handled.has(key), `the Watchdog ignores { ${key} } sent by the app`);
});

test('every message the Watchdog sends to the app has a handler there', () => {
  const sent = new Set();
  for (const source of watchdogSources()) {
    for (const key of sentKeys(source, 'process\\.send')) sent.add(key);
    // Some modules take `send` as a parameter, or name it `deliver`, falling back on process.send.
    if (/process\.send/.test(source)) for (const key of sentKeys(source, '(?<![.\\w])(?:send|deliver)')) sent.add(key);
  }
  assert.ok(sent.size >= 5, 'the Watchdog sends messages to the app');
  const handled = handledKeys(bodyAfter(read('app', 'electron', 'init.js'), 'function handleMonitorMessage('));
  for (const key of sent) assert.ok(handled.has(key), `the app ignores { ${key} } sent by the Watchdog`);
});
