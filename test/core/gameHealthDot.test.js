'use strict';

/*
  The status dot an emulated game carries beside its name. It only speaks about a game AW Next can
  see on this PC: an uninstalled game or one with no achievements gets no dot at all.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { dotState, needsFullReport, STATE } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));

const crackedGame = (overrides = {}) => ({ appid: '1245620', installed: true, hasSteamApiDll: true, achievement: { total: 42 }, ...overrides });

test('an installed emulated game keeps the scan answer until a full report replaces it', () => {
  assert.equal(dotState(crackedGame()), STATE.READY);
  assert.equal(dotState(crackedGame(), STATE.ATTENTION), STATE.ATTENTION);
  assert.equal(dotState(crackedGame({ hasSteamApiDll: false })), STATE.NOT_TRACKING);
});

test('a game that is not installed gets no dot', () => {
  // Its unlocks still read from the save, but there is nothing on this PC to judge or repair.
  assert.equal(dotState(crackedGame({ installed: false })), null);
  assert.equal(dotState(crackedGame({ installed: false }), STATE.ATTENTION), null);
  assert.equal(dotState({ appid: 'CUSA03173', system: 'playstation', installed: false, achievement: { total: 40 } }), null);
  assert.equal(needsFullReport(crackedGame({ installed: false })), false);
});

test('a game with no achievements gets no dot', () => {
  const none = crackedGame({ achievement: { total: 0, none: true } });
  assert.equal(dotState(none), null);
  assert.equal(needsFullReport(none), false);
});

test('an installed console emulator game is judged by its trophy list', () => {
  // Its title id is no Steam appid, so the full report would only ever warn.
  const bloodborne = { appid: 'CUSA03173', system: 'playstation', installed: true, achievement: { total: 40 } };
  assert.equal(dotState(bloodborne), STATE.READY);
  assert.equal(dotState({ ...bloodborne, achievement: { total: 0 } }), STATE.ATTENTION);
  assert.equal(dotState(bloodborne, STATE.ATTENTION), STATE.READY);
  assert.equal(needsFullReport(bloodborne), false);
});

test('an installed game with no emulator marker still gets an answer', () => {
  const nemirtingas = { appid: 'c4763f236d08423eb47b4c3008779c84', source: 'epic', installed: true, achievement: { total: 30 } };
  assert.equal(dotState(nemirtingas), STATE.READY);
  assert.equal(dotState({ ...nemirtingas, achievement: { total: 0 } }), STATE.ATTENTION);
  assert.equal(needsFullReport(nemirtingas), true);
});

test('a Uplay R2 game is reported like any emulated game', () => {
  const blackFlag = { appid: '3751950', system: 'uplay', uplayR2: true, uplayHealthy: true, installed: true, achievement: { total: 49 } };
  assert.equal(dotState(blackFlag), STATE.READY);
  assert.equal(needsFullReport(blackFlag), true);
});
