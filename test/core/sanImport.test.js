'use strict';

/*
  Importing a Steam Achievement Notifier theme: a `.san` file is untrusted data from an unknown
  machine, so half of this file is about what the importer refuses to do with one - reach outside its
  own package, write anything that is not a picture or a sound, or let a value through unclamped. The
  other half is the conversion itself, what a theme becomes and what the user is told was left behind.
  The fixture uses invented colours, filenames and paths - nothing from SAN's own repository.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const AdmZip = require(path.join(appRoot, 'node_modules', 'adm-zip'));
const sanImport = require(path.join(appRoot, 'util', 'sanImport.js'));
const presetPackage = require(path.join(appRoot, 'util', 'presetPackage.js'));
const schema = require(path.join(appRoot, 'util', 'presetSchema.js'));
const { PRESET_OPTIONS_FILE, PRESET_PACKAGE_FILE } = require(path.join(appRoot, 'util', 'customPreset.js'));

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'san', 'usertheme.json');
const theme = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

// Not real media, and it does not have to be: nothing here decodes a picture or plays a sound. The
// signatures are only there so the bytes are recognisable in a failure.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVEfmt ')]);

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dirs = {
    root,
    presets: path.join(root, 'presets'),
    sounds: path.join(root, 'sounds'),
    images: path.join(root, 'images'),
    out: path.join(root, 'out'),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

// Build a .san by hand, so a test can put anything at all inside one.
function writeTheme(file, entries) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8'));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  zip.writeZip(file);
  return file;
}

// The fixture as a complete package: the manifest plus the two files it actually references.
function fixturePackage(dirs, { manifest = theme(), assets = {} } = {}) {
  return writeTheme(path.join(dirs.out, 'sample.san'), {
    'usertheme.json': JSON.stringify(manifest),
    'assets/backdrop.png': PNG,
    'assets/unlock-chime.wav': WAV,
    ...assets,
  });
}

const install = (dirs, file, extra = {}) =>
  sanImport.installSanTheme({
    file,
    presetsDir: dirs.presets,
    soundsDir: dirs.sounds,
    imagesDir: dirs.images,
    appVersion: '3.9.2',
    ...extra,
  });

// The key table is the contract.

/*
  Every property of SAN's own `Customisation`, as its public type declares it. A key that turns up in
  a theme and is not in this list is what the importer reports as unrecognised; a key that is in the
  list but not in the adapter's table would be silently unaccounted for, which is what this catches.
*/
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
  'iconborderimgsilver', 'textvspace', 'usertheme',
];

test('every property a SAN theme can carry has a decided fate', () => {
  const known = new Set(sanImport.SAN_KEYS.map((entry) => entry.key));
  const missing = SAN_CUSTOMISATION_KEYS.filter((key) => !known.has(key));
  assert.deepEqual(missing, [], 'these SAN properties are not accounted for by the adapter');

  // ...and nothing invented: a key here that SAN does not have would report a property that cannot
  // exist, and would quietly rot the moment SAN renamed something.
  const declared = new Set(SAN_CUSTOMISATION_KEYS);
  assert.deepEqual(
    sanImport.SAN_KEYS.map((entry) => entry.key).filter((key) => !declared.has(key)),
    []
  );

  const codes = new Set(['mapped', 'app-setting', 'unsupported', 'internal']);
  for (const entry of sanImport.SAN_KEYS) {
    assert.ok(codes.has(entry.code), `${entry.key}: unknown disposition ${entry.code}`);
    if (entry.code === 'mapped') assert.ok(schema.PROPERTY_BY_KEY.has(entry.to), `${entry.key} maps to unknown property ${entry.to}`);
  }
  // A key cannot be listed twice, or its second entry would never be reached.
  const keys = sanImport.SAN_KEYS.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);
});

// The conversion.

