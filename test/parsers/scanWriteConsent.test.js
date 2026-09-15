'use strict';

/*
  "Automatically fix newly detected games" is off by default and its own comment in settings.js says
  what that means: AW never touches game files unprompted. Two paths in the scan ignored it entirely
  and rewrote configs.app.ini, configs.main.ini and configs.user.ini in every detected game folder -
  reported from cs.rin.ru, where a user watched their hand-managed emulator configuration get
  replaced during what was supposed to be a read-only scan.

  The DLC and identity writes went further and became opt-ins of their own, which the manual repair
  paths honour as well: a setting that says "leave my DLC alone" cannot hold in the scan and give way
  at a button.

  These are source-anchored: the writes happen deep inside discover(), behind network fetches and an
  emulator install, so what can be pinned down here is that every write sits behind the setting. If a
  rename breaks one of these, check the gate still exists before rewriting the pattern.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');

test('runtime GSE config writes are gated on the automatic-repair setting', () => {
  const block = SRC.slice(SRC.indexOf('const runtimeConfigAllowed'), SRC.indexOf('const hasSteamAchievementSchema'));
  assert.ok(block.length > 0, 'the runtime GSE config block must still be recognisable');
  assert.match(block, /option\.emulator\.autoApplyNewGames !== false/, 'it must honour the automatic-repair setting');
  assert.match(block, /announceAutomaticEmulatorFix\(\)/, 'it must announce itself before writing into a game folder');
});

test('DLC ownership and identity each need their own opt-in', () => {
  const block = SRC.slice(SRC.indexOf('const runtimeConfigAllowed'), SRC.indexOf('const hasSteamAchievementSchema'));
  assert.match(block, /option\.emulator\.manageDlc === true/, 'writeDlcConfig must be behind manageDlc');
  assert.match(block, /option\.emulator\.stampIdentity === true/, 'writeUserConfig must be behind stampIdentity');

  // The DLC write and the identity write must not share one condition: someone can want AW to leave
  // their DLC alone while still letting it stamp an account name, and the reverse.
  const dlcAt = block.indexOf('goldberg.writeDlcConfig');
  const userAt = block.indexOf('goldberg.writeUserConfig');
  assert.ok(dlcAt > 0 && userAt > dlcAt, 'both writes must still be present and separate');
});

test('schema repair is gated too - it drags the configs along with it', () => {
  const block = SRC.slice(SRC.indexOf('const schemaRepairDirs = new Set()'), SRC.indexOf('const iconRecheckDirs'));
  assert.ok(block.length > 0, 'the schema repair block must still be recognisable');
  assert.match(block, /canAutoApply && \(await announceAutomaticEmulatorFix\(\)\)/, 'schema repair must follow the setting');
});

test('the repair() call from a scan honours both opt-ins', () => {
  const call = SRC.slice(SRC.indexOf('const summary = await goldberg.repair({'));
  const firstCall = call.slice(0, call.indexOf('});'));
  assert.match(firstCall, /writeDlc: option\.emulator\.manageDlc === true/, 'a schema repair must not enable every DLC');
  assert.match(firstCall, /stampIdentity === true \? option\.general && option\.general\.username : undefined/, 'a schema repair must not stamp an identity');
});

test('the manual repair paths honour the opt-ins too', () => {
  // Otherwise the setting just moves the surprise to another button - and "Fix all" rewrites dozens
  // of game folders from one click.
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');
  const calls = app.split('goldberg.repair({').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('});')));
  assert.equal(calls.length, 2, 'app.js should still have exactly the single-game repair and the bulk one');
  for (const call of calls) {
    assert.match(call, /writeDlc: app\.config/, 'a repair must not enable every DLC unless asked');
    assert.match(call, /stampIdentity === true \?/, 'a repair must not stamp an identity unless asked');
  }
});

test('both opt-ins default to off in the shipped configuration', () => {
  const settings = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'settings.js'), 'utf8');
  assert.match(settings, /manageDlc: false/, 'manageDlc must ship off');
  assert.match(settings, /stampIdentity: false/, 'stampIdentity must ship off');
  assert.match(settings, /options\.emulator\.manageDlc !== 'boolean'\) options\.emulator\.manageDlc = false/, 'an existing config must not inherit it as on');
  assert.match(settings, /options\.emulator\.stampIdentity !== 'boolean'\) options\.emulator\.stampIdentity = false/, 'an existing config must not inherit it as on');
});

test('the settings rows exist and are bound by id', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'view', 'app.html'), 'utf8');
  assert.match(html, /id="option_manageDlc"/);
  assert.match(html, /id="option_stampIdentity"/);
  // Default-selected option must be the off one, or a fresh install shows the wrong state before
  // the config is read back over it.
  for (const id of ['option_manageDlc', 'option_stampIdentity']) {
    const select = html.slice(html.indexOf(`id="${id}"`));
    const firstOption = select.slice(0, select.indexOf('</select>'));
    assert.match(firstOption, /<option value="false" selected>/, `${id} must default to disabled`);
  }

  const loader = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'locale', 'loader.js'), 'utf8');
  assert.match(loader, /bindEmuRow\('option_manageDlc'/);
  assert.match(loader, /bindEmuRow\('option_stampIdentity'/);
});
