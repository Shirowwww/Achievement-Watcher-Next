'use strict';

// A preset made by an older build (a gallery one included) carries an older copy of the shared
// engine. It is given today's, which makes it a base the designer can customise; a page whose script
// is not one of ours is never touched.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const customPreset = require(path.join(appRoot, 'util', 'customPreset.js'));
const layerTool = require(path.join(appRoot, 'util', 'presetLayer.js'));

const BUNDLED = path.join(appRoot, 'presets', 'Default Presets');
// Ticket as the gallery serves it: the shared card, with the engine of 2026-08-22 (AW Next 3.9.2).
const OLD_PAGE = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'presets', 'ticket-3.9.2.html'), 'utf8');
const CURRENT_ENGINE_HASH = 'cd3c7e7d758ebc881ab9381ce3b1bd342b6c6cc36e543861e8c8fec4e73bb319';

test('the current engine is pinned, so a change to it records the version it replaces', () => {
  assert.equal(
    customPreset.engineHash(customPreset.PRESET_ENGINE),
    CURRENT_ENGINE_HASH,
    'PRESET_ENGINE changed: add the hash pinned here to PAST_ENGINE_HASHES in util/customPreset.js, then pin the new one'
  );
  assert.equal(customPreset.upgradeEngineHtml(customPreset.buildCustomPresetHtml({})), null, 'a current page is left as it is');
});

test('a page with an older engine gets the current one, and nothing else of it changes', () => {
  const upgraded = customPreset.upgradeEngineHtml(OLD_PAGE);
  assert.ok(upgraded, 'the 3.9.2 page was not recognised');
  assert.ok(layerTool.isLayerableHtml(upgraded), 'the upgraded page is not a base');
  const outside = (html) => html.replace(/<script>[\s\S]*<\/script\s*>/i, '<script></script>');
  assert.equal(outside(upgraded), outside(OLD_PAGE));
  assert.equal(customPreset.upgradeEngineHtml(upgraded), null, 'an upgraded page is upgraded once');
  // Saved with Windows line endings, it is the same script.
  assert.ok(customPreset.upgradeEngineHtml(OLD_PAGE.replace(/\n/g, '\r\n')));
});

test('a page that runs anything but one of our engines is never touched', () => {
  const script = /<script>([\s\S]*)<\/script\s*>/i.exec(OLD_PAGE)[1];
  const cases = {
    'a changed engine': OLD_PAGE.replace(script, `${script}\nfetch('https://example.com');`),
    'a second script': OLD_PAGE.replace('</body>', '<script>alert(1)</script></body>'),
    'a script with attributes': OLD_PAGE.replace('<script>', '<script type="module">'),
    'another card': OLD_PAGE.replace('<div class="ach">', '<div class="ach other">'),
    'no page': '',
  };
  for (const [what, html] of Object.entries(cases)) assert.equal(customPreset.upgradeEngineHtml(html), null, what);
  assert.equal(customPreset.upgradeEngineHtml(null), null);
});

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-engine-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const users = path.join(root, 'users');
  const preset = (name, files) => {
    fs.mkdirSync(path.join(users, name), { recursive: true });
    for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(users, name, file), content);
  };
  return { users, preset };
}

