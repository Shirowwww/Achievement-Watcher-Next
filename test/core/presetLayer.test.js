'use strict';

// A layer is a bundled preset plus a handful of overrides. These cover what is stored, what is
// built from it, and which bundled presets it is allowed to sit on.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const layerTool = require(path.join(appRoot, 'util', 'presetLayer.js'));
const { mainProcessSource } = require('../helpers/mainProcessSource');

const BUNDLED = path.join(appRoot, 'presets', 'Default Presets');
const COMMUNITY = path.join(appRoot, 'presets', 'Users Presets');

test('only presets built on the shared engine can be a base', () => {
  const layerable = fs.readdirSync(BUNDLED).filter((name) => layerTool.isLayerableHtml(fs.readFileSync(path.join(BUNDLED, name, 'index.html'), 'utf8')));
  assert.deepEqual(layerable, fs.readdirSync(BUNDLED), 'a default preset left the shared engine');
  // The community presets draw their own markup, which no generic stylesheet can aim at.
  for (const name of fs.readdirSync(COMMUNITY)) {
    assert.equal(layerTool.isLayerableHtml(fs.readFileSync(path.join(COMMUNITY, name, 'index.html'), 'utf8')), false, `${name} cannot be layered`);
  }
  assert.equal(layerTool.isLayerableHtml(''), false);
  assert.equal(layerTool.isLayerableHtml(null), false);
});

test('a layer is read strictly: unknown sections and keys are dropped, values are clamped', () => {
  const layer = layerTool.normalizeLayer({
    base: '  AW Next ',
    sections: ['accent', 'logo', 'hostile', 'accent'],
    options: { accent: '#112233', bgMode: 'artwork', glow: 9999, logoImage: '../x.png', evil: 'x' },
  });
  assert.equal(layer.base, 'AW Next');
  assert.deepEqual(layer.sections, ['accent', 'logo']);
  assert.equal(layer.options.accent, '#112233');
  assert.equal(layer.options.bgMode, 'solid', 'a picture background cannot sit over somebody else\u2019s layout');
  assert.equal(layer.options.glow, 100);
  assert.equal(layer.options.logoImage, '');
  assert.equal('evil' in layer.options, false);
  assert.deepEqual(layerTool.normalizeLayer(null).sections, []);
});

test('what is stored is only the sections that were switched on', () => {
  const layer = { base: 'Glass', sections: ['border', 'font'], options: { borderWidth: 2, borderColor: '#abcdef', accent: '#ff0000', fontFamily: 'serif', fontFile: 'Face.ttf' } };
  const stored = layerTool.layerOptions(layerTool.normalizeLayer(layer));
  assert.deepEqual(Object.keys(stored).sort(), ['borderColor', 'borderWidth', 'fontFamily', 'fontFile']);
  assert.equal(stored.accent, undefined, 'a section that is off must not be written');
  assert.deepEqual(layerTool.layerAssets(layer), { fontFile: 'Face.ttf', logoImage: '' });
});

