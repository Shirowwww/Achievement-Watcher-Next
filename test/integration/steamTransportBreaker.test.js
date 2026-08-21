'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const initSource = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron', 'init.js'), 'utf8');

/*
  With no DNS, a library scan used to spend ~10s per game in the Chromium fallback and then hit the
  30s per-game load timeout - 210s for one scan in a user log. The plain-HTTP breaker existed, but
  the browser path neither consulted it nor reported into it.
*/
test('the browser fallback consults the transport breaker before launching Chromium', () => {
  const scrape = initSource.slice(initSource.indexOf('async function scrapeWithPuppeteer'));
  const guardAt = scrape.indexOf('if (steamTransportUnavailable())');
  const leaseAt = scrape.indexOf('withScrapeLease(');
  assert.ok(guardAt !== -1, 'the scrape must check the breaker');
  assert.ok(guardAt < leaseAt, 'and check it before taking the scrape lease or starting the browser');
});

test('a failed scrape navigation reports into the breaker, and a good one clears it', () => {
  const scrape = initSource.slice(
    initSource.indexOf('async function scrapeWithPuppeteer'),
    initSource.indexOf('// Drop the payloads a SteamDB/HTML scrape never reads')
  );
  assert.ok(scrape.includes('recordSteamTransportFailure(e)'), 'a navigation error opens the breaker');
  assert.ok(scrape.includes('recordSteamTransportSuccess()'), 'a successful page closes it again');
});

test('both breakers are the same shared implementation', () => {
  assert.ok(initSource.includes("require('../util/networkCircuit.js')"));
  assert.ok(initSource.includes('steamTransportCircuit = createNetworkCircuit('));
  assert.ok(initSource.includes('steamGroupsCircuit = createNetworkCircuit('));
});