test('the fixture theme becomes the design it describes', () => {
  const { options } = sanImport.mapSanCustomisation(theme().customisation);

  // Sizes and timings, in the units AW Next uses rather than SAN's percentages.
  assert.equal(options.duration, 8000, '8 seconds');
  assert.equal(options.radius, 12, 'SAN roundness is a quarter of a pixel each');
  assert.equal(options.iconRadius, 50, 'SAN roundness 100 is a circle');
  assert.equal(options.iconSize, 70, '110% of the 64px default');
  assert.equal(options.fontSize, 20, 'the title size drives the card when custom sizes are on');
  assert.equal(options.detailScale, 80, 'the description is sized relative to the title');
  assert.equal(options.opacity, 0.9);

  // Colours, including the two SAN keeps apart from the body text.
  assert.equal(options.bg, '#141024');
  assert.equal(options.bg2, '#2b1550');
  assert.equal(options.bgAngle, 45);
  assert.equal(options.text, '#e6ecff', 'the description colour is the card text');
  assert.equal(options.titleColorMode, 'custom');
  assert.equal(options.titleColor, '#33ffd5');
  // tertiarycolor is plain white here, so the glow colour the author DID choose becomes the accent.
  assert.equal(options.accent, '#ff2fa8');

  // The picture behind the text, with SAN's brightness read as how much of it is left.
  assert.equal(options.bgMode, 'image');
  assert.equal(options.artworkDim, 40);
  assert.equal(options.artworkBlur, 1);

  // Effects.
  assert.equal(options.glow, 35);
  assert.equal(options.glowAnim, 'pulse', 'SAN "double" is a pulse');
  assert.equal(options.rareAccent, '#ffcf4d');
  assert.equal(options.rareSilver, '#9aa4b2');
  assert.equal(options.rareBronze, '#c07038');
  assert.equal(options.textShadow, 60);
  assert.equal(options.textStroke, 1.5);
  assert.equal(options.textStrokeColor, '#101018');
  assert.equal(options.borderWidth, 2);
  assert.equal(options.borderColor, '#33ffd5');
  assert.equal(options.iconBorder, 2);
  assert.equal(options.iconGlow, 50);

  // Rows and motion.
  assert.equal(options.showGameName, true);
  assert.equal(options.showRarity, true);
  assert.equal(options.animIn, 'right', 'a card travelling left comes in from the right edge');
  assert.equal(options.animOut, 'right');

  // A SAN card has no accent rail, so an imported one must not grow the one AW Next adds by default.
  assert.equal(options.accentBar, 'none');
  assert.equal(options.fontFamily, 'mono', 'VT323 is the closest thing to a monospaced stack');

  // Whatever came out is a design the designer can show back, unchanged.
  assert.deepEqual(schema.normalizeOptions(options), options);
});

test('a theme that says nothing still lands on a usable design', () => {
  const { options, report } = sanImport.mapSanCustomisation({});
  assert.deepEqual(schema.normalizeOptions(options), options);
  assert.deepEqual(report.mapped, []);
  assert.deepEqual(report.skipped, []);
  // The two AW Next defaults an empty theme has to override, because SAN has neither.
  assert.equal(options.accentBar, 'none');
  assert.equal(options.titleColorMode, 'text');

  // Nonsense is clamped rather than carried: this is the same normalizer the designer writes through.
  const hostile = sanImport.mapSanCustomisation({
    primarycolor: 'red; } body { display: none } .x {',
    fontcolor: 'expression(alert(1))',
    outlinecolor: '</style><script>alert(1)</script>',
    useoutline: true,
    displaytime: 99999,
    roundness: -500,
    bgstyle: 'nonsense',
  });
  assert.equal(hostile.options.bg, '#16181d');
  assert.equal(hostile.options.text, '#ffffff');
  assert.equal(hostile.options.borderColor, '#ffffff');
  assert.equal(hostile.options.duration, 12000);
  assert.equal(hostile.options.radius, 0);
  assert.equal(hostile.options.bgMode, 'solid');
});

test('SAN colours that carry alpha keep their colour and lose the alpha', () => {
  const { options } = sanImport.mapSanCustomisation({ tertiarycolor: '#ffb84e99', fontcolor: '#112233ff' });
  assert.equal(options.accent, '#ffb84e');
  assert.equal(options.text, '#112233');
});

