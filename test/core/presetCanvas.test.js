'use strict';

// The free layout of a preset: what is stored, what reaches the stylesheet and the page, and how a
// layer over a bundled preset carries it.

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const schema = require(path.join(appRoot, 'util', 'presetSchema.js'));
const generator = require(path.join(appRoot, 'util', 'customPreset.js'));
const layerTool = require(path.join(appRoot, 'util', 'presetLayer.js'));

test('an empty or unreadable layout is the default and changes nothing', () => {
  for (const raw of [undefined, null, '', 'not json', '[]', 42, { move: 'x', items: 'y' }]) {
    assert.deepEqual(schema.normalizeCanvas(raw), { move: {}, items: [] });
  }
  assert.deepEqual(schema.normalizeOptions({}).canvas, { move: {}, items: [] });
  assert.equal(generator.canvasCss({}), '');
  assert.equal(generator.canvasMarkup({}), '');
  assert.ok(generator.buildCustomPresetHtml({}).includes('<div class="ach"><div class="icon">'), 'the card markup must not change');
});

test('moved parts are clamped, unknown parts dropped, and a part back home is not stored', () => {
  const canvas = schema.normalizeCanvas(
    JSON.stringify({ move: { icon: { x: 9999, y: -12.345, r: 400, s: 0 }, title: { x: 0, y: 0, r: 0, s: 1 }, hostile: { x: 5 } } })
  );
  assert.deepEqual(canvas.move, { icon: { x: 600, y: -12.3, r: 180, s: 0.2 } });
});

test('items are validated one by one and capped in number', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'text', text: 'Hi\u0000 there', color: 'red;}', weight: 650, x: 'a' },
      { kind: 'image', file: '../escape.png' },
      { kind: 'image', file: 'star.png', radius: 99, fit: { w: 40, ar: 2 } },
      { kind: 'shape', shape: 'hexagon', fill: 'rgba(0;}body{x', radius: -5 },
      { kind: 'script' },
    ],
  });
  assert.equal(canvas.items.length, 3, 'a path and an unknown kind are dropped');
  const [text, image, shape] = canvas.items;
  assert.equal(text.text, 'Hi there');
  assert.equal(text.color, 'text', 'only hex or a named role reaches the stylesheet');
  assert.equal(text.weight, 700);
  assert.equal(text.x, 0);
  assert.equal(image.radius, 50);
  assert.deepEqual(image.fit, { x: 0, y: 0, w: 40, ar: 2 });
  assert.equal(shape.shape, 'rect');
  assert.equal(shape.fill, '#ffffff');
  assert.equal(shape.radius, 0);

  const many = schema.normalizeCanvas({ items: Array.from({ length: 60 }, () => ({ kind: 'shape' })) });
  assert.equal(many.items.length, schema.CANVAS_MAX_ITEMS);
  assert.deepEqual(schema.canvasFiles({ items: [image, image, { kind: 'image', file: 'b.webp' }] }), ['star.png', 'b.webp']);
});

