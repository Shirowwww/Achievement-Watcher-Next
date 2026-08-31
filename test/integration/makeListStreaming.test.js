'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
  makeList streams each game to the caller inside the callback that builds `gameList`. Deferring it to
  requestAnimationFrame breaks background scans (rAF never fires on a hidden, throttled window), so
  this guards the source against reintroducing the defer.
*/

const achievements = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');

test('makeList hands each game to its caller without waiting for a frame', () => {
  const calls = [...achievements.matchAll(/onGame\?\.\(/g)];
  assert.ok(calls.length > 0, 'makeList must stream games to its caller');

  const deferred = /requestAnimationFrame\(\s*\(\)\s*=>\s*onGame/.test(achievements);
  assert.equal(deferred, false, 'onGame must not be deferred to requestAnimationFrame: it never fires while the window is hidden');

  const rafCalls = [...achievements.matchAll(/^\s*requestAnimationFrame\(/gm)];
  assert.equal(rafCalls.length, 0, `achievements.js must not depend on frame callbacks, found ${rafCalls.length}`);
});

test('makeList reports the real game count before the first game resolves', () => {
  // Without it the renderer sizes its placeholder grid from the previous session's count.
  assert.match(achievements, /callbackProgress\(0, finalList\.length\);/, 'the total must be announced up front');
  assert.match(achievements, /callbackProgress\(Math\.floor\(\(count \/ finalList\.length\) \* 100\), finalList\.length\)/);
});

test('the renderer builds its game list from that callback', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');
  assert.match(app, /gameList\.push\(game\)/, 'the renderer tracks loaded games in gameList');
  // gameList drives the tiles, the profile counters and the sort, so it must still be filled from
  // the stream. The periodic new-game check no longer reads it - it diffs discovery against the
  // previous discovery instead (see integration/newGameScanBaseline.test.js).
  assert.match(app, /refreshProfileStats\(\)/, 'the profile counters follow the streamed list');
});

/*
  The percentage in the loading footer only starts existing at the first callbackProgress. Everything
  before it - discovery, then the Steam ownership call - is silent, and the bar simply kept whatever
  the previous scan left on it: "100%" on a refresh, "0%" on a cold start, for as long as the network
  took. That is the whole of the "it sits at 100% or 0% for ages when I launch it" report.
*/
test('the total is announced before the ownership call, which cannot hold the scan', () => {
  const announceAt = achievements.indexOf('callbackProgress(0, finalList.length)');
  const ownershipAt = achievements.indexOf('await refreshSteamOwnership(appidList)');
  assert.ok(announceAt > -1 && ownershipAt > -1, 'both steps must still be there');
  assert.ok(announceAt < ownershipAt, 'the bar must be sized before a network call, not after it');

  const refresh = achievements.slice(achievements.indexOf('async function refreshSteamOwnership'));
  const body = refresh.slice(0, refresh.indexOf('\n}'));
  assert.match(body, /withTimeout\(\s*ipcInvoke\('steam:ensure-token'\)/, 'the token call needs a deadline');
  assert.match(body, /withTimeout\(\s*steamAccount\.loadLibrary\(/, 'so does the library call');
  assert.match(achievements, /const STEAM_OWNERSHIP_TIMEOUT_MS = \d+/);
});

test('the renderer clears the previous percentage before it scans again', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');
  const start = app.indexOf("$('#main-footer').removeClass('done')");
  assert.ok(start > -1, 'the loading footer is still reused between scans');
  // Bounded by the next real statement rather than a character count: the block grows, and a fixed
  // window silently stops covering the lines the assertions below are about.
  const end = app.indexOf('const showLoadingIndicator', start);
  assert.ok(end > start, 'the loading footer setup still runs before showLoadingIndicator');
  const setup = app.slice(start, end);
  assert.match(setup, /addClass\('indeterminate'\)/, 'no percentage exists yet, so the bar must sweep instead');
  // An inline width wins over any stylesheet rule, so pinning the meter to 0% here left the sweep
  // running on a zero-width element: an empty bar, motionless for the whole discovery phase. The
  // previous scan's width still has to go - by being cleared, not by being replaced with another one.
  assert.match(setup, /meter\.css\('width', ''\)/, 'the inline width must be cleared, never pinned');
  assert.doesNotMatch(setup, /meter\.css\('width', '\d/, 'an inline width would override the sweeping rule');
  assert.match(setup, /setLoadingLabel\(\)/, 'the sweeping bar names its phase instead of printing a number');

  assert.match(app, /removeClass\('indeterminate'\)\.attr\('data-percent', percent\)/, 'the first real report ends the sweep');
  // callbackProgress(0, total) is the opening announcement, not progress: the ownership call still
  // has to run before any game resolves. Acting on it would drop the bar back to a flat empty 0%.
  const report = app.slice(app.indexOf('(percent, total) => {'));
  assert.match(report.slice(0, report.indexOf('},')), /if \(percent <= 0\) return;/, 'a zero report must not end the sweep');

  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'resources', 'css', 'app.css'), 'utf8');
  assert.match(css, /\.loading \.progressBar\.indeterminate \.meter/, 'the sweeping state needs to exist in CSS');
  assert.match(
    css,
    /\.loading \.progressBar\.indeterminate:before\s*\{\s*content: attr\(data-label\);/,
    'and it must name the phase rather than print a fake percentage'
  );
});
