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

test('the per-tier pictures follow the tier AW Next shows, not the SAN state it maps to', () => {
  const tierFor = (tier, extra = {}) => engine.pictureTier({ tier, percent: 50, thresholds: THRESHOLDS, ...extra });
  // Rare mode sends silver to SAN's rare state, which pairs with gold: the picture must stay silver.
  assert.deepEqual(['gold', 'silver', 'bronze'].map((tier) => tierFor(tier)), ['gold', 'silver', 'bronze']);
  assert.equal(tierFor(''), 'bronze', 'an ordinary unlock gets the plainest picture');
  assert.equal(tierFor('platinum'), 'gold');
  assert.equal(tierFor('', { platinum: true }), 'gold');
  // An older payload with no tier at all grades by the theme's own cut-offs, as SAN does.
  assert.equal(engine.pictureTier({ percent: 20, thresholds: THRESHOLDS }), 'silver');
  // A preset that pins its pictures to one tier keeps it whatever was unlocked.
  for (const fixed of ['bronze', 'silver', 'gold']) {
    assert.deepEqual(['gold', 'silver', 'bronze', '', 'platinum'].map((tier) => tierFor(tier, { fixed })), Array(5).fill(fixed), fixed);
  }
  assert.equal(tierFor('silver', { fixed: 'auto' }), 'silver');
  assert.equal(tierFor('silver', { fixed: '../x' }), 'silver', 'an unknown setting is automatic');

  const decoration = ['assets/b.svg', 'assets/s.svg', 'assets/g.svg'];
  const c = { preset: 'ps5', decorationpos: 1, customicons: { ps5: { decoration } } };
  assert.match(engine.computeProperties(c, { tier: tierFor('silver') })['--decoration'], /s\.svg/);
});

