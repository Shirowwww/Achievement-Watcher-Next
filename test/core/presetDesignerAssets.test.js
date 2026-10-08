'use strict';

// The two files a designed preset can carry beyond its stylesheet - a font and a logo - arrive from
// the user or from a stranger's package. These cover how they are vetted and how they reach the CSS.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const AdmZip = require(path.join(appRoot, 'node_modules', 'adm-zip'));
const schema = require(path.join(appRoot, 'util', 'presetSchema.js'));
const generator = require(path.join(appRoot, 'util', 'customPreset.js'));
const presetPackage = require(path.join(appRoot, 'util', 'presetPackage.js'));

const sfnt = (extra = 16) => Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(extra, 7)]);
const withTag = (tag, extra = 16) => Buffer.concat([Buffer.from(tag, 'latin1'), Buffer.alloc(extra, 7)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);

test('a font is accepted by what it starts with, not by what it is called', () => {
  assert.equal(schema.checkFont('a.ttf', sfnt()).kind, 'ttf');
  assert.equal(schema.checkFont('a.otf', withTag('OTTO')).kind, 'otf');
  assert.equal(schema.checkFont('a.woff', withTag('wOFF')).kind, 'woff');
  assert.equal(schema.checkFont('a.woff2', withTag('wOF2')).kind, 'woff2');
  // A TrueType-flavoured file is allowed under either sfnt extension.
  assert.equal(schema.checkFont('a.otf', sfnt()).ok, true);

  assert.equal(schema.checkFont('a.ttf', Buffer.from('MZ' + 'x'.repeat(40))).error, 'not-a-font', 'an executable named .ttf');
  assert.equal(schema.checkFont('a.ttf', Buffer.from('<svg xmlns=...>'.padEnd(40))).error, 'not-a-font');
  assert.equal(schema.checkFont('a.woff', withTag('wOF2')).error, 'not-a-font', 'a WOFF2 file named .woff');
  assert.equal(schema.checkFont('a.ttf', withTag('ttcf')).error, 'not-a-font', 'a collection holds several faces');
  assert.equal(schema.checkFont('a.ttf', Buffer.alloc(0)).error, 'empty-font');
});

test('a font over the size limit or with a path for a name is refused', () => {
  assert.equal(schema.checkFont('big.ttf', sfnt(schema.MAX_FONT_BYTES)).error, 'font-too-large');
  assert.equal(schema.checkFont('ok.ttf', sfnt(schema.MAX_FONT_BYTES - 8)).ok, true);
  for (const name of ['..\\evil.ttf', '../evil.ttf', 'C:\\x.ttf', 'a:b.ttf', "quote'.ttf", 'a.svg', 'a.ttf.exe', '.ttf', '']) {
    assert.equal(schema.checkFont(name, sfnt()).ok, false, `${name} was accepted as a font name`);
  }
});

test('a logo has to be a real raster picture of a sensible size', () => {
  assert.equal(schema.checkLogo('l.png', png()).kind, 'png');
  assert.equal(schema.checkLogo('l.jpg', withTag('\xff\xd8\xff\xe0')).kind, 'jpeg');
  assert.equal(schema.checkLogo('l.webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])).kind, 'webp');
  assert.equal(schema.checkLogo('l.png', sfnt()).error, 'not-an-image');
  assert.equal(schema.checkLogo('l.jpg', png()).error, 'not-an-image', 'a PNG named .jpg');
  assert.equal(schema.checkLogo('l.svg', png()).error, 'invalid-image-name', 'SVG can carry script');
  assert.equal(schema.checkLogo('big.png', Buffer.concat([png(), Buffer.alloc(schema.MAX_LOGO_BYTES)])).error, 'image-too-large');
});

test('the options carry only clean filenames for the font and the logo', () => {
  const values = schema.normalizeOptions({ fontFile: 'My Face.woff2', logoImage: 'mark.png', logoPosition: 'bottom-left', logoSize: 500, logoOffset: -3 });
  assert.equal(values.fontFile, 'My Face.woff2');
  assert.equal(values.logoImage, 'mark.png');
  assert.equal(values.logoPosition, 'bottom-left');
  assert.equal(values.logoSize, 120, 'the size is clamped');
  assert.equal(values.logoOffset, 0, 'the offset is clamped');
  for (const hostile of ['..\\x.ttf', 'a/b.ttf', "a'); x(.ttf", 'x.svg', 'x.exe', 5, null]) {
    assert.equal(schema.normalizeOptions({ fontFile: hostile }).fontFile, '', `fontFile accepted ${String(hostile)}`);
  }
  for (const hostile of ['x.svg', '../x.png', "a'b.png", 'x.ttf', {}]) {
    assert.equal(schema.normalizeOptions({ logoImage: hostile }).logoImage, '', `logoImage accepted ${String(hostile)}`);
  }
  assert.equal(schema.normalizeOptions({ logoPosition: 'middle' }).logoPosition, 'top-right');
});

test('a preset without a font or a logo produces the stylesheet it always did', () => {
  const css = generator.buildCustomPresetCss({});
  assert.doesNotMatch(css, /@font-face/);
  assert.doesNotMatch(css, new RegExp(generator.CUSTOM_FONT_FAMILY));
  assert.doesNotMatch(css, /\.ach::after/);
  assert.match(css, /--font: 'Segoe UI', system-ui, sans-serif;/);
});

test('the font is loaded by name and keeps the chosen stack behind it', () => {
  const css = generator.buildCustomPresetCss({ fontFile: 'Face.woff2', fontFamily: 'serif' });
  assert.match(css, /@font-face \{ font-family: 'AW Custom Font'; src: url\('Face\.woff2'\) format\('woff2'\); font-display: block; \}/);
  assert.match(css, /--font: 'AW Custom Font', Georgia, 'Times New Roman', serif;/);
  // The preview hands a data URI in instead of a filename.
  const preview = generator.buildCustomPresetCss({ fontFile: 'Face.ttf' }, { assetUrl: (name) => `data:font/ttf;base64,${name.length}` });
  assert.match(preview, /src: url\('data:font\/ttf;base64,8'\) format\('truetype'\)/);
});

test('the logo is a background layer of the card, placed where the designer said', () => {
  const css = generator.buildCustomPresetCss({ logoImage: 'mark.png', logoPosition: 'bottom-left', logoSize: 40, logoOffset: 10 });
  const rule = css.split('\n').find((line) => line.startsWith('.ach::after'));
  assert.ok(rule, 'no layer was written for the logo');
  assert.match(rule, /background-image: url\('mark\.png'\);/);
  assert.match(rule, /background-position: left 10px bottom 10px;/);
  assert.match(rule, /background-size: auto 40px;/);
  assert.match(rule, /background-repeat: no-repeat;/);
  // Text and the other layers must keep painting above/below it as before.
  assert.match(css, /\.ach > \* \{ position: relative; z-index: 1; \}/);

  const positions = {
    'top-left': 'left 8px top 8px',
    top: 'center top 8px',
    'top-right': 'right 8px top 8px',
    left: 'left 8px center',
    right: 'right 8px center',
    'bottom-left': 'left 8px bottom 8px',
    bottom: 'center bottom 8px',
    'bottom-right': 'right 8px bottom 8px',
  };
  for (const [position, expected] of Object.entries(positions)) {
    const line = generator.buildCustomPresetCss({ logoImage: 'm.png', logoPosition: position }).split('\n').find((l) => l.startsWith('.ach::after'));
    assert.match(line, new RegExp(`background-position: ${expected};`), position);
  }
});

test('the logo and a texture share the one layer without losing either', () => {
  const css = generator.buildCustomPresetCss({ logoImage: 'm.png', bgPattern: 'grid' });
  const rule = css.split('\n').find((line) => line.startsWith('.ach::after'));
  assert.match(rule, /background-image: url\('m\.png'\), linear-gradient\(var\(--pattern-ink\) 1px, transparent 1px\), linear-gradient\(90deg/);
  assert.match(rule, /background-repeat: no-repeat, repeat, repeat;/);
  assert.match(rule, /background-size: auto 32px, 22px 22px, 22px 22px;/);
  // Without the logo the texture is written exactly as before.
  const plain = generator.buildCustomPresetCss({ bgPattern: 'dots' }).split('\n').find((line) => line.startsWith('.ach::after'));
  assert.match(plain, /background-image: radial-gradient\(var\(--pattern-ink\) 1\.4px, transparent 1\.5px\); background-size: 14px 14px; \}$/);
});

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-designer-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dirs = { root, source: path.join(root, 'source'), presets: path.join(root, 'presets'), sounds: path.join(root, 'sounds'), out: path.join(root, 'out') };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

test('a preset keeps its font and logo through export and import', (t) => {
  const dirs = workspace(t);
  const options = { fontFile: 'Face.woff2', logoImage: 'mark.png', logoPosition: 'left', logoSize: 44 };
  fs.writeFileSync(path.join(dirs.source, 'index.html'), '<!DOCTYPE html><html><head><meta width="450" height="150" /></head><body></body></html>');
  fs.writeFileSync(path.join(dirs.source, 'style.css'), generator.buildCustomPresetCss(options));
  fs.writeFileSync(path.join(dirs.source, 'Face.woff2'), withTag('wOF2', 64));
  fs.writeFileSync(path.join(dirs.source, 'mark.png'), png());

  const file = path.join(dirs.out, 'Designed.awpreset');
  assert.equal(presetPackage.exportPreset({ presetDir: dirs.source, name: 'Designed', destination: file, options, appVersion: '3.12.0' }).ok, true);
  const installed = presetPackage.installPackage({ file, presetsDir: dirs.presets, soundsDir: dirs.sounds, appVersion: '3.12.0' });
  assert.equal(installed.ok, true, installed.error);

  const dir = path.join(dirs.presets, 'Designed');
  assert.deepEqual(fs.readFileSync(path.join(dir, 'Face.woff2')), withTag('wOF2', 64));
  assert.deepEqual(fs.readFileSync(path.join(dir, 'mark.png')), png());
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'aw-preset.json'), 'utf8'));
  assert.equal(stored.fontFile, 'Face.woff2');
  assert.equal(stored.logoImage, 'mark.png');
  assert.equal(stored.logoPosition, 'left');
  assert.equal(stored.logoSize, 44);
});

