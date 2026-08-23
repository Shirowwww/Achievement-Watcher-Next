'use strict';

// The .awtheme package is the only path by which a theme from another machine reaches theme
// storage, so these cover the round trip and every way a package can be wrong or hostile.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const AdmZip = require(path.join(appRoot, 'node_modules', 'adm-zip'));
const { rawZip } = require(path.join(__dirname, '..', 'helpers', 'rawZip.js'));
const themePackage = require(path.join(appRoot, 'util', 'themePackage.js'));
const themeLayers = require(path.join(appRoot, 'util', 'themeLayers.js'));
const { THEME_PACKAGE_FORMAT, THEME_PACKAGE_FORMAT_VERSION, THEME_PACKAGE_EXTENSION, LIMITS } = themePackage;

const APP_VERSION = '3.9.2';

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-theme-pkg-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dirs = { root, source: path.join(root, 'source'), userData: path.join(root, 'userData'), out: path.join(root, 'out') };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

// A real PNG header, with a real IHDR, so the content check passes on its own terms.
function png(width = 800, height = 600, padding = 0) {
  const buffer = Buffer.alloc(64 + padding);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpeg(width = 400, height = 300) {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt16BE(0xffd8, 0);
  buffer.writeUInt16BE(0xffc0, 2);
  buffer.writeUInt16BE(11, 4);
  buffer[6] = 8;
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  return buffer;
}

// A theme with something in every part of the model, so a round trip has something to lose.
function fullTheme(imageFile) {
  const theme = themeLayers.defaultCustomTheme();
  theme.bg.color = '#101820';
  theme.bg.image = imageFile;
  theme.bg.fit = 'contain';
  theme.bg.effect = { enabled: true, type: 'blur', color: '#000000', opacity: 40, blur: 22, blurImage: 'C:/machine/only/blur.png' };
  theme.header.color = '#1b2733cc';
  theme.panel.gradient = { enabled: true, from: '#101820', to: '#000000', angle: 135 };
  theme.card.color = '#22303d';
  theme.settings.color = '#161f28';
  theme.text.color = '#e7edf6';
  theme.muted.color = '#94a5ba';
  theme.border.color = '#3e5065';
  theme.accent.color = '#ffb703';
  return theme;
}

function manifest(overrides = {}) {
  return JSON.stringify({
    format: THEME_PACKAGE_FORMAT,
    formatVersion: THEME_PACKAGE_FORMAT_VERSION,
    name: 'Shared Theme',
    description: 'A theme',
    version: '1.0.0',
    createdAt: '2026-08-22T00:00:00.000Z',
    app: { createdWith: APP_VERSION, minVersion: '' },
    assets: [],
    ...overrides,
  });
}

function minimalTheme() {
  const theme = {};
  for (const id of themeLayers.LAYER_IDS) {
    theme[id] = { color: '#123456', gradient: { enabled: false, from: '#123456', to: '#123456', angle: 180 } };
    if (themeLayers.IMAGE_LAYER_IDS.includes(id)) {
      theme[id].image = '';
      theme[id].fit = 'cover';
      theme[id].effect = { enabled: false, type: 'veil', color: '#000000', opacity: 40, blur: 8, blurImage: '' };
    }
  }
  return theme;
}

// Build a package by hand so a test can put anything at all inside it.
function writeZip(file, entries) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8'));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  zip.writeZip(file);
  return file;
}

// --- the round trip ---------------------------------------------------------------------------

