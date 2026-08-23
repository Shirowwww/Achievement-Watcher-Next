'use strict';

/*
  Import Theme / Export Theme in Settings, and the frame that shows a theme before it is applied.
  The renderer is not testable in jsdom, so what these pin is the contract around it: the markup the
  locale loader binds by id, the IPC channels the buttons call, and the rule that an imported theme
  is never applied by anything but the picker.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const { parse } = require(path.join(appDir, 'node_modules', 'node-html-parser'));

const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
const document = parse(html);
const settings = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
const loader = fs.readFileSync(path.join(appDir, 'locale', 'loader.js'), 'utf8');
const main = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
const english = JSON.parse(fs.readFileSync(path.join(appDir, 'locale', 'lang', 'english.json'), 'utf8'));

test('the theme file controls live in the Appearance section', () => {
  const section = document.querySelector('section[data-view="appearance"]');
  assert.ok(section, 'the Appearance section is gone');
  assert.ok(section.querySelector('#theme-library'), 'the theme file card must be in Appearance');

  for (const id of ['btn-import-theme', 'btn-export-theme', 'btn-delete-theme', 'theme-library-status']) {
    assert.ok(section.querySelector(`#${id}`), `#${id} is missing`);
  }

  // Delete only exists for a theme the app installed, so it starts hidden.
  assert.ok(document.querySelector('#btn-delete-theme').hasAttribute('hidden'), 'Delete must start hidden');
});

/*
  The card belongs to the themes a person owns. A built-in is not theirs to export or delete, so on
  one the card is absent rather than disabled - and it starts hidden in the markup, or it would show
  for a frame before the picker has been read.
*/
test('the theme card only appears for a theme the user owns', () => {
  const card = document.querySelector('#theme-library');
  assert.match(card.getAttribute('style') || '', /display\s*:\s*none/, 'the card must start hidden');

  const refresh = settings.slice(settings.indexOf('function refreshThemeLibraryControls()'));
  const body = refresh.slice(0, refresh.indexOf('\n    }'));
  assert.match(body, /value === 'custom' \|\| Boolean\(imported\)/, 'the card shows for the Custom theme and for an imported one');
  assert.match(body, /\$\('#theme-library'\)\.toggle\(shown\)/);

  // Selecting a theme is the one thing that re-decides it, so nothing can leave the card stranded.
  const picker = settings.slice(settings.indexOf("$('#option_theme').on('change'"));
  assert.ok(picker.indexOf('refreshThemeLibraryControls()') > -1, 'the picker must refresh the card');
});

/*
  The locale loader binds the Settings rows by nth-child, so anything added to one of those lists
  shifts every label after it. The theme card is a sibling card bound by id instead, which is why
  it can exist at all - and this is the test that keeps it that way.
*/
test('the theme card adds no row to a list the locale loader counts', () => {
  const rows = document.querySelectorAll('section[data-view="appearance"] .arrow-list ul > li');
  assert.equal(rows.length, 1, 'the Appearance list is one row: the theme picker');
  assert.ok(rows[0].querySelector('#option_theme'), 'and that row is the picker');
  assert.equal(document.querySelector('#theme-library').closest('ul'), null, 'the card must not be inside a bound list');
});

test('every string in the theme card is bound by the locale loader', () => {
  const bound = [
    ['#theme-library-title', 'library.title'],
    ['#theme-library-hint', 'library.hint'],
    ['#theme-library-desc', 'library.description'],
    ['#btn-import-theme span', 'library.import'],
    ['#btn-export-theme span', 'library.export'],
    ['#btn-delete-theme span', 'library.delete'],
    ['#theme-preview-title', 'library.previewTitle'],
    ['#theme-preview-cancel span', 'library.previewCancel'],
    ['#theme-preview-apply span', 'library.previewApply'],
  ];

  for (const [selector, key] of bound) {
    assert.ok(document.querySelector(selector), `${selector} is missing from app.html`);
    assert.ok(loader.includes(`$('${selector}')`), `${selector} is not bound in loader.js`);
    assert.ok(loader.includes(`library.${key.split('.').pop()}`), `${key} is not read by loader.js`);
  }

  const library = english.settings.general.theme.library;
  assert.ok(library, 'settings.general.theme.library is missing from English');
  for (const [, key] of bound) {
    const field = key.split('.').pop();
    assert.ok(String(library[field] || '').trim(), `library.${field} has no English value`);
  }
});