test('the stylesheet carries exactly the sections that are on', () => {
  assert.equal(layerTool.buildLayerCss({ base: 'x', sections: [], options: { accent: '#ff0000' } }), '');
  const only = layerTool.buildLayerCss({ base: 'x', sections: ['accent'], options: { accent: '#ff0000', bg: '#000000' } });
  assert.equal(only, '.ach { --accent: #ff0000; }');

  const every = layerTool.buildLayerCss({ base: 'x', sections: layerTool.LAYER_SECTION_NAMES, options: { logoImage: 'mark.png', fontFile: 'Face.otf', bgMode: 'gradient', bg: '#111111', bg2: '#222222', bgAngle: 90 } });
  assert.match(every, /@font-face \{ font-family: 'AW Layer Font'; src: url\('Face\.otf'\) format\('opentype'\)/);
  assert.match(every, /background: linear-gradient\(90deg, #111111 0%, #222222 100%\) !important;/);
  assert.match(every, /\.ach > \.aw-layer-logo \{[^}]*z-index: -1;[^}]*background: url\('mark\.png'\) no-repeat center \/ contain; \}/);
  assert.match(every, /border: 0px solid/);
  // A switched-on logo section with no picture draws nothing.
  assert.doesNotMatch(layerTool.buildLayerCss({ base: 'x', sections: ['logo'], options: {} }), /aw-layer-logo/);
  assert.equal(layerTool.layerHasLogo({ sections: ['logo'], options: { logoImage: 'a.png' } }), true);
  assert.equal(layerTool.layerHasLogo({ sections: ['accent'], options: { logoImage: 'a.png' } }), false);
});

test('the logo sits where the position says, and its files come from the layer folder', () => {
  const css = layerTool.buildLayerCss(
    { base: 'x', sections: ['logo'], options: { logoImage: 'a b.png', logoPosition: 'left', logoSize: 40, logoOffset: 9 } },
    { assetUrl: (name) => layerTool.layerAssetFileUrl(path.join(os.tmpdir(), 'layer one'), name) }
  );
  assert.match(css, /left: 9px; top: 50%; transform: translateY\(-50%\); height: 40px;/);
  assert.match(css, /url\('file:\/\/\/[^']*layer%20one\/a%20b\.png'\)/);
  assert.match(layerTool.buildLayerCss({ base: 'x', sections: ['logo'], options: { logoImage: 'a.png', logoPosition: 'top-right' } }), /top: 8px; right: 8px;|right: 8px; top: 8px;/);
});

test('a bundled stylesheet\u2019s relative urls are pointed at its folder and nothing else is touched', () => {
  const css = "a{background:url(bg.jpg)} b{src:url('SST Light.ttf')} c{x:url(\"logo.svg\")} d{y:url(data:image/png;base64,AAAA)} e{z:url(https://x/y.png)} f{w:url(#frag)} g{v:url(/abs.png)}";
  const out = layerTool.absolutizeCssUrls(css, 'file:///C:/app/presets/Steam');
  assert.match(out, /url\('file:\/\/\/C:\/app\/presets\/Steam\/bg\.jpg'\)/);
  assert.match(out, /url\('file:\/\/\/C:\/app\/presets\/Steam\/SST%20Light\.ttf'\)/);
  assert.match(out, /url\('file:\/\/\/C:\/app\/presets\/Steam\/logo\.svg'\)/);
  for (const untouched of ['url(data:image/png;base64,AAAA)', 'url(https://x/y.png)', 'url(#frag)', 'url(/abs.png)']) assert.ok(out.includes(untouched), untouched);
});

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-layer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const users = path.join(root, 'users');
  fs.mkdirSync(path.join(users, 'Mine'), { recursive: true });
  return { root, users };
}

test('a saved layer resolves to its bundled base, and to nothing for a base that is not there', (t) => {
  const { users } = workspace(t);
  const write = (name, content) => {
    fs.mkdirSync(path.join(users, name), { recursive: true });
    fs.writeFileSync(path.join(users, name, layerTool.LAYER_FILE), JSON.stringify(content));
  };
  write('Mine', { name: 'Mine', base: 'AW Next', sections: ['accent'], options: { accent: '#ff0000' } });
  const found = layerTool.readLayerFolder(users, BUNDLED, 'Mine');
  assert.equal(found.baseFolder, path.join(BUNDLED, 'AW Next'));
  assert.equal(found.layer.dir, path.join(users, 'Mine'));
  assert.deepEqual(found.layer.sections, ['accent']);

  // A layer cannot name a folder outside the bundled library, a community preset, or nothing.
  for (const base of ['../Users Presets/Onyx', '..\\x', 'Onyx', 'Does Not Exist', '']) {
    write('Bad', { base, sections: ['accent'], options: {} });
    assert.equal(layerTool.readLayerFolder(users, BUNDLED, 'Bad'), null, `base "${base}" was accepted`);
  }
  fs.writeFileSync(path.join(users, 'Bad', layerTool.LAYER_FILE), '{ not json');
  assert.throws(() => layerTool.readLayerFolder(users, BUNDLED, 'Bad'));
});

test('the main process lists, reads and writes layers only through the layer helpers', () => {
  const main = mainProcessSource();
  assert.match(main, /presetLayer\.readLayerFolder\(usersPresetsDir\(\), bundledPresetRoots\(\)\[0\], name\)/);
  assert.match(main, /notif\.webContents\.once\('dom-ready'/);
  assert.match(main, /insertCSS\(css\)/);
  assert.match(main, /executeJavaScript\(presetLayer\.LAYER_LOGO_SCRIPT\)/);
  assert.match(main, /ipcMain\.handle\('create-layered-preset'/);
  assert.match(main, /ipcMain\.handle\('preview-layered-preset'/);
  assert.match(main, /const PRESET_MARKERS = \[PRESET_OPTIONS_FILE, customPreset\.PRESET_PACKAGE_FILE, presetLayer\.LAYER_FILE\];/);
  // The bundled library is never written to: nothing in the layer path opens it for writing.
  assert.doesNotMatch(main, /writeFileSync\(path\.join\(bundledPresetRoots/);
  // A layer has no page of its own, so it cannot be packaged.
  const library = fs.readFileSync(path.join(appRoot, 'electron', 'presetLibrary.js'), 'utf8');
  assert.match(library, /layered-not-exportable/);
});
