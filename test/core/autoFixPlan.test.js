'use strict';

// The automatic fix used to act on two signals only (missing schema, missing runtime), so every
// other repairable finding Game Health shows waited for someone to click Repair. These lock the
// decision table down, and above all the two cases where acting automatically is wrong: a runtime
// that is somebody else's (swapping it is what crashes Pragmata and the RUNE builds) and a game
// folder that is not there.

const assert = require('node:assert/strict');
const test = require('node:test');

const autoFixPlan = require('../../app/util/autoFixPlan.js');
const gameHealth = require('../../app/util/gameHealth.js');

const repairableCodes = gameHealth.REPAIRABLE_GOLDBERG_CODES;

function report(...codes) {
  return { issues: codes.map((code) => ({ level: 'warning', code, message: code })) };
}

test('a clean diagnosis asks for nothing', () => {
  const plan = autoFixPlan.plan({ report: report('SAVE_PRESENT'), repairableCodes });
  assert.equal(plan.act, false);
  assert.equal(plan.reason, 'nothing-flagged');
});

test('a repairable finding alone is enough to act, without touching the runtime', () => {
  const plan = autoFixPlan.plan({ report: report('NO_USER_CONFIG', 'MISSING_ICONS'), repairableCodes });
  assert.equal(plan.act, true);
  assert.equal(plan.repairData, true);
  assert.equal(plan.fullSetup, false);
  assert.equal(plan.reason, 'health-repairable');
  assert.deepEqual(plan.codes, ['NO_USER_CONFIG', 'MISSING_ICONS']);
});

test('settings written beside a dll the game never loads is repaired, not reinstalled', () => {
  const plan = autoFixPlan.plan({ report: report('SETTINGS_NOT_BESIDE_DLL'), repairableCodes });
  assert.equal(plan.repairData, true);
  assert.equal(plan.fullSetup, false);
});

test('a finding nothing can repair is left alone', () => {
  const plan = autoFixPlan.plan({ report: report('APPID_MISMATCH', 'CUSTOM_SAVE_PATH'), repairableCodes });
  assert.equal(plan.act, false);
  assert.equal(plan.reason, 'nothing-flagged');
});

test('no supported runtime escalates to the full setup', () => {
  const plan = autoFixPlan.plan({ report: report('NO_USER_CONFIG'), repairableCodes, needsRuntimeFix: true });
  assert.equal(plan.act, true);
  assert.equal(plan.fullSetup, true);
  assert.equal(plan.repairData, false);
  assert.equal(plan.reason, 'runtime-missing');
});

test("a runtime that belongs to another fix is never swapped automatically, in either mode", () => {
  for (const mode of [autoFixPlan.MODE.REPAIR, autoFixPlan.MODE.RUNTIME]) {
    const plan = autoFixPlan.plan({
      report: report('RUNTIME_DLL_NOT_EMULATOR', 'NO_USER_CONFIG'),
      repairableCodes,
      needsSchema: true,
      needsRuntimeFix: true,
      mode,
    });
    assert.equal(plan.act, false, mode);
    assert.equal(plan.reason, 'foreign-runtime', mode);
  }
});

test('a missing game folder stops everything', () => {
  const plan = autoFixPlan.plan({ report: report('NO_GAME_DIR'), repairableCodes, needsSchema: true });
  assert.equal(plan.act, false);
  assert.equal(plan.reason, 'no-game-folder');
});

test('runtime mode re-applies the whole setup for any flagged game', () => {
  const plan = autoFixPlan.plan({
    report: report('NO_USER_CONFIG'),
    repairableCodes,
    mode: autoFixPlan.MODE.RUNTIME,
  });
  assert.equal(plan.fullSetup, true);
  assert.equal(plan.repairData, false);
  assert.equal(plan.reason, 'mode-runtime');
});

test('a missing schema still acts with no diagnosis at all', () => {
  const plan = autoFixPlan.plan({ report: null, repairableCodes, needsSchema: true });
  assert.equal(plan.act, true);
  assert.equal(plan.repairData, true);
  assert.equal(plan.reason, 'schema-missing');
});

test('an unknown mode falls back to repair rather than to a dll swap', () => {
  assert.equal(autoFixPlan.normalizeMode('nonsense'), autoFixPlan.MODE.REPAIR);
  assert.equal(autoFixPlan.normalizeMode(undefined), autoFixPlan.MODE.REPAIR);
  assert.equal(autoFixPlan.DEFAULT_MODE, autoFixPlan.MODE.REPAIR);
});

test('every code the plan reasons about is one goldberg.diagnose can emit', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../app/parser/goldberg.js'), 'utf8');
  for (const code of [...autoFixPlan.FOREIGN_RUNTIME_CODES, ...autoFixPlan.BLOCKING_CODES]) {
    assert.ok(source.includes(`'${code}'`), `${code} is not a code goldberg.diagnose emits`);
  }
});

test('icons and DLC are repairable only while their own setting allows the write', () => {
  const off = autoFixPlan.repairableCodesFor({ achievement: {}, emulator: {} });
  assert.equal(off.has('MISSING_ICONS'), false);
  assert.equal(off.has('NO_DLC_CONFIG'), false);
  assert.equal(off.has('NO_USER_CONFIG'), true, 'the user config is not behind either setting');

  const on = autoFixPlan.repairableCodesFor({ achievement: { goldbergDownloadIcons: true }, emulator: { manageDlc: true } });
  assert.equal(on.has('MISSING_ICONS'), true);
  assert.equal(on.has('NO_DLC_CONFIG'), true);
  assert.equal(on.has('BAD_DLC_CONFIG'), true);
});

test('missing icons alone asks for nothing while icon downloads are off', () => {
  const option = { achievement: {}, emulator: {} };
  const plan = autoFixPlan.plan({
    report: report('MISSING_ICONS'),
    repairableCodes: autoFixPlan.repairableCodesFor(option),
  });
  assert.equal(plan.act, false);
});

test('the shared repairable set is never mutated by a narrower one', () => {
  const before = gameHealth.REPAIRABLE_GOLDBERG_CODES.size;
  autoFixPlan.repairableCodesFor({ achievement: {}, emulator: {} });
  assert.equal(gameHealth.REPAIRABLE_GOLDBERG_CODES.size, before);
});
