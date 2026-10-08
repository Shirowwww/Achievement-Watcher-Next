'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appDir = path.join(__dirname, '..', '..', 'app');
const deps = require(path.join(appDir, 'util', 'settingsDependencies.js'));
const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
const settingsJs = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');

test('every control a rule reads or dims exists in the markup', () => {
  for (const id of [...deps.watchedControls(), ...deps.dimmableControls()]) {
    assert.ok(html.includes(`id="${id}"`), `settingsDependencies names #${id}, which is not in app.html`);
  }
});

test('with the defaults nothing is dimmed except what a switched-off parent turns off', () => {
  const values = {
    option_mergeDuplicate: 'true',
    option_notifyOnProgress: 'true',
    option_notifMode: 'auto',
    option_souvenirScreenshot: 'true',
    option_controllerEnabled: 'true',
    option_controllerAppNavigation: 'true',
  };
  assert.deepEqual([...deps.inactiveControls(values)], []);
});

test('the notification mode dims the rows of the transport it does not use', () => {
  const overlayRows = ['option_overlayPreset', 'option_overlayPosition', 'option_overlaySound', 'option_overlayVolume'];
  const toastRows = ['option_groupToast', 'option_urgent'];
  const base = { option_mergeDuplicate: 'true', option_notifyOnProgress: 'true', option_souvenirScreenshot: 'true', option_controllerEnabled: 'true' };

  const toast = deps.inactiveControls({ ...base, option_notifMode: 'toast' });
  overlayRows.forEach((id) => assert.ok(toast.has(id), `${id} is overlay-only`));
  toastRows.forEach((id) => assert.ok(!toast.has(id)));

  const overlay = deps.inactiveControls({ ...base, option_notifMode: 'overlay' });
  toastRows.forEach((id) => assert.ok(overlay.has(id), `${id} is toast-only`));
  overlayRows.forEach((id) => assert.ok(!overlay.has(id)));

  for (const mode of ['auto', 'both']) {
    const both = deps.inactiveControls({ ...base, option_notifMode: mode });
    assert.equal(both.size, 0, `${mode} uses both transports`);
  }
});

test('each parent switch dims its dependents', () => {
  const live = {
    option_mergeDuplicate: 'true',
    option_notifyOnProgress: 'true',
    option_notifMode: 'auto',
    option_souvenirScreenshot: 'true',
    option_controllerEnabled: 'true',
    option_controllerAppNavigation: 'false',
  };
  const off = (key, value) => deps.inactiveControls({ ...live, [key]: value });

  assert.ok(off('option_mergeDuplicate', 'false').has('option_timeMergeRecentFirst'));
  assert.ok(off('option_notifyOnProgress', 'false').has('option_progressStep'));
  assert.ok(off('option_souvenirScreenshot', 'false').has('option_souvenirHdr'));
  assert.ok(off('option_controllerEnabled', 'false').has('option_controllerToggle1'));
  // The layout serves both controller features, so it stays live while either is on.
  assert.ok(!off('option_controllerEnabled', 'true').has('option_controllerLayout'));
  assert.ok(off('option_controllerEnabled', 'false').has('option_controllerLayout'));
  assert.ok(!deps.inactiveControls({ ...live, option_controllerEnabled: 'false', option_controllerAppNavigation: 'true' }).has('option_controllerLayout'));
});

test('dimming never changes a value: the panel only toggles is-inactive', () => {
  const start = settingsJs.indexOf('function updateDependentRows()');
  const body = settingsJs.slice(start, settingsJs.indexOf('\n    }\n', start));
  assert.match(body, /toggleClass\('is-inactive'/);
  assert.doesNotMatch(body, /\.val\(['"`\w]/, 'a dimmed row keeps its value');
  assert.doesNotMatch(body, /\.remove\(|\.hide\(|prop\('disabled'/, 'dimmed rows stay in place and enabled');
});