test('the report says what was used, not what SAN happens to have', () => {
  const { report } = sanImport.mapSanCustomisation(theme().customisation);
  const skipped = new Map(report.skipped.map((entry) => [entry.key, entry.code]));

  // Turned on in the fixture, and genuinely lost.
  assert.equal(skipped.get('showdecoration'), 'unsupported');
  assert.equal(skipped.get('percentbadge'), 'unsupported');
  assert.equal(skipped.get('customtext'), 'unsupported');
  assert.equal(skipped.get('outline'), 'unsupported', 'a dashed border is not something a preset can ask for');
  assert.equal(skipped.get('textvspace'), 'unsupported');

  // Real here, but a setting of the app rather than part of a preset.
  assert.equal(skipped.get('scale'), 'app-setting');
  assert.equal(skipped.get('pos'), 'app-setting');
  assert.equal(skipped.get('volume'), 'app-setting');

  // Left off, or left exactly as SAN ships it: saying these were lost would be noise.
  for (const quiet of ['mask', 'maskimg', 'bgachicon', 'usegameicon', 'gameicontype', 'sspercentbadge', 'hiddeniconpos', 'iconborderx']) {
    assert.equal(skipped.has(quiet), false, `${quiet} was never in use and should not be reported`);
  }
  // SAN's own bookkeeping is not a design decision either way.
  for (const internal of ['usertheme', 'synctheme', 'shortcut', 'ovpos']) {
    assert.equal(skipped.has(internal), false, `${internal} is bookkeeping, not a lost setting`);
  }
  /*
    An empty map of custom icons is not a custom icon that was lost, and the element list SAN writes
    for everyone is not a choice either. Both used to be reported, which buried the dozen entries
    that were real under a dozen that were not.
  */
  for (const untouched of ['customicons', 'elems', 'sselems', 'fontshadowcolor', 'iconanimcolor', 'sspercentbadgecolor']) {
    assert.equal(skipped.has(untouched), false, `${untouched} was left at its default and should not be reported`);
  }
  // A theme that is one big default reports nothing lost at all.
  const untouched = sanImport.mapSanCustomisation({ ...theme().customisation, ...sanImport.SAN_DEFAULTS, customicons: {}, customtext: '' });
  assert.equal(untouched.report.skipped.filter((entry) => entry.code === 'unsupported').length, 0);

  const mapped = new Map(report.mapped.map((entry) => [entry.key, entry.to]));
  assert.equal(mapped.get('primarycolor'), 'bg');
  assert.equal(mapped.get('glowcolorgold'), 'rareAccent');
  assert.equal(mapped.get('animdir'), 'animIn');
  assert.ok(report.mapped.length > 20, 'most of a real theme should survive the conversion');
});

test('a lost feature is named once, not once per option it has', () => {
  /*
    A theme using SAN's percentage badge sets six keys for it. Listing all six says nothing the word
    "percentbadge" did not already say, and buries the other features that were genuinely lost.
  */
  const customisation = {
    ...theme().customisation,
    percentbadge: true,
    percentbadgepos: 'topright',
    percentbadgecolor: '#123456',
    percentbadgefontcolor: '#654321',
    percentbadgeimg: true,
    percentbadgeimggold: 'C:/x/gold.svg',
    showdecoration: true,
    decorationpos: 2,
    decorationscale: 140,
    mask: true,
    maskimg: 'C:/x/mask.png',
  };
  const { report } = sanImport.mapSanCustomisation(customisation);
  const skipped = report.skipped.map((entry) => entry.key);

  for (const switchedOn of ['percentbadge', 'showdecoration', 'mask']) {
    assert.ok(skipped.includes(switchedOn), `${switchedOn} is the feature that was lost and must be named`);
  }
  for (const detail of ['percentbadgepos', 'percentbadgecolor', 'percentbadgefontcolor', 'percentbadgeimg', 'percentbadgeimggold', 'decorationpos', 'decorationscale', 'maskimg']) {
    assert.equal(skipped.includes(detail), false, `${detail} is a detail of a feature already named`);
  }

  /*
    ...but only when the switch itself is in the list. SAN's icon border becomes a plain accent
    border here, so the border is NOT lost - its artwork and its rarity variants are, and they have
    to keep saying so.
  */
  assert.ok(skipped.includes('iconborderimg'));
  assert.equal(skipped.includes('showiconborder'), false, 'the border itself was carried over');

  // A chain of gates collapses to its root rather than one link at a time.
  const chained = sanImport.mapSanCustomisation({
    sspercentbadge: true,
    sspercentbadgeimg: true,
    sspercentbadgeimggold: 'C:/x/gold.svg',
  }).report.skipped.map((entry) => entry.key);
  assert.deepEqual(chained, ['sspercentbadge']);
});

