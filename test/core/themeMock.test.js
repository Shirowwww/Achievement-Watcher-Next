'use strict';

/*
  The sample interface a theme is judged by, in Settings before an import and on a gallery card.

  Two things have to hold for it to be worth showing at all: it has to be built from the theme and
  from nothing else a package supplies, and two runs over the same theme have to produce the same
  document, since the gallery caches a rendered picture by the checksum of the file it came from.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const { buildThemeMock, DESIGN, WINDOW, SAMPLE, DEFAULT_LABELS } = require(path.join(appRoot, 'util', 'themeMock.js'));
const themeLayers = require(path.join(appRoot, 'util', 'themeLayers.js'));

function theme(overrides = {}) {
  const clean = themeLayers.defaultCustomTheme();
  for (const [id, values] of Object.entries(overrides)) Object.assign(clean[id], values);
  return clean;
}

test('the same theme always produces the same document', () => {
  const model = theme({ accent: { color: '#ff00aa' }, bg: { color: '#101820' } });
  assert.equal(buildThemeMock(model), buildThemeMock(model), 'the mock is not deterministic');
  // Two equal models built separately, so it is the values that decide and not object identity.
  assert.equal(buildThemeMock(theme({ accent: { color: '#123456' } })), buildThemeMock(theme({ accent: { color: '#123456' } })));
});

test('the document carries the theme, and the theme is the only thing it carries', () => {
  const html = buildThemeMock(theme({ accent: { color: '#ff00aa' }, card: { color: '#22303d' } }));

  assert.ok(html.includes('#ff00aa'), 'the accent is in the document');
  assert.ok(html.includes('#22303d'), 'so is the card colour');
  // The stylesheet is the app's own generator, so what the preview shows is what the window draws.
  assert.ok(html.includes(themeLayers.buildCustomAppCss(theme({ accent: { color: '#ff00aa' }, card: { color: '#22303d' } })).trim().split('\n')[0]));
});

test('nothing in the document can run', () => {
  const html = buildThemeMock(theme());
  assert.ok(!/<script/i.test(html), 'the mock must never carry a script');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'no inline event handler');
  assert.ok(!/javascript:/i.test(html));
  assert.ok(html.includes("script-src 'none'"), 'and the document says so itself');
  assert.ok(html.includes("default-src 'none'"));
});

test('nothing on the page reaches the network', () => {
  const model = theme({ bg: { image: 'C:/themes/wall.png' }, card: { image: 'C:/themes/card.jpg' } });
  const html = buildThemeMock(model);
  assert.ok(!/https?:\/\//i.test(html), 'the mock names no remote address');
  assert.ok(!/@import/i.test(html));
});

test('a hostile value in the model cannot become markup or a URL', () => {
  const html = buildThemeMock(
    theme({
      accent: { color: '</style><script>alert(1)</script>' },
      bg: { color: 'url(https://evil.invalid/x.png)' },
      text: { color: 'expression(alert(1))' },
    })
  );

  assert.ok(!html.includes('<script>'), 'a colour became markup');
  assert.ok(!html.includes('evil.invalid'), 'a colour became a remote URL');
  assert.ok(!html.includes('expression('), 'a colour became a CSS expression');
});

test('the sample says nothing about whoever is running it', () => {
  const html = buildThemeMock(theme());
  // The sample content is a constant in the module, so a preview cannot leak a library, an
  // account or a path from the machine that rendered it.
  for (const game of SAMPLE.games) assert.ok(html.includes(game.name));
  assert.ok(!/[A-Za-z]:[\\/]Users/i.test(html), 'a path from a machine reached the sample');
  assert.ok(!html.includes(process.env.USERNAME || '\u0000never'), 'the account name reached the sample');
});

/*
  Every layer a theme can set has to appear somewhere, or a preview shows a theme nobody can judge.
  These are the selectors the generated stylesheet paints, so the mock has to use the real ones
  rather than names of its own.
*/
test('the sample shows every layer a theme can paint', () => {
  const html = buildThemeMock(theme());

  for (const [layer, marker] of [
    ['header', 'class="mock-header"'],
    ['panel', 'id="game-list"'],
    ['card, as a tile', 'class="info"'],
    ['card, as a list row', 'class="achievement-list"'],
    ['settings', 'id="settings"'],
    ['accent', 'class="btn-accent"'],
    ['border and muted, as the quiet button', 'class="btn-quiet"'],
  ]) {
    assert.ok(html.includes(marker), `the ${layer} layer has nothing to paint`);
  }
  assert.ok(html.includes('game-box'), 'the library tiles are gone');
});

test('every achievement state a theme has to colour is in the sample', () => {
  assert.deepEqual([...new Set(SAMPLE.achievements.map((entry) => entry.state))].sort(), ['locked', 'rare', 'unlocked']);
});

