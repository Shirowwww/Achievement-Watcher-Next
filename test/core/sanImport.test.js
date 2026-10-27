'use strict';

/*
  Importing a Steam Achievement Notifier theme. A `.san` is untrusted data from an unknown machine,
  so most of this file is about what the importer refuses: reaching outside its package, writing
  anything that is not a picture, a font or a sound, or keeping a value in a shape the page could
  misread. The rest is the promise made to the user: the theme is kept whole, every state and every
  sound comes along, and the preset shares on as an .awpreset without losing any of it. The fixture
  uses invented colours, filenames and paths, nothing from SAN's own repository.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const AdmZip = require(path.join(appRoot, 'node_modules', 'adm-zip'));
const sanImport = require(path.join(appRoot, 'util', 'sanImport.js'));
const sanTheme = require(path.join(appRoot, 'util', 'sanTheme.js'));
const sanEngine = require(path.join(appRoot, 'util', 'sanEngine', 'index.js'));
const presetPackage = require(path.join(appRoot, 'util', 'presetPackage.js'));
const { PRESET_PACKAGE_FILE } = require(path.join(appRoot, 'util', 'customPreset.js'));

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'san', 'usertheme.json');
const theme = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

// Not real media: nothing here decodes a picture or plays a sound, only the leading bytes matter.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVEfmt ')]);
const TTF = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(12, 1)]);

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dirs = { root, presets: path.join(root, 'presets'), sounds: path.join(root, 'sounds'), out: path.join(root, 'out') };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

// A .san built by hand, so a test can put anything at all inside one.
function writeTheme(file, entries) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  zip.writeZip(file);
  return file;
}

function fixturePackage(dirs, { manifest = theme(), assets = {} } = {}) {
  return writeTheme(path.join(dirs.out, 'sample.san'), {
    'usertheme.json': JSON.stringify(manifest),
    'assets/backdrop.png': PNG,
    'assets/unlock-chime.wav': WAV,
    'assets/VT323-Regular.ttf': TTF,
    ...assets,
  });
}

const install = (dirs, file, extra = {}) =>
  sanImport.installSanTheme({ file, presetsDir: dirs.presets, soundsDir: dirs.sounds, appVersion: '3.9.2', sanImagesDir: '', ...extra });

const presetTheme = (dirs, name) => sanEngine.readEmbeddedTheme(fs.readFileSync(path.join(dirs.presets, name, 'index.html'), 'utf8'));
const presetManifest = (dirs, name) => JSON.parse(fs.readFileSync(path.join(dirs.presets, name, PRESET_PACKAGE_FILE), 'utf8'));

// ---- the format ---------------------------------------------------------------------------------

// Every property of SAN's `Customisation` (1.9.47), as its public settings write them.
const SAN_CUSTOMISATION_KEYS = [
  'soundmode', 'soundfile', 'sounddir', 'volume', 'preset', 'displaytime', 'scale', 'customtext', 'usegametitle',
  'bgstyle', 'gradientangle', 'bgimg', 'bgachicon', 'bgimgbrightness', 'brightness', 'blur', 'roundness', 'fontsize',
  'usecustomfontsizes', 'unlockmsgfontsize', 'titlefontsize', 'descfontsize', 'opacity', 'bgonly', 'glow', 'glowcolor',
  'glowsize', 'glowx', 'glowy', 'glowanim', 'glowspeed', 'glowrarity', 'glowcolorbronze', 'glowcolorsilver',
  'glowcolorgold', 'mask', 'maskimg', 'useoutline', 'outline', 'outlinecolor', 'outlinewidth', 'fontcolor',
  'usecustomfontcolors', 'unlockmsgfontcolor', 'titlefontcolor', 'descfontcolor', 'fontoutline', 'fontoutlinecolor',
  'fontoutlinescale', 'fontshadow', 'fontshadowcolor', 'fontshadowscale', 'fontshadowx', 'fontshadowy', 'iconroundness',
  'usegameicon', 'gameicontype', 'usecustomimgicon', 'customimgicon', 'customicons', 'showdecoration', 'pos',
  'usecustompos', 'custompos', 'animdir', 'ovpos', 'ovmatch', 'ovx', 'ovy', 'alldetails', 'primarycolor',
  'secondarycolor', 'tertiarycolor', 'gameart', 'shortcut', 'customfont', 'iconanim', 'showhiddenicon', 'replacelogo',
  'hiddenicon', 'previewhiddenicon', 'usepercent', 'elems', 'sselems', 'elemsmatch', 'hiddeniconpos', 'sshiddeniconpos',
  'decorationpos', 'ssdecorationpos', 'percentpos', 'sspercentpos', 'percentbadge', 'sspercentbadge', 'percentbadgepos',
  'sspercentbadgepos', 'percentbadgecolor', 'sspercentbadgecolor', 'percentbadgefontsize', 'sspercentbadgefontsize',
  'percentbadgefontcolor', 'sspercentbadgefontcolor', 'percentbadgeroundness', 'sspercentbadgeroundness',
  'percentbadgex', 'sspercentbadgex', 'percentbadgey', 'sspercentbadgey', 'percentbadgeimg', 'sspercentbadgeimg',
  'percentbadgeimgbronze', 'sspercentbadgeimgbronze', 'percentbadgeimgsilver', 'sspercentbadgeimgsilver',
  'percentbadgeimggold', 'sspercentbadgeimggold', 'synctheme', 'ssdisplay', 'ssenabled', 'iconscale',
  'iconshadowcolor', 'iconanimcolor', 'logoscale', 'decorationscale', 'showiconborder', 'iconborderimg',
  'iconborderpos', 'iconborderscale', 'iconborderx', 'iconbordery', 'iconborderrarity', 'iconborderimgbronze',
  'iconborderimgsilver', 'textvspace', 'usertheme', 'decorationshadow', 'usecustomtext', 'customtextunlockmsg',
  'usegametitleunlockmsg', 'customtexttitle', 'usegametitletitle', 'customtextdesc', 'usegametitledesc',
];

test('every property a SAN theme can carry is either kept with a type or known bookkeeping', () => {
  const unaccounted = SAN_CUSTOMISATION_KEYS.filter((key) => !sanTheme.SAN_FIELDS[key] && !sanTheme.SAN_INTERNAL.has(key));
  assert.deepEqual(unaccounted, []);
  // ...and nothing invented: a key SAN does not have would quietly rot the day SAN renamed one.
  const declared = new Set(SAN_CUSTOMISATION_KEYS);
  assert.deepEqual(Object.keys(sanTheme.SAN_FIELDS).filter((key) => !declared.has(key)), []);
  assert.deepEqual([...sanTheme.SAN_INTERNAL].filter((key) => !declared.has(key)), []);
});

test('the fixture keeps every value it set, in the type SAN wrote it', () => {
  const { customisation, report } = sanTheme.cleanCustomisation(theme().customisation, { resolveAsset: () => '' });
  assert.equal(customisation.preset, 'xqjan');
  assert.equal(customisation.glowcolor, '#ff2fa8');
  assert.equal(customisation.glowanim, 'double');
  assert.equal(customisation.iconshadowcolor, '#ffb84e99', 'an alpha channel is kept: the engine sets it as CSS');
  assert.equal(customisation.roundness, 48);
  assert.deepEqual(customisation.elems, ['unlockmsg', 'title', 'desc']);
  assert.deepEqual(customisation.custompos, { x: 0, y: 0 });
  // SAN's own bookkeeping does not travel.
  for (const key of ['usertheme', 'synctheme', 'shortcut', 'ovpos']) assert.equal(key in customisation, false, key);
  assert.deepEqual(report.unknown, []);
  // Every path the fixture names is missing from an empty package, and said so by its bare name.
  assert.ok(report.missing.some((entry) => entry.key === 'bgimg' && entry.name === 'backdrop.png'));
  assert.equal(customisation.bgimg, '');
});

test('a value that could say more than a colour, a number or a word is dropped', () => {
  const { customisation, report } = sanTheme.cleanCustomisation({
    primarycolor: 'red; } body { display: none } .x {',
    fontcolor: 'expression(alert(1))',
    outlinecolor: '</style><script>alert(1)</script>',
    glowcolor: 'url(https://example.com/x.png)',
    displaytime: 99999,
    roundness: -500,
    bgstyle: 'nonsense',
    preset: '../../evil',
    elems: ['title', '<img>', 'desc', 'extra'],
    customtextunlockmsg: 'line\u0000break\u001b',
    custompos: 'nope',
  });
  for (const key of ['primarycolor', 'fontcolor', 'outlinecolor', 'glowcolor', 'bgstyle', 'preset', 'custompos']) {
    assert.equal(key in customisation, false, `${key} was kept`);
    assert.ok(report.dropped.includes(key), `${key} was not reported`);
  }
  assert.equal(customisation.displaytime, 120);
  assert.equal(customisation.roundness, 0);
  assert.deepEqual(customisation.elems, ['title', null, 'desc'], 'an unknown line is an empty one, not markup');
  assert.equal(customisation.customtextunlockmsg, 'line break ');
});

test('a key from a newer SAN is kept when it is plain data, and reported', () => {
  const { customisation, report } = sanTheme.cleanCustomisation({ somethingnew: 42, anotherone: 'x', nested: { a: 1 }, __proto__: { polluted: true } });
  assert.equal(customisation.somethingnew, 42);
  assert.equal(customisation.anotherone, 'x');
  assert.equal('nested' in customisation, false);
  assert.deepEqual(report.unknown.sort(), ['anotherone', 'somethingnew']);
  assert.equal({}.polluted, undefined);
});

test('an SVG is only kept when it cannot do more than a picture', () => {
  const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
  assert.equal(sanTheme.isSafeSvg(svg('<rect width="1" height="1"/>')), true);
  for (const hostile of [
    '<script>alert(1)</script>',
    '<foreignObject><div/></foreignObject>',
    '<rect onload="alert(1)"/>',
    '<a href="javascript:alert(1)"/>',
    '<image href="https://example.com/x.png"/>',
    '<image xlink:href="//example.com/x.png"/>',
  ]) {
    assert.equal(sanTheme.isSafeSvg(svg(hostile)), false, hostile);
  }
  assert.equal(sanTheme.isSafeSvg(Buffer.from('<!DOCTYPE x [<!ENTITY a "b">]><svg/>')), false);
  assert.equal(sanTheme.isSafeSvg(Buffer.from('not an svg')), false);
});

// ---- reading a package ----------------------------------------------------------------------------

test('a theme is refused whole when the package is not one', (t) => {
  const dirs = workspace(t);
  const bad = {
    'not-a-zip': () => fs.writeFileSync(path.join(dirs.out, 'x.san'), 'this is not a zip'),
    'no-manifest': () => writeTheme(path.join(dirs.out, 'x.san'), { 'assets/backdrop.png': PNG }),
    'broken-json': () => writeTheme(path.join(dirs.out, 'x.san'), { 'usertheme.json': '{ not json' }),
    'no-customisation': () => writeTheme(path.join(dirs.out, 'x.san'), { 'usertheme.json': JSON.stringify({ label: 'x' }) }),
    'array-manifest': () => writeTheme(path.join(dirs.out, 'x.san'), { 'usertheme.json': '[]' }),
  };
  for (const [name, make] of Object.entries(bad)) {
    make();
    const read = sanImport.readSanTheme(path.join(dirs.out, 'x.san'));
    assert.equal(read.ok, false, `${name} was accepted`);
    assert.ok(['unreadable-theme', 'invalid-theme', 'missing-theme-manifest'].includes(read.error), `${name}: ${read.error}`);
  }
  assert.equal(sanImport.readSanTheme(path.join(dirs.out, 'nope.san')).ok, false);
});

test('nothing in a package may point outside it', (t) => {
  const dirs = workspace(t);
  // adm-zip cleans a name on the way in, so the hostile one is written back afterwards.
  const hostilePackage = (entryName) => {
    const zip = new AdmZip();
    zip.addFile('usertheme.json', Buffer.from(JSON.stringify(theme()), 'utf8'));
    zip.addFile('assets/placeholder.png', PNG);
    zip.getEntries()[1].entryName = entryName;
    const file = path.join(dirs.out, 'hostile.san');
    zip.writeZip(file);
    return file;
  };
  for (const hostile of ['../evil.png', 'assets/../../evil.png', '/etc/evil.png', 'C:/windows/evil.png', 'assets\\..\\..\\evil.png', 'assets/sub/./../../evil.png']) {
    const read = sanImport.readSanTheme(hostilePackage(hostile));
    assert.equal(read.ok, false, `${hostile} was accepted`);
    assert.equal(read.error, 'unsafe-path', `${hostile}: ${read.error}`);
    assert.equal(install(dirs, hostilePackage(hostile)).ok, false);
    assert.deepEqual(fs.readdirSync(dirs.presets), [], `${hostile} left something in the preset storage`);
  }
});

test('only pictures, fonts and sounds ever leave a package, and each is what it claims', (t) => {
  const dirs = workspace(t);
  const file = fixturePackage(dirs, {
    assets: {
      'assets/payload.exe': Buffer.from([0x4d, 0x5a, 0x90]),
      'assets/hook.js': 'require("fs")',
      'assets/page.html': '<script>alert(1)</script>',
      'readme.txt': 'hello',
    },
  });
  const read = sanImport.readSanTheme(file);
  assert.ok(read.ok);
  assert.deepEqual([...read.files.keys()].sort(), ['backdrop.png', 'unlock-chime.wav', 'vt323-regular.ttf']);
  assert.deepEqual(read.rejected.map((entry) => entry.name).sort(), ['assets/hook.js', 'assets/page.html', 'assets/payload.exe', 'readme.txt']);

  // A picture that scripts, or a "font" that is not one, is refused when the theme names it.
  const manifest = theme();
  manifest.customisation.hiddenicon = 'C:/x/lock.svg';
  manifest.customisation.customfont = 'C:/x/fake.ttf';
  const out = install(dirs, fixturePackage(dirs, { manifest, assets: { 'assets/lock.svg': '<svg onload="alert(1)"></svg>', 'assets/fake.ttf': 'MZ not a font at all' } }));
  assert.ok(out.ok, out.error);
  const refused = out.report.assets.filter((entry) => entry.code === 'asset-rejected').map((entry) => entry.name).sort();
  assert.deepEqual(refused, ['fake.ttf', 'lock.svg']);
  const assets = fs.readdirSync(path.join(dirs.presets, out.name, 'assets')).sort();
  assert.deepEqual(assets, ['backdrop.png']);
  assert.equal(presetTheme(dirs, out.name).types.main.hiddenicon, '');
});

test('an oversized or duplicated entry is refused before anything is written', (t) => {
  const dirs = workspace(t);
  const huge = Buffer.alloc(sanImport.SAN_LIMITS.fileBytes + 1024, 7);
  assert.equal(sanImport.readSanTheme(fixturePackage(dirs, { assets: { 'assets/huge.png': huge } })).error, 'asset-too-large');

  const zip = new AdmZip();
  zip.addFile('usertheme.json', Buffer.from(JSON.stringify(theme()), 'utf8'));
  zip.addFile('assets/backdrop.png', PNG);
  zip.getEntries()[1].entryName = 'usertheme.json';
  const twice = path.join(dirs.out, 'twice.san');
  zip.writeZip(twice);
  assert.equal(sanImport.readSanTheme(twice).error, 'duplicate-entry');
  assert.deepEqual(fs.readdirSync(dirs.presets), []);
});

test('an absolute path in a .san is read as a name, never as a path', (t) => {
  const dirs = workspace(t);
  // The picture is not in the package, but the path points at a real file: reading it is the bug.
  const outside = path.join(dirs.root, 'secret.png');
  fs.writeFileSync(outside, PNG);
  const manifest = theme();
  manifest.customisation.bgimg = outside;
  const out = install(dirs, writeTheme(path.join(dirs.out, 'x.san'), { 'usertheme.json': JSON.stringify(manifest) }));
  assert.ok(out.ok, out.error);
  assert.equal(presetTheme(dirs, out.name).types.main.bgimg, '');
  assert.ok(out.report.missing.some((entry) => entry.name === 'secret.png'));
  assert.equal(fs.existsSync(path.join(dirs.presets, out.name, 'assets', 'secret.png')), false);
});

// ---- installing ---------------------------------------------------------------------------------

test('an imported theme is kept whole and drawn by the SAN engine', (t) => {
  const dirs = workspace(t);
  const out = install(dirs, fixturePackage(dirs));
  assert.ok(out.ok, out.error);
  assert.equal(out.name, 'Sample Neon');
  const dir = path.join(dirs.presets, out.name);

  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.equal(sanEngine.engineVersionOf(html), sanEngine.ENGINE_VERSION);
  // (353 + 2 x 25) x 1.25 by (58 + 2 x 25) x 1.25: the card it was built on, with SAN's room for its glow.
  assert.match(html, /<meta width="504" height="135" \/>/, 'the window is the card the theme was built on and its glow, at its own 125%');
  assert.ok(fs.existsSync(path.join(dir, 'layout-xqjan.css')));

  // The theme, not a translation of it: the values SAN wrote, with every file now a preset asset.
  const kept = presetTheme(dirs, out.name);
  const main = kept.types.main;
  assert.equal(main.preset, 'xqjan');
  assert.equal(main.glowcolorgold, '#ffcf4d');
  assert.equal(main.bgimg, 'assets/backdrop.png');
  assert.equal(main.customfont, 'assets/VT323-Regular.ttf');
  assert.ok(fs.readFileSync(path.join(dir, 'assets', 'backdrop.png')).equals(PNG));
  assert.deepEqual(kept.thresholds, { rarity: 10, semirarity: 25 });
  assert.equal(out.report.kept > 100, true, 'a real theme keeps well over a hundred settings');
  assert.equal(out.report.notifyType, 'main', 'SAN stamps the notification type into the folder name');
  assert.equal(out.report.sanVersion, '2.4.1');
});

test('the manifest says where the preset came from and what each state plays', (t) => {
  const dirs = workspace(t);
  const out = install(dirs, fixturePackage(dirs));
  const manifest = presetManifest(dirs, out.name);
  assert.equal(manifest.origin.app, sanImport.SAN_ORIGIN_APP);
  assert.equal(manifest.origin.format, sanImport.SAN_ORIGIN_FORMAT);
  assert.equal(manifest.origin.version, '2.4.1');
  assert.ok(manifest.tags.includes('san'));
  assert.equal(manifest.sound, 'unlock-chime.wav');
  assert.deepEqual(manifest.sanSounds, { main: { mode: 'file', files: ['unlock-chime.wav'] } });
  assert.ok(fs.readFileSync(path.join(dirs.sounds, 'unlock-chime.wav')).equals(WAV));
});

test('a SAN preset shares on as an .awpreset with every sound and the theme intact', (t) => {
  const dirs = workspace(t);
  const manifestIn = theme();
  manifestIn.customisation.soundmode = 'folder';
  manifestIn.customisation.sounddir = 'C:/Users/Sample/Music/Trophies';
  const file = writeTheme(path.join(dirs.out, 'folder.san'), {
    'usertheme.json': JSON.stringify(manifestIn),
    'assets/backdrop.png': PNG,
    'assets/Trophies/one.wav': WAV,
    'assets/Trophies/two.wav': Buffer.concat([WAV, Buffer.from([2])]),
  });
  const out = install(dirs, file);
  assert.ok(out.ok, out.error);
  const dir = path.join(dirs.presets, out.name);
  const manifest = presetManifest(dirs, out.name);
  assert.deepEqual(manifest.sanSounds.main, { mode: 'folder', files: ['one.wav', 'two.wav'] });
  assert.equal(manifest.sound, '', 'a random pick has no single sound to name');

  // What the export handler does: the manifest's own fields, and every state's sounds.
  const shipped = path.join(dirs.out, 'shared.awpreset');
  const extraSounds = manifest.sanSounds.main.files.map((name) => ({ name, file: path.join(dirs.sounds, name) }));
  const exported = presetPackage.exportPreset({
    presetDir: dir,
    name: out.name,
    destination: shipped,
    meta: { origin: manifest.origin, sanSounds: manifest.sanSounds, sanThresholds: manifest.sanThresholds, tags: manifest.tags },
    extraSounds,
    appVersion: '3.9.2',
  });
  assert.ok(exported.ok, exported.error);

  // Somewhere else, where one of the two sound names is already something different.
  const other = workspace(t);
  fs.writeFileSync(path.join(other.sounds, 'one.wav'), Buffer.from('RIFF____WAVEmine'));
  const installed = presetPackage.installPackage({ file: shipped, presetsDir: other.presets, soundsDir: other.sounds, appVersion: '3.9.2' });
  assert.ok(installed.ok, installed.error);
  const arrived = JSON.parse(fs.readFileSync(path.join(other.presets, installed.name, PRESET_PACKAGE_FILE), 'utf8'));
  assert.deepEqual(arrived.origin, manifest.origin);
  assert.deepEqual(arrived.sanSounds.main.files, ['one (2).wav', 'two.wav'], 'each state follows the name its sound was installed as');
  assert.deepEqual(arrived.sanThresholds, { rarity: 10, semirarity: 25 });
  assert.ok(fs.readFileSync(path.join(other.sounds, 'two.wav')).equals(fs.readFileSync(path.join(dirs.sounds, 'two.wav'))));

  // ...and it is the same theme, drawn by the same engine.
  const otherDir = path.join(other.presets, installed.name);
  assert.deepEqual(sanEngine.readEmbeddedTheme(fs.readFileSync(path.join(otherDir, 'index.html'), 'utf8')), presetTheme(dirs, out.name));
  assert.ok(sanEngine.isSanPreset(otherDir));
  assert.ok(fs.existsSync(path.join(otherDir, 'assets', 'backdrop.png')));
});

test('a name already taken is asked about, never silently overwritten', (t) => {
  const dirs = workspace(t);
  const file = fixturePackage(dirs);
  assert.ok(install(dirs, file).ok);

  const clash = install(dirs, file);
  assert.equal(clash.ok, false);
  assert.equal(clash.error, 'duplicate');
  assert.equal(clash.name, 'Sample Neon');

  const kept = install(dirs, file, { duplicate: 'rename' });
  assert.equal(kept.name, 'Sample Neon (2)');
  const replaced = install(dirs, file, { duplicate: 'replace' });
  assert.equal(replaced.name, 'Sample Neon');
  assert.equal(replaced.replaced, true);

  const bundled = install(dirs, fixturePackage(dirs, { manifest: { ...theme(), label: 'AW Next' } }), { takenNames: ['AW Next'] });
  assert.equal(bundled.error, 'duplicate');
  assert.equal(bundled.bundled, true);
  const reserved = install(dirs, fixturePackage(dirs, { manifest: { ...theme(), label: '__aw-preview__' } }), { reservedNames: ['__aw-preview__'] });
  assert.equal(reserved.error, 'reserved-name');
});

test('a theme with no usable name still installs under one, inside the preset storage', (t) => {
  const dirs = workspace(t);
  const manifest = theme();
  manifest.label = '../../<evil>';
  const out = install(dirs, fixturePackage(dirs, { manifest }));
  assert.ok(out.ok, out.error);
  assert.equal(path.dirname(path.resolve(path.join(dirs.presets, out.name))), path.resolve(dirs.presets));
  assert.match(out.name, /^[^\\/:*?"<>|]+$/);
});

test('a sound of the same name never overwrites one the user already has', (t) => {
  const dirs = workspace(t);
  const mine = Buffer.from('RIFF____WAVEmine');
  fs.writeFileSync(path.join(dirs.sounds, 'unlock-chime.wav'), mine);
  const out = install(dirs, fixturePackage(dirs));
  assert.ok(out.ok, out.error);
  assert.ok(fs.readFileSync(path.join(dirs.sounds, 'unlock-chime.wav')).equals(mine));
  assert.deepEqual(presetManifest(dirs, out.name).sanSounds.main.files, ['unlock-chime (2).wav']);
});

test('the theme SAN already unpacked can be imported from its own folder, and nothing beside it', (t) => {
  const dirs = workspace(t);
  const themeDir = path.join(dirs.root, 'Sample Neon_rare');
  fs.mkdirSync(path.join(themeDir, 'assets'), { recursive: true });
  const manifest = theme();
  manifest.userthemedir = 'Sample Neon_rare';
  manifest.customisation.bgimg = path.join(themeDir, 'assets', 'backdrop.png').replace(/\\/g, '/');
  fs.writeFileSync(path.join(themeDir, 'usertheme.json'), JSON.stringify(manifest), 'utf8');
  fs.writeFileSync(path.join(themeDir, 'assets', 'backdrop.png'), PNG);
  fs.writeFileSync(path.join(themeDir, 'assets', 'notes.txt'), 'hello');
  fs.writeFileSync(path.join(dirs.root, 'secret.png'), Buffer.from('secret'));

  const out = install(dirs, path.join(themeDir, 'usertheme.json'));
  assert.ok(out.ok, out.error);
  assert.equal(out.report.notifyType, 'rare');
  assert.deepEqual(fs.readdirSync(path.join(dirs.presets, out.name, 'assets')), ['backdrop.png']);
});

test('a refused theme leaves the preset storage and the sounds exactly as they were', (t) => {
  const dirs = workspace(t);
  assert.ok(install(dirs, fixturePackage(dirs)).ok);
  const listing = () => fs.readdirSync(dirs.presets).sort();
  const settled = listing();
  const soundsBefore = fs.readdirSync(dirs.sounds).sort();
  fs.writeFileSync(path.join(dirs.out, 'broken.san'), 'not a zip at all');
  for (const file of [path.join(dirs.out, 'broken.san'), path.join(dirs.out, 'absent.san')]) {
    assert.equal(install(dirs, file, { duplicate: 'replace' }).ok, false);
    assert.deepEqual(listing(), settled);
    assert.deepEqual(fs.readdirSync(dirs.sounds).sort(), soundsBefore);
  }
  assert.equal(listing().some((name) => name.startsWith('.awsan-')), false);
});

// ---- SAN's own settings -------------------------------------------------------------------------

// A SAN settings file as it sits on disk: the theme in use per type, each with its saved themes.
function sanSettings(dirs, { rarity = 5, semirarity = 30 } = {}) {
  const media = path.join(dirs.root, 'media');
  fs.mkdirSync(path.join(media, 'rare-sounds'), { recursive: true });
  fs.writeFileSync(path.join(media, 'main.wav'), WAV);
  fs.writeFileSync(path.join(media, 'wall.png'), PNG);
  fs.writeFileSync(path.join(media, 'rare-sounds', 'a.wav'), Buffer.concat([WAV, Buffer.from([1])]));
  fs.writeFileSync(path.join(media, 'rare-sounds', 'b.wav'), Buffer.concat([WAV, Buffer.from([2])]));
  fs.writeFileSync(path.join(media, 'notes.txt'), 'not a theme file');
  const base = theme().customisation;
  const one = (overrides) => ({ ...base, soundfile: '', bgimg: '', customfont: '', maskimg: '', iconborderimg: '', ...overrides });
  const main = one({ preset: 'xqjan', soundfile: path.join(media, 'main.wav'), bgimg: path.join(media, 'wall.png') });
  const config = {
    version: '1.9.47',
    rarity,
    semirarity,
    showpercent: 'all',
    notify1line: true,
    customisation: {
      main: {
        ...main,
        usertheme: [
          { label: 'Default Main', enabled: false, customisation: one({}) },
          { label: 'Neon', enabled: true, customisation: main },
          { label: 'Second', enabled: false, customisation: one({ preset: 'ps5', bgimg: path.join(media, 'notes.txt') }) },
        ],
      },
      semi: one({ preset: 'xqjan', glowcolor: '#00ff00' }),
      rare: one({ preset: 'ps5', soundmode: 'folder', sounddir: path.join(media, 'rare-sounds') }),
      plat: one({ preset: 'xbox360' }),
    },
  };
  const file = path.join(dirs.root, 'config.json');
  fs.writeFileSync(file, JSON.stringify(config), 'utf8');
  return file;
}

const installSetup = (dirs, configFile, extra = {}) =>
  sanImport.installSanSetup({ configFile, presetsDir: dirs.presets, soundsDir: dirs.sounds, appVersion: '3.9.2', ...extra });

test('SAN settings are found under the newest version folder', (t) => {
  const dirs = workspace(t);
  for (const version of ['1.9', '1.10', '1.8.5']) {
    const dir = path.join(dirs.root, `Steam Achievement Notifier (V${version})`);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'config.json'), '{}');
  }
  fs.mkdirSync(path.join(dirs.root, 'Steam Achievement Notifier (V2.0)'));
  const found = sanImport.findSanConfig({ platform: 'win32', env: { LOCALAPPDATA: dirs.root } });
  assert.equal(found, path.join(dirs.root, 'Steam Achievement Notifier (V1.10)', 'config.json'), 'a folder without settings is skipped');

  const home = path.join(dirs.root, 'home');
  fs.mkdirSync(path.join(home, '.local', 'share', 'Steam Achievement Notifier (V1.9)'), { recursive: true });
  fs.writeFileSync(path.join(home, '.local', 'share', 'Steam Achievement Notifier (V1.9)', 'config.json'), '{}');
  assert.match(sanImport.findSanConfig({ platform: 'linux', env: {}, home }), /V1\.9/);
  assert.equal(sanImport.findSanConfig({ platform: 'win32', env: {} }), '');
});

test('the four themes in use become one preset that switches like SAN, plus one per saved theme', (t) => {
  const dirs = workspace(t);
  const out = installSetup(dirs, sanSettings(dirs));
  assert.ok(out.ok, out.error);
  assert.deepEqual(out.installed.map((one) => one.name), ['SAN - Neon', 'Second'], 'an untouched default and the theme in use are not repeated');

  const setup = presetTheme(dirs, 'SAN - Neon');
  assert.deepEqual(Object.keys(setup.types), ['main', 'semi', 'rare', 'plat']);
  assert.equal(setup.types.semi.glowcolor, '#00ff00');
  assert.deepEqual(setup.thresholds, { rarity: 5, semirarity: 30 });
  assert.equal(setup.showpercent, 'all');
  assert.equal(setup.notify1line, true);
  const html = fs.readFileSync(path.join(dirs.presets, 'SAN - Neon', 'index.html'), 'utf8');
  assert.match(html, /<meta width="504" height="135" \/>/, 'the window holds the largest card of the four and its glow, at 125%');
  for (const card of ['xqjan', 'ps5', 'xbox360']) assert.ok(fs.existsSync(path.join(dirs.presets, 'SAN - Neon', `layout-${card}.css`)), card);

  // Each state plays what it played in SAN; the rare one picks from its folder.
  const manifest = presetManifest(dirs, 'SAN - Neon');
  assert.deepEqual(manifest.sanSounds.main, { mode: 'file', files: ['main.wav'] });
  assert.deepEqual(manifest.sanSounds.rare, { mode: 'folder', files: ['a.wav', 'b.wav'] });
  assert.deepEqual(manifest.sanSounds.semi, { mode: 'file', files: [] });
  assert.deepEqual(manifest.sanThresholds, { rarity: 5, semirarity: 30 });

  // A file the settings name that is not a picture is not read, even on this machine.
  assert.equal(presetTheme(dirs, 'Second').types.main.bgimg, '');
});

test('importing SAN settings again refreshes its presets and never touches the user own', (t) => {
  const dirs = workspace(t);
  const config = sanSettings(dirs);
  // A preset of the user's that happens to share a saved theme's name.
  fs.mkdirSync(path.join(dirs.presets, 'Second'));
  fs.writeFileSync(path.join(dirs.presets, 'Second', 'index.html'), '<html>mine</html>');

  const first = installSetup(dirs, config);
  assert.deepEqual(first.installed.map((one) => one.name), ['SAN - Neon', 'Second (2)']);
  const again = installSetup(dirs, config);
  assert.deepEqual(again.installed.map((one) => one.name), ['SAN - Neon', 'Second (2)'], 'a second run replaces, it does not pile up copies');
  assert.equal(fs.readFileSync(path.join(dirs.presets, 'Second', 'index.html'), 'utf8'), '<html>mine</html>');
  assert.deepEqual(fs.readdirSync(dirs.presets).sort(), ['SAN - Neon', 'Second', 'Second (2)']);
});

test('settings that are not SAN settings are refused', (t) => {
  const dirs = workspace(t);
  for (const content of ['not json', '{}', JSON.stringify({ customisation: [] }), JSON.stringify({ customisation: { other: {} } })]) {
    const file = path.join(dirs.root, 'config.json');
    fs.writeFileSync(file, content);
    const out = installSetup(dirs, file);
    assert.equal(out.ok, false, content);
  }
  assert.deepEqual(fs.readdirSync(dirs.presets), []);
});

// ---- the sound a notification plays ---------------------------------------------------------------

test('each SAN state plays its own sound, by the theme cut-offs', (t) => {
  const dirs = workspace(t);
  const dir = path.join(dirs.presets, 'p');
  fs.mkdirSync(dir);
  fs.writeFileSync(
    path.join(dir, PRESET_PACKAGE_FILE),
    JSON.stringify({
      sanSounds: { main: { mode: 'file', files: ['a.wav'] }, rare: { mode: 'folder', files: ['b.wav', 'c.wav'] }, plat: { mode: 'file', files: [] } },
      sanThresholds: { rarity: 5, semirarity: 30 },
    })
  );
  const pick = (opts) => sanEngine.presetSound(dir, { random: () => 0.99, ...opts });
  assert.equal(pick({ unlockRate: 50 }), 'a.wav');
  assert.equal(pick({ unlockRate: 4 }), 'c.wav');
  assert.equal(pick({ unlockRate: 4, random: () => 0 }), 'b.wav');
  assert.equal(pick({ unlockRate: 20 }), 'a.wav', 'a state with no sounds of its own falls back to the main one');
  assert.equal(pick({ unlockRate: null }), 'a.wav', 'an unknown rate is an ordinary unlock');
  assert.equal(pick({ notificationType: 'platinum', unlockRate: 4 }), '', 'a state SAN left silent stays silent');
  // AW Next's own tier wins over the theme's cut-offs, so the sound matches the card painted.
  assert.equal(pick({ rarityTier: 'gold', rarityMode: 'trophy', unlockRate: 50 }), 'c.wav');
  assert.equal(pick({ rarityTier: '', rarityMode: 'rare', unlockRate: 4 }), 'a.wav');

  fs.writeFileSync(path.join(dir, PRESET_PACKAGE_FILE), JSON.stringify({ sound: 'x.wav' }));
  assert.equal(sanEngine.presetSound(dir, {}), null, 'an ordinary preset is left to the ordinary rules');
  assert.equal(sanEngine.presetSound(path.join(dirs.root, 'absent'), {}), null);
});

test('an antivirus holding a fresh theme file for a moment does not fail the import', (t) => {
  const dirs = workspace(t);
  const rename = fs.renameSync;
  let refused = 0;
  // Windows refuses to rename a folder while a scanner still has a file inside it open.
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (String(from).includes('.awsan-') && refused < 2) {
      refused += 1;
      throw Object.assign(new Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`), { code: 'EPERM' });
    }
    return rename(from, to);
  });
  const out = install(dirs, fixturePackage(dirs));
  assert.equal(out.ok, true, out.error);
  assert.equal(refused, 2);
  assert.ok(fs.existsSync(path.join(dirs.presets, out.name, 'index.html')));
});

test('a rename that stays refused still fails the import cleanly', (t) => {
  const dirs = workspace(t);
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (String(from).includes('.awsan-')) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    return rename(from, to);
  });
  const out = install(dirs, fixturePackage(dirs));
  assert.equal(out.ok, false);
  assert.match(out.error, /EPERM/);
  assert.deepEqual(fs.readdirSync(dirs.presets), [], 'no staging folder is left behind');
});

test('a picture SAN ships itself and a .san leaves out comes from the SAN install', (t) => {
  const dirs = workspace(t);
  const sanImages = path.join(dirs.root, 'san-img');
  fs.mkdirSync(sanImages);
  fs.writeFileSync(path.join(sanImages, 'saniconborder.png'), PNG);
  const file = fixturePackage(dirs);
  const missingBorder = (out) => out.report.missing.some((entry) => entry.name === 'saniconborder.png');

  const without = install(dirs, file);
  assert.ok(without.ok);
  assert.ok(missingBorder(without), 'no SAN install: reported missing');

  const out = install(dirs, file, { sanImagesDir: sanImages, duplicate: 'auto' });
  assert.ok(out.ok);
  assert.ok(!missingBorder(out), 'taken from the SAN install');
});

test('the SAN install is found under its versioned program folder, newest first', (t) => {
  const dirs = workspace(t);
  const img = (version) => path.join(dirs.root, 'Programs', `steamachievementnotifierv${version}`, 'resources', 'img');
  fs.mkdirSync(img('1.8'), { recursive: true });
  fs.mkdirSync(img('1.9'), { recursive: true });

  assert.equal(sanImport.findSanImages({ platform: 'win32', env: { LOCALAPPDATA: dirs.root } }), img('1.9'));
  assert.equal(sanImport.findSanImages({ platform: 'win32', env: { LOCALAPPDATA: path.join(dirs.root, 'none') } }), '');
  assert.equal(sanImport.findSanImages({ platform: 'linux', env: {} }), '');
});