test('a property this adapter has never heard of is reported, never a reason to fail', () => {
  const customisation = { ...theme().customisation, somethingnewinsan: 42, anotherone: 'x' };
  const { report, options } = sanImport.mapSanCustomisation(customisation);
  const unknown = report.skipped.filter((entry) => entry.code === 'unknown').map((entry) => entry.key);
  assert.deepEqual(unknown, ['anotherone', 'somethingnewinsan']);
  assert.deepEqual(schema.normalizeOptions(options), options);
});

test('a font file is matched to a stack by name, never loaded', () => {
  assert.equal(sanImport.fontFamily('C:/x/JetBrainsMono-Light.ttf'), 'mono');
  assert.equal(sanImport.fontFamily('C:/x/VT323-Regular.ttf'), 'mono');
  assert.equal(sanImport.fontFamily('C:/x/TitilliumWeb-SemiBold.ttf'), 'condensed');
  assert.equal(sanImport.fontFamily('C:/x/Mandali-Regular.ttf'), 'rounded');
  assert.equal(sanImport.fontFamily('C:/x/PlayfairDisplay.otf'), 'serif');
  assert.equal(sanImport.fontFamily('C:/x/NotoSans-Regular.ttf'), 'sans');
  assert.equal(sanImport.fontFamily(''), '', 'no font named means no opinion');
  // The stack is one the schema offers, or the generator would fall back to the default silently.
  for (const file of ['a/VT323.ttf', 'b/Georgia.ttf', 'c/Anything.woff2']) {
    assert.ok(Object.keys(schema.FONT_STACKS).includes(sanImport.fontFamily(file)));
  }
});

// Reading a package.

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
  /*
    adm-zip cleans a path on the way IN, so a hostile archive cannot be produced by asking it for
    one: the entry name has to be written back afterwards. That is also exactly the shape of the
    real thing, which was not built by adm-zip either.
  */
  const hostilePackage = (entryName) => {
    const zip = new AdmZip();
    zip.addFile('usertheme.json', Buffer.from(JSON.stringify(theme()), 'utf8'));
    zip.addFile('assets/placeholder.png', PNG);
    zip.getEntries()[1].entryName = entryName;
    const file = path.join(dirs.out, 'hostile.san');
    zip.writeZip(file);
    return file;
  };

  for (const hostile of [
    '../evil.png',
    'assets/../../evil.png',
    '../../../../windows/system32/evil.png',
    '/etc/evil.png',
    'C:/windows/evil.png',
    'assets\\..\\..\\evil.png',
    'assets/sub/./../../evil.png',
  ]) {
    const read = sanImport.readSanTheme(hostilePackage(hostile));
    assert.equal(read.ok, false, `${hostile} was accepted`);
    assert.equal(read.error, 'unsafe-path', `${hostile}: ${read.error}`);
    // ...and an install stops at the same place, so nothing is written anywhere.
    const out = install(dirs, hostilePackage(hostile));
    assert.equal(out.ok, false);
    assert.deepEqual(fs.readdirSync(dirs.presets), [], `${hostile} left something in the preset storage`);
    assert.deepEqual(fs.readdirSync(dirs.root).filter((name) => name.endsWith('.png')), []);
  }

  // A name that is legal but not part of the format is skipped, not a reason to refuse the theme.
  const zip = new AdmZip();
  zip.addFile('usertheme.json', Buffer.from(JSON.stringify(theme()), 'utf8'));
  zip.addFile('elsewhere/backdrop.png', PNG);
  const stray = path.join(dirs.out, 'stray.san');
  zip.writeZip(stray);
  const read = sanImport.readSanTheme(stray);
  assert.ok(read.ok);
  assert.deepEqual([...read.assets.keys()], []);
  assert.deepEqual(read.rejected.map((entry) => entry.name), ['elsewhere/backdrop.png']);
});