test('the preview frame is a document, not a place a theme can run something', () => {
  const preview = document.querySelector('#theme-preview');
  assert.ok(preview, 'the preview modal is missing');
  assert.equal(preview.getAttribute('aria-hidden'), 'true', 'it must start hidden from assistive tech');

  const frame = preview.querySelector('#theme-preview-frame');
  assert.ok(frame, 'the preview frame is missing');
  assert.equal(frame.tagName.toLowerCase(), 'iframe');
  assert.equal(frame.getAttribute('src'), undefined, 'the frame is filled with srcdoc, never pointed at a file');

  // srcdoc inherits the page policy, and the page policy pins every script that may run by hash.
  assert.match(settings, /frame\.srcdoc = themeMock\.buildThemeMock\(/, 'the frame must be filled by the shared mock builder');
  const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.match(csp, /script-src 'self'/, "the page still pins what may run");
  assert.ok(!/unsafe-inline/.test(csp.split('script-src')[1].split(';')[0]), 'inline script must not be allowed');
});

test('the buttons call channels the main process answers', () => {
  const channels = ['export-theme', 'preview-theme', 'discard-theme-preview', 'import-theme', 'list-installed-themes', 'delete-installed-theme'];
  for (const channel of channels) {
    assert.ok(settings.includes(`invoke('${channel}'`), `settings.js never calls ${channel}`);
    assert.ok(main.includes(`ipcMain.handle('${channel}'`), `init.js does not answer ${channel}`);
  }
});

test('a name clash changes nothing until the user picks', () => {
  // The first call reports the clash, and only a second one carries a policy.
  assert.match(settings, /invoke\('import-theme', \{ file \}\)/, 'the first import must not carry a policy');
  assert.match(settings, /invoke\('import-theme', \{ file, duplicate: choice === 1 \? 'replace' : 'rename' \}\)/);
  assert.match(settings, /'keep-both-themes'/);
  assert.match(settings, /'replace-theme'/);

  // The main process refuses anything but the two policies it knows.
  assert.match(main, /\['rename', 'replace'\]\.includes\(opts\.duplicate\) \? opts\.duplicate : 'fail'/);
});

test('an import is only installed after the preview is confirmed', () => {
  // Reading a package writes nothing but a throwaway folder, and applying is a separate call.
  assert.match(main, /ipcMain\.handle\('preview-theme'/);
  assert.ok(!/preview-theme[\s\S]{0,2000}installThemePackage/.test(main), 'previewing must not install');
  assert.match(settings, /\$\('#theme-preview-apply'\)\.on\('click'/);
  assert.match(settings, /\$\('#theme-preview-cancel'\)\.on\('click', \(\) => closeThemePreview\(\)\)/);
  // Cancelling takes the unpacked copy with it.
  assert.match(settings, /invoke\('discard-theme-preview'\)/);
});

test('export refuses the one theme that has no model to write', () => {
  // A user stylesheet is not exportable, and the refusal is a translated sentence rather than a
  // silent no-op.
  assert.match(main, /css-theme-not-exportable/);
  assert.match(settings, /'export-theme-css-unsupported'/);
  assert.match(
    settings,
    /userThemes\.parseValue\(value\) !== null \|\| value === MORE_THEMES_VALUE/,
    'the button is disabled for a stylesheet theme'
  );
});

test('deleting a theme stops painting it before the folder goes', () => {
  const block = settings.slice(settings.indexOf("$('#btn-delete-theme')"));
  const populate = block.indexOf("populateThemeSelect('default')");
  const apply = block.indexOf("applyThemeValue('default')");
  const remove = block.indexOf("invoke('delete-installed-theme'");
  assert.ok(populate > -1, 'deleting must put the picker back on a theme that exists');
  assert.ok(apply > -1, 'and stop the window drawing the theme that is about to be removed');
  /*
    Order is the whole fix. The window keeps every image a theme brought open for as long as its
    stylesheet names them, and Windows answers EPERM when asked to delete a folder whose files are
    open - which is what deleting the applied theme used to report.
  */
  assert.ok(populate < remove && apply < remove, 'the theme stops being painted first, then the folder is removed');
  assert.match(block, /showMessageBoxSync/, 'deleting a theme asks first');
  // A refusal must not leave the user on a theme they did not choose.
  assert.match(block, /populateThemeSelect\(wasSelected\);\s*\n\s*applyThemeValue\(wasSelected\);/);
});

test('a theme folder is removed with retries, not on the first refusal', () => {
  const pkg = fs.readFileSync(path.join(root, 'app', 'util', 'themePackage.js'), 'utf8');
  const remove = pkg.slice(pkg.indexOf('function deleteInstalledTheme'));
  assert.match(remove.slice(0, remove.indexOf('\n}')), /rmSync\([^)]*maxRetries: \d+/, 'a handle that is closing needs a moment, not an error');
});

test('an imported theme is an ordinary entry in the picker', () => {
  assert.match(settings, /invoke\('list-installed-themes'\)/);
  assert.match(settings, /installedThemes\.forEach\(\(theme\) => sel\.append\(themeOption\(theme\.value, theme\.name\)\)\)/);
  // The value it stores, and the one thing every injected-CSS theme has to agree on.
  assert.match(settings, /userThemes\.usesInjectedCss\(value\)/);
  const app = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
  assert.match(app, /userThemes\.usesInjectedCss\(savedTheme\)/, 'the main window must treat an imported theme like the Custom one');
});