test('a theme survives export, import and re-export unchanged', (t) => {
  const dirs = workspace(t);
  const image = path.join(dirs.source, 'my wallpaper.png');
  fs.writeFileSync(image, png(1920, 1080));

  const file = path.join(dirs.out, `theme${THEME_PACKAGE_EXTENSION}`);
  const exported = themePackage.exportTheme({
    theme: fullTheme(image),
    name: 'Midnight Rail',
    destination: file,
    meta: { author: 'Ada', description: 'Dark and gold', version: '2.1.0', tags: ['Dark', 'dark', 'gold'] },
    base: 'nord',
    appVersion: APP_VERSION,
  });
  assert.equal(exported.ok, true, exported.error);
  assert.equal(exported.assets, 1);

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, true, read.error);
  assert.equal(read.manifest.name, 'Midnight Rail');
  assert.equal(read.manifest.author, 'Ada');
  assert.equal(read.manifest.version, '2.1.0');
  assert.equal(read.manifest.base, 'nord');
  assert.deepEqual(read.manifest.tags, ['dark', 'gold'], 'tags are lower cased and de-duplicated');

  // The image is named after its layer and its real format, never after the file on this disk.
  assert.deepEqual(read.manifest.assets, ['bg.png']);
  assert.equal(read.theme.bg.image, 'bg.png');
  assert.equal(read.theme.bg.fit, 'contain');
  assert.equal(read.theme.bg.effect.blur, 22);
  assert.equal(read.theme.panel.gradient.angle, 135);
  assert.equal(read.theme.accent.color, '#ffb703');
  assert.equal(read.theme.header.color, '#1b2733cc', 'the alpha half of a colour survives');

  const install = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION });
  assert.equal(install.ok, true, install.error);
  assert.equal(install.name, 'Midnight Rail');

  // Installed, the image is an absolute path inside this install and the layer model is otherwise
  // identical, which is what makes an imported theme behave like the Custom theme.
  const installedImage = install.theme.bg.image;
  assert.ok(installedImage.startsWith(path.join(dirs.userData, 'theme-packs', 'Midnight Rail')));
  assert.ok(fs.existsSync(installedImage));
  assert.equal(install.theme.accent.color, '#ffb703');

  const again = path.join(dirs.out, `again${THEME_PACKAGE_EXTENSION}`);
  const reExported = themePackage.exportTheme({
    theme: install.theme,
    name: install.name,
    destination: again,
    meta: { author: install.manifest.author, description: install.manifest.description, version: install.manifest.version, tags: install.manifest.tags },
    base: install.manifest.base,
    appVersion: APP_VERSION,
  });
  assert.equal(reExported.ok, true, reExported.error);

  const back = themePackage.readThemePackage(again, { appVersion: APP_VERSION });
  assert.equal(back.ok, true, back.error);
  assert.deepEqual(back.theme, read.theme, 'the model is identical after a full round trip');
  assert.equal(back.manifest.author, 'Ada', 'credit survives being passed on');
  assert.equal(back.manifest.base, 'nord');
});

test('a theme with no images at all is a valid package', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, `plain${THEME_PACKAGE_EXTENSION}`);

  const out = themePackage.exportTheme({ theme: minimalTheme(), name: 'Plain', destination: file, appVersion: APP_VERSION });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.assets, 0);

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, true, read.error);
  assert.deepEqual(read.manifest.assets, []);
  assert.equal(read.theme.bg.image, '');
  assert.equal(read.theme.bg.color, '#123456');
});

test('an image-heavy theme carries one copy of a picture used by several layers', (t) => {
  const dirs = workspace(t);
  const shared = path.join(dirs.source, 'shared.png');
  const other = path.join(dirs.source, 'other.jpg');
  fs.writeFileSync(shared, png(1600, 900));
  fs.writeFileSync(other, jpeg(800, 600));

  const theme = themeLayers.defaultCustomTheme();
  for (const id of ['bg', 'header', 'panel']) theme[id].image = shared;
  theme.card.image = other;
  theme.settings.image = other;

  const file = path.join(dirs.out, `heavy${THEME_PACKAGE_EXTENSION}`);
  const out = themePackage.exportTheme({ theme, name: 'Heavy', destination: file, appVersion: APP_VERSION });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.assets, 2, 'one file per distinct picture, not one per layer');

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, true, read.error);
  assert.equal(read.theme.bg.image, read.theme.header.image);
  assert.equal(read.theme.card.image, read.theme.settings.image);
  assert.notEqual(read.theme.bg.image, read.theme.card.image);
  // The extension follows the real format, not the source name.
  assert.ok(read.theme.card.image.endsWith('.jpg'));
});

test('every built-in palette can be exported and read back', (t) => {
  const dirs = workspace(t);
  for (const name of Object.keys(themeLayers.BUILTIN_COLORS)) {
    const file = path.join(dirs.out, `${name}${THEME_PACKAGE_EXTENSION}`);
    const out = themePackage.exportTheme({
      theme: themePackage.themeFromBuiltin(name),
      name: `Built in ${name}`,
      destination: file,
      base: name,
      appVersion: APP_VERSION,
    });
    assert.equal(out.ok, true, `${name}: ${out.error}`);

    const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
    assert.equal(read.ok, true, `${name}: ${read.error}`);
    assert.equal(read.manifest.base, name);
    assert.equal(read.theme.accent.color, themeLayers.BUILTIN_COLORS[name].accent);
  }
});

// --- what never travels -----------------------------------------------------------------------

