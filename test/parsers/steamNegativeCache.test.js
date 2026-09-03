'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const steam = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'));

/*
  The negative cache stops a non-existent appid from costing a full 11-30s Steam lookup on every
  scan. Its danger is that "no data came back" and "this is not a Steam app" are indistinguishable at
  the call site - and offline they are the same thing for EVERY appid, so a single offline scan could
  blacklist the whole library for the cache's lifetime. The rule below is what prevents that.
*/

test('only a miss Steam actually answered is remembered', () => {
  // The real negative: Steam answered, this appid is not listed, and no data came back.
  assert.equal(steam.shouldRememberUnresolved({ hasResult: false, inAppList: false, answered: true }), true);

  // Offline: every appid misses, so a miss says nothing. Remembering here is the failure that would
  // hide real games for the memo's whole lifetime.
  assert.equal(steam.shouldRememberUnresolved({ hasResult: false, inAppList: false, answered: false }), false);

  // The appid is listed, or data did come back - not a miss at all.
  assert.equal(steam.shouldRememberUnresolved({ hasResult: false, inAppList: true, answered: true }), false);
  assert.equal(steam.shouldRememberUnresolved({ hasResult: true, inAppList: false, answered: true }), false);

  // Valve retired GetAppList, so any dump still on disk is frozen at the day it was downloaded. A
  // game released after that CANNOT be in it, and reading its absence as "no such AppID" blacklisted
  // brand-new games for three days (issue #55). The list is no longer a way in at all.
  assert.equal(steam.shouldRememberUnresolved({ hasResult: false, inAppList: false, appListLoaded: true }), false);
  assert.equal(steam.shouldRememberUnresolved({ hasResult: false, inAppList: false, appListLoaded: false }), false);

  // Missing fields must fail closed (nothing remembered), never open.
  assert.equal(steam.shouldRememberUnresolved({}), false);
  assert.equal(steam.shouldRememberUnresolved(), false);
});

test('the memo can be cleared, so a manual refresh really re-checks Steam', () => {
  // forgetUnresolved must be callable before any cache exists and with no argument (clear-all),
  // since the manual refresh path calls it unconditionally at startup.
  assert.doesNotThrow(() => steam.forgetUnresolved());
  assert.doesNotThrow(() => steam.forgetUnresolved('3751950'));
});
