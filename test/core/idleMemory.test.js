'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const init = fs.readFileSync(path.join(root, 'app', 'electron', 'init.js'), 'utf8');
const watchdog = fs.readFileSync(path.join(root, 'watchdog', 'watchdog.js'), 'utf8');
const workingSet = fs.readFileSync(path.join(root, 'watchdog', 'util', 'workingSet.js'), 'utf8');

// What the tray daemon holds while nobody is looking: memory and disk belong to whatever the user
// is actually running, and a background tracker is not entitled to either until it has work to do.

test('the background scan holds off while a game is running', () => {
  const scan = init.slice(init.indexOf('async function runBackgroundAutoFix('));
  const guard = scan.indexOf('if (isGameRunning() &&');
  const work = scan.indexOf('await startEngines()');
  assert.ok(guard > 0, 'the background scan no longer checks for a running game');
  assert.ok(guard < work, 'the check must come before the engine is loaded, not after');
  // Held work has to be picked up again, or a game installed during a session stays invisible for
  // the rest of it.
  assert.match(init, /runBackgroundAutoFix\('after-game'\)/, 'a held scan is never resumed once the game ends');
});

test('the hold cannot last forever', () => {
  // A background Steam app the user owns (DSX, Wallpaper Engine) reads as "a game running" until
  // blacklisted; an unbounded hold would silently disable the headless scan for the whole session.
  assert.match(init, /const BG_AUTOFIX_MAX_HELD_TICKS = \d+;/, 'the hold has no ceiling');
  assert.match(init, /isGameRunning\(\) && bgAutoFixHeldTicks < BG_AUTOFIX_MAX_HELD_TICKS/, 'the ceiling is not applied');
  assert.match(init, /bgAutoFixHeldTicks \+= 1;/, 'held ticks are never counted');
  // And a real session must start over from zero, or the ceiling drifts down across sessions.
  const activity = init.slice(init.indexOf('function setGameActivity('), init.indexOf('const minimist'));
  assert.match(activity, /bgAutoFixHeldTicks = 0;/, 'the counter is not reset when the last game exits');
});

test('idle memory is handed back on a transition, never on a timer', () => {
  assert.match(init, /function scheduleIdleTrim\(reason\)/, 'nothing releases the idle working set');
  for (const reason of ['game-started', 'window-released', 'overlay-released']) {
    assert.ok(init.includes(`scheduleIdleTrim('${reason}')`), `the ${reason} transition does not release memory`);
  }
  // Emptying a working set over and over is how a machine ends up thrashing: the pages fault back in
  // and the dirty ones are written out again every round. The floor between two passes is the guard.
  assert.match(init, /IDLE_TRIM_MIN_INTERVAL_MS/, 'there is no floor between two trims');
  assert.match(init, /if \(Date\.now\(\) - lastIdleTrimAt < IDLE_TRIM_MIN_INTERVAL_MS\) return;/, 'the floor is not enforced');
  assert.ok(!/setInterval\([^)]*scheduleIdleTrim/.test(init), 'the trim must never be driven by an interval');
  // A window back on screen means the pages are in use again.
  assert.match(init, /if \(MainWin \|\| overlayVisible\) return;/, 'a reopened window does not cancel the pending trim');
});

test('the trim is a native call in the process that already carries koffi', () => {
  assert.match(watchdog, /if \(msg\.trimWorkingSets\)/, 'the Watchdog ignores the request');
  assert.match(watchdog, /require\('\.\/util\/workingSet\.js'\)\.trim\(pids\)/, 'the request does not reach the native call');
  assert.match(workingSet, /SetProcessWorkingSetSizeEx/, 'the trim is not the documented Win32 call');
  // -1 for both bounds is what makes it "remove as many pages as possible"; any other value sets a
  // quota instead, which is a different (and much worse) thing to do to a process.
  assert.match(workingSet, /const EMPTY = 0xffffffffffffffffn;/, 'the empty-working-set sentinel changed');
  assert.ok(!/powershell/i.test(workingSet), 'the trim must not shell out');
});