test('a shape keeps its plain look until given a gradient, an outline, a shadow or a blur', () => {
  const [plain] = schema.normalizeCanvas({ items: [{ kind: 'shape', shape: 'rect', fill: '#123456' }] }).items;
  assert.equal(plain.fillMode, 'solid');
  assert.equal(plain.stroke + plain.shadow + plain.blur, 0);
  const plainCss = generator.canvasCss({ items: [plain] });
  assert.match(plainCss, /background: #123456;/);
  assert.doesNotMatch(plainCss, /border:|filter:/);

  const [styled] = schema.normalizeCanvas({
    items: [{ kind: 'shape', shape: 'rect', fillMode: 'gradient', fill: '#ff0000', fill2: 'blue;}', angle: 90, stroke: 99, strokeColor: '#00ff00', shadow: 9, blur: 3 }],
  }).items;
  assert.equal(styled.fill2, '#4aa3ff', 'a second colour is hex like the first');
  assert.equal(styled.stroke, 20);
  const css = generator.canvasCss({ items: [styled] });
  assert.match(css, /background: linear-gradient\(90deg, #ff0000, #4aa3ff\);/);
  assert.match(css, /border: 20px solid #00ff00;/);
  assert.match(css, /filter: drop-shadow\(0 3px 9px rgba\(0, 0, 0, 0\.55\)\) blur\(3px\);/);
  assert.match(generator.canvasCss({ items: [{ ...styled, fillMode: 'none' }] }), /background: transparent;/);
});

test('triangles, diamonds, stars and arrows are SVG polygons painted from checked values only', () => {
  for (const shape of ['triangle', 'diamond', 'star', 'arrow']) {
    const markup = generator.canvasMarkup({ items: [{ kind: 'shape', shape, fill: '#abcdef', stroke: 2, strokeColor: '#010203' }] });
    assert.match(markup, /<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="[\d., ]+" fill="#abcdef" stroke="#010203" stroke-width="2"/, shape);
  }
  const gradient = generator.canvasMarkup({ items: [{ kind: 'shape', shape: 'star', fillMode: 'gradient', fill: '#111111', fill2: '#222222', angle: 180 }] });
  assert.match(gradient, /<linearGradient id="aw-cv-g0" gradientTransform="rotate\(90 0\.5 0\.5\)">/);
  assert.match(gradient, /fill="url\(#aw-cv-g0\)"/);
  assert.match(generator.canvasMarkup({ items: [{ kind: 'shape', shape: 'arrow', fillMode: 'none' }] }), /fill="none"(?! stroke)/);
  assert.equal(generator.canvasMarkup({ items: [{ kind: 'shape', shape: 'rect' }] }), '<div class="aw-canvas" aria-hidden="true"><div data-i="0" data-kind="shape"></div></div>');
});

test('an accent shape takes the state colour, so it follows bronze, silver, gold and platinum', () => {
  assert.equal(schema.normalizeCanvas({ items: [{ kind: 'shape', shape: 'rect', fillMode: 'accent' }] }).items[0].fillMode, 'accent');
  assert.match(generator.canvasCss({ items: [{ kind: 'shape', shape: 'rect', fillMode: 'accent' }] }), /background: var\(--accent\);/);
  assert.match(generator.canvasMarkup({ items: [{ kind: 'shape', shape: 'star', fillMode: 'accent' }] }), /<polygon points="[\d., ]+" style="fill: var\(--accent\)"\/>/);
});

test('a shape or an icon can wear one tier colour whatever state the popup is in', () => {
  const css = generator.canvasCss({ items: [{ kind: 'shape', shape: 'rect', fillMode: 'gold' }, { kind: 'shape', shape: 'ellipse', fillMode: 'bronze' }] });
  assert.match(css, /\[data-i="0"\] \{[^}]*background: var\(--rare-accent, #ffd24e\);/);
  assert.match(css, /\[data-i="1"\] \{[^}]*background: var\(--rare-bronze, #cd7f32\);/);
  assert.match(generator.canvasMarkup({ items: [{ kind: 'shape', shape: 'star', fillMode: 'platinum' }] }), /style="fill: var\(--platinum-accent, #cfe3ff\)"/);
});

test('an icon draws a built-in outline filled with its paint, and an unknown one falls back to the trophy', () => {
  const canvas = schema.normalizeCanvas({ items: [{ kind: 'icon', icon: 'crown', shadow: 6 }, { kind: 'icon', icon: '<script>' }] });
  assert.deepEqual(
    canvas.items.map((item) => [item.icon, item.fillMode]),
    [['crown', 'accent'], ['trophy', 'accent']]
  );
  const css = generator.canvasCss(canvas);
  assert.match(css, /\[data-i="0"\] > span \{[^}]*background: var\(--accent\);[^}]*mask: url\("data:image\/svg\+xml,[^"]+"\) center \/ contain no-repeat;/);
  assert.match(css, /\[data-i="0"\] \{[^}]*filter: drop-shadow/, 'the shadow sits on the item, outside the mask');
  assert.ok(css.includes(encodeURIComponent(schema.CANVAS_ICONS.crown)));
  assert.match(generator.canvasMarkup(canvas), /<div data-i="0" data-kind="icon"><span><\/span><\/div>/);
  for (const [name, d] of Object.entries(schema.CANVAS_ICONS)) assert.match(d, /^[MmLlHhVvCcSsAaZz\d\s.,-]+$/, `${name} is a bare path`);
});

test('an item an older layout kept to some states is switched off in the others', () => {
  const items = schema.normalizeCanvas({
    items: [
      { kind: 'icon', states: ['gold', 'nope', 'bronze', 'gold'] },
      { kind: 'icon', states: [...schema.CANVAS_STATES] },
      { kind: 'icon', states: [] },
      { kind: 'icon', states: 'gold', off: 'yes', lock: 1 },
      { kind: 'text', text: 'x', off: true, lock: true },
    ],
  }).items;
  const off = { off: true };
  assert.deepEqual(items[0].tiers, { normal: off, silver: off, platinum: off, progress: off });
  assert.equal(items[0].states, undefined, 'the old field is not written back');
  for (const item of items.slice(1, 4)) assert.deepEqual([item.tiers, item.off, item.lock], [undefined, undefined, undefined]);
  assert.deepEqual([items[4].off, items[4].lock], [true, true]);
  const css = generator.canvasCss({ items: [items[0], items[4], { kind: 'icon' }] });
  assert.match(css, /\.ach:not\(:is\(\.tier-bronze, \.tier-gold\)\) > \.aw-canvas > \[data-i="0"\] \{ display: none !important; \}/);
  assert.match(css, /\.ach > \.aw-canvas > \[data-i="1"\] \{ display: none !important; \}/, 'a switched-off item is never drawn');
  assert.doesNotMatch(css, /\[data-i="2"\] \{ display: none/);
  assert.match(generator.canvasCss({ items: [items[0]] }, { editing: true }), /\[data-i="0"\] \{ opacity: 0\.25 !important;/, 'the editor still shows it, faintly');
});

test('a tier keeps only what it changes on an item, and never what every state shares', () => {
  const canvas = schema.normalizeCanvas({
    items: [{ kind: 'shape', shape: 'rect', x: 0, y: 0, w: 50, h: 20, tiers: { gold: { w: 80, lock: true, back: true }, silver: { w: 50 }, nope: { w: 9 } } }],
  });
  assert.deepEqual(canvas.items[0].tiers, { gold: { w: 80 } }, 'an equal value, a shared key and an unknown state leave nothing');
  assert.equal(schema.canvasItemIn(canvas.items[0], 'gold').w, 80);
  assert.equal(schema.canvasItemIn(canvas.items[0], 'normal').w, 50);
  assert.equal(schema.canvasItemIn(canvas.items[0], 'gold').tiers, undefined);
  assert.equal(JSON.stringify(schema.normalizeCanvas(canvas)), JSON.stringify(canvas), 'a stored layout reads back the same');
});

test('an item a tier changes is drawn once per look, each shown in its own states', () => {
  const canvas = { items: [{ kind: 'shape', shape: 'star', x: 0, y: 0, w: 40, h: 40, fillMode: 'gradient', tiers: { gold: { w: 80 }, platinum: { off: true } } }] };
  const markup = generator.canvasMarkup(canvas);
  assert.match(markup, /<div data-i="0" data-v="0" data-kind="shape">/);
  assert.match(markup, /<div data-i="0" data-v="1" data-kind="shape">/);
  assert.ok(markup.includes('id="aw-cv-g0-0"') && markup.includes('id="aw-cv-g0-1"'), 'each copy has its own gradient');
  const css = generator.canvasCss(canvas);
  assert.match(css, /\[data-i="0"\]\[data-v="1"\] \{[^}]*width: 80px;/);
  assert.match(css, /\.ach:not\(:is\(\.tier-gold\)\) > \.aw-canvas > \[data-i="0"\]\[data-v="1"\] \{ display: none !important; \}/);
  assert.match(css, /\.ach:not\(:is\(:not\(\.state-rare[^{]*\.tier-silver[^{]*\)\) > \.aw-canvas > \[data-i="0"\]\[data-v="0"\] \{ display: none !important; \}/);
  const editing = generator.canvasCss(canvas, { editing: true });
  assert.match(editing, /\.ach:not\(:is\(\.tier-gold\)\) > \.aw-canvas > \[data-i="0"\]\[data-v="1"\] \{ display: none !important; \}/, 'the other look is never shown');
  assert.match(editing, /\.ach:not\(:is\([^{]*\)\) > \.aw-canvas > \[data-i="0"\]\[data-v="0"\] \{ opacity: 0\.25 !important;/, 'switched off on platinum, faint there');
  assert.doesNotMatch(generator.canvasMarkup({ items: [{ kind: 'icon' }] }), /data-v/, 'an item no tier changes keeps one element');
});

test('a tier moves, hides and restyles the card parts for itself only', () => {
  const canvas = {
    move: { icon: { x: 4 } },
    style: { title: { size: 20 } },
    tiers: { gold: { move: { title: { y: 6 } }, style: { title: { size: 24 } }, hidden: { meta: true } }, silver: { move: { icon: { x: 4 } } } },
  };
  const css = generator.canvasCss(canvas);
  assert.match(css, /^\.ach \.icon \{ translate: 4px 0px/m, 'a part every state places alike keeps its plain rule');
  assert.match(css, /^\.ach:is\(\.tier-gold\) \.title \{ translate: 0px 6px/m);
  assert.match(css, /^\.ach:is\(\.tier-gold\) \.meta \{ visibility: hidden !important; \}/m);
  assert.match(css, /\.ach:is\(\.tier-gold\) \.title \{ font-size: 24px !important;/);
  assert.match(css, /\.ach:is\([^{]*\.tier-silver[^{]*\) \.title \{ font-size: 20px !important;/);
  assert.ok(css.includes('.ach .text_wrap { overflow: visible !important;'), 'a line moved in one state lets the column overflow');
});

test('the popup makes room for the largest look a tier gives an item', () => {
  const plain = generator.presetBoxSize({ canvas: { items: [{ kind: 'shape', shape: 'rect', x: 0, y: 0, w: 40, h: 20 }] } });
  const grown = generator.presetBoxSize({ canvas: { items: [{ kind: 'shape', shape: 'rect', x: 0, y: 0, w: 40, h: 20, tiers: { gold: { x: -30 } } }] } });
  assert.equal(grown.width, plain.width + 30);
  const goldOnly = generator.presetBoxSize({ canvas: { items: [{ kind: 'shape', shape: 'rect', x: -50, y: 0, w: 40, h: 20, off: true, tiers: { gold: { off: null, x: -30 } } }] } });
  assert.equal(goldOnly.width, plain.width + 30, 'a look no state draws takes no room');
});

test('the popup grows for what touches the card and leaves out what floats away from it', () => {
  const plain = generator.presetBoxSize({});
  const touching = { items: [{ kind: 'shape', shape: 'rect', x: -40, y: 10, w: 60, h: 20 }] };
  const grown = generator.presetBoxSize({ canvas: touching });
  assert.equal(grown.width, plain.width + 40);
  assert.equal(grown.height, plain.height);
  assert.match(generator.buildCustomPresetCss({ canvas: touching }), /\.ach \{ left: calc\(50% \+ 20px\); top: calc\(50% \+ 0px\); \}/);

  const floating = { items: [{ kind: 'shape', shape: 'rect', x: 900, y: 300, w: 40, h: 40 }] };
  assert.deepEqual(generator.presetBoxSize({ canvas: floating }), plain, 'a detached item costs the popup nothing');
  assert.match(generator.buildCustomPresetCss({ canvas: floating }), /\[data-i="0"\] \{ display: none; \}/);
  const editing = generator.buildCustomPresetCss({ canvas: floating }, { editing: true });
  assert.doesNotMatch(editing, /\[data-i="0"\] \{ display: none; \}/);
  assert.match(editing, /\[data-i="0"\] \{ opacity: 0\.35;/, 'the designer still shows it, faded');
  // The designer grows its area evenly for what lies off the card, up to a cap, and the card stays
  // centred in it; with nothing off the card it is barely bigger than the card.
  const pad = generator.presetBoxSize({}, { editing: true }).width - plain.width;
  assert.ok(pad > 0 && pad <= 60);
  assert.equal(generator.presetBoxSize({ canvas: touching }, { editing: true }).width, plain.width + pad + 40 * 2);
  assert.equal(generator.presetBoxSize({ canvas: floating }, { editing: true }).width, plain.width + pad + generator.CANVAS_EDIT_ROOM.x * 2);
  assert.doesNotMatch(generator.buildCustomPresetCss({ canvas: touching }, { editing: true }), /\.ach \{ left: calc/, 'the card stays centred while editing');
});

test('a card given a height is at least that tall, and its window grows to hold it', () => {
  const plain = generator.presetBoxSize({});
  assert.deepEqual(generator.presetBoxSize({ minHeight: 40 }), plain, 'a height under the content changes nothing');
  assert.equal(generator.presetBoxSize({ minHeight: 200 }).height, 200 + (plain.height - 88));
  assert.match(generator.buildCustomPresetCss({ minHeight: 200 }), /min-height: var\(--min-height\);[\s\S]*--min-height: 200px;|--min-height: 200px;[\s\S]*min-height: var\(--min-height\);/);
});

test('the stylesheet moves parts with the individual transform properties', () => {
  const css = generator.canvasCss({ move: { icon: { x: 10, y: -4, r: 15, s: 1.5 } } });
  assert.equal(css, '.ach .icon { translate: 10px -4px !important; rotate: 15deg !important; scale: 1.5 !important; }');
  assert.doesNotMatch(css, /text_wrap/, 'moving the icon leaves the text column clipping as it was');
  assert.match(generator.canvasCss({ move: { title: { x: 30 } } }), /\.ach \.text_wrap \{ overflow: visible !important;/);
});

test('items get one rule each, behind or in front of the text, and pictures come from assetUrl', () => {
  const canvas = {
    items: [
      { kind: 'text', text: 'GG', x: 10, y: 5, w: 120, size: 20, color: 'accent', upper: true },
      { kind: 'image', file: 'star.png', x: 300, y: 0, w: 50, h: 50, back: true, fit: { x: -5, y: -5, w: 60, ar: 1 } },
      { kind: 'shape', shape: 'ellipse', fill: '#ff0000', w: 20, h: 20 },
    ],
  };
  const css = generator.canvasCss(canvas, { assetUrl: (name) => `data:image/png;base64,${name}` });
  assert.match(css, /\[data-i="0"\] \{ left: 10px; top: 5px; width: 120px; rotate: 0deg; opacity: 1; z-index: 2; font-size: 20px;[^}]*color: var\(--accent, #ffffff\);[^}]*text-transform: uppercase;/);
  assert.match(css, /\[data-i="1"\] \{[^}]*height: 50px;[^}]*z-index: -1;[^}]*url\(['"]?data:image\/png;base64,star\.png['"]?\)[^}]*background-size: 60px 60px; background-position: -5px -5px;/);
  assert.match(css, /\[data-i="2"\] \{[^}]*background: #ff0000; border-radius: 50%;/);
  assert.match(css, /\.ach > \.aw-canvas \{ position: absolute !important; inset: 0; z-index: auto !important;/);
});

test('item text is escaped in the page, whichever way it gets there', () => {
  const canvas = { items: [{ kind: 'text', text: '<img src=x onerror=alert(1)> & "q"' }] };
  const markup = generator.canvasMarkup(canvas);
  assert.equal(markup, '<div class="aw-canvas" aria-hidden="true"><div data-i="0" data-kind="text">&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;</div></div>');
  assert.ok(generator.buildCustomPresetHtml({ canvas }).includes(`<div class="ach">${markup}<div class="icon">`));
  assert.ok(generator.buildPresetPreviewHtml({ canvas }).includes(markup));
  assert.ok(generator.canvasScript(canvas).includes(JSON.stringify(markup)));
});

test('a text item follows the card font unless it names a family', () => {
  const [card, serif, bogus] = schema.normalizeCanvas({
    items: [{ kind: 'text' }, { kind: 'text', font: 'serif' }, { kind: 'text', font: 'Comic;}' }],
  }).items;
  assert.equal(card.font, 'card');
  assert.equal(serif.font, 'serif');
  assert.equal(bogus.font, 'card', 'only a known family reaches the stylesheet');
  const css = generator.canvasCss({ items: [card, serif] });
  assert.doesNotMatch(css, /\[data-i="0"\][^}]*font-family/);
  assert.match(css, new RegExp(`\\[data-i="1"\\][^}]*font-family: ${schema.FONT_STACKS.serif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`));
});

test('a text item can carry its own imported font, declared once per file', () => {
  const items = schema.normalizeCanvas({
    items: [
      { kind: 'text', fontFile: 'Brand.ttf' },
      { kind: 'text', fontFile: 'Other.woff2', font: 'serif' },
      { kind: 'text', fontFile: 'Brand.ttf' },
      { kind: 'text', fontFile: '../escape.ttf' },
      { kind: 'text', fontFile: 'picture.png' },
    ],
  }).items;
  assert.deepEqual(items.map((item) => item.fontFile), ['Brand.ttf', 'Other.woff2', 'Brand.ttf', '', '']);
  assert.deepEqual(schema.canvasFonts({ items }), ['Brand.ttf', 'Other.woff2']);
  const css = generator.canvasCss({ items }, { assetUrl: (name) => `data:font/x;base64,${name}` });
  assert.equal(css.match(/@font-face/g).length, 2);
  assert.match(css, /@font-face \{ font-family: 'AW Item Font 1'; src: url\(['"]?data:font\/x;base64,Other\.woff2['"]?\) format\('woff2'\);/);
  assert.match(css, /\[data-i="0"\][^}]*font-family: 'AW Item Font 0', var\(--font, sans-serif\);/);
  assert.match(css, /\[data-i="1"\][^}]*font-family: 'AW Item Font 1', Georgia/);
  assert.match(css, /\[data-i="2"\][^}]*font-family: 'AW Item Font 0',/);
  assert.doesNotMatch(css, /\[data-i="3"\][^}]*font-family/);

  const layer = { base: 'Xbox', sections: ['canvas'], options: { canvas: { items } } };
  assert.deepEqual(layerTool.layerAssets(layer).canvasFonts, ['Brand.ttf', 'Other.woff2']);
  assert.deepEqual(layerTool.layerAssets({ ...layer, sections: ['accent'] }).canvasFonts, []);
});

test('replacement patterns in item text reach the page as typed', () => {
  const canvas = { items: [{ kind: 'text', text: "$& $` $' $$" }] };
  const html = generator.buildCustomPresetHtml({ canvas });
  assert.ok(html.includes(generator.canvasMarkup(canvas)), 'the item text was rewritten on its way into the page');
  assert.equal(html.split('<div class="ach">').length, 2, 'the card opening tag was duplicated into the item');
});

test('a layer carries the layout only when its canvas section is on', () => {
  const canvas = { move: { icon: { x: 4 } }, items: [{ kind: 'image', file: 'star.png' }] };
  const on = { base: 'Xbox', sections: ['canvas'], options: { canvas } };
  const off = { base: 'Xbox', sections: ['accent'], options: { canvas } };
  assert.match(layerTool.buildLayerCss(on), /\.ach \.icon \{ translate: 4px 0px/);
  assert.doesNotMatch(layerTool.buildLayerCss(off), /translate/);
  assert.ok(layerTool.layerCanvasScript(on).includes('aw-canvas'));
  assert.equal(layerTool.layerCanvasScript(off), '');
  assert.equal(layerTool.layerCanvasScript({ base: 'Xbox', sections: ['canvas'], options: { canvas: { move: { icon: { x: 4 } } } } }), '', 'no items, no script');
  assert.deepEqual(layerTool.layerAssets(on).canvasImages, ['star.png']);
  assert.deepEqual(layerTool.layerAssets(off).canvasImages, []);
  assert.deepEqual(Object.keys(layerTool.layerOptions(layerTool.normalizeLayer(on))), ['canvas']);
});

test('a card line keeps only the look the user changed, from checked values', () => {
  const canvas = schema.normalizeCanvas({
    style: {
      title: { color: '#ff0000', size: 200, weight: 650, upper: false, align: 'center', font: 'serif', fontFile: '../x.ttf' },
      detail: { color: 'red;}body{', size: '' },
      icon: { color: '#00ff00' },
      meta: { color: 'accent', fontFile: 'Brand.woff2' },
    },
  });
  assert.deepEqual(canvas.style, {
    title: { color: '#ff0000', size: 96, upper: false, align: 'center', font: 'serif' },
    meta: { color: 'accent', fontFile: 'Brand.woff2' },
  });
  assert.deepEqual(schema.canvasFonts(canvas), ['Brand.woff2'], 'a restyled line packages its font like an added text');
});

test('a restyled line wins over the preset text settings, reaching into its spans', () => {
  const css = generator.canvasCss({ style: { meta: { color: 'accent', size: 14, upper: true }, progress: { align: 'right' } } });
  assert.match(css, /\.ach \.meta, \.ach \.meta \* \{ color: var\(--accent, #ffffff\) !important; text-transform: uppercase !important;/);
  assert.match(css, /\.ach \.meta \{ font-size: 14px !important; \}/);
  assert.match(css, /\.ach \.progress_label \{ text-align: right !important; align-self: flex-end !important; \}/);
  assert.doesNotMatch(css, /@font-face/, 'no font, no @font-face');
  const withFont = generator.canvasCss({ style: { title: { fontFile: 'Brand.woff2' } } });
  assert.match(withFont, /@font-face \{ font-family: 'AW Item Font 0'/, 'a line font is declared without any added item');
  assert.match(withFont, /\.ach \.title, \.ach \.title \* \{ font-family: 'AW Item Font 0', var\(--font, sans-serif\) !important; \}/);
});

test('parts and items share one stacking order, and an order back to normal is not stored', () => {
  const items = [{ kind: 'text', text: 'a' }, { kind: 'text', text: 'b', back: true }];
  assert.equal(schema.normalizeCanvas({ items, order: [1, 'icon', 'meta', 'title', 'detail', 'progress', 0] }).order, undefined);
  const canvas = schema.normalizeCanvas({ items, order: ['icon', 0, 'title', 'hostile', 0, 7] });
  assert.deepEqual(canvas.order, ['icon', 0, 'title', 1, 'meta', 'detail', 'progress']);
  assert.deepEqual(canvas.items.map((item) => item.back), [false, false], '`back` follows the order for older builds');
  const css = generator.canvasCss(canvas);
  assert.match(css, /\.ach \.text_wrap \{ z-index: auto !important;/, 'the text column must not trap its lines');
  assert.match(css, /\.ach \.icon \{ z-index: 1 !important; \}/);
  assert.match(css, /\.ach \.title \{ z-index: 3 !important; \}/);
  assert.match(css, /\[data-i="0"\] \{[^}]*z-index: 2;/);
  assert.match(css, /\[data-i="1"\] \{[^}]*z-index: 4;/);
});

test('a stored order follows its items past one the schema drops', () => {
  const canvas = schema.normalizeCanvas({ items: [{ kind: 'script' }, { kind: 'text', text: 'kept' }], order: [1, 'icon', 'meta', 'title', 'detail', 'progress'] });
  assert.equal(canvas.items.length, 1);
  assert.equal(canvas.items[0].back, true, 'the kept item stays at the bottom where the order put it');
  assert.equal(canvas.order, undefined);
});

test('a text holds the popup words as empty spans, and nothing else becomes markup', () => {
  const html = generator.canvasMarkup({ items: [{ kind: 'text', text: '{game} - {title} {nope} <b>{tier}</b> {rarity}{detail}' }] });
  assert.ok(
    html.includes(
      '<span data-tok="game"></span> - <span data-tok="title"></span> {nope} &lt;b&gt;<span data-tok="tier"></span>&lt;/b&gt; <span data-tok="rarity"></span><span data-tok="detail"></span>'
    ),
    html
  );
  assert.ok(generator.PRESET_ENGINE.includes("querySelectorAll('.aw-canvas [data-tok]')"), 'the engine fills the spans');
});

test('the words for {tier} are kept only while a text says {tier}, checked and escaped', () => {
  const words = { gold: '  Or "1" </style>', silver: 'x'.repeat(40), bronze: '', hostile: 'no', platinum: 7 };
  assert.equal(schema.normalizeCanvas({ items: [{ kind: 'text', text: 'no token' }], words }).words, undefined);
  const canvas = schema.normalizeCanvas({ items: [{ kind: 'text', text: 'Trophy {tier}' }], words });
  assert.deepEqual(canvas.words, { silver: 'x'.repeat(24), gold: 'Or "1" </style>' });
  const css = generator.canvasCss(canvas);
  assert.ok(css.includes('.ach.tier-gold > .aw-canvas [data-tok="tier"]::after { content: "Or \\22 1\\22  \\3c /style>"; }'), css);
  assert.doesNotMatch(css, /<\/style>/i, 'a word cannot close the stylesheet');
});

test('an entrance is stored with its delay, played with the card and left out while editing', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'shape', enter: 'rise', delay: 123.4 },
      { kind: 'shape', enter: 'none', delay: 500 },
      { kind: 'shape', enter: 'explode' },
      { kind: 'icon', enter: 'pop', delay: 99999 },
    ],
  });
  assert.deepEqual(
    canvas.items.map(({ enter, delay }) => [enter, delay]),
    [
      ['rise', 120],
      [undefined, undefined],
      [undefined, undefined],
      ['pop', 3000],
    ]
  );
  const css = generator.canvasCss(canvas);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{/);
  assert.match(css, /@keyframes aw-cv-rise \{ from \{ opacity: 0; transform: translateY\(14px\); \} \}/);
  assert.match(css, /\.ach\.active > \.aw-canvas > \[data-i="0"\] \{ animation: aw-cv-rise 480ms [^;]+ 120ms both; \}/);
  assert.match(css, /\[data-i="3"\] \{ animation: aw-cv-pop 480ms cubic-bezier\(0\.34, 1\.56, 0\.64, 1\) 3000ms both; \}/);
  assert.doesNotMatch(css, /data-i="1"\] \{ animation/);
  assert.doesNotMatch(generator.canvasCss(canvas, { editing: true }), /animation:/);
});

test('a star, an arrow and a triangle take their own settings, stored only when changed', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'shape', shape: 'star', points: 99, depth: 3 },
      { kind: 'shape', shape: 'arrow', head: 30, shaft: 60 },
      { kind: 'shape', shape: 'triangle', apex: 0 },
      { kind: 'shape', shape: 'star', points: 5, depth: 42 },
      { kind: 'shape', shape: 'rect', points: 7, apex: 10 },
    ],
  });
  const [star, arrow, triangle, plainStar, rect] = canvas.items;
  assert.deepEqual([star.points, star.depth], [12, 10]);
  assert.deepEqual([arrow.head, arrow.shaft], [30, 60]);
  assert.equal(triangle.apex, 0);
  assert.ok(!('points' in plainStar) && !('depth' in plainStar), 'the default star has one spelling');
  assert.ok(!('points' in rect) && !('apex' in rect), 'a rectangle has none of them');
  const markup = generator.canvasMarkup(canvas);
  assert.match(markup, /data-i="1"[^>]*><svg[^>]*><polygon points="0,20 70,20 70,0 100,50 70,100 70,80 0,80"/);
  assert.match(markup, /data-i="2"[^>]*><svg[^>]*><polygon points="0,0 100,100 0,100"/);
  const starPoints = /data-i="0"[^>]*><svg[^>]*><polygon points="([^"]+)"/.exec(markup)[1].split(' ');
  assert.equal(starPoints.length, 24, 'twelve branches');
  const ys = starPoints.map((point) => Number(point.split(',')[1]));
  assert.deepEqual([Math.min(...ys), Math.max(...ys)], [0, 100], 'a star fills its box, so its handles frame it');
  assert.match(generator.canvasMarkup({ items: [{ kind: 'shape', shape: 'arrow' }] }), /points="0,30 58,30 58,0 100,50 58,100 58,70 0,70"/, 'the default arrow is unchanged');
});

test('rounded corners turn a polygon into a path drawn at the size of the item', () => {
  const canvas = schema.normalizeCanvas({ items: [{ kind: 'shape', shape: 'triangle', w: 120, h: 60, round: 999 }, { kind: 'shape', shape: 'diamond', round: 0 }] });
  assert.equal(canvas.items[0].round, 100);
  assert.ok(!('round' in canvas.items[1]));
  const markup = generator.canvasMarkup(canvas);
  assert.match(markup, /data-i="0"[^>]*><svg viewBox="0 0 120 60" preserveAspectRatio="none"><path d="M[\d. ]+(L[\d. ]+Q[\d. ]+)+Z"/);
  assert.match(markup, /data-i="1"[^>]*><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon /);
});

test('an outline can be dashed or dotted, a line included', () => {
  const css = generator.canvasCss({
    items: [
      { kind: 'shape', shape: 'rect', stroke: 3, strokeColor: '#ff0000', dash: 'dashed' },
      { kind: 'shape', shape: 'line', fill: '#00ff00', h: 4, dash: 'dotted' },
      { kind: 'shape', shape: 'line', fill: '#00ff00', h: 2, dash: 'dashed' },
      { kind: 'shape', shape: 'rect', stroke: 3, dash: 'wavy' },
    ],
  });
  assert.match(css, /\[data-i="0"\] \{[^}]*border: 3px dashed #ff0000;/);
  assert.match(css, /\[data-i="1"\] \{[^}]*background: radial-gradient\(circle closest-side, #00ff00 96%, transparent\) 0 0 \/ 8px 4px repeat-x;/);
  assert.match(css, /\[data-i="2"\] \{[^}]*background: repeating-linear-gradient\(90deg, #00ff00 0 6px, transparent 6px 10px\);/);
  assert.match(css, /\[data-i="3"\] \{[^}]*border: 3px solid/, 'an unknown style is a plain outline');
  const markup = generator.canvasMarkup({ items: [{ kind: 'shape', shape: 'star', w: 50, h: 50, stroke: 2, dash: 'dotted' }] });
  assert.match(markup, /<svg viewBox="0 0 50 50"[^>]*><polygon points="[\d., ]+"[^>]*stroke-dasharray="0 4" stroke-linecap="round"/);
});

test('a radial gradient paints shapes and icons from the middle out', () => {
  const css = generator.canvasCss({ items: [{ kind: 'shape', shape: 'rect', fillMode: 'radial', fill: '#111111', fill2: '#222222' }, { kind: 'icon', fillMode: 'radial', fill: '#333333', fill2: '#444444' }] });
  assert.match(css, /\[data-i="0"\] \{[^}]*background: radial-gradient\(closest-side, #111111, #222222\);/);
  assert.match(css, /\[data-i="1"\] > span \{[^}]*background: radial-gradient\(closest-side, #333333, #444444\);/);
  const markup = generator.canvasMarkup({ items: [{ kind: 'shape', shape: 'diamond', fillMode: 'radial', fill: '#111111', fill2: '#222222' }] });
  assert.match(markup, /<radialGradient id="aw-cv-g0" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#111111"\/><stop offset="1" stop-color="#222222"\/><\/radialGradient>/);
  assert.match(markup, /fill="url\(#aw-cv-g0\)"/);
});

test('shapes, icons and pictures can be mirrored, texts cannot', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'shape', flipX: true },
      { kind: 'icon', flipX: true, flipY: true },
      { kind: 'image', file: 'a.png', flipY: true },
      { kind: 'text', text: 'x', flipX: true },
      { kind: 'shape', flipX: 'yes' },
    ],
  });
  assert.deepEqual(
    canvas.items.map((item) => [item.flipX, item.flipY]),
    [[true, undefined], [true, true], [undefined, true], [undefined, undefined], [undefined, undefined]]
  );
  const css = generator.canvasCss(canvas);
  assert.match(css, /\[data-i="0"\] \{[^}]*scale: -1 1;/);
  assert.match(css, /\[data-i="1"\] \{[^}]*scale: -1 -1;/);
  assert.match(css, /\[data-i="2"\] \{[^}]*scale: 1 -1;/);
  assert.doesNotMatch(css, /\[data-i="[34]"\] \{[^}]*scale:/);
});

test('a shadow can take a colour or become a glow, and texts can have one too', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'shape', shadow: 9 },
      { kind: 'shape', shadow: 12, shadowStyle: 'glow', shadowColor: 'accent' },
      { kind: 'icon', shadow: 6, shadowColor: '#ff0000' },
      { kind: 'text', text: 'x', shadow: 8, shadowStyle: 'glow', shadowColor: '#00ffaa' },
      { kind: 'text', text: 'y', shadowStyle: 'glow', shadowColor: 'red;}' },
    ],
  });
  const [plain, glow, red, text, bare] = canvas.items;
  assert.ok(!('shadowStyle' in plain) && !('shadowColor' in plain), 'a plain shadow has one spelling');
  assert.deepEqual([glow.shadowStyle, glow.shadowColor], ['glow', 'accent']);
  assert.equal(red.shadowColor, '#ff0000');
  assert.deepEqual([text.shadow, text.shadowStyle, text.shadowColor], [8, 'glow', '#00ffaa']);
  assert.ok(!('shadow' in bare) && !('shadowStyle' in bare) && !('shadowColor' in bare), 'a text without a shadow keeps none of it');
  const css = generator.canvasCss(canvas);
  assert.match(css, /\[data-i="0"\] \{[^}]*filter: drop-shadow\(0 3px 9px rgba\(0, 0, 0, 0\.55\)\);/);
  assert.match(css, /\[data-i="1"\] \{[^}]*filter: drop-shadow\(0 0 6px var\(--accent\)\) drop-shadow\(0 0 12px var\(--accent\)\);/);
  assert.match(css, /\[data-i="2"\] \{[^}]*filter: drop-shadow\(0 2px 6px #ff0000\);/);
  assert.match(css, /\[data-i="3"\] \{[^}]*filter: drop-shadow\(0 0 4px #00ffaa\) drop-shadow\(0 0 8px #00ffaa\);/);
  assert.doesNotMatch(css, /\[data-i="4"\] \{[^}]*filter:/);
});

test('a picture can be cut to a shape, rounded or not', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'image', file: 'a.png', shape: 'ellipse' },
      { kind: 'image', file: 'a.png', shape: 'diamond' },
      { kind: 'image', file: 'a.png', shape: 'star', points: 6, radius: 20, w: 100, h: 50 },
      { kind: 'image', file: 'a.png', shape: 'line' },
      { kind: 'image', file: 'a.png', shape: 'rect', radius: 10 },
    ],
  });
  assert.deepEqual(
    canvas.items.map((item) => item.shape),
    ['ellipse', 'diamond', 'star', undefined, undefined]
  );
  assert.equal(canvas.items[2].points, 6);
  const css = generator.canvasCss(canvas);
  assert.match(css, /\[data-i="0"\] \{[^}]*border-radius: 50%;/);
  assert.match(css, /\[data-i="1"\] \{[^}]*clip-path: polygon\(50% 0%, 100% 50%, 50% 100%, 0% 50%\);/);
  assert.match(css, /\[data-i="2"\] \{[^}]*clip-path: path\('M[\d. ]+(L[\d. ]+Q[\d. ]+)+Z'\);/);
  assert.match(css, /\[data-i="4"\] \{[^}]*border-radius: 10%;/);
  assert.doesNotMatch(css, /\[data-i="4"\] \{[^}]*clip-path/);
});

test('a looping animation follows the entrance, keeps the item filters and stays out of the editor', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'icon', loop: 'spin' },
      { kind: 'shape', loop: 'float', enter: 'rise', delay: 200 },
      { kind: 'text', text: 'x', loop: 'shine', shadow: 4 },
      { kind: 'shape', loop: 'explode' },
    ],
  });
  assert.deepEqual(canvas.items.map((item) => item.loop), ['spin', 'float', 'shine', undefined]);
  const css = generator.canvasCss(canvas);
  assert.match(css, /@keyframes aw-cv-loop-spin \{ to \{ transform: rotate\(360deg\); \} \}/);
  assert.match(css, /\.ach\.active > \.aw-canvas > \[data-i="0"\] \{ animation: aw-cv-loop-spin \d+ms linear 0ms infinite; \}/);
  assert.match(css, /\[data-i="1"\] \{ animation: aw-cv-rise 480ms cubic-bezier\([^)]+\) 200ms both, aw-cv-loop-float \d+ms ease-in-out 680ms infinite; \}/);
  assert.match(css, /@keyframes aw-cv-shine-2 \{ 50% \{ filter: drop-shadow\(0 1px 4px rgba\(0, 0, 0, 0\.55\)\) brightness\(1\.35\); \} \}/);
  assert.doesNotMatch(generator.canvasCss(canvas, { editing: true }), /animation:|@keyframes/);
});

test('an animated picture can start over when it appears, a still one cannot', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'image', file: 'party.gif', replay: true, enter: 'fade', delay: 300 },
      { kind: 'image', file: 'still.png', replay: true },
      { kind: 'image', file: 'loop.webp', replay: true },
    ],
  });
  assert.deepEqual(canvas.items.map((item) => item.replay), [true, undefined, true]);
  const markup = generator.canvasMarkup(canvas);
  assert.match(markup, /<div data-i="0" data-kind="image" data-replay="300" data-file="party\.gif"><\/div>/);
  assert.match(markup, /<div data-i="1" data-kind="image"><\/div>/);
  assert.match(markup, /<div data-i="2" data-kind="image" data-replay="0" data-file="loop\.webp"><\/div>/);
  assert.match(generator.PRESET_ENGINE, /\[data-replay\]/, 'the page engine starts them over');
});

test('a replayed picture gets a new address, an inline one through its media type', () => {
  const source = generator.PRESET_ENGINE.match(/function restartPicture\(node\) \{[\s\S]*?\n {2}\}/)[0];
  class FakeImage {
    set src(value) {
      this.onload();
    }
  }
  let sheet = '';
  const restart = new Function('getComputedStyle', 'Image', `var replayCount = 0; ${source} return restartPicture;`)(() => ({ backgroundImage: `url("${sheet}")` }), FakeImage);
  const shown = (url) => {
    sheet = url;
    const node = { style: { backgroundImage: '' } };
    restart(node);
    return node.style.backgroundImage;
  };

  assert.equal(shown('file:///C:/presets/p/party.gif'), 'url("file:///C:/presets/p/party.gif?replay=1")');
  assert.equal(shown('file:///C:/presets/p/party.gif?replay=1'), 'url("file:///C:/presets/p/party.gif?replay=2")');
  assert.equal(shown('data:image/gif;base64,R0lGODlh'), 'url("data:image/gif;replay=3;base64,R0lGODlh")');
  assert.equal(shown('data:image/gif;replay=3;base64,R0lGODlh'), 'url("data:image/gif;replay=4;base64,R0lGODlh")');
});

test('a picture of up to 5 MB is accepted, a GIF included', () => {
  const gif = (bytes) => Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(Math.round(bytes) - 6)]);
  assert.equal(schema.MAX_LOGO_BYTES, 5 * 1024 * 1024);
  assert.deepEqual(schema.checkLogo('party.gif', gif(4.9 * 1024 * 1024)), { ok: true, kind: 'gif' });
  assert.deepEqual(schema.checkLogo('party.gif', gif(5.1 * 1024 * 1024)), { ok: false, error: 'image-too-large' });
});