test('only pictures and sounds are ever taken out of a package', (t) => {
  const dirs = workspace(t);
  const file = fixturePackage(dirs, {
    assets: {
      'assets/payload.exe': Buffer.from([0x4d, 0x5a, 0x90]),
      'assets/hook.js': 'require("fs").rmSync("/", { recursive: true })',
      'assets/logo.svg': '<svg onload="alert(1)"></svg>',
      'assets/page.html': '<script>alert(1)</script>',
      'readme.txt': 'hello',
    },
  });
  const read = sanImport.readSanTheme(file);
  assert.ok(read.ok);
  assert.deepEqual([...read.assets.keys()].sort(), ['backdrop.png', 'unlock-chime.wav']);
  assert.deepEqual(read.rejected.map((entry) => entry.name).sort(), ['hook.js', 'logo.svg', 'page.html', 'payload.exe', 'readme.txt']);

  const out = install(dirs, file);
  assert.ok(out.ok, out.error);
  const installed = fs.readdirSync(path.join(dirs.presets, out.name)).sort();
  assert.deepEqual(installed, ['aw-package.json', 'aw-preset.json', 'backdrop.png', 'index.html', 'style.css']);
  // ...and the user is told, rather than left to wonder where the rest went.
  const refused = out.report.assets.filter((entry) => entry.code === 'asset-rejected').map((entry) => entry.name);
  assert.equal(refused.length, 5);
});

test('an oversized or duplicated entry is refused before anything is written', (t) => {
  const dirs = workspace(t);
  const huge = Buffer.alloc(sanImport.SAN_LIMITS.fileBytes + 1024, 7);
  const file = fixturePackage(dirs, { assets: { 'assets/huge.png': huge } });
  assert.equal(sanImport.readSanTheme(file).error, 'asset-too-large');

  // adm-zip keeps both entries of a repeated name, which is the shape a zip-confusion trick takes.
  const zip = new AdmZip();
  zip.addFile('usertheme.json', Buffer.from(JSON.stringify(theme()), 'utf8'));
  zip.addFile('assets/backdrop.png', PNG);
  zip.getEntries()[1].entryName = 'usertheme.json';
  const twice = path.join(dirs.out, 'twice.san');
  zip.writeZip(twice);
  assert.equal(sanImport.readSanTheme(twice).error, 'duplicate-entry');

  assert.deepEqual(fs.readdirSync(dirs.presets), [], 'a refused package must not leave anything behind');
});

test('an absolute path in the theme is read as a name, never as a path', (t) => {
  const dirs = workspace(t);
  // The picture the fixture names is not in the package, and the absolute path it carries points at
  // a real file. Reading that file would be the bug; the import falls back to a flat colour instead.
  const outside = path.join(dirs.root, 'backdrop.png');
  fs.writeFileSync(outside, PNG);
  const manifest = theme();
  manifest.customisation.bgimg = outside;
  const file = writeTheme(path.join(dirs.out, 'x.san'), { 'usertheme.json': JSON.stringify(manifest), 'assets/unlock-chime.wav': WAV });

  const out = install(dirs, file);
  assert.ok(out.ok, out.error);
  assert.equal(out.options.bgMode, 'solid', 'a picture that did not travel cannot be drawn');
  assert.equal(out.options.bgImage, '');
  assert.ok(out.report.assets.some((entry) => entry.kind === 'image' && entry.code === 'asset-missing'));
  assert.equal(fs.existsSync(path.join(dirs.presets, out.name, 'backdrop.png')), false);
});

// Installing.