test('nothing about the exporting machine is written into the package', (t) => {
  const dirs = workspace(t);
  const image = path.join(dirs.source, 'C_Users_someone_Pictures_wallpaper.png');
  fs.writeFileSync(image, png());

  const file = path.join(dirs.out, `private${THEME_PACKAGE_EXTENSION}`);
  assert.equal(themePackage.exportTheme({ theme: fullTheme(image), name: 'Private', destination: file, appVersion: APP_VERSION }).ok, true);

  const raw = fs.readFileSync(file).toString('latin1');
  assert.ok(!raw.includes('C_Users_someone'), 'the source file name reached the package');
  assert.ok(!raw.includes(dirs.source.replace(/\\/g, '/')), 'a path from this machine reached the package');
  assert.ok(!raw.includes('machine/only/blur.png'), 'a generated blur path reached the package');

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.theme.bg.effect.blurImage, '', 'a generated copy is never packaged');
});

// --- refusals ------------------------------------------------------------------------------------

test('a package is refused unless it is really a theme package', (t) => {
  const dirs = workspace(t);
  const cases = {
    'not-a-zip': { file: () => fs.writeFileSync(path.join(dirs.out, 'x.awtheme'), 'plain text'), error: 'unreadable-package' },
    empty: { file: () => fs.writeFileSync(path.join(dirs.out, 'x.awtheme'), ''), error: 'unreadable-package' },
    'no manifest': { entries: { 'theme.json': JSON.stringify(minimalTheme()) }, error: 'missing-manifest' },
    'no theme': { entries: { 'manifest.json': manifest() }, error: 'missing-theme' },
    'another format': { entries: { 'manifest.json': manifest({ format: 'aw-preset' }), 'theme.json': JSON.stringify(minimalTheme()) }, error: 'not-a-theme-package' },
    'broken manifest': { entries: { 'manifest.json': '{ not json', 'theme.json': JSON.stringify(minimalTheme()) }, error: 'invalid-manifest' },
    'broken theme': { entries: { 'manifest.json': manifest(), 'theme.json': '{ not json' }, error: 'invalid-theme' },
    'theme is an array': { entries: { 'manifest.json': manifest(), 'theme.json': '[]' }, error: 'invalid-theme' },
    'no name': { entries: { 'manifest.json': manifest({ name: '   ' }), 'theme.json': JSON.stringify(minimalTheme()) }, error: 'invalid-name' },
    'a stray file': {
      entries: { 'manifest.json': manifest(), 'theme.json': JSON.stringify(minimalTheme()), 'notes.txt': 'hello' },
      error: 'unexpected-file',
    },
    'a stylesheet': {
      entries: { 'manifest.json': manifest(), 'theme.json': JSON.stringify(minimalTheme()), 'assets/evil.css': 'body{}' },
      error: 'unsafe-path',
    },
    'a script': {
      entries: { 'manifest.json': manifest(), 'theme.json': JSON.stringify(minimalTheme()), 'assets/evil.js': 'alert(1)' },
      error: 'unsafe-path',
    },
    'an html document': {
      entries: { 'manifest.json': manifest(), 'theme.json': JSON.stringify(minimalTheme()), 'assets/evil.html': '<script></script>' },
      error: 'unsafe-path',
    },
    'an svg': {
      entries: { 'manifest.json': manifest(), 'theme.json': JSON.stringify(minimalTheme()), 'assets/evil.svg': '<svg onload="x()"/>' },
      error: 'unsafe-path',
    },
  };

  for (const [what, spec] of Object.entries(cases)) {
    const file = path.join(dirs.out, `${what.replace(/\W+/g, '-')}.awtheme`);
    if (spec.file) spec.file();
    else writeZip(file, spec.entries);
    const read = themePackage.readThemePackage(spec.file ? path.join(dirs.out, 'x.awtheme') : file, { appVersion: APP_VERSION });
    assert.equal(read.ok, false, `${what} should be refused`);
    assert.equal(read.error, spec.error, `${what}: ${read.error}`);
  }
});

