'use strict';

/*
  Four ways a notification used to be late, lost or wrong, each fixed where it starts. They live in
  init.js and watchdog.js, which run only inside Electron and a live Watchdog, so the wiring is read
  from the source; the coalescer the Watchdog now uses has its own tests.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const init = fs.readFileSync(path.join(root, 'app', 'electron', 'init.js'), 'utf8');
const watchdog = fs.readFileSync(path.join(root, 'watchdog', 'watchdog.js'), 'utf8');
const rarityTiers = require(path.join(root, 'app', 'util', 'rarityTiers.js'));

test('a save is read once per change, never skipped because another file changed just before', () => {
  assert.doesNotMatch(watchdog, /Spamming protection/, 'the shared 600 ms window is back');
  assert.doesNotMatch(watchdog, /self\.tick\b/);
  // One read at a time per save, the changes made during a read folded into one more read.
  assert.match(watchdog, /const saveReads = createChangeCoalescer\(\);/);
  assert.match(watchdog, /saveReads\.run\(String\(name\)\.toLowerCase\(\), \(\) => onChange\(evt, name, false, seenAt\)\)/);
  // A read that runs after the burst is still judged fresh against when the change was reported.
  assert.match(watchdog, /const onChange = async function \(evt, name, catchUp = false, seenAt = Date\.now\(\)\)/);
  assert.match(watchdog, /const currentTime = seenAt;/);
});

test('the unlock rates of a game are asked for when it starts, not at its first unlock', () => {
  const launch = /runningGames\.push\(game\);[\s\S]{0,200}?loadRarityMap\(game, String\(game\.appid\)\);/.exec(watchdog);
  assert.ok(launch, 'a launched game does not start loading its rates');
  // The unlock joins that same request rather than starting a second one.
  assert.match(watchdog, /if \(!game\.__rarityLoad\) game\.__rarityLoad = rarity\.getRarityMap\(/);
  assert.match(watchdog, /if \(!game\.__rarityMap\) game\.__rarityMap = await loadRarityMap\(game, appID\);/);
});

test('a popup that cannot draw is closed at once rather than holding the queue', () => {
  const block = /const giveUp = \(why\) => \{[\s\S]*?notif\.once\('unresponsive'[^\n]*\n/.exec(init);
  assert.ok(block, 'the early close is gone');
  assert.match(block[0], /if \(!notif\.isDestroyed\(\)\) notif\.close\(\);/);
  // Only the page itself failing counts: a picture that fails to load is not a broken popup.
  assert.match(block[0], /did-fail-load', \(event, code, description, url, isMainFrame\) => \{\s*if \(isMainFrame\)/);
  assert.match(block[0], /render-process-gone/);
});

test('trophy mode grades from the full unlock rate', () => {
  // rarityPercent only travels up to the rare cut-off; above it trophy mode could never say silver.
  assert.match(init, /percent: data\.unlockRate != null \? data\.unlockRate : data\.rarityPercent,/);
  const tier = (percent) => rarityTiers.notificationTier({ percent, type: 'achievement', mode: 'trophy' });
  assert.equal(tier(35), 'silver');
  assert.equal(tier(null), 'bronze', 'what every rate above 15% used to become');
});