test('an imported theme is an ordinary preset, complete and editable', (t) => {
  const dirs = workspace(t);
  const out = install(dirs, fixturePackage(dirs));
  assert.ok(out.ok, out.error);
  assert.equal(out.name, 'Sample Neon');

  const dir = path.join(dirs.presets, out.name);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="style\.css" \/>/);
  assert.match(html, /<meta width="\d+" height="\d+" \/>/, 'the notification window sizes itself from this');
  // The colour the theme carried, on the variable the card paints from. It is `--bg-base` rather
  // than `--bg` because a state re-points `--bg` to a tint of it, the way it re-points `--accent`.
  assert.match(css, /--bg-base: #141024;/);
  assert.match(css, /--bg: var\(--bg-base\);/);
  // The picture is named relative to the stylesheet it sits beside, so an installed preset resolves
  // it and a package carries it along.
  assert.match(css, /--bg-image: url\('backdrop\.png'\);/);
  assert.ok(fs.readFileSync(path.join(dir, 'backdrop.png')).equals(PNG));

  // The builder's own options file is what makes it editable rather than merely present.
  const stored = JSON.parse(fs.readFileSync(path.join(dir, PRESET_OPTIONS_FILE), 'utf8'));
  assert.equal(stored.name, 'Sample Neon');
  const { name, ...values } = stored;
  assert.deepEqual(schema.normalizeOptions(values), values, 'the stored options must round-trip through the designer');
  assert.equal(values.bgImage, 'backdrop.png');

  // The sound travelled, and the preset asks for it under the name it was installed as.
  assert.ok(fs.existsSync(path.join(dirs.sounds, 'unlock-chime.wav')));
  assert.equal(values.sound, 'unlock-chime.wav');

  // ...and the picture is offered to the designer again, or the preset could be opened but not saved.
  assert.ok(fs.readFileSync(path.join(dirs.images, 'backdrop.png')).equals(PNG));
});

test('the preset says where it came from, and keeps saying it', (t) => {
  const dirs = workspace(t);
  const out = install(dirs, fixturePackage(dirs));
  const dir = path.join(dirs.presets, out.name);

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, PRESET_PACKAGE_FILE), 'utf8'));
  assert.equal(manifest.origin.app, sanImport.SAN_ORIGIN_APP);
  assert.equal(manifest.origin.format, sanImport.SAN_ORIGIN_FORMAT);
  assert.equal(manifest.origin.version, '2.4.1');
  assert.equal(manifest.origin.name, 'Sample Neon');
  assert.ok(manifest.tags.includes('san'));

  // Shared on as an .awpreset and imported somewhere else, it still says where it started.
  const shipped = path.join(dirs.out, 'sample.awpreset');
  const exported = presetPackage.exportPreset({
    presetDir: dir,
    name: out.name,
    destination: shipped,
    options: JSON.parse(fs.readFileSync(path.join(dir, PRESET_OPTIONS_FILE), 'utf8')),
    meta: { origin: manifest.origin, description: manifest.description, tags: manifest.tags },
    appVersion: '3.9.2',
  });
  assert.ok(exported.ok, exported.error);

  const reread = presetPackage.readPackage(shipped, { appVersion: '3.9.2' });
  assert.ok(reread.ok, reread.error);
  assert.deepEqual(reread.manifest.origin, manifest.origin);
  // ...and the picture is part of what is shared, not something the recipient has to find.
  assert.ok(reread.presetFiles.some((entry) => entry.path === 'backdrop.png'));
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
  assert.ok(kept.ok, kept.error);
  assert.equal(kept.name, 'Sample Neon (2)');
  assert.ok(fs.existsSync(path.join(dirs.presets, 'Sample Neon', 'index.html')));

  const replaced = install(dirs, file, { duplicate: 'replace' });
  assert.ok(replaced.ok, replaced.error);
  assert.equal(replaced.name, 'Sample Neon');
  assert.equal(replaced.replaced, true);

  // A bundled preset of the same name is a clash too, or the import would hide it behind a copy.
  const bundled = install(dirs, fixturePackage(dirs, { manifest: { ...theme(), label: 'AW Next' } }), { takenNames: ['AW Next'] });
  assert.equal(bundled.ok, false);
  assert.equal(bundled.error, 'duplicate');
  assert.equal(bundled.bundled, true);

  // The scratch preset the designer previews through can never be taken over.
  const reserved = install(dirs, fixturePackage(dirs, { manifest: { ...theme(), label: '__aw-preview__' } }), { reservedNames: ['__aw-preview__'] });
  assert.equal(reserved.error, 'reserved-name');
});