/*
  These use the raw writer rather than adm-zip: adm-zip normalises a name as it adds it, collapsing
  `..`, folding backslashes and replacing a repeated name, so an archive built with it can never
  carry the thing being tested for. A hostile one is not built with adm-zip either.
*/
test('no entry name can point outside the assets folder', (t) => {
  const dirs = workspace(t);
  const escapes = [
    '../escape.png',
    '../../escape.png',
    'assets/../../escape.png',
    'assets/sub/deep.png',
    'assets/C:/escape.png',
    'assets//escape.png',
    'assets/.hidden.png',
    // Names Windows refuses outright, or silently rewrites by trimming what it ends on.
    'assets/con.png',
    'assets/com1.png',
    'assets/nul.png',
    'assets/trailing.png ',
    'assets/trailing.png.',
    // A separator Windows honours and a POSIX path check does not.
    'assets\\..\\..\\escape.png',
    '..\\escape.png',
  ];

  for (const name of escapes) {
    const file = path.join(dirs.out, 'escape.awtheme');
    fs.writeFileSync(
      file,
      rawZip([
        { name: 'manifest.json', data: manifest() },
        { name: 'theme.json', data: JSON.stringify(minimalTheme()) },
        { name, data: png() },
      ])
    );
    const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
    assert.equal(read.ok, false, `"${name}" was accepted`);
    assert.ok(['unsafe-path', 'unexpected-file'].includes(read.error), `"${name}": ${read.error}`);
    assert.equal(fs.existsSync(path.join(dirs.out, 'escape.png')), false, `"${name}" wrote a file`);
  }
});

test('a name the reader refuses never reaches theme storage', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'traversal.awtheme');
  fs.writeFileSync(
    file,
    rawZip([
      { name: 'manifest.json', data: manifest() },
      { name: 'theme.json', data: JSON.stringify(minimalTheme()) },
      { name: 'assets/../../../evil.png', data: png() },
    ])
  );

  const install = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION });
  assert.equal(install.ok, false);
  assert.equal(install.error, 'unsafe-path');
  assert.equal(fs.existsSync(path.join(dirs.root, 'evil.png')), false);
  assert.equal(fs.existsSync(path.join(dirs.userData, 'evil.png')), false);
  assert.equal(fs.existsSync(path.join(dirs.userData, 'theme-packs')), false, 'nothing was created at all');
});

test('an asset is what its bytes say, not what its name claims', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'liar.awtheme');
  const theme = minimalTheme();
  theme.bg.image = 'bg.png';

  writeZip(file, {
    'manifest.json': manifest({ assets: ['bg.png'] }),
    'theme.json': JSON.stringify(theme),
    'assets/bg.png': '<html><script>alert(1)</script></html>',
  });

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, false);
  assert.equal(read.error, 'not-an-image');
});

test('an image too large to be worth decoding is refused before anything decodes it', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'huge.awtheme');
  const theme = minimalTheme();
  theme.bg.image = 'bg.png';

  writeZip(file, {
    'manifest.json': manifest({ assets: ['bg.png'] }),
    'theme.json': JSON.stringify(theme),
    // A header claiming a picture far past the pixel ceiling; the bytes themselves are tiny.
    'assets/bg.png': png(30000, 30000),
  });

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, false);
  assert.equal(read.error, 'image-too-large');
});

test('a layer pointing at an image the package does not carry is refused', (t) => {
  const dirs = workspace(t);
  const theme = minimalTheme();
  theme.bg.image = 'missing.png';

  const file = path.join(dirs.out, 'missing.awtheme');
  writeZip(file, { 'manifest.json': manifest(), 'theme.json': JSON.stringify(theme) });

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, false);
  assert.equal(read.error, 'missing-asset');
});

test('an image field that is a path rather than a name is refused', (t) => {
  const dirs = workspace(t);
  for (const value of ['../../etc/passwd', 'assets/bg.png', 'C:/Windows/win.ini', 'bg.png\u0000.txt']) {
    const theme = minimalTheme();
    theme.bg.image = value;
    const file = path.join(dirs.out, 'path.awtheme');
    writeZip(file, { 'manifest.json': manifest({ assets: ['bg.png'] }), 'theme.json': JSON.stringify(theme), 'assets/bg.png': png() });
    const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
    assert.equal(read.ok, false, `"${value}" was accepted`);
    assert.equal(read.error, 'missing-asset');
  }
});

test('a manifest naming an asset the package does not carry is refused', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'claimed.awtheme');
  writeZip(file, { 'manifest.json': manifest({ assets: ['bg.png'] }), 'theme.json': JSON.stringify(minimalTheme()) });

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, false);
  assert.equal(read.error, 'missing-asset');
});

