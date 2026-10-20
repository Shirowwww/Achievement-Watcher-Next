'use strict';

/*
  The engine that draws an imported SAN theme. Its pure half decides which of the four states paints
  an unlock and every value a layout reads; the builder turns a theme into the preset's files and
  keeps installed presets on the current engine. The page itself is exercised in a real browser by
  test/browser/sanPreset.browser.test.js.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const engine = require(path.join(appRoot, 'util', 'sanEngine', 'engine.js'));
const sanEngine = require(path.join(appRoot, 'util', 'sanEngine', 'index.js'));
const engineDir = path.join(appRoot, 'util', 'sanEngine');

const THRESHOLDS = { rarity: 10, semirarity: 25 };

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-engine-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---- which state, which values ------------------------------------------------------------------

test('an unlock is painted by the state its rate falls in, a completion always by plat', () => {
  assert.equal(engine.notifyType(50, THRESHOLDS, false), 'main');
  assert.equal(engine.notifyType(25, THRESHOLDS, false), 'semi', 'the cut-off itself belongs to the rarer state');
  assert.equal(engine.notifyType(10, THRESHOLDS, false), 'rare');
  assert.equal(engine.notifyType(0.1, THRESHOLDS, false), 'rare');
  assert.equal(engine.notifyType(0.1, THRESHOLDS, true), 'plat');
  for (const unknown of [null, undefined, '', 'n/a', NaN]) assert.equal(engine.notifyType(unknown, THRESHOLDS, false), 'main', String(unknown));
  // A theme's own cut-offs, not AW Next's.
  assert.equal(engine.notifyType(20, { rarity: 30, semirarity: 50 }, false), 'rare');
  assert.equal(engine.notifyType(20, null, false), 'semi', 'no cut-offs means SAN defaults');

  assert.equal(engine.tierOf(50, THRESHOLDS), 'bronze');
  assert.equal(engine.tierOf(20, THRESHOLDS), 'silver');
  assert.equal(engine.tierOf(5, THRESHOLDS), 'gold');
});

test('AW Next rarity tier decides the state, in both rarity modes', () => {
  const state = (tier, mode) => engine.stateOf({ tier, mode, percent: 50, thresholds: THRESHOLDS });
  // Rare mode grades only the rarest three bands: gold and silver are SAN's rare, bronze its semi.
  assert.deepEqual(['gold', 'silver', 'bronze', ''].map((tier) => state(tier, 'rare')), ['rare', 'rare', 'semi', 'main']);
  // Trophy mode grades everything.
  assert.deepEqual(['gold', 'silver', 'bronze'].map((tier) => state(tier, 'trophy')), ['rare', 'semi', 'main']);
  assert.equal(state('platinum', 'rare'), 'plat');
  assert.equal(engine.stateOf({ tier: '', platinum: true }), 'plat');
  // The theme's own cut-offs only when the payload carries no tier at all.
  assert.equal(engine.stateOf({ percent: 5, thresholds: THRESHOLDS }), 'rare');
  assert.equal(engine.stateOf({ tier: '', percent: 5, thresholds: THRESHOLDS }), 'main', 'an empty tier is AW Next saying "not rare"');

  // The per-tier pictures and glow follow the state, as SAN pairs them.
  const c = { glow: true, glowrarity: true, glowcolorbronze: '#111111', glowcolorsilver: '#222222', glowcolorgold: '#333333' };
  assert.equal(engine.computeProperties(c, { percent: 80, tier: 'gold' })['--glowcolor'], '#333333');
});

test('a theme with no known base card is drawn on the default one', () => {
  assert.equal(engine.layoutOf('ps5'), 'ps5');
  for (const odd of ['', 'os', '../evil', '__proto__', 'constructor', undefined]) assert.equal(engine.layoutOf(odd), 'default', String(odd));
});

test('the three lines follow the theme custom text, the game title, and the completion wording', () => {
  const strings = { unlocked: 'Unlocked', congrats: 'Bravo', gameTitle: 'Game' };
  const info = { title: 'First Blood', desc: 'Win a match', gameName: 'Quake', type: 'main' };
  assert.deepEqual(engine.textLines({}, info, strings), { unlockmsg: 'Unlocked', title: 'First Blood', desc: 'Win a match' });
  assert.equal(engine.textLines({}, { ...info, type: 'plat' }, strings).unlockmsg, 'Bravo');

  const custom = { usecustomtext: true, customtextunlockmsg: 'GG', usegametitletitle: true, customtextdesc: '' };
  assert.deepEqual(engine.textLines(custom, info, strings), { unlockmsg: 'GG', title: 'Quake', desc: 'Win a match' });
  assert.equal(engine.textLines(custom, { ...info, gameName: '' }, strings).title, 'Game', 'no game name falls back to the placeholder');
  // The switch governs everything: custom text left behind by a disabled toggle is not drawn.
  assert.equal(engine.textLines({ customtextunlockmsg: 'GG' }, info, strings).unlockmsg, 'Unlocked');
});

test('the unlock rate is printed the way SAN prints it, only when its setting says so', () => {
  assert.equal(engine.percentValue(12.345), 12.3);
  assert.equal(engine.percentValue(0), 0.1);
  const suffix = (type, showpercent, extra = {}) => engine.percentSuffix(extra, { type, percent: 4.26, showpercent });
  assert.equal(suffix('rare', 'rareonly'), '(4.3%)');
  assert.equal(suffix('main', 'rareonly'), '');
  assert.equal(suffix('main', 'all'), '(4.3%)');
  assert.equal(suffix('rare', 'off'), '');
  assert.equal(suffix('plat', 'all'), '');
  assert.equal(suffix('rare', 'all', { percentbadge: true }), '', 'a badge already shows it');
});

test('each slot gets its line, and the decoration, lock and rate land where the theme put them', () => {
  const lines = { unlockmsg: 'Unlocked', title: 'T', desc: 'D' };
  const all = engine.slotContents({ elems: ['unlockmsg', 'title', 'desc'], decorationpos: 2, hiddeniconpos: 3, showhiddenicon: true, percentpos: 1 }, {
    lines,
    hidden: true,
    percentText: '(1%)',
  });
  assert.equal(all.alldetails, true);
  assert.deepEqual(all.slots.unlockmsg, { decoration: false, hiddenIcon: false, text: 'Unlocked', percent: ' (1%)' });
  assert.equal(all.slots.title.decoration, true);
  assert.equal(all.slots.desc.hiddenIcon, true);
  // A lock is only drawn for a hidden achievement.
  assert.equal(engine.slotContents({ hiddeniconpos: 3, showhiddenicon: true }, { lines, hidden: false }).slots.desc.hiddenIcon, false);

  /*
    The lines shown are packed in order. A partial card (whose stylesheet hides the first slot when
    a line is off) reads them one slot earlier, so its second and third slots carry them.
  */
  const partial = engine.slotContents({ preset: 'ps5', elems: [null, 'title', 'desc'] }, { lines });
  assert.equal(partial.alldetails, false);
  assert.deepEqual([partial.slots.title.text, partial.slots.desc.text], ['T', 'D']);
  const full = engine.slotContents({ preset: 'default', elems: [null, 'title', 'desc'] }, { lines });
  assert.deepEqual([full.slots.unlockmsg.text, full.slots.title.text, full.slots.desc], ['T', 'D', null]);
});

