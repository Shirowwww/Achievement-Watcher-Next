'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const topOwners = require('../../app/parser/topOwners.js');

const LADDER_HTML = `
<table>
  <tr><td><a href="/profile/76561197960287930/">Gaben</a></td></tr>
  <tr><td><a href="/profile/76561197960287930/">Gaben (dup)</a></td></tr>
  <tr><td><a href="/profile/76561198000000001/">Owner Two</a></td></tr>
  <tr><td><a href="/group/12345/">not a profile</a></td></tr>
  <tr><td><a href="/profile/123/">too short</a></td></tr>
  <tr><td><a href="/profile/76561198000000002/">Owner Three</a></td></tr>
</table>`;

test('extractSteamIdsFromHtml pulls de-duplicated 17-digit SteamID64s in page order', () => {
  assert.deepEqual(topOwners.extractSteamIdsFromHtml(LADDER_HTML), [
    '76561197960287930',
    '76561198000000001',
    '76561198000000002',
  ]);
});

test('extractSteamIdsFromHtml honors the limit', () => {
  assert.deepEqual(topOwners.extractSteamIdsFromHtml(LADDER_HTML, 2), ['76561197960287930', '76561198000000001']);
});

test('extractSteamIdsFromHtml ignores non-profile links and malformed ids', () => {
  const ids = topOwners.extractSteamIdsFromHtml(LADDER_HTML);
  assert.ok(!ids.includes('12345'));
  assert.ok(!ids.includes('123'));
});

test('extractSteamIdsFromHtml returns [] on empty or profile-less markup', () => {
  assert.deepEqual(topOwners.extractSteamIdsFromHtml(''), []);
  assert.deepEqual(topOwners.extractSteamIdsFromHtml('<html><body>nothing</body></html>'), []);
});

// A scrape that fails writes no cache, so the main process must not retry it for every game of a scan.
test('the main process waits before scraping the top owners again', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'app', 'electron', 'init.js'), 'utf8');
  const body = source.slice(source.indexOf('async function fetchTopOwners()'));
  const guard = body.indexOf('if (Date.now() - lastTopOwnersScrapeAt < TOP_OWNERS_RETRY_MS) return [];');
  assert.ok(guard > 0, 'a recent attempt must short-circuit the scrape');
  assert.ok(guard < body.indexOf('acquirePuppeteerSlot'), 'the check must come before the browser is started');
});