test('an archive built to be unpacked rather than read is refused', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'bomb.awtheme');
  const theme = minimalTheme();
  theme.bg.image = 'bg.png';

  // Highly compressible bytes behind a real PNG header: small on disk, large unpacked.
  const bomb = Buffer.concat([png(400, 300), Buffer.alloc(8 * 1024 * 1024)]);
  writeZip(file, { 'manifest.json': manifest({ assets: ['bg.png'] }), 'theme.json': JSON.stringify(theme), 'assets/bg.png': bomb });

  const packed = fs.statSync(file).size;
  assert.ok(packed * LIMITS.expansion < bomb.length, 'the fixture must actually expand past the ratio');

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, false);
  assert.equal(read.error, 'package-too-large');
});

test('more entries or more images than the format carries are refused', (t) => {
  const dirs = workspace(t);

  const many = { 'manifest.json': manifest(), 'theme.json': JSON.stringify(minimalTheme()) };
  for (let i = 0; i < LIMITS.entries + 2; i += 1) many[`assets/img-${i}.png`] = png(10, 10);
  const tooMany = path.join(dirs.out, 'many.awtheme');
  writeZip(tooMany, many);
  assert.equal(themePackage.readThemePackage(tooMany, { appVersion: APP_VERSION }).error, 'too-many-files');

  const someImages = { 'manifest.json': manifest(), 'theme.json': JSON.stringify(minimalTheme()) };
  for (let i = 0; i < LIMITS.assets + 1; i += 1) someImages[`assets/img-${i}.png`] = png(10, 10);
  const tooManyImages = path.join(dirs.out, 'images.awtheme');
  writeZip(tooManyImages, someImages);
  assert.equal(themePackage.readThemePackage(tooManyImages, { appVersion: APP_VERSION }).error, 'too-many-files');
});

test('a duplicate entry name is refused rather than resolved', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'duplicate.awtheme');
  // Two entries under one name: which one a reader picks is its own business, and a package that
  // means two different things depending on who opens it is not a package worth opening.
  fs.writeFileSync(
    file,
    rawZip([
      { name: 'manifest.json', data: manifest({ assets: ['bg.png'] }) },
      { name: 'theme.json', data: JSON.stringify(minimalTheme()) },
      { name: 'assets/bg.png', data: png(400, 300) },
      { name: 'assets/bg.png', data: png(10, 10) },
    ])
  );

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, false);
  assert.equal(read.error, 'duplicate-entry');
});

test('an entry that lies about its size is measured on the bytes that come out', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'lying-size.awtheme');
  const theme = minimalTheme();
  theme.bg.image = 'bg.png';

  // The header claims a picture far past the per-file ceiling. It is refused on the claim alone,
  // before a single byte is read out of it.
  fs.writeFileSync(
    file,
    rawZip([
      { name: 'manifest.json', data: manifest({ assets: ['bg.png'] }) },
      { name: 'theme.json', data: JSON.stringify(theme) },
      { name: 'assets/bg.png', data: png(400, 300), declaredSize: LIMITS.fileBytes + 1 },
    ])
  );

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, false);
  assert.equal(read.error, 'asset-too-large');
});

// --- compatibility ---------------------------------------------------------------------------

test('a format from the future is refused, and one from the past is not', (t) => {
  const dirs = workspace(t);

  const future = path.join(dirs.out, 'future.awtheme');
  writeZip(future, {
    'manifest.json': manifest({ formatVersion: THEME_PACKAGE_FORMAT_VERSION + 1 }),
    'theme.json': JSON.stringify(minimalTheme()),
  });
  const ahead = themePackage.readThemePackage(future, { appVersion: APP_VERSION });
  assert.equal(ahead.ok, false);
  assert.equal(ahead.error, 'format-too-new');
  assert.equal(ahead.supported, THEME_PACKAGE_FORMAT_VERSION);

  for (const bad of [0, -1, 1.5, 'one', null]) {
    const file = path.join(dirs.out, 'bad-version.awtheme');
    writeZip(file, { 'manifest.json': manifest({ formatVersion: bad }), 'theme.json': JSON.stringify(minimalTheme()) });
    assert.equal(themePackage.readThemePackage(file, { appVersion: APP_VERSION }).error, 'invalid-manifest', `formatVersion ${bad}`);
  }
});