test('body attributes only ever carry plain names', () => {
  const attrs = engine.bodyAttributes({ preset: 'xqjan', displaytime: 5, bgstyle: 'x" onload="alert(1)', bgonly: true, iconanim: false }, { type: 'rare', pos: 'topright', notify1line: true });
  assert.deepEqual(attrs, ['rare', 'noiconanim', 'notify1line', 'fastanim', 'bgonly', 'topright']);
  assert.equal(engine.bodyAttributes({ preset: 'xqjan', displaytime: 9, iconanim: true }, { type: 'main' }).includes('fastanim'), false);
});

test('computed values follow the state tier and never let a file name out of its url()', () => {
  const c = {
    preset: 'default',
    glow: true,
    glowrarity: true,
    glowcolorbronze: '#111111',
    glowcolorsilver: '#222222',
    glowcolorgold: '#333333',
    iconroundness: 100,
    bgimg: "assets/it's.png",
    customicons: { default: { logo: ['assets/b.png', 'assets/s.png', 'assets/g.png'], decoration: null } },
    decorationpos: 0,
  };
  const at = (percent) => engine.computeProperties(c, { percent, thresholds: THRESHOLDS, background: c.bgimg });
  assert.equal(at(50)['--glowcolor'], '#111111');
  assert.equal(at(20)['--glowcolor'], '#222222');
  assert.equal(at(5)['--glowcolor'], '#333333');
  assert.equal(at(5)['--logo'], "url('assets/g.png')");
  assert.equal(at(50)['--iconroundness'], '50%');
  assert.equal(at(50)['--bgimg'], "url('assets/it\\'s.png')");
  assert.equal(at(50)['--decoration'], 'none', 'a hidden decoration hides its slot too');
  assert.equal(at(50)['--decorationdisplaytype'], 'none');
  assert.equal(engine.computeProperties({ preset: 'epicgames', decorationpos: 0 }, { percent: 50 })['--decorationdisplaytype'], 'block', 'except on the card built around it');
});

