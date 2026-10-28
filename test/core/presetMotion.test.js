'use strict';

// How the elements of a card come in: the timeline's delays and lengths, the card's own parts, and
// the effects that type a line out, count its numbers up, shake it or flash it.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const schema = require('../../app/util/presetSchema.js');
const generator = require('../../app/util/customPreset.js');
const { foldEdit } = require('../../app/ui/presetCanvasTiers.js');

const motionBlock = (css) => {
  const start = css.indexOf('@media (prefers-reduced-motion: no-preference) {');
  assert.ok(start >= 0, 'the motion sits behind prefers-reduced-motion');
  return css.slice(start);
};

test('an entrance keeps its own length only when it is not its effect’s usual one', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'shape', enter: 'rise', dur: 480 },
      { kind: 'shape', enter: 'rise', dur: 1234 },
      { kind: 'shape', enter: 'shake' },
      { kind: 'shape', enter: 'burst', dur: 99999 },
      { kind: 'text', text: 'x', enter: 'type', dur: 5 },
      { kind: 'shape', enter: 'none', dur: 900 },
    ],
  });
  assert.deepEqual(
    canvas.items.map(({ enter, dur }) => [enter, dur]),
    [
      ['rise', undefined],
      ['rise', 1230],
      ['shake', undefined],
      ['burst', 4000],
      ['type', 100],
      [undefined, undefined],
    ]
  );
  assert.equal(schema.canvasEnterMs('rise'), 480);
  assert.equal(schema.canvasEnterMs('type'), 1000);
  assert.equal(schema.canvasEnterMs('burst', 1500), 1500);
});

test('only a text types or counts; any item shakes or flashes', () => {
  const canvas = schema.normalizeCanvas({
    items: [
      { kind: 'shape', enter: 'type' },
      { kind: 'image', file: 'a.png', enter: 'count' },
      { kind: 'text', text: 'Top 3%', enter: 'count' },
      { kind: 'icon', enter: 'burst' },
    ],
  });
  assert.deepEqual(
    canvas.items.map((item) => item.enter),
    [undefined, undefined, 'count', 'burst']
  );
  const own = (target) => schema.canvasEntrances(target).filter((enter) => enter === 'type' || enter === 'count');
  assert.deepEqual(own({ kind: 'text' }), ['type', 'count']);
  assert.deepEqual(own({ kind: 'shape' }), []);
  assert.deepEqual(own({ part: 'title' }), ['type']);
  assert.deepEqual(own({ part: 'rarity' }), ['count']);
  assert.deepEqual(own({ part: 'progress' }), ['count']);
  assert.deepEqual(own({ part: 'icon' }), []);
  assert.ok(schema.canvasEntrances({ part: 'icon' }).includes('shake'));
});

test('the card’s own parts come in on their own, shared by every state', () => {
  const canvas = schema.normalizeCanvas({
    motion: {
      icon: { enter: 'pop', delay: 104 },
      title: { enter: 'type', dur: 900 },
      detail: { enter: 'count' },
      rarity: { enter: 'count', dur: 1000 },
      progress: { enter: 'type' },
      game: { enter: 'none' },
      meta: { enter: 'fade' },
      mark: { enter: 'fade' },
    },
  });
  assert.deepEqual(canvas.motion, { icon: { enter: 'pop', delay: 100 }, title: { enter: 'type', dur: 900 }, rarity: { enter: 'count' } });
  assert.equal(schema.normalizeCanvas({ motion: { title: { enter: 'none' } } }).motion, undefined);
  assert.equal(schema.normalizeCanvas({ motion: 'rise' }).motion, undefined);
  assert.deepEqual(schema.canvasIn(canvas, 'gold').motion, canvas.motion);
});

test('an edit made in one state keeps how the parts come in', () => {
  const layout = schema.normalizeCanvas({ motion: { icon: { enter: 'fade' } } });
  const before = schema.canvasIn(layout, 'normal');
  const after = { ...before, motion: { ...before.motion, title: { enter: 'type' } } };
  const out = foldEdit(layout, before, after, { state: 'gold', alone: true, sourceOf: () => undefined });
  assert.deepEqual(out.motion, { icon: { enter: 'fade' }, title: { enter: 'type' } });
  const cleared = foldEdit(layout, before, { ...before, motion: undefined }, { state: 'normal', alone: false, sourceOf: () => undefined });
  assert.equal(cleared.motion, undefined);
});

