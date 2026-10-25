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