test('a theme that needs a newer app says which version, and is not installed', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'newer.awtheme');
  writeZip(file, {
    'manifest.json': manifest({ app: { createdWith: '9.9.9', minVersion: '9.9.9' } }),
    'theme.json': JSON.stringify(minimalTheme()),
  });

  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, false);
  assert.equal(read.error, 'app-too-old');
  assert.equal(read.requires, '9.9.9');

  const install = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION });
  assert.equal(install.ok, false);
  assert.equal(install.error, 'app-too-old');
  assert.equal(fs.existsSync(path.join(dirs.userData, 'theme-packs', 'Shared Theme')), false);

  // A floor this build satisfies is fine, and an unparsable app version only skips the floor.
  const okFloor = path.join(dirs.out, 'floor.awtheme');
  writeZip(okFloor, { 'manifest.json': manifest({ app: { createdWith: '3.0.0', minVersion: '3.0.0' } }), 'theme.json': JSON.stringify(minimalTheme()) });
  assert.equal(themePackage.readThemePackage(okFloor, { appVersion: APP_VERSION }).ok, true);
  assert.equal(themePackage.readThemePackage(file, { appVersion: 'not a version' }).ok, true, 'no known app version means no floor to check');

  const nonsense = path.join(dirs.out, 'nonsense-floor.awtheme');
  writeZip(nonsense, { 'manifest.json': manifest({ app: { createdWith: '', minVersion: 'tomorrow' } }), 'theme.json': JSON.stringify(minimalTheme()) });
  assert.equal(themePackage.readThemePackage(nonsense, { appVersion: APP_VERSION }).error, 'invalid-manifest');
});

test('a hand edited theme cannot widen a range the editor clamps', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'wide.awtheme');
  const theme = minimalTheme();
  theme.bg.color = 'javascript:alert(1)';
  theme.bg.fit = 'url(http://evil.invalid)';
  theme.bg.effect = { enabled: true, type: 'blur', color: 'expression(x)', opacity: 9000, blur: 9000, blurImage: 'C:/evil.png' };
  theme.accent.color = '#nothex';

  writeZip(file, { 'manifest.json': manifest(), 'theme.json': JSON.stringify(theme) });
  const read = themePackage.readThemePackage(file, { appVersion: APP_VERSION });
  assert.equal(read.ok, true, read.error);

  assert.equal(read.theme.bg.fit, 'cover', 'an unknown fit falls back');
  assert.equal(read.theme.bg.effect.blur, 40, 'the blur radius is clamped');
  assert.equal(read.theme.bg.effect.opacity, 100, 'the opacity is clamped');
  assert.equal(read.theme.bg.effect.blurImage, '', 'a generated path is dropped');
  assert.match(read.theme.bg.color, /^#[0-9a-f]{6}$/i, 'a colour is a colour');
  assert.match(read.theme.accent.color, /^#[0-9a-f]{6}$/i);

  // And the stylesheet built from it carries none of the strings that were tried.
  const css = themeLayers.buildCustomAppCss(read.theme);
  for (const attempt of ['javascript:', 'expression(', 'evil.invalid', 'C:/evil.png']) {
    assert.ok(!css.includes(attempt), `"${attempt}" reached the generated stylesheet`);
  }
});

// --- installing ----------------------------------------------------------------------------------

test('installing twice asks before it overwrites, and follows the answer', (t) => {
  const dirs = workspace(t);
  const image = path.join(dirs.source, 'bg.png');
  fs.writeFileSync(image, png());
  const file = path.join(dirs.out, 'twice.awtheme');
  assert.equal(themePackage.exportTheme({ theme: fullTheme(image), name: 'Twice', destination: file, appVersion: APP_VERSION }).ok, true);

  const first = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION });
  assert.equal(first.ok, true, first.error);

  const clash = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION });
  assert.equal(clash.ok, false);
  assert.equal(clash.error, 'duplicate');
  assert.equal(clash.name, 'Twice');

  const renamed = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION, duplicate: 'rename' });
  assert.equal(renamed.ok, true, renamed.error);
  assert.equal(renamed.name, 'Twice (2)');

  const replaced = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION, duplicate: 'replace' });
  assert.equal(replaced.ok, true, replaced.error);
  assert.equal(replaced.name, 'Twice');
  assert.equal(replaced.replaced, true);

  assert.deepEqual(
    themePackage.listInstalledThemes(dirs.userData).map((theme) => theme.name),
    ['Twice', 'Twice (2)']
  );

  const nonsense = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION, duplicate: 'whatever' });
  assert.equal(nonsense.error, 'invalid-duplicate-policy');
});