test('a package whose "font" is not a font is refused and leaves nothing behind', (t) => {
  const dirs = workspace(t);
  const zip = new AdmZip();
  zip.addFile(
    'manifest.json',
    Buffer.from(JSON.stringify({ format: presetPackage.PRESET_PACKAGE_FORMAT, formatVersion: presetPackage.PRESET_PACKAGE_FORMAT_VERSION, name: 'Sneaky' }))
  );
  zip.addFile('preset/index.html', Buffer.from('<html></html>'));
  zip.addFile('preset/Face.ttf', Buffer.from('MZ this is a program, not a font ......'));
  const file = path.join(dirs.out, 'Sneaky.awpreset');
  zip.writeZip(file);

  const res = presetPackage.installPackage({ file, presetsDir: dirs.presets, soundsDir: dirs.sounds, appVersion: '3.12.0' });
  assert.equal(res.ok, false);
  assert.match(res.error, /not-a-font/);
  assert.deepEqual(fs.readdirSync(dirs.presets), []);
});

test('the Settings page lets its preview frame load a font from a data URI', () => {
  const html = fs.readFileSync(path.join(appRoot, 'view', 'app.html'), 'utf8');
  const csp = /content="(default-src[^"]+)"/.exec(html)[1];
  assert.match(csp, /font-src 'self' data:;/, 'the font preview would be blocked by the page policy');
  assert.match(csp, /img-src [^;]*data:/);
});