// ---- the cards ----------------------------------------------------------------------------------

test('every base card the engine knows ships its markup and stylesheet', () => {
  for (const id of engine.LAYOUT_IDS) {
    const html = path.join(engineDir, 'layouts', `${id}.html`);
    const css = path.join(engineDir, 'layouts', `${id}.css`);
    assert.ok(fs.existsSync(html) && fs.readFileSync(html, 'utf8').trim(), `${id}.html is missing`);
    assert.ok(fs.existsSync(css) && fs.readFileSync(css, 'utf8').trim(), `${id}.css is missing`);
    // The size the engine opens the window at is the size the card declares.
    const meta = /<meta\s+width="(\d+)"\s+height="(\d+)"/.exec(fs.readFileSync(html, 'utf8'));
    assert.ok(meta, `${id}.html declares no size`);
    assert.deepEqual([Number(meta[1]), Number(meta[2])], [engine.LAYOUTS[id].width, engine.LAYOUTS[id].height], id);
    // A card fills the three text slots by id, or its lines are never drawn.
    for (const slot of engine.TEXT_SLOTS) assert.match(fs.readFileSync(html, 'utf8'), new RegExp(`id="${slot}"`), `${id} has no #${slot}`);
  }
});

test('a card loads nothing from outside its preset: no script, no remote resource, no SAN file', () => {
  const remote = /@import|url\(\s*["']?(?:https?:)?\/\/|\s(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i;
  for (const file of fs.readdirSync(path.join(engineDir, 'layouts'))) {
    const text = fs.readFileSync(path.join(engineDir, 'layouts', file), 'utf8');
    assert.doesNotMatch(text, /<script|<\/template|javascript:|\son[a-z]+\s*=/i, file);
    assert.doesNotMatch(text, remote, file);
    // SAN's pages name its own folders; a preset only has its own files.
    assert.doesNotMatch(text, /\.\.\//, file);
  }
  for (const file of ['base.css', 'fonts.css']) {
    const text = fs.readFileSync(path.join(engineDir, file), 'utf8');
    assert.doesNotMatch(text, remote, file);
    assert.doesNotMatch(text, /\.\.\//, file);
  }
});

test('a card is sized by itself, not by the window that holds every state of the theme', () => {
  // SAN's window is always its card; AW Next's fits the largest card of the theme.
  for (const file of fs.readdirSync(path.join(engineDir, 'layouts')).filter((name) => name.endsWith('.css'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(engineDir, 'layouts', file), 'utf8'), /\d(?:vw|vh|vmax|vmin)\b/, `${file} measures the window`);
  }
  const adapter = fs.readFileSync(path.join(engineDir, 'base.css'), 'utf8').split('/* ---- AW Next')[1] || '';
  assert.match(adapter, /body \{\s*width: var\(--notifywidth\);\s*height: var\(--notifyheight\);\s*container-type: size;/);
  assert.match(adapter, /font-size: clamp\([^;]*max\(var\(--notifywidth\), var\(--notifyheight\)\)/);
});

test('every typeface a card asks for is bundled', () => {
  const declared = new Set([...fs.readFileSync(path.join(engineDir, 'fonts.css'), 'utf8').matchAll(/font-family: "([^"]+)"/g)].map((match) => match[1]));
  const sheets = ['base.css', ...fs.readdirSync(path.join(engineDir, 'layouts')).filter((name) => name.endsWith('.css')).map((name) => `layouts/${name}`)];
  for (const sheet of sheets) {
    const css = fs.readFileSync(path.join(engineDir, sheet), 'utf8');
    for (const rule of css.matchAll(/font-family:\s*([^;}]+)/g)) {
      for (const family of rule[1].matchAll(/"([^"]+)"/g)) {
        if (family[1] !== 'customfont') assert.ok(declared.has(family[1]), `${sheet} asks for "${family[1]}", which fonts.css does not declare`);
      }
    }
  }
});

test('every bundled font face has its file, and every font file is a real font', () => {
  const { fontKind } = require(path.join(appRoot, 'util', 'presetSchema.js'));
  const faces = [...fs.readFileSync(path.join(engineDir, 'fonts.css'), 'utf8').matchAll(/url\("fonts\/([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(faces.length >= 8);
  for (const file of faces) {
    const full = path.join(engineDir, 'fonts', file);
    assert.ok(fs.existsSync(full), `${file} is declared but missing`);
    assert.equal(fontKind(fs.readFileSync(full)), 'woff2', file);
  }
  assert.ok(fs.existsSync(path.join(engineDir, 'fonts', 'LICENSES.md')), 'the bundled fonts ship without their licences');
});

// ---- the preset files ---------------------------------------------------------------------------

const sampleTheme = (types) => ({ label: 'Sample', thresholds: THRESHOLDS, showpercent: 'rareonly', notify1line: false, types });

test('a preset carries one card per state it uses, in a window that fits the largest', () => {
  const built = sanEngine.buildPresetFiles(sampleTheme({ main: { preset: 'xqjan', displaytime: 6 }, rare: { preset: 'windows', displaytime: 12 }, plat: { preset: 'xqjan' } }));
  assert.deepEqual(built.layouts.sort(), ['windows', 'xqjan']);
  assert.deepEqual(built.size, { width: 353, height: 100 });
  const html = built.files['index.html'];
  assert.match(html, /<meta width="353" height="100" \/>/);
  assert.match(html, /<template id="aw-san-layout-xqjan">/);
  assert.match(html, /<template id="aw-san-layout-windows">/);
  assert.match(html, /<meta name="duration" content="13500" \/>/, 'the longest state, plus its fade');
  assert.ok(built.files['layout-xqjan.css'] !== undefined && built.files['layout-windows.css'] !== undefined);
  // Only the fonts the cards name travel with the preset.
  for (const relative of Object.values(built.fonts)) assert.match(built.files['style.css'], new RegExp(relative.replace(/[.]/g, '\\.')));
});

test('the theme block cannot close its own script element, whatever a label says', () => {
  const theme = sampleTheme({ main: { preset: 'default', customtextdesc: '</script><script>alert(1)</script>' } });
  theme.label = '</title><script>alert(2)</script>';
  const html = sanEngine.buildPresetFiles(theme, { name: 'x' }).files['index.html'];
  assert.equal((html.match(/<\/script/gi) || []).length, 3, 'the JSON block, the engine and the host, nothing else');
  // The engine and host are inlined as they are, so they must not hold anything that ends a script.
  for (const file of ['engine.js', 'host.js']) assert.doesNotMatch(fs.readFileSync(path.join(engineDir, file), 'utf8'), /<\/script|<!--/i, file);
  assert.deepEqual(sanEngine.readEmbeddedTheme(html), theme);
  assert.equal(sanEngine.readEmbeddedTheme('<html></html>'), null);
  assert.equal(sanEngine.readEmbeddedTheme('<script type="application/json" id="aw-san-theme">{"no":"types"}</script>'), null);
});

test('an installed preset follows the engine it was built with, and nothing else is touched', (t) => {
  const dir = scratch(t);
  const theme = sampleTheme({ main: { preset: 'default', bgimg: 'assets/bg.png', hiddenicon: 'assets/gone.png', glowcolor: 'red;}' } });
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'bg.png'), 'png');
  sanEngine.writePresetFiles(dir, theme, { name: 'p' });
  assert.equal(sanEngine.refreshPreset(dir), false, 'already current');

  // An older build, carried by a shared package whose block says more than an import would keep.
  const stale = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace(/name="aw-san-engine" content="\d+"/, 'name="aw-san-engine" content="0"');
  fs.writeFileSync(path.join(dir, 'index.html'), stale);
  fs.writeFileSync(path.join(dir, 'layout-ps5.css'), 'left over from a card the theme no longer uses');
  assert.equal(sanEngine.refreshPreset(dir), true);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.equal(sanEngine.engineVersionOf(html), sanEngine.ENGINE_VERSION);
  const main = sanEngine.readEmbeddedTheme(html).types.main;
  assert.equal(main.bgimg, 'assets/bg.png');
  assert.equal(main.hiddenicon, '', 'a file the preset does not carry is not named');
  assert.equal('glowcolor' in main, false, 'a value an import would refuse is refused here too');
  assert.equal(fs.existsSync(path.join(dir, 'layout-ps5.css')), false);

  const plain = scratch(t);
  fs.writeFileSync(path.join(plain, 'index.html'), '<html><body>an ordinary preset</body></html>');
  assert.equal(sanEngine.refreshPreset(plain), false);
  assert.equal(sanEngine.isSanPreset(plain), false);
  assert.equal(sanEngine.refreshPreset(path.join(plain, 'absent')), false);
});
