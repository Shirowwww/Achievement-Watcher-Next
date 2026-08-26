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
  The card is there for every theme the app can write out - a built-in included, since every theme
  is editable now and hiding the card was how "a built-in keeps its name" used to be enforced: by
  leaving no way out of a theme somebody had just spent ten minutes on. A user stylesheet is the one
  exception, because there is no model to write. It starts hidden in the markup, or it would show
  for a frame before the picker has been read.
*/
test('the theme card appears for every theme the app can write out', () => {
  const card = document.querySelector('#theme-library');
  assert.match(card.getAttribute('style') || '', /display\s*:\s*none/, 'the card must start hidden');

  const refresh = settings.slice(settings.indexOf('function refreshThemeLibraryControls()'));
  const body = refresh.slice(0, refresh.indexOf('\n    }'));
  assert.match(body, /userThemes\.parseValue\(value\) === null/, 'a user stylesheet is the one theme with nothing to write');
  assert.match(body, /value !== MORE_THEMES_VALUE/, 'the More themes row is a command, not a theme');
  assert.match(body, /\$\('#theme-library'\)\.toggle\(shown\)/);
  // Delete still belongs only to a theme the app installed.
  assert.match(body, /\$\('#btn-delete-theme'\)\.prop\('hidden', !imported\)/);

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

  // The frame is created when a theme is actually previewed, so the markup carries its wrapper and
  // the panel builds the iframe into it. It is never given a src: srcdoc is the only way in.
  const wrap = preview.querySelector('.theme-preview-frame');
  assert.ok(wrap, 'the preview frame wrapper is missing');
  assert.ok(!wrap.querySelector('iframe'), 'the frame must not be built before a theme is previewed');
  assert.match(
    settings,
    /const frame = ensureFrame\(document\.querySelector\('#theme-preview \.theme-preview-frame'\)/,
    'nothing creates the preview frame'
  );

  // srcdoc inherits the page policy, and the page policy pins every script that may run by hash.
  assert.match(settings, /frame\.srcdoc = themeMock\.buildThemeMock\(/, 'the frame must be filled by the shared mock builder');
  // Non-vacuous version of the old "the frame has no src attribute" check: the element is built in
  // JS now, so the thing to pin is that its builder never gives it one and nothing assigns one later.
  const builder = settings.slice(settings.indexOf('function ensureFrame('), settings.indexOf('const localeRefreshers'));
  assert.ok(!/\.src\s*=/.test(builder), 'the frame builder must never point a frame at a file');
  assert.ok(!/theme-preview-frame'\)\.src\s*=|frame\.src\s*=/.test(settings), 'nothing may set a src on the preview frame');
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
  // silent no-op. The button is not offered for one either, since the whole card is absent.
  assert.match(main, /css-theme-not-exportable/);
  assert.match(settings, /'export-theme-css-unsupported'/);
  assert.match(settings, /\$\('#btn-export-theme'\)\.prop\('disabled', !shown\)/, 'the button follows the card');
});

/*
  And a built-in is refused under its own name, in words, rather than by having no button.

  The file would install as "Nord" on somebody else's machine and shadow the Nord they already
  have, so the name has to become the exporter's first - which is also the moment it stops being
  the built-in. What changed is only how that is said: it used to be said by hiding the control.
*/
test('a built-in is refused under its own name, and told why', () => {
  // The main process checks the resolved name against everything the picker already means.
  const block = main.slice(main.indexOf("ipcMain.handle('export-theme'"));
  const body = block.slice(0, block.indexOf('\n});'));
  assert.match(body, /takenThemeNames\(\)\.some\(/, 'the export must check the reserved names');
  assert.match(body, /error: 'reserved-name'/);
  // An imported theme keeps its own name through a re-export, so it is exempt from the check.
  assert.match(body, /!userThemes\.parsePackValue\(value\) &&/);

  // The renderer turns that into a sentence that says what to do.
  assert.match(settings, /if \(error === 'reserved-name'\)/);
  assert.match(settings, /'export-theme-reserved-name'/);

  // And the name it sends is the one from the editor, which is where a rename happens.
  assert.match(settings, /name: known \? known\.name : themeNameFromDom\(\) \|\| selectedThemeLabel\(\)/);

  const localeDir = path.join(appDir, 'locale', 'lang');
  for (const file of fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    assert.ok(String(locale.dialogs['export-theme-reserved-name'] || '').trim(), `${file}: the refusal has no words`);
  }
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

/*
  Deleting an imported theme used to need two clicks.

  Ordering the calls was not enough: applying a theme is a round trip to the main process, so the
  delete fired while the window was still painted by the stylesheet naming the theme's images.
  Windows answered EPERM, the delete reported failure - and by then the theme was no longer painted,
  so a second click worked. The await is the fix, and this is what keeps it there.
*/
test('deleting waits for the window to stop painting the theme', () => {
  const block = settings.slice(settings.indexOf("$('#btn-delete-theme').on('click'"));
  const body = block.slice(0, block.indexOf('\n    });'));
  assert.match(body, /await applyThemeValue\('default'\)/, 'the repaint must be awaited, not merely started first');
  const apply = body.indexOf("await applyThemeValue('default')");
  const remove = body.indexOf("invoke('delete-installed-theme'");
  assert.ok(apply > -1 && remove > apply, 'and awaited before the folder is removed');

  // Awaiting it means something only because the function hands back the promise it starts.
  const applyFn = settings.slice(settings.indexOf('function applyThemeValue('));
  assert.match(applyFn.slice(0, applyFn.indexOf('\n}')), /return ipcRenderer\s*\n?\s*\.invoke\('get-theme-payload'/);
});

/*
  A custom theme has a name its author gave it, and that one name is what the picker shows and what
  the exported file is called. Nothing here invents a name: an unnamed theme is refused, in words,
  with the field that fixes it focused.
*/
test('the Custom theme is named by its author, in a required field', () => {
  const card = document.querySelector('#theme-customizer');
  assert.ok(card, 'the Custom theme editor is gone');
  const field = card.querySelector('#theme-customizer-name');
  assert.ok(field, 'there is nowhere to name the theme');
  assert.equal(field.tagName, 'INPUT');
  assert.ok(field.hasAttribute('required'), 'the name is required');
  assert.ok(card.querySelector('#theme-customizer-name-label'), 'the field has no label');
  assert.ok(card.querySelector('#theme-customizer-name-hint'), 'the field has no hint to show when it is empty');

  // Bound by id, so it shifts none of the nth-child bindings the locale loader counts on.
  assert.equal(document.querySelector('#theme-customizer-name').closest('ul'), null);
  assert.match(loader, /\$\('#theme-customizer-name-label'\)\.text/);
  assert.match(loader, /\$\('#theme-customizer-name'\)\.attr\('placeholder'/);
  const theme = english.settings.general.theme;
  assert.ok(String(theme.customName || '').trim(), 'settings.general.theme.customName has no English value');
  assert.ok(String(theme.customNamePlaceholder || '').trim(), 'settings.general.theme.customNamePlaceholder has no English value');
});

/*
  "Custom…" is a row, not a theme's name.

  It is the scratch slot: always present, always editable, and it keeps its invitation wording
  however many themes have been saved out of it. Naming happens through Save, which writes a theme
  of its own and leaves the slot free for the next idea - so the row must never be relabelled after
  a name is typed.
*/
test('the Custom row keeps its own wording, whatever the name field says', () => {
  assert.match(settings, /function customThemeLabel\(\) \{\s*\n\s*return t\('themeCustom'/, 'the row must always read as the invitation');
  assert.match(settings, /sel\.append\(\$\('<option>'\)\.attr\('value', 'custom'\)\.text\(customThemeLabel\(\)\)\)/);
  assert.ok(!settings.includes('refreshCustomThemeOption'), 'nothing may relabel the Custom row from the name field any more');
});

/*
  Save is what turns an edit into a theme. The name decides which one: unchanged it updates the
  theme the editor opened on, changed it makes a second and leaves the first alone - and a name that
  is taken is reported before anything is written, never overwritten silently.
*/
test('Save writes a theme of the user own, and never overwrites one silently', () => {
  const field = document.querySelector('#theme-customizer .theme-name-field');
  assert.ok(field, 'the name block is gone');
  assert.ok(field.querySelector('#theme-customizer-name'), 'there is nowhere to name the theme');
  assert.ok(field.querySelector('#btn-save-theme'), 'Save must sit with the name it uses');
  assert.ok(field.querySelector('#theme-save-status'), 'a save says what it did');
  assert.match(loader, /\$\('#btn-save-theme span'\)\.text/, 'the button label is not bound to the locale');

  // The two-step: the first call carries no policy, and only an explicit Replace calls back with one.
  assert.match(settings, /invoke\('save-theme-as', request\)/, 'the first save must not carry a policy');
  assert.match(settings, /invoke\('save-theme-as', \{ \.\.\.request, overwrite: true \}\)/);
  assert.match(settings, /'replace-theme'/);
  assert.match(main, /ipcMain\.handle\('save-theme-as'/);

  // The main process refuses a name that is taken unless it was told to replace.
  const pkg = fs.readFileSync(path.join(appDir, 'util', 'themePackage.js'), 'utf8');
  const save = pkg.slice(pkg.indexOf('function saveThemeAs('));
  assert.match(save.slice(0, save.indexOf('\n}')), /if \(existed && !overwrite\) return fail\('duplicate'/);

  // Nothing is saved under no name at all.
  assert.match(settings, /const name = themeNameFromDom\(\);\s*\n\s*if \(!name\)/);
  assert.match(settings, /\$\('#theme-customizer-name'\)\.trigger\('focus'\)/);
});

/*
  Every theme is editable, and the editor follows the picker rather than belonging to the Custom row.
  A user stylesheet is the one kind with no layer model - it is CSS somebody wrote - so it is the one
  the editor stays shut for.
*/
test('the editor opens on whichever theme is selected', () => {
  assert.match(settings, /if \(userThemes\.parseValue\(value\)\) closeThemeEditor\(\);\s*\n\s*else openThemeEditor\(value\);/);
  assert.match(settings, /invoke\('get-theme-model', editingValue\)/);
  assert.match(main, /ipcMain\.handle\('get-theme-model'/);
  // themeModelFor answers null for a stylesheet theme, which is how the editor knows to stay shut.
  assert.match(main, /if \(userThemes\.parseValue\(name\)\) return null;/);
});

/*
  Editing a built-in previews; it does not quietly rewrite it. Only the Custom slot is written as you
  type, because that is what a scratchpad is - which is also why a built-in stays the built-in and
  why saving under another name keeps both.
*/
test('only the Custom slot is written while editing', () => {
  const block = settings.slice(settings.indexOf('function scheduleCustomThemeSave()'));
  const body = block.slice(0, block.indexOf('\n    }'));
  assert.match(body, /editingValue === 'custom' \? 'save-custom-theme' : 'preview-theme-model'/, 'a draft over another theme must not be persisted');
  assert.match(main, /ipcMain\.handle\('preview-theme-model'/);

  // And the preview handler is exactly that: it builds the stylesheet and stores nothing.
  const preview = main.slice(main.indexOf("ipcMain.handle('preview-theme-model'"));
  const handler = preview.slice(0, preview.indexOf('\n});'));
  assert.ok(!/saveCustomTheme|saveInstalledTheme|writeFileSync/.test(handler), 'previewing must not write a theme');
});

test('the refusal has words in every bundled locale', () => {
  const localeDir = path.join(appDir, 'locale', 'lang');
  const files = fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    assert.ok(String(locale.dialogs['theme-name-required'] || '').trim(), `${file}: the refusal has no words`);
    assert.ok(String(locale.settings.general.theme.customName || '').trim(), `${file}: the field has no label`);
    assert.ok(String(locale.settings.general.theme.customNamePlaceholder || '').trim(), `${file}: the field has no placeholder`);
  }
});

/*
  The preview is a picture of THIS application, and half of what makes a window recognisable is its
  lettering. Under `default-src 'none'` a font it does not carry is a font it cannot have, so the
  faces travel in the document as data - which is also the only thing the gallery renderer lets
  through besides its own folder.
*/
test('the preview is set in the application own typefaces', () => {
  const mock = fs.readFileSync(path.join(appDir, 'util', 'themeMock.js'), 'utf8');
  for (const family of ['Raleway', 'Open-Sans', 'Open-Sans-Bold', 'Raleway-Bold']) {
    assert.ok(mock.includes(`'${family}'`), `the mock never asks for ${family}`);
  }
  assert.ok(mock.includes('font-src data:'), 'the document must allow the faces it carries');

  const fonts = require(path.join(appDir, 'util', 'themeFonts.js'));
  const css = fonts.themeMockFontCss();
  assert.match(css, /^@font-face/, 'the faces are not built');
  for (const face of fonts.FACES) {
    assert.ok(css.includes(`font-family: '${face.family}'`), `${face.family} is missing from the stylesheet`);
  }
  assert.ok(!/url\((?!data:)/.test(css), 'a face must travel as data, never as a path or an address');

  // Both places that draw the sample pass them, so a card and the in-app preview are the same picture.
  assert.match(settings, /fontCss: themeFonts\.themeMockFontCss\(\)/);
  const renderer = fs.readFileSync(path.join(root, 'tools', 'gallery', 'render-theme-preview.js'), 'utf8');
  assert.match(renderer, /buildThemeMock\(theme, \{ fontCss: themeMockFontCss\(\) \}\)/);
});

/*
  Deleting a saved or imported theme took two clicks, in a second way.

  The picker is rebuilt from theme storage BEFORE the folder is removed - it has to be, so the window
  stops painting the theme whose images are about to go. But nothing read storage again afterwards,
  so the list came back still holding the theme that was then deleted: the row stayed, selecting it
  painted nothing, and Delete had to be pressed again to clear it. The theme had gone the first time;
  only the list had not caught up.
*/
test('deleting a theme takes it out of the picker as well as off the disk', () => {
  const block = settings.slice(settings.indexOf("$('#btn-delete-theme').on('click'"));
  const body = block.slice(0, block.indexOf('\n    });'));

  const removed = body.indexOf("invoke('delete-installed-theme'");
  const rebuilds = [...body.matchAll(/populateThemeSelect\('default'\)/g)].map((match) => match.index);
  assert.ok(removed > -1, 'the delete call is gone');
  assert.ok(
    rebuilds.some((at) => at < removed),
    'the picker must move off the theme before its folder goes'
  );
  assert.ok(
    rebuilds.some((at) => at > removed),
    'and be read again afterwards, or the deleted theme stays in the list'
  );

  // The second rebuild belongs to the success branch: a refusal puts the user back instead.
  const success = body.slice(body.indexOf('if (res && res.ok)'));
  assert.match(success.slice(0, success.indexOf('} else')), /populateThemeSelect\('default'\)/);
});

/*
  Reset puts back the theme the editor was opened on.

  Every theme is editable now, so "reset all" has an obvious meaning it did not have when the editor
  only ever showed one theme: undo what I changed about THIS one. It reads the model back rather than
  reconstructing it, so a built-in returns its own palette and a saved or imported theme returns what
  is on disk. The Custom slot is the exception with nothing to go back to - what is stored there is
  what you are editing - so there it stays the default palette.
*/
test('Reset goes back to the theme being edited, not to a generic default', () => {
  const block = settings.slice(settings.indexOf("$('#theme-customizer-reset').on('click'"));
  const body = block.slice(0, block.indexOf('\n    });'));

  assert.match(body, /if \(!editingValue \|\| editingValue === 'custom'\)/, 'the Custom slot needs its own branch');
  assert.match(body, /invoke\('get-theme-model', editingValue\)/, 'anything else must be read back, not guessed');
  // The default palette is still what the Custom slot resets to, and the fallback if the read fails.
  assert.equal((body.match(/themeLayers\.defaultCustomTheme\(\)/g) || []).length, 3, 'the default palette is the Custom branch and the two fallbacks');
  assert.match(body, /scheduleCustomThemeSave\(\);/, 'the reset has to reach the preview');
});

/*
  A late answer must not paint over a newer selection.

  The editor names the theme it is opening straight away and fetches its model asynchronously, so two
  selections close together settle in whatever order the main process answers. A stale answer painting
  its layers under a newer `editingValue` would leave the editor showing one theme while believing it
  holds another - and with the Custom slot selected, the next edit would write the wrong colours into
  the one theme the editor writes to as you type.
*/
test('a slow theme load cannot paint over the theme selected after it', () => {
  const block = settings.slice(settings.indexOf('function openThemeEditor('));
  const body = block.slice(0, block.indexOf('\n    }'));

  assert.match(body, /const opening = String\(value \|\| 'custom'\);/, 'the opened theme must be captured, not re-read');
  assert.match(body, /invoke\('get-theme-model', opening\)/);
  assert.match(body, /if \(editingValue !== opening\) return;/, 'a stale answer must be dropped');
  // And the guard has to come before anything it would have changed.
  const guard = body.indexOf('if (editingValue !== opening) return;');
  for (const write of ['customThemeSnapshot =', 'editingBase =', 'renderCustomThemeLayers(']) {
    assert.ok(body.indexOf(write) > guard, `${write} runs before the staleness check`);
  }
});