test('each AW Next state can be drawn by a theme of its own, the SAN state still decides the wording', () => {
  const main = { preset: 'ps5' };
  const silver = { preset: 'xboxone' };
  const theme = { thresholds: THRESHOLDS, types: { main }, states: { silver } };
  const pick = (tier, extra = {}) => engine.customisationFor(theme, { tier, mode: 'rare', percent: 50, ...extra });
  assert.equal(pick('silver').customisation, silver);
  assert.equal(pick('silver').type, 'rare');
  assert.equal(pick('silver').state, 'silver');
  assert.equal(pick('gold').customisation, main, 'a state with no theme of its own keeps the preset one');
  assert.equal(pick('').state, 'normal');
  assert.equal(pick('platinum').state, 'platinum');
  assert.equal(pick('bronze', { mode: 'trophy' }).type, 'main');
  // No tier in the payload: the theme's cut-offs name the state.
  assert.equal(engine.customisationFor(theme, { percent: 20 }).state, 'silver');
  assert.equal(engine.customisationFor({ types: { main } }, { tier: 'gold' }).customisation, main);
  assert.equal(engine.customisationFor({ types: { main }, states: { __proto__: null } }, { tier: 'gold' }).customisation, main);
  assert.deepEqual(engine.AW_STATES, ['normal', 'bronze', 'silver', 'gold', 'platinum']);
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
  // SAN's completion popup prints its own two lines, not the achievement that finished the game.
  const done = { ...strings, gameComplete: '100% Complete', gameCompleteDesc: 'All unlocked' };
  assert.deepEqual(engine.textLines({}, { ...info, type: 'plat' }, done), { unlockmsg: 'Bravo', title: '100% Complete', desc: 'All unlocked' });
  assert.equal(engine.textLines({ usecustomtext: true, usegametitledesc: true }, { ...info, type: 'plat' }, done).desc, 'Quake');
  // The game's real PlayStation platinum keeps its own name and description.
  const real = { ...info, type: 'plat', realPlatinum: true, title: 'King', desc: 'Every trophy' };
  assert.deepEqual(engine.textLines({}, real, done), { unlockmsg: 'Bravo', title: 'King', desc: 'Every trophy' });

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

test('a card measures SAN window units against its own card plus the glow room around it', () => {
  // SAN's window is the card plus 25px of glow room on each side (listeners.js setnotifybounds), and
  // its vw/vh/vmax measure that window. AW Next's window fits the largest card of the theme instead.
  for (const file of fs.readdirSync(path.join(engineDir, 'layouts')).filter((name) => name.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(engineDir, 'layouts', file), 'utf8');
    assert.doesNotMatch(css, /\d(?:vw|vh|vmax|vmin)\b/, `${file} measures the window`);
    assert.doesNotMatch(css, /\dcq(?:w|h|max|min)\b/, `${file} measures the card without its glow room`);
  }
  const adapter = fs.readFileSync(path.join(engineDir, 'base.css'), 'utf8').split('/* ---- AW Next')[1] || '';
  assert.match(adapter, /body \{\s*width: var\(--notifywidth\);\s*height: var\(--notifyheight\);/);
  assert.match(adapter, /--sanvw: calc\(\(var\(--notifywidth\) \+ 50px\) \/ 100\);/);
  assert.match(adapter, /--sanvh: calc\(\(var\(--notifyheight\) \+ 50px\) \/ 100\);/);
  assert.match(adapter, /font-size: clamp\(0\.05rem, 0\.05rem \+ 3 \* max\(var\(--sanvw\), var\(--sanvh\)\), 12\.5rem\);/);
});

test('the sync tool turns SAN viewport units into glow-aware card units, signs included', () => {
  const { toCardUnits } = require(path.join(__dirname, '..', '..', 'tools', 'sync-san-notify.js'));
  assert.equal(toCardUnits('width: 30vw;'), 'width: calc(30 * var(--sanvw));');
  assert.equal(toCardUnits('height: 17.5vmax;'), 'height: calc(17.5 * max(var(--sanvw), var(--sanvh)));');
  assert.equal(toCardUnits('--translate: -100vh;'), '--translate: calc(-100 * var(--sanvh));');
  assert.equal(toCardUnits('translate: 0 100vh;'), 'translate: 0 calc(100 * var(--sanvh));');
  assert.equal(toCardUnits('min-width: 2vmin;'), 'min-width: calc(2 * min(var(--sanvw), var(--sanvh)));');
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

test('the window fits each state at the scale the theme gives it, as SAN sizes its window', () => {
  const built = sanEngine.buildPresetFiles(sampleTheme({ main: { preset: 'xqjan', scale: 150 }, rare: { preset: 'windows', scale: 50 }, plat: { preset: 'default' } }));
  // xqjan 353x58 at 150% is 529.5x87; windows 300x100 at 50% is 150x50; default 300x50 at 100%.
  assert.deepEqual(built.size, { width: 530, height: 87 });
  assert.match(built.files['index.html'], /<meta width="530" height="87" \/>/);
  const out = sanEngine.buildPresetFiles(sampleTheme({ main: { preset: 'default', scale: 'huge' }, plat: { preset: 'default', scale: 5000 } }));
  assert.deepEqual(out.size, { width: 3000, height: 500 }, 'a missing scale is 100%, a wild one stops at SAN\'s 1000%');
});

test('a state that glows gets the room SAN keeps around the card for it, at its own scale', () => {
  const plain = sanEngine.buildPresetFiles(sampleTheme({ main: { preset: 'default', glow: false } }));
  assert.deepEqual(plain.size, { width: 300, height: 50 }, 'no glow, no room: the window stays the card');
  const glowing = sanEngine.buildPresetFiles(sampleTheme({ main: { preset: 'default', glow: true, scale: 150 } }));
  // (300 + 2 x 25) x 1.5 by (50 + 2 x 25) x 1.5.
  assert.deepEqual(glowing.size, { width: 525, height: 150 });
  const mixed = sanEngine.windowSize(sampleTheme({ main: { preset: 'windows', glow: false, scale: 200 }, rare: { preset: 'default', glow: true } }));
  assert.deepEqual(mixed, { width: 600, height: 200 }, 'the largest state wins, glowing or not');
});

test('the designer previews a preset with a page rebuilt from its theme, loading the engine from the app', (t) => {
  const dir = scratch(t);
  const theme = sampleTheme({ main: { preset: 'xqjan', glow: true }, rare: { preset: 'windows' } });
  theme.awCanvas = { items: [{ type: 'text', text: '{game}' }] };
  sanEngine.writePresetFiles(dir, theme, { name: 'p' });
  // What the folder's own page says is never run: a shared package could have put anything there.
  fs.writeFileSync(path.join(dir, 'index.html'), fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('</body>', '<script>window.evil = 1</script></body>'));

  const page = sanEngine.previewPage(dir);
  assert.ok(page);
  assert.deepEqual({ width: page.width, height: page.height }, sanEngine.windowSize(page.theme));
  assert.doesNotMatch(page.html, /window\.evil/);
  assert.match(page.html, new RegExp(`<base href="${require('node:url').pathToFileURL(dir).href}/" />`), 'the stylesheets and pictures are the folder\'s own');
  const scripts = [...page.html.matchAll(/<script src="([^"]+)"/gi)].map((match) => path.basename(new URL(match[1]).pathname));
  assert.deepEqual(scripts, ['preview.js', 'engine.js', 'host.js'], 'the stand-in for the popup bridge comes first');
  assert.doesNotMatch(page.html, /AWSanEngine = factory/, 'the engine is loaded, not inlined');
  // The designer draws the items itself, in a stylesheet of its own.
  assert.match(page.html, /<style id="aw-preview-css"><\/style>/);
  assert.doesNotMatch(page.html, /<template id="aw-san-canvas">/);
  assert.equal(page.theme.types.rare.preset, 'windows');

  const plain = scratch(t);
  fs.writeFileSync(path.join(plain, 'index.html'), '<html><body>an ordinary preset</body></html>');
  assert.equal(sanEngine.previewPage(plain), null);
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

// The user asked for no margin a preset brings on its own: a SAN card touches the edge like any other,
// and only the user's distance from the edge moves it inside.
test('a SAN theme brings no margin of its own to where its popup is placed', () => {
  assert.equal(sanEngine.edgeGap, undefined);
  const init = fs.readFileSync(path.join(__dirname, '../../app/electron/init.js'), 'utf8');
  assert.doesNotMatch(init, /sanEngine\.edgeGap|sanGap/);
});

test('a SAN preset can pin its trophy tier and borrow another theme for one AW Next state', (t) => {
  const target = scratch(t);
  const source = scratch(t);
  const asset = (dir, name, bytes) => {
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets', name), bytes);
  };
  asset(target, 'bg.png', 'target picture');
  asset(source, 'bg.png', 'source picture');
  asset(source, 'logo.png', 'logo');
  sanEngine.writePresetFiles(target, sampleTheme({ main: { preset: 'ps5', bgimg: 'assets/bg.png' } }), { name: 'Target' });
  sanEngine.writePresetFiles(source, sampleTheme({ main: { preset: 'xboxone', bgimg: 'assets/bg.png', customicons: { xboxone: { logo: 'assets/logo.png' } } } }), { name: 'Source' });
  fs.writeFileSync(path.join(target, 'aw-package.json'), JSON.stringify({ name: 'Target', sanSounds: { main: { mode: 'file', files: ['own.wav'] } } }));
  fs.writeFileSync(path.join(source, 'aw-package.json'), JSON.stringify({ name: 'Source', sanSounds: { main: { mode: 'file', files: ['borrowed.wav'] } } }));

  assert.deepEqual(sanEngine.awSettingsOf(target), { tierPictures: 'auto', stateFrom: {} });
  assert.deepEqual(sanEngine.updateAwSettings(target, { tierPictures: 'gold', states: { silver: source }, mode: 'rare' }), { ok: true });

  const theme = sanEngine.readEmbeddedTheme(fs.readFileSync(path.join(target, 'index.html'), 'utf8'));
  assert.equal(theme.tierPictures, 'gold');
  assert.equal(theme.states.silver.preset, 'xboxone');
  // Same name, other bytes: copied beside the preset's own picture rather than over it.
  assert.equal(theme.states.silver.bgimg, 'assets/bg-2.png');
  assert.equal(fs.readFileSync(path.join(target, 'assets', 'bg-2.png'), 'utf8'), 'source picture');
  assert.equal(fs.readFileSync(path.join(target, 'assets', 'bg.png'), 'utf8'), 'target picture');
  assert.equal(theme.states.silver.customicons.xboxone.logo, 'assets/logo.png');
  assert.equal(theme.types.main.bgimg, 'assets/bg.png');
  assert.deepEqual(sanEngine.awSettingsOf(target), { tierPictures: 'gold', stateFrom: { silver: path.basename(source) } });
  const manifest = JSON.parse(fs.readFileSync(path.join(target, 'aw-package.json'), 'utf8'));
  assert.deepEqual(manifest.sanSounds.silver.files, ['borrowed.wav']);
  assert.deepEqual(manifest.sanSounds.main.files, ['own.wav']);
  // The borrowed look counts for the cards the page carries, and brings its sound.
  assert.match(fs.readFileSync(path.join(target, 'index.html'), 'utf8'), /<template id="aw-san-layout-xboxone">/);
  assert.equal(sanEngine.presetSound(target, { rarityTier: 'silver', rarityMode: 'rare' }), 'borrowed.wav');
  assert.equal(sanEngine.presetSound(target, { rarityTier: 'gold', rarityMode: 'rare' }), 'own.wav');

  // A rebuild for a newer engine keeps all of it.
  const stale = fs.readFileSync(path.join(target, 'index.html'), 'utf8').replace(/name="aw-san-engine" content="\d+"/, 'name="aw-san-engine" content="0"');
  fs.writeFileSync(path.join(target, 'index.html'), stale);
  assert.equal(sanEngine.refreshPreset(target), true);
  assert.deepEqual(sanEngine.awSettingsOf(target), { tierPictures: 'gold', stateFrom: { silver: path.basename(source) } });

  // Giving the state back, and an automatic tier, leave the block as an import writes it.
  sanEngine.updateAwSettings(target, { tierPictures: 'auto', states: { silver: '' } });
  const back = sanEngine.readEmbeddedTheme(fs.readFileSync(path.join(target, 'index.html'), 'utf8'));
  assert.equal('states' in back || 'stateFrom' in back || 'tierPictures' in back, false);
  assert.equal('silver' in JSON.parse(fs.readFileSync(path.join(target, 'aw-package.json'), 'utf8')).sanSounds, false);

  const plain = scratch(t);
  fs.writeFileSync(path.join(plain, 'index.html'), '<html></html>');
  assert.equal(sanEngine.updateAwSettings(target, { states: { gold: plain } }).error, 'not-san');
  assert.equal(sanEngine.awSettingsOf(plain), null);
});

test('a SAN preset has its own settings edited, checked, and can go back to the imported theme', (t) => {
  const dir = scratch(t);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'bg.png'), 'picture');
  sanEngine.writePresetFiles(dir, sampleTheme({ main: { preset: 'ps5', glowcolor: '#ff0000', bgimg: 'assets/bg.png' }, rare: { preset: 'xboxone' } }), { name: 'Look' });
  fs.writeFileSync(path.join(dir, 'aw-package.json'), JSON.stringify({ name: 'Look' }));

  const look = sanEngine.lookOf(dir);
  assert.deepEqual(look.types, ['main', 'rare']);
  assert.equal(look.values.main.glowcolor, '#ff0000');
  assert.equal(look.fields.glowcolor.kind, 'color');
  assert.equal(look.edited, false);

  assert.deepEqual(sanEngine.updateLook(dir, { type: 'main', changes: { glowcolor: '#00ff00', roundness: 5000, bgimg: 'C:/elsewhere.png', preset: 'nope', usertheme: 'x' } }), { ok: true });
  const theme = () => sanEngine.readEmbeddedTheme(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'));
  assert.equal(theme().types.main.glowcolor, '#00ff00');
  assert.equal(theme().types.main.roundness, 1000, 'bounded like an import');
  assert.equal(theme().types.main.bgimg, 'assets/bg.png', 'a file is never set from here');
  assert.equal(theme().types.main.preset, 'ps5', 'an unknown card is refused');
  assert.equal(theme().types.rare.preset, 'xboxone', 'the other state is untouched');
  assert.equal(sanEngine.lookOf(dir).edited, true);
  assert.equal(sanEngine.updateLook(dir, { type: 'semi', changes: { glow: true } }).error, 'no-such-look');

  // A second edit keeps the first original, not the edited one.
  sanEngine.updateLook(dir, { type: 'main', changes: { glowcolor: '#0000ff' } });
  assert.deepEqual(sanEngine.restoreLook(dir), { ok: true });
  assert.equal(theme().types.main.glowcolor, '#ff0000');
  assert.equal(sanEngine.lookOf(dir).edited, false);
  assert.equal(sanEngine.lookOf(scratch(t)), null);
});

test('a SAN preset carries items added on top of its card, with their pictures, and drops them again', (t) => {
  const dir = scratch(t);
  const shared = scratch(t);
  fs.writeFileSync(path.join(shared, 'star.png'), 'picture');
  sanEngine.writePresetFiles(dir, sampleTheme({ main: { preset: 'ps5' } }), { name: 'Items' });
  const copied = [];
  const copyAsset = (file, target) => {
    copied.push(file);
    fs.copyFileSync(path.join(shared, file), target);
    return true;
  };
  const canvas = {
    items: [
      { kind: 'text', text: 'GG {title}', x: 10, y: 5, w: 120, size: 14 },
      { kind: 'image', file: 'star.png', x: 200, y: 0, w: 40, h: 40 },
    ],
  };
  assert.deepEqual(sanEngine.updateCanvas(dir, canvas, { copyAsset }), { ok: true });
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const theme = sanEngine.readEmbeddedTheme(html);
  assert.equal(theme.awCanvas.items.length, 2);
  assert.match(html, /<template id="aw-san-canvas"><div class="aw-canvas"/);
  assert.match(html, /data-tok="title"/);
  assert.match(html, /url\(["']?canvas\/star\.png["']?\)/,'the picture is read from the preset itself');
  assert.ok(fs.existsSync(path.join(dir, 'canvas', 'star.png')));
  assert.deepEqual(sanEngine.lookOf(dir).canvas.items.map((item) => item.kind), ['text', 'image']);

  // A rebuild for a newer engine keeps them; a look edit too.
  sanEngine.updateLook(dir, { type: 'main', changes: { glow: true } });
  assert.equal(sanEngine.readEmbeddedTheme(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).awCanvas.items.length, 2);

  assert.deepEqual(sanEngine.updateCanvas(dir, { items: [] }, { copyAsset }), { ok: true });
  const bare = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.equal(sanEngine.readEmbeddedTheme(bare).awCanvas, undefined);
  assert.doesNotMatch(bare, /id="aw-san-canvas(-css)?"/);
  assert.ok(!fs.existsSync(path.join(dir, 'canvas', 'star.png')), 'a picture no item uses is removed');
  assert.deepEqual(copied, ['star.png']);
  assert.equal(sanEngine.updateCanvas(scratch(t), canvas, { copyAsset }).error, 'not-san');
});
