'use strict';

/*
  What portable themes are allowed to cost when nobody is using them.

  The app is a resident tray daemon, so a feature that reads theme storage on every start, or on
  every theme broadcast, is paid for by every user who never imports a theme. These pin the cheap
  shape: nothing is read unless an imported theme is actually selected, the generated blur copies
  are made once at import rather than on every payload, and the throwaway folder a preview unpacks
  into is always removed.

  Source-level assertions for init.js, in the house style: it cannot be required outside Electron.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const initJs = fs.readFileSync(path.join(appRoot, 'electron', 'init.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(appRoot, 'ui', 'settings.js'), 'utf8');
const themePackage = require(path.join(appRoot, 'util', 'themePackage.js'));

function block(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from > -1, `${start} is gone`);
  const to = source.indexOf(end, from);
  assert.ok(to > from, `${end} no longer follows ${start}`);
  return source.slice(from, to);
}

test('theme storage is only read when an imported theme is the one selected', () => {
  const payload = block(initJs, 'function currentThemePayload(', 'const BASE_URL');
  // The read sits behind the prefix check, so a start on a built-in theme touches nothing.
  const guard = payload.indexOf('userThemes.parsePackValue(name)');
  const read = payload.indexOf('themePackage.readInstalledTheme');
  assert.ok(guard > -1, 'the pack prefix check is gone');
  assert.ok(read > guard, 'theme storage is read before anything says a theme is selected');
  assert.match(payload, /if \(pack\) \{/);
});

test('nothing enumerates theme storage at startup', () => {
  // listInstalledThemes walks a folder, so it belongs to the picker and to an import, never to a
  // path that runs on every start.
  const uses = [...initJs.matchAll(/themePackage\.listInstalledThemes\(/g)].map((match) => match.index);
  assert.ok(uses.length > 0, 'the picker has to be able to list them');
  for (const at of uses) {
    const before = initJs.slice(0, at);
    const handler = before.lastIndexOf('ipcMain.handle(');
    const listener = before.lastIndexOf('ipcMain.on(');
    assert.ok(handler > -1 || listener > -1, 'listInstalledThemes is called outside an IPC handler');
  }
  // And the renderer asks for the list when it builds the picker, not on load.
  assert.match(settingsJs, /function populateThemeSelect\(preferred\) \{[\s\S]{0,2000}invoke\('list-installed-themes'\)/);
});

test('the generated blur copies are made once, at import', () => {
  const importer = block(initJs, "ipcMain.handle('import-theme'", "ipcMain.handle('list-installed-themes'");
  assert.match(importer, /prepareThemeBlurImages\(out\.theme, path\.join\(dir, themePackage\.THEME_DERIVED_DIR\)\)/);
  assert.match(importer, /saveInstalledTheme/, 'the result has to be persisted or it is regenerated every time');

  // The payload path never generates anything: it reads what the import already wrote.
  const payload = block(initJs, 'function currentThemePayload(', 'const BASE_URL');
  assert.ok(!payload.includes('prepareThemeBlurImages'), 'resolving a theme must not start an image job');
});

/*
  A layer with an effect is drawn from a generated copy, never from its source image. Any preview
  that skipped that step would show a sharp wallpaper for a theme about to install heavily blurred,
  so all three places that draw a theme make the same copies through the same module.
*/
test('every place that draws a theme makes the same copies', () => {
  const shared = require.resolve(path.join(appRoot, 'util', 'themeBlur.js'));
  assert.ok(fs.existsSync(shared), 'the shared blur module is gone');

  // The main process delegates rather than carrying its own copy of the logic.
  assert.match(initJs, /themeBlur\.prepareThemeBlurImages\(/);
  assert.ok(!/sharp\(layer\.image\)/.test(initJs), 'init.js grew a second blur implementation');

  // The preview a user approves, and the picture the gallery publishes.
  const preview = block(initJs, "ipcMain.handle('preview-theme'", "ipcMain.handle('discard-theme-preview'");
  assert.match(preview, /prepareThemeBlurImages\(/, 'the Settings preview would show an unblurred theme');
  const renderer = fs.readFileSync(path.join(appRoot, '..', 'tools', 'gallery', 'render-theme-preview.js'), 'utf8');
  assert.match(renderer, /prepareThemeBlurImages\(/, 'the gallery would publish an unblurred picture');
});

test('a preview never leaves its unpacked copy behind', () => {
  assert.match(initJs, /function discardThemePreview\(\)/);
  // A new preview drops the previous one, importing drops it, and quitting drops it.
  const preview = block(initJs, "ipcMain.handle('preview-theme'", "ipcMain.handle('discard-theme-preview'");
  assert.match(preview, /discardThemePreview\(\);\s*\n\s*const dir = fs\.mkdtempSync/);
  assert.match(initJs, /ipcMain\.handle\('discard-theme-preview'/);
  assert.match(initJs, /app\.on\('will-quit', discardThemePreview\)/);

  const importer = block(initJs, "ipcMain.handle('import-theme'", "ipcMain.handle('list-installed-themes'");
  assert.match(importer, /discardThemePreview\(\)/);

  // The renderer closes the loop from its side too, so cancelling costs nothing on disk.
  assert.match(settingsJs, /function closeThemePreview\(\{ discard = true \} = \{\}\)/);
});

test('reading an installed theme is two small files, not a scan', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-theme-cost-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const dir = path.join(root, 'theme-packs', 'Measured');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const theme = {};
  for (const id of ['bg', 'header', 'panel', 'card', 'settings', 'text', 'muted', 'border', 'accent']) {
    theme[id] = { color: '#123456', gradient: { enabled: false } };
  }
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(theme), 'utf8');
  fs.writeFileSync(path.join(dir, 'aw-theme.json'), JSON.stringify({ name: 'Measured', version: '1.0.0' }), 'utf8');

  const started = process.hrtime.bigint();
  for (let i = 0; i < 200; i += 1) assert.ok(themePackage.readInstalledTheme(root, 'Measured'));
  const perCall = Number(process.hrtime.bigint() - started) / 1e6 / 200;

  // Generous on purpose: this is here to catch a read that starts walking a folder or decoding an
  // image, not to measure a machine.
  assert.ok(perCall < 5, `resolving an installed theme took ${perCall.toFixed(2)} ms, which is not two small file reads`);
});

test('a theme storage folder that is not there costs nothing and is not an error', () => {
  const missing = path.join(os.tmpdir(), 'aw-theme-does-not-exist-a76c31');
  assert.deepEqual(themePackage.listInstalledThemes(missing), []);
  assert.equal(themePackage.readInstalledTheme(missing, 'Anything'), null);
  assert.equal(fs.existsSync(missing), false, 'listing must not create the folder');
});