/*
  The sample covers stay inside the theme's palette. Pushing each tile around the hue wheel was
  tried and looked wrong: eight unrelated colours read as a rainbow of somebody else's artwork, and
  a reader judging a theme cannot tell which colours are the theme's own.
*/
test('the sample cover art invents no colour of its own', () => {
  const html = buildThemeMock(theme({ accent: { color: '#4fd6a4' } }));

  assert.ok(!/hue-rotate|calc\(h \+/.test(html), 'the covers rotate the hue away from the theme');
  // Every cover is the accent faded into the theme's own card colour, and nothing else.
  const covers = [...html.matchAll(/--cover-[ab]: ([^;]+);/g)].map((match) => match[1]);
  assert.ok(covers.length >= 8, 'the covers are gone');
  for (const cover of covers) {
    assert.match(cover, /^color-mix\(in oklab, var\(--accent\) \d{1,3}%, var\(--surface\)\)$/, `"${cover}" is not a theme colour`);
  }

  // They still differ, or eight identical tiles say nothing about the theme either.
  assert.ok(new Set(covers).size >= 6, 'the covers are all the same');
});

test('a layer image is addressed on disk, and only when it exists', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-mock-image-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const image = path.join(dir, 'wall.png');
  fs.writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP8z8DAxIAEmJAZAB0EAQGnLnrCAAAAAElFTkSuQmCC', 'base64'));

  const painted = buildThemeMock(theme({ bg: { image } }));
  assert.ok(painted.includes('file:///'), 'the image is not addressed as a file');
  assert.ok(painted.includes('wall.png'));

  // A path that is not there resolves to nothing rather than to a reference the browser would go
  // looking for.
  const missing = buildThemeMock(theme({ bg: { image: path.join(dir, 'absent.png') } }));
  assert.ok(!missing.includes('absent.png'), 'a missing image was still addressed');
});

test('the labels are translatable, and default to a fixed set', () => {
  const english = buildThemeMock(theme());
  // Every default has to reach the document: a label nothing renders is one nobody translates and
  // nobody notices is wrong.
  for (const [key, label] of Object.entries(DEFAULT_LABELS)) {
    assert.ok(english.includes(label), `the "${key}" label never reaches the document`);
  }

  const french = buildThemeMock(theme(), { labels: { library: 'Bibliothèque', achievements: 'Succès' } });
  assert.ok(french.includes('Bibliothèque'));
  assert.ok(french.includes('Succès'));
  // A label from a caller is text, never markup.
  const hostile = buildThemeMock(theme(), { labels: { library: '<img src=x onerror=alert(1)>' } });
  assert.ok(!hostile.includes('<img'), 'a label became markup');
});

test('a model the editor would not produce is clamped before it is drawn', () => {
  const html = buildThemeMock({ bg: { color: 'nonsense', effect: { enabled: true, blur: 9999 } }, accent: { color: '#0f0' } });
  assert.ok(html.includes('#00ff00') || html.includes('#0f0'), 'a short hex is still a colour');
  assert.ok(!html.includes('9999px'), 'an out of range blur reached the document');
  assert.ok(!html.includes('nonsense'));
});

/*
  A theme may be see-through, and photographed against a blank page such a theme reads as a washed
  out design nobody would install. So the document paints a scene behind the window - and the scene
  has to be a constant, because the gallery caches a rendered picture by the checksum of the file it
  came from and two renders of one theme have to be the same picture.
*/
test('the window is drawn on a fixed scene, not on a blank page', () => {
  const one = buildThemeMock(theme({ bg: { color: '#10182080' } }));
  const two = buildThemeMock(theme({ bg: { color: '#10182080' } }));
  assert.equal(one, two, 'the scene is not deterministic');

  // Whatever the theme is, the scene is the same, so it can never be mistaken for part of it.
  const other = buildThemeMock(theme({ bg: { color: '#ffffff' }, accent: { color: '#ff0000' } }));
  for (const document of [one, other]) {
    assert.match(document, /html \{[^}]*background-color: #0d1119/, 'the scene is missing behind the window');
    assert.match(document, /html \{[^}]*padding:/, 'the window is not inset from the edge of the picture');
    // The frame the app has on a desktop: a rounded, clipped, shadowed window rather than a page.
    assert.match(document, /border-radius: 14px/);
    assert.match(document, /box-shadow: 0 26px 60px/);
  }

  // The scene is drawn, not fetched: nothing here may reach a file or the network.
  const scene = one.slice(one.indexOf('html {'), one.indexOf('.mock-header'));
  assert.ok(!/url\(/i.test(scene), 'the scene loads something instead of drawing itself');
});

// The window keeps the size it always had, so the library still shows the same tiles and the
// in-app preview and a gallery card are still the same picture at different scales.
test('the scene is added around the window, not taken out of it', () => {
  assert.deepEqual(WINDOW, { width: 960, height: 600 });
  assert.ok(DESIGN.width > WINDOW.width && DESIGN.height > WINDOW.height, 'the design frame did not grow with the scene');
  assert.equal((DESIGN.width - WINDOW.width) % 2, 0, 'the window is not centred horizontally');
});
