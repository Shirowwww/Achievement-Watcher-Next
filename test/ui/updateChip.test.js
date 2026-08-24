'use strict';

/*
  The update chip has to be right across three files that nothing else compares: titleBar.js ships
  the markup the first paint uses, app.js decides what each phase looks like, and titlebar.css
  decides what is visible. A phase app.js can produce but the CSS has no rule for renders as an
  empty box; a phase the CSS styles but app.js never produces is dead weight.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const appJs = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const titleBarJs = fs.readFileSync(path.join(appDir, 'components/titleBar/titleBar.js'), 'utf8');
const titleBarCss = fs.readFileSync(path.join(appDir, 'resources/css/titlebar.css'), 'utf8');
const settingsJs = fs.readFileSync(path.join(appDir, 'ui/settings.js'), 'utf8');
const updateStatus = require(path.join(appDir, 'util', 'updateStatus.js'));

test('the chip ships hidden, so an idle app pays nothing for it', () => {
  assert.match(titleBarJs, /<span id="update-status" hidden>/);
  assert.match(titleBarCss, /#update-status\[hidden\] \{\s*display: none;/);
});

test('the chip lives in the title-bar row instead of floating over the window controls', () => {
  // The bar is 30px tall and the window controls own its right-hand 180px; an absolutely positioned
  // badge here would sit on top of them as soon as the window narrows.
  assert.match(titleBarJs, /<span id="start-watchdog"><\/span><span id="update-status"/);
  assert.doesNotMatch(titleBarCss.slice(titleBarCss.indexOf('#update-status {')), /^\s*position: absolute;/m);
});

test('every phase the renderer can show has a label and a distinct icon', () => {
  const fn = appJs.slice(appJs.indexOf('function updateChipPresentation('));
  assert.ok(fn, 'updateChipPresentation must exist');
  const body = fn.slice(0, fn.indexOf('\n}\n'));

  // 'idle' is the one phase that renders nothing; every other one must be handled.
  for (const phase of updateStatus.PHASES.filter((name) => name !== 'idle')) {
    assert.ok(body.includes(`case '${phase}':`), `missing a case for '${phase}'`);
  }
  assert.ok(body.includes('default:'), 'an unknown phase must render nothing rather than an empty chip');

  const icons = [...body.matchAll(/icon: '(fa-[a-z-]+)'/g)].map((match) => match[1]);
  assert.ok(icons.length >= 6, 'each phase carries its own icon');
  // Error must not look like progress.
  assert.ok(icons.includes('fa-triangle-exclamation'));
});

test('the progress bar is only drawn for the phase that has a percentage', () => {
  assert.match(titleBarCss, /#update-status\[data-phase='downloading'\] \.update-track \{\s*display: inline-block;/);
  assert.match(titleBarCss, /#update-status \.update-track \{[^}]*display: none;/);
});

test('Cancel is shown only while there is a transfer to stop', () => {
  const chipView = fs.readFileSync(path.join(appDir, 'util/updateChipView.js'), 'utf8');
  assert.match(titleBarCss, /#update-cancel \{[^}]*display: none;/);
  assert.match(titleBarCss, /#update-status\[data-cancellable='true'\] #update-cancel \{\s*display: inline-flex;/);
  assert.match(chipView, /chip\.setAttribute\('data-cancellable', String\(!!state\.cancellable\)\)/);
  assert.match(titleBarJs, /invoke\('cancel-update-download'\)/);
});

test('the chip markup is applied by the shared view, which a real engine can drive', () => {
  // Layout and paint are what can go wrong here, and neither is observable from source; see
  // test/browser/updateChip.browser.test.js.
  assert.match(appJs, /applyUpdateChip\(chip, view \? state : null, view, t\('cancel'/);
  assert.ok(fs.existsSync(path.join(appDir, 'util/updateChipView.js')));
});

test('Cancel is reachable from the keyboard', () => {
  // It is the only way to stop a download that was started by mistake, so it cannot be mouse-only.
  assert.match(titleBarJs, /id="update-cancel" role="button" tabindex="0"/);
  assert.match(titleBarJs, /addEventListener\('keydown', this\.onCancelUpdate\)/);
  assert.match(titleBarJs, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(titleBarJs, /removeEventListener\('keydown', this\.onCancelUpdate\)/);
});

test('a window opened mid-download asks for the state instead of waiting for the next event', () => {
  assert.match(appJs, /ipcRenderer\s*\.invoke\('get-update-status'\)/);
  assert.match(appJs, /ipcRenderer\.on\('update-status'/);
  // Settings shows the same state, from the same source.
  assert.match(settingsJs, /ipcRenderer\.on\('update-status'/);
  assert.match(settingsJs, /ipcRenderer\.invoke\('get-update-status'\)/);
});

test('an error clears itself instead of sitting in the title bar until the next check', () => {
  assert.match(appJs, /const UPDATE_ERROR_VISIBLE_MS = \d+;/);
  const visible = Number(/const UPDATE_ERROR_VISIBLE_MS = (\d+);/.exec(appJs)[1]);
  assert.ok(visible >= 5000 && visible <= 60000, `an error must stay long enough to read and no longer (got ${visible}ms)`);
  assert.match(appJs, /if \(state\.phase === 'error'\) \{[\s\S]*renderUpdateStatus\(null\)/);
});

test('a language change repaints the chip from the last known state', () => {
  // The chip is only pushed on an updater event, so switching language mid-download would otherwise
  // leave the old language on screen until the next percent.
  assert.match(appJs, /window\.refreshWatchdogStatusText = \(\) => \{[\s\S]*renderUpdateStatus\(lastUpdateStatus\)/);
});

test('the chip never renders a raw string the locale layer has not seen', () => {
  const fn = appJs.slice(appJs.indexOf('function updateChipPresentation('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  const labels = [...body.matchAll(/label: ([^,\n]+)/g)].map((match) => match[1].trim());
  assert.ok(labels.length > 0);
  for (const label of labels) assert.match(label, /^t\(/, `label ${label} bypasses the locale layer`);
});