test('a part comes in over its preset’s own animation, and only while the card is up', () => {
  const css = motionBlock(
    generator.canvasCss({
      motion: {
        icon: { enter: 'pop', delay: 100 },
        detail: { enter: 'shake' },
        title: { enter: 'type', delay: 200, dur: 900 },
        rarity: { enter: 'count' },
        progress: { enter: 'count', delay: 300 },
      },
    })
  );
  assert.ok(css.includes('.ach.active .icon { animation: aw-cv-pop 480ms cubic-bezier(0.34, 1.56, 0.64, 1) 100ms both !important; }'), css);
  assert.ok(
    css.includes('.ach.active .detail { animation: aw-cv-appear 120ms linear 0ms both, aw-cv-shake 520ms ease-out 0ms both !important; animation-composition: replace, add !important; }'),
    css
  );
  // A typed line is marked whether or not the card is up: the engine cuts it before it shows.
  assert.ok(css.includes('.ach .title { --aw-type: 1; --aw-type-at: 200ms; --aw-type-for: 900ms; }'), css);
  assert.ok(css.includes('.ach.active .aw-ch { animation: aw-cv-letter 0s linear calc(var(--aw-type-at) + var(--aw-type-for) * (var(--aw-i) + 1) / var(--aw-n)) backwards; }'), css);
  assert.ok(css.includes('@keyframes aw-cv-letter { from, to { opacity: 0; } }'), css);
  assert.ok(css.includes('.ach .rarity { --aw-count: 1; font-variant-numeric: tabular-nums; }'), css);
  assert.ok(css.includes('.ach.active .rarity { animation: aw-cv-count 1000ms linear 0ms both !important; }'), css);
  // The bar's figures count in its label while the bar itself fills.
  assert.ok(css.includes('.ach .progress_label { --aw-count: 1; font-variant-numeric: tabular-nums; }'), css);
  assert.ok(css.includes('.ach.active .progress_label { animation: aw-cv-count 1000ms linear 300ms both !important; }'), css);
  assert.ok(css.includes('.ach.active .progress_meter { animation: aw-cv-fill 1000ms cubic-bezier(0.33, 1, 0.68, 1) 300ms both !important; }'), css);
  assert.ok(css.includes('@keyframes aw-cv-fill { from { width: 0; } }'), css);
  assert.doesNotMatch(generator.canvasCss({ motion: { icon: { enter: 'pop' } } }, { editing: true }), /animation|--aw-type|--aw-count/);
});

test('an item shakes or flashes over its own look, and types or counts through the engine', () => {
  const css = motionBlock(
    generator.canvasCss({
      items: [
        { kind: 'shape', enter: 'shake', delay: 200 },
        { kind: 'icon', enter: 'burst', dur: 900 },
        { kind: 'text', text: 'Hello', enter: 'type', dur: 1500, loop: 'pulse' },
        { kind: 'text', text: 'Top {rarity}', enter: 'count' },
      ],
    })
  );
  assert.ok(css.includes('.ach.active > .aw-canvas > [data-i="0"] { animation: aw-cv-appear 120ms linear 200ms both, aw-cv-shake 520ms ease-out 200ms both; animation-composition: replace, add; }'), css);
  assert.ok(css.includes('.ach.active > .aw-canvas > [data-i="1"] { animation: aw-cv-appear 160ms linear 0ms both, aw-cv-burst 900ms ease-out 0ms backwards; animation-composition: replace, add; }'), css);
  assert.match(css, /@keyframes aw-cv-burst \{ 0% \{ filter: brightness\([\d.]+\) drop-shadow\(0 0 0 var\(--accent, #ffffff\)\); \}/);
  assert.match(css, /@keyframes aw-cv-shake \{ 0%, 100% \{ transform: none; \}/);
  assert.ok(css.includes('.ach > .aw-canvas > [data-i="2"] { --aw-type: 1; --aw-type-at: 0ms; --aw-type-for: 1500ms; }'), css);
  // Its loop starts once the last letter is in.
  assert.match(css, /\.ach\.active > \.aw-canvas > \[data-i="2"\] \{ animation: aw-cv-loop-pulse \d+ms ease-in-out 1500ms infinite; \}/);
  assert.ok(css.includes('.ach > .aw-canvas > [data-i="3"] { --aw-count: 1; font-variant-numeric: tabular-nums; }'), css);
  assert.ok(css.includes('.ach.active > .aw-canvas > [data-i="3"] { animation: aw-cv-count 1000ms linear 0ms both; }'), css);
  assert.equal(css.split('.ach.active .aw-ch {').length, 2, 'one rule for every typed letter');
});