test('a name that already means something else in the picker is a clash, not a silent shadow', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'nord.awtheme');
  writeZip(file, { 'manifest.json': manifest({ name: 'Nord' }), 'theme.json': JSON.stringify(minimalTheme()) });

  const clash = themePackage.installThemePackage({
    file,
    userDataPath: dirs.userData,
    appVersion: APP_VERSION,
    takenNames: ['nord', 'default'],
  });
  assert.equal(clash.ok, false);
  assert.equal(clash.error, 'duplicate');
  assert.equal(clash.bundled, true);

  const beside = themePackage.installThemePackage({
    file,
    userDataPath: dirs.userData,
    appVersion: APP_VERSION,
    takenNames: ['nord'],
    duplicate: 'rename',
  });
  assert.equal(beside.ok, true, beside.error);
  assert.equal(beside.name, 'Nord (2)');

  const reserved = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION, reservedNames: ['Nord'] });
  assert.equal(reserved.error, 'reserved-name');
});

test('a failed install leaves the theme that was there exactly as it was', (t) => {
  const dirs = workspace(t);
  const good = path.join(dirs.out, 'good.awtheme');
  const theme = minimalTheme();
  theme.accent.color = '#00ff00';
  writeZip(good, { 'manifest.json': manifest({ name: 'Keep' }), 'theme.json': JSON.stringify(theme) });
  assert.equal(themePackage.installThemePackage({ good, file: good, userDataPath: dirs.userData, appVersion: APP_VERSION }).ok, true);

  const before = fs.readFileSync(path.join(dirs.userData, 'theme-packs', 'Keep', 'theme.json'), 'utf8');

  const broken = path.join(dirs.out, 'broken.awtheme');
  const brokenTheme = minimalTheme();
  brokenTheme.bg.image = 'nope.png';
  writeZip(broken, { 'manifest.json': manifest({ name: 'Keep' }), 'theme.json': JSON.stringify(brokenTheme) });

  const failed = themePackage.installThemePackage({ file: broken, userDataPath: dirs.userData, appVersion: APP_VERSION, duplicate: 'replace' });
  assert.equal(failed.ok, false);
  assert.equal(fs.readFileSync(path.join(dirs.userData, 'theme-packs', 'Keep', 'theme.json'), 'utf8'), before);

  // And nothing is left behind in the storage folder.
  assert.deepEqual(
    fs.readdirSync(path.join(dirs.userData, 'theme-packs')).filter((name) => name.startsWith('.')),
    []
  );
});

test('deleting an installed theme takes its images and its generated copies with it', (t) => {
  const dirs = workspace(t);
  const image = path.join(dirs.source, 'bg.png');
  fs.writeFileSync(image, png());
  const file = path.join(dirs.out, 'gone.awtheme');
  assert.equal(themePackage.exportTheme({ theme: fullTheme(image), name: 'Gone', destination: file, appVersion: APP_VERSION }).ok, true);
  assert.equal(themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION }).ok, true);

  const dir = path.join(dirs.userData, 'theme-packs', 'Gone');
  fs.mkdirSync(path.join(dir, 'derived'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'derived', 'bg-blur-22.png'), png());

  assert.equal(themePackage.deleteInstalledTheme(dirs.userData, 'Gone').ok, true);
  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual(themePackage.listInstalledThemes(dirs.userData), []);

  assert.equal(themePackage.deleteInstalledTheme(dirs.userData, 'Gone').error, 'not-installed');
  for (const nasty of ['../../etc', '', '..', 'C:/Windows', 'a/../../b']) {
    const out = themePackage.deleteInstalledTheme(dirs.userData, nasty);
    assert.equal(out.ok, false, `"${nasty}" was accepted`);
    assert.ok(['invalid-name', 'not-installed', 'outside-theme-storage'].includes(out.error), `"${nasty}": ${out.error}`);
  }
  assert.equal(fs.existsSync(dirs.userData), true, 'nothing outside theme storage was touched');
});