test('an installed gallery preset on the shared card is a base; a designer, SAN or older one is not', (t) => {
  const { users, preset } = workspace(t);
  const current = customPreset.upgradeEngineHtml(OLD_PAGE);
  preset('Ticket', { 'index.html': current, [customPreset.PRESET_PACKAGE_FILE]: '{}' });
  preset('Not Yet', { 'index.html': OLD_PAGE, [customPreset.PRESET_PACKAGE_FILE]: '{}' });
  preset('Made Here', { 'index.html': current, [customPreset.PRESET_PACKAGE_FILE]: '{}', [customPreset.PRESET_OPTIONS_FILE]: '{}' });
  preset('SAN Theme', { 'index.html': '<html><body><div id="outerwrapper"></div></body></html>', [customPreset.PRESET_PACKAGE_FILE]: '{}' });
  preset('Loose', { 'index.html': current });

  assert.equal(layerTool.layerBaseFolder(users, BUNDLED, 'Ticket'), path.join(users, 'Ticket'));
  for (const name of ['Not Yet', 'Made Here', 'SAN Theme', 'Loose', '../users/Ticket', '']) {
    assert.equal(layerTool.layerBaseFolder(users, BUNDLED, name), null, `${name || 'no name'} was taken as a base`);
  }
  const names = layerTool.layerBaseNames(users, BUNDLED);
  assert.ok(names.includes('Ticket') && names.includes('AW Next'), names.join(', '));
  assert.deepEqual(
    names.filter((name) => name !== 'Ticket'),
    fs.readdirSync(BUNDLED).sort((a, b) => a.localeCompare(b))
  );

  preset('Ticket custom', { [layerTool.LAYER_FILE]: JSON.stringify({ base: 'Ticket', sections: ['accent'], options: { accent: '#336699' } }) });
  assert.equal(layerTool.readLayerFolder(users, BUNDLED, 'Ticket custom').baseFolder, path.join(users, 'Ticket'));
});

test('the text section recolours a base whose title reads a colour of its own, as Ticket reads --ink', (t) => {
  const ink = ':root {\n  --ink: #241d15;\n}\n.ach {\n  color: var(--ink);\n}\n.ach .title {\n  margin: 0 0 3px;\n  color: var(--ink);\n}\n.ach.state-platinum .title {\n  color: #0d4c48;\n}\n';
  assert.equal(layerTool.titleInkVar(ink), '--ink');
  // The bundled titles read --text, which the section always sets, or the accent on purpose.
  for (const name of fs.readdirSync(BUNDLED)) {
    assert.equal(layerTool.titleInkVar(fs.readFileSync(path.join(BUNDLED, name, 'style.css'), 'utf8')), '', name);
  }
  const text = { base: 'Inked', sections: ['text'], options: { text: '#f4efe6' } };
  assert.match(layerTool.buildLayerCss(text, { textVar: '--ink' }), /\.ach \{ --text: #f4efe6; --ink: #f4efe6; color: #f4efe6 !important; \}/);
  assert.doesNotMatch(layerTool.buildLayerCss(text, { textVar: '--ink; } body { display: none' }), /display/);

  const { users, preset } = workspace(t);
  preset('Inked', { 'index.html': customPreset.upgradeEngineHtml(OLD_PAGE), 'style.css': ink, [customPreset.PRESET_PACKAGE_FILE]: '{}' });
  preset('Inked custom', { [layerTool.LAYER_FILE]: JSON.stringify(text) });
  assert.equal(layerTool.readLayerFolder(users, BUNDLED, 'Inked custom').layer.textVar, '--ink');
});

test('the main process upgrades installed presets as it lists them, and reads bases through the layer helpers', () => {
  const main = fs.readFileSync(path.join(appRoot, 'electron', 'init.js'), 'utf8');
  assert.match(main, /customPreset\.upgradeEngineHtml\(fs\.readFileSync\(page, 'utf8'\)\)/);
  assert.match(main, /presetLayer\.layerBaseNames\(usersPresetsDir\(\), bundledPresetRoots\(\)\[0\]\)/);
  assert.match(main, /presetLayer\.layerBaseFolder\(usersPresetsDir\(\), bundledPresetRoots\(\)\[0\], name\)/);
  // The popup and the designer build the same stylesheet, from the same reading of the base.
  assert.match(main, /presetLayer\.buildLayerCss\(layer, \{[^}]*markPseudo: layer\.markPseudo, textVar: layer\.textVar \}\)/);
  const designerJs = fs.readFileSync(path.join(appRoot, 'ui', 'presetDesigner.js'), 'utf8');
  assert.match(designerJs, /textVar: presetLayerTool\.titleInkVar\(base\.css\),/);
  assert.match(designerJs, /markPseudo: layerMode\.markPseudo, textVar: layerMode\.textVar,/);
});