test('a theme with no usable name still installs under one', (t) => {
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
  assert.ok(fs.readFileSync(path.join(dirs.sounds, 'unlock-chime.wav')).equals(mine), 'the existing sound was clobbered');
  assert.equal(out.options.sound, 'unlock-chime (2).wav', 'the preset must follow the name its sound was installed as');
  assert.ok(fs.existsSync(path.join(dirs.sounds, 'unlock-chime (2).wav')));
});

test('two themes shipping the same filename never end up sharing one picture', (t) => {
  /*
    Both halves have to agree. The preset reads the copy beside its own stylesheet; the designer's
    preview resolves the name through the shared images folder. Installing a second "backdrop.png"
    under the name the first one took left the preview showing the wrong theme's picture, which is
    the kind of wrong that looks like the import simply lost the background.
  */
  const dirs = workspace(t);
  const withImage = (label, bytes) => {
    const manifest = theme();
    manifest.label = label;
    return writeTheme(path.join(dirs.out, `${label}.san`), {
      'usertheme.json': JSON.stringify(manifest),
      'assets/backdrop.png': bytes,
    });
  };
  const first = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 1, 1, 1]);
  const second = Buffer.from([0x89, 0x50, 0x4e, 0x47, 2, 2, 2, 2]);

  const a = install(dirs, withImage('Theme A', first));
  const b = install(dirs, withImage('Theme B', second));
  assert.ok(a.ok, a.error);
  assert.ok(b.ok, b.error);

  assert.equal(a.options.bgImage, 'backdrop.png');
  assert.equal(b.options.bgImage, 'backdrop (2).png', 'the second picture must not take the first one name');

  for (const outcome of [a, b]) {
    const stored = path.join(dirs.presets, outcome.name, outcome.options.bgImage);
    const shared = path.join(dirs.images, outcome.options.bgImage);
    assert.ok(fs.existsSync(stored), `${outcome.name}: the preset does not carry the picture it names`);
    assert.ok(fs.readFileSync(stored).equals(fs.readFileSync(shared)), `${outcome.name}: the preview would show another theme's picture`);
  }
  assert.ok(fs.readFileSync(path.join(dirs.images, 'backdrop.png')).equals(first));
  assert.ok(fs.readFileSync(path.join(dirs.images, 'backdrop (2).png')).equals(second));

  // An identical picture is reused rather than copied a third time.
  const again = install(dirs, withImage('Theme C', first));
  assert.equal(again.options.bgImage, 'backdrop.png');
  assert.deepEqual(fs.readdirSync(dirs.images).sort(), ['backdrop (2).png', 'backdrop.png']);
});

test('a theme that plays a random sound still brings its folder of sounds', (t) => {
  /*
    SAN picks a random file from a folder; AW Next has the same idea as an app setting rather than a
    preset one. Reporting the folder as "an app setting" and then dropping the audio would leave the
    user with a setting to turn on and nothing to point it at.
  */
  const dirs = workspace(t);
  const manifest = theme();
  manifest.customisation.soundmode = 'folder';
  manifest.customisation.sounddir = 'C:/Users/Sample/Music/Trophies';
  const file = writeTheme(path.join(dirs.out, 'folder.san'), {
    'usertheme.json': JSON.stringify(manifest),
    'assets/Trophies/one.wav': WAV,
    'assets/Trophies/two.wav': WAV,
    'assets/Trophies/notes.txt': 'not audio',
  });

  const out = install(dirs, file);
  assert.ok(out.ok, out.error);
  // The preset itself keeps no opinion: picking one of them would not be "random".
  assert.equal(out.options.sound, '');
  assert.deepEqual(fs.readdirSync(dirs.sounds).sort(), ['one.wav', 'two.wav']);
  const installed = out.report.assets.filter((entry) => entry.kind === 'sound' && entry.code === 'installed').map((entry) => entry.name);
  assert.deepEqual(installed.sort(), ['one.wav', 'two.wav']);
  // ...and the folder itself is still reported, so the user knows where to turn the setting on.
  assert.ok(out.report.skipped.some((entry) => entry.key === 'sounddir' && entry.code === 'app-setting'));
});