test('an installed theme describes itself with names, never with paths', (t) => {
  const dirs = workspace(t);
  const image = path.join(dirs.source, 'bg.png');
  fs.writeFileSync(image, png());
  const file = path.join(dirs.out, 'stored.awtheme');
  assert.equal(themePackage.exportTheme({ theme: fullTheme(image), name: 'Stored', destination: file, appVersion: APP_VERSION }).ok, true);
  assert.equal(themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION }).ok, true);

  const stored = JSON.parse(fs.readFileSync(path.join(dirs.userData, 'theme-packs', 'Stored', 'theme.json'), 'utf8'));
  assert.equal(stored.bg.image, 'bg.png', 'the stored model carries a name, so the folder can move');

  const installed = themePackage.readInstalledTheme(dirs.userData, 'Stored');
  assert.ok(path.isAbsolute(installed.theme.bg.image));
  assert.ok(fs.existsSync(installed.theme.bg.image));
  assert.equal(installed.manifest.name, 'Stored');

  // Saving a model with a path that is not inside this install drops it rather than storing it.
  const wandering = JSON.parse(JSON.stringify(installed.theme));
  wandering.bg.image = 'C:/somewhere/else.png';
  wandering.bg.effect.blurImage = 'C:/somewhere/else-blur.png';
  themePackage.saveInstalledTheme(dirs.userData, 'Stored', wandering);
  const after = JSON.parse(fs.readFileSync(path.join(dirs.userData, 'theme-packs', 'Stored', 'theme.json'), 'utf8'));
  assert.equal(after.bg.image, '');
  assert.equal(after.bg.effect.blurImage, '');
});

test('an imported theme is drawn by the same generator as the Custom theme', (t) => {
  const dirs = workspace(t);
  const file = path.join(dirs.out, 'payload.awtheme');
  const theme = minimalTheme();
  theme.accent.color = '#ff00aa';
  writeZip(file, { 'manifest.json': manifest({ name: 'Payload' }), 'theme.json': JSON.stringify(theme) });

  const install = themePackage.installThemePackage({ file, userDataPath: dirs.userData, appVersion: APP_VERSION });
  assert.equal(install.ok, true, install.error);

  const payload = themeLayers.themePayload(dirs.userData, 'pack:Payload', null, '', install.theme);
  assert.equal(payload.imported, true);
  assert.equal(payload.custom, false, 'an imported theme is not the Custom theme');
  assert.equal(payload.accent, '#ff00aa');
  assert.ok(payload.appCss.includes('#ff00aa'), 'the window stylesheet is built from the theme');
  assert.ok(payload.overlayCss.includes('#ff00aa'), 'so is the overlay stylesheet');
  assert.equal(payload.userCss, '', 'an imported theme never injects a stylesheet of its own');

  // Exactly what the Custom theme produces for the same model.
  const asCustom = themeLayers.themePayload(dirs.userData, 'custom', install.theme, '');
  assert.equal(payload.appCss, asCustom.appCss);
  assert.equal(payload.overlayCss, asCustom.overlayCss);
});

test('a theme value with no theme behind it falls back instead of leaving the window unpainted', (t) => {
  const dirs = workspace(t);
  const payload = themeLayers.themePayload(dirs.userData, 'pack:Deleted', null, '', null);
  assert.equal(payload.imported, false);
  assert.equal(payload.appCss, '', 'nothing is injected');
  assert.ok(payload.overlayCss.includes(themeLayers.BUILTIN_COLORS.default.accent), 'the overlay falls back to the built-in look');
});

test('exporting refuses an image the model points at but the disk does not have', (t) => {
  const dirs = workspace(t);
  const theme = themeLayers.defaultCustomTheme();
  theme.bg.image = path.join(dirs.source, 'not-there.png');

  const out = themePackage.exportTheme({ theme, name: 'Broken', destination: path.join(dirs.out, 'broken.awtheme'), appVersion: APP_VERSION });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'missing-asset');

  theme.bg.image = path.join(dirs.source, 'text.png');
  fs.writeFileSync(theme.bg.image, 'this is not an image');
  const notAnImage = themePackage.exportTheme({ theme, name: 'Broken', destination: path.join(dirs.out, 'broken.awtheme'), appVersion: APP_VERSION });
  assert.equal(notAnImage.error, 'not-an-image');
});

test('a name that is not a name is refused on the way out as well as on the way in', (t) => {
  const dirs = workspace(t);
  for (const bad of ['', '   ', '...', '<>:"/|?*']) {
    const out = themePackage.exportTheme({ theme: minimalTheme(), name: bad, destination: path.join(dirs.out, 'x.awtheme'), appVersion: APP_VERSION });
    assert.equal(out.ok, false, `"${bad}" was accepted`);
    assert.equal(out.error, 'invalid-name');
  }
  assert.equal(themePackage.sanitizeThemeName('  My Theme  '), 'My Theme');
  assert.equal(themePackage.sanitizeThemeName('a/b\\c:d'), 'abcd');
  assert.ok(themePackage.sanitizeThemeName('x'.repeat(200)).length <= LIMITS.nameLength);
});
