'use strict';

/*
  The Settings surface is intentionally a small user-facing front end over the shared repair
  transaction. Architecture selection, filenames and emulator configuration stay in the installer;
  this card may verify the integrated package and run the same repair for detected games.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));
const document = htmlParser.parse(fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8'));
const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
const loaderSource = fs.readFileSync(path.join(appDir, 'locale', 'loader.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');

test('Uplay R2 has its own focused emulator settings view', () => {
  const nav = document.querySelector('#settingNav li[data-view="uplay"]');
  const view = document.querySelector('#settings .content[data-view="uplay"]');
  const steamView = document.querySelector('#settings .content[data-view="emulator"]');
  const card = view && view.querySelector('#uplay-r2-settings');
  assert.ok(nav, 'Uplay R2 has a dedicated navigation item beside Steam / GBE Fork');
  assert.ok(card, 'the Uplay R2 controls belong to that view');
  assert.ok(card.querySelector('#uplay-r2-package-status[role="status"]'));
  assert.ok(card.querySelector('#verify-uplay-r2-package'));
  assert.ok(card.querySelector('#import-uplay-r2-loaders'));
  assert.ok(card.querySelector('#restore-uplay-r2-loaders'));
  assert.ok(card.querySelector('#repair-all-uplay-r2'));
  assert.ok(card.querySelector('#uplay-r2-settings-result[aria-live="polite"]'));
  assert.doesNotMatch(steamView.textContent, /Uplay R2/i, 'Steam / GBE Fork keeps its own terminology');
});

test('Uplay settings expose repair controls without loader or INI options', () => {
  const card = document.querySelector('#uplay-r2-settings');
  const view = document.querySelector('#settings .content[data-view="uplay"]');
  const selects = view.querySelectorAll('select');
  assert.deepEqual(selects.map((select) => select.getAttribute('id')), [
    'option_autoApplyNewGamesUplay',
  ]);
  assert.equal(view.querySelector('#uplay-r2-advanced'), null);
  assert.equal(view.querySelector('#options-uplay-ini'), null);
  assert.equal(view.querySelector('#uplay-r2-username'), null);
  assert.equal(view.querySelector('.uplay-r2-source-row'), null);
  assert.equal(view.querySelector('#open-uplay-r2-source'), null);
  assert.equal(view.querySelector('#open-uplay-r2-code'), null);
  assert.doesNotMatch(view.textContent, /Steam|loader|INI/i);
  assert.doesNotMatch(appSource, /open-uplay-r2-(?:source|code)/);
  assert.doesNotMatch(card.textContent, /AchSave|AchKey|upc_r2\.ini|uplay_r2\.ini|x86|x64/i);
  assert.match(settingsSource, /#option_autoApplyNewGames, #option_autoApplyNewGamesUplay/);
  assert.match(settingsSource, /\.not\(this\)\.val\(value\)/, 'both views stay synchronized');
  assert.match(loaderSource, /bindEmuRow\('option_autoApplyNewGamesUplay', emu\.autoApply\)/);
  assert.match(loaderSource, /option_autoApplyNewGamesUplay.*closest\('li'\)/s, 'the Uplay help uses Uplay-specific copy');
});

test('Uplay-specific styling follows theme and semantic variables', () => {
  const block = cssSource.slice(cssSource.indexOf('#settings .uplay-r2-settings-body'));
  const rules = block.slice(0, block.indexOf('/* Emulator group headers'));
  assert.match(rules, /var\(--set-/);
  assert.match(rules, /var\(--success\)/);
  assert.match(rules, /var\(--danger\)/);
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}|rgba?\(|\bwhite\b|\bblack\b/i);
});

test('the integrated package helper stays below its action buttons', () => {
  const block = cssSource.slice(cssSource.indexOf('#settings .uplay-r2-package-row'));
  assert.match(block, /\.uplay-r2-package-row > \.right[\s\S]*grid-row: 1/);
  assert.match(block, /\.uplay-r2-package-row \.help[\s\S]*grid-row: 2/);
});

test('opening the emulator tab automatically verifies the integrated package', () => {
  const settingsBlock = appSource.slice(appSource.indexOf('let uplayPackageCheck'));
  assert.match(settingsBlock, /ensureBundledEmulatorDlls\s*\(/);
  assert.match(settingsBlock, /#settingNav li\[data-view='uplay'\]/);
  assert.match(settingsBlock, /verifyUplayPackage\(\)/);
  assert.match(settingsBlock, /if \(!cache\.complete\)/, 'the status cannot become ready for a partial package');
});

test('the targeted batch only selects detected Uplay games and delegates to the shared repair', () => {
  const handler = appSource.slice(appSource.indexOf("$('#repair-all-uplay-r2').on('click'"));
  const body = handler.slice(0, handler.indexOf("// Settings → Advanced"));
  assert.match(body, /fs\.existsSync\(game\.gameDir\)/);
  assert.match(body, /uplayR2\.isUplayR2Game\(game, game\.appid\)/);
  assert.match(body, /await verifyUplayPackage\(\)/, 'repair refuses to start with an invalid package');
  assert.match(body, /showMessageBox/, 'a batch write requires explicit confirmation');
  assert.match(body, /applyUplayR2Repair\s*\(\{/);
  assert.match(body, /interactive: false/);
  assert.match(body, /summary\.changed/, 'idempotent no-op repairs are reported separately');
});

test('re-applying an existing Uplay fix asks first, interpolates the single-game count, and reports the repair', () => {
  const repair = appSource.slice(
    appSource.indexOf('async function applyUplayR2Repair'),
    appSource.indexOf('// Show a progress cursor')
  );
  assert.match(repair, /hasExistingUplayFix/);
  assert.match(repair, /reapply-gbe-message/);
  assert.match(repair, /reapplyConfirmed/);
  assert.match(repair, /count: 1/);
  assert.match(repair, /if \(interactive && !reapplyConfirmed\)/);
  assert.match(repair, /t\('emulator-fix-applied'/);
});

test('unmapped Uplay games use a validated, persistent Steam mapping fallback', () => {
  const selector = appSource.slice(
    appSource.indexOf('async function selectUplayR2SteamMapping'),
    appSource.indexOf('async function replaceUplayR2SteamMapping')
  );
  assert.match(selector, /findSteamAppidHints\(gameDir\)/, 'local appid markers are offered only as confirmation hints');
  assert.match(selector, /findAppidCandidatesByName/, 'the fallback offers ranked Steam catalog candidates');
  assert.match(selector, /showMessageBoxSync/, 'the user must explicitly choose a candidate');

  const replacement = appSource.slice(
    appSource.indexOf('async function replaceUplayR2SteamMapping'),
    appSource.indexOf('async function applyUplayR2Repair')
  );
  assert.ok(
    replacement.indexOf('derivePrefixedIds') < replacement.indexOf('saveSteamMappingOverride'),
    'a replacement is persisted only after its Steam achievement convention is validated'
  );

  const repair = appSource.slice(
    appSource.indexOf('async function applyUplayR2Repair'),
    appSource.indexOf('// Show a progress cursor')
  );
  assert.ok(
    repair.indexOf('resolveGameIdentity') < repair.indexOf('selectUplayR2SteamMapping'),
    'the already-resolved Ubisoft→Steam identity is consumed before offering the manual fallback'
  );
  assert.match(repair, /if \(!mapping && interactive\) mapping = await selectUplayR2SteamMapping/);
  assert.ok(
    repair.indexOf('repairInstallation') < repair.indexOf('saveSteamMappingOverride'),
    'a newly selected mapping is persisted only after the repair transaction succeeds'
  );
});

test('every visible Uplay settings label is locale-bound', () => {
  for (const id of [
    'uplay-r2-settings-title',
    'uplay-r2-nav-label',
    'uplay-r2-options-title',
    'uplay-r2-options-intro',
    'uplay-r2-auto-title',
    'uplay-r2-package-label',
    'uplay-r2-package-help',
    'uplay-r2-package-status-text',
    'verify-uplay-r2-package-label',
    'import-uplay-r2-loaders-label',
    'restore-uplay-r2-loaders-label',
    'repair-all-uplay-r2-label',
    'repair-all-uplay-r2-row-label',
    'repair-all-uplay-r2-help',
  ]) {
    assert.match(loaderSource, new RegExp(`#${id}`), `${id} must be bound by locale/loader.js`);
  }
  const required = [
    'title', 'packageLabel', 'packageHelp', 'checking', 'ready', 'attention', 'verify',
    'verifySuccess', 'verifyFailure', 'import', 'restore', 'customReady', 'importSuccess', 'importFailure',
    'restoreSuccess', 'repair', 'repairHelp', 'noGames', 'repairConfirm',
    'repairTitle', 'repairConfirmMessage', 'repairing', 'repairResult',
  ];
  for (const file of fs.readdirSync(path.join(appDir, 'locale', 'lang')).filter((name) => name.endsWith('.json'))) {
    const locale = JSON.parse(fs.readFileSync(path.join(appDir, 'locale', 'lang', file), 'utf8'));
    for (const key of required) assert.ok(String(locale.settings.emulator.uplay[key] || '').trim(), `${file}: ${key}`);
  }
});