test('the theme SAN already unpacked can be imported from its own folder', (t) => {
  const dirs = workspace(t);
  const themeDir = path.join(dirs.root, 'Sample Neon_main');
  fs.mkdirSync(path.join(themeDir, 'assets'), { recursive: true });
  // Which is how SAN leaves it: the paths rewritten to files sitting beside the manifest.
  const manifest = theme();
  manifest.customisation.bgimg = path.join(themeDir, 'assets', 'backdrop.png').replace(/\\/g, '/');
  manifest.customisation.soundfile = path.join(themeDir, 'assets', 'unlock-chime.wav').replace(/\\/g, '/');
  fs.writeFileSync(path.join(themeDir, 'usertheme.json'), JSON.stringify(manifest), 'utf8');
  fs.writeFileSync(path.join(themeDir, 'assets', 'backdrop.png'), PNG);
  fs.writeFileSync(path.join(themeDir, 'assets', 'unlock-chime.wav'), WAV);
  // Something the format does not describe, dropped in the same folder.
  fs.writeFileSync(path.join(themeDir, 'assets', 'notes.txt'), 'hello');
  // ...and a file OUTSIDE the folder that was picked, which must stay untouched whatever is asked.
  fs.writeFileSync(path.join(dirs.root, 'secret.png'), Buffer.from('secret'));

  const out = install(dirs, path.join(themeDir, 'usertheme.json'));
  assert.ok(out.ok, out.error);
  assert.equal(out.options.bgImage, 'backdrop.png');
  assert.ok(fs.readFileSync(path.join(dirs.presets, out.name, 'backdrop.png')).equals(PNG));
  assert.equal(fs.existsSync(path.join(dirs.presets, out.name, 'secret.png')), false);
  assert.equal(fs.existsSync(path.join(dirs.presets, out.name, 'notes.txt')), false);
});

test('the report carries where the theme came from, not only what was lost', (t) => {
  const dirs = workspace(t);
  const out = install(dirs, fixturePackage(dirs));
  assert.ok(out.ok, out.error);
  assert.equal(out.report.label, 'Sample Neon');
  assert.equal(out.report.sanVersion, '2.4.1');
  assert.equal(out.report.sanPreset, 'xqjan', 'the SAN layout the theme was designed against');
  assert.equal(out.report.notifyType, 'main', 'SAN stamps the notification type into the folder name');
  // The one structural difference the user has to be told about outright.
  assert.ok(out.report.notes.includes('states-merged'));
});

test('a refused theme leaves the preset storage exactly as it was', (t) => {
  const dirs = workspace(t);
  const before = install(dirs, fixturePackage(dirs));
  assert.ok(before.ok, before.error);
  const listing = () => fs.readdirSync(dirs.presets).sort();
  const settled = listing();
  const soundsBefore = fs.readdirSync(dirs.sounds).sort();

  fs.writeFileSync(path.join(dirs.out, 'broken.san'), 'not a zip at all');
  for (const file of [path.join(dirs.out, 'broken.san'), path.join(dirs.out, 'absent.san')]) {
    const out = install(dirs, file, { duplicate: 'replace' });
    assert.equal(out.ok, false);
    assert.deepEqual(listing(), settled, 'a failed import changed the preset storage');
    assert.deepEqual(fs.readdirSync(dirs.sounds).sort(), soundsBefore, 'a failed import left a sound behind');
  }
  // ...and no staging folder is left behind either.
  assert.equal(listing().some((name) => name.startsWith('.awsan-')), false);
});
