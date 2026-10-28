'use strict';

/*
  The timeline under the card in the full-screen editor: a row per element that comes in, its bar
  running from when its entrance starts to when its effect ends. The bar drags to move the start,
  its right edge to change the length. Play runs every entrance from the start, and the playhead
  holds the card at any moment of them. At rest the preview holds still and shows the card as it
  ends, which is the card the layout editor edits.
*/

const intlFormat = require('../util/intlFormat.js');

// The window shows a little past the last entrance, on whole half seconds, never less than this.
const MIN_SPAN_MS = 1500;
const SPAN_ROOM_MS = 250;
const SPAN_STEP_MS = 500;
const TICK_MS = 100;
const LONG_SPAN_MS = 4000;
const TIME_STEP_MS = 10;
const NUDGE_MS = 50;
const NUDGE_BIG_MS = 250;
const SNAP_PX = 6;
const DRAG_THRESHOLD_PX = 3;
// What a click in an empty row gives the element.
const NEW_ENTRANCE = 'fade';
const SLIDER_KEYS = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toStep = (value, step) => Math.round(value / step) * step;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function icon(name) {
  const node = el('i', `fas ${name}`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

// How long the window lasts for these rows.
function spanOf(rows) {
  const ends = rows.filter((row) => row.enter !== 'none').map((row) => row.delay + row.dur);
  const end = Math.max(0, ...ends);
  return Math.max(MIN_SPAN_MS, Math.ceil((end + SPAN_ROOM_MS) / SPAN_STEP_MS) * SPAN_STEP_MS);
}

// The point nearest to one of a bar's edges, within `near`, and which edge it caught.
function snapOf(points, edges, near) {
  let best = null;
  for (const point of points) {
    edges.forEach((edge, index) => {
      const gap = Math.abs(point - edge);
      if (gap <= near && (!best || gap < best.gap)) best = { point, index, gap };
    });
  }
  return best;
}

/**
 * A row, as the editor describes it:
 *   id, name, icon        the element, as the layers list names it ('card', 'p:title', 'i:3')
 *   enter                 its entrance, 'none' when it comes in with the card
 *   delay, dur            ms from the card's start, and ms its effect lasts
 *   min, max, step        the lengths it may take; maxDelay its latest start (0 holds it at 0)
 *   choices               [value, name] of the effects it may take, or `effect` for what it shows
 *   loop                  the name of the loop that follows its entrance, if any
 *   card, fixed           the card's own row; drawn but never moved
 *
 * @param {object} options
 * @param {HTMLElement} options.host  where the timeline is drawn
 * @param {(key: string) => string} options.label
 * @param {() => string} options.lang  the app's language, for the times
 * @param {() => object[]} options.rows
 * @param {() => boolean} options.shown
 * @param {(id: string, patch: object, done: boolean) => void} options.change  live while dragging, one step when done
 * @param {(id: string) => void} options.select
 * @param {() => string|null} options.selected
 * @param {() => Document|null} options.doc  the preview's document
 * @param {(on: boolean) => void} options.motion  the preview with its entrances, or holding still
 * @param {() => void} options.restart  the preview's popup again, from its start
 * @param {() => void} options.rested  the preview holds still again
 */
function createTimeline(options) {
  const { host, label } = options;
  const seconds = (ms) => intlFormat.formatNumber(ms / 1000, options.lang(), { style: 'unit', unit: 'second', unitDisplay: 'narrow', maximumFractionDigits: 2 });
  let rows = [];
  let span = MIN_SPAN_MS;
  // 'rest': the card holds still as it ends; 'play': the entrances run; 'hold': held at `at`.
  let mode = 'rest';
  let at = MIN_SPAN_MS;
  // The preview's animations in hand while it is held, each paused.
  let held = new Set();
  let frame = 0;
  let reholdFrame = 0;
  let startedAt = 0;
  let drag = null;
  let scrubbing = false;
  // The timeline's own switches redraw the preview, which must not read as an edit.
  let switching = false;

  const head = el('div', 'pd-tl-head');
  const controls = el('div', 'pd-tl-controls');
  const foldButton = el('button', 'pd-tl-fold');
  foldButton.type = 'button';
  foldButton.appendChild(icon('fa-chevron-down'));
  const playButton = el('button', 'pd-tl-play inline-action-btn secondary');
  playButton.type = 'button';
  const clock = el('span', 'pd-tl-clock');
  controls.append(foldButton, playButton, clock);
  const ruler = el('div', 'pd-tl-ruler');
  ruler.tabIndex = 0;
  ruler.setAttribute('role', 'slider');
  ruler.setAttribute('aria-valuemin', '0');
  head.append(controls, ruler);
  const list = el('div', 'pd-tl-rows');
  list.id = 'pd-tl-rows';
  list.setAttribute('role', 'list');
  foldButton.setAttribute('aria-controls', list.id);
  const cursor = el('div', 'pd-tl-cursor');
  const guide = el('div', 'pd-tl-guide');
  guide.hidden = true;
  for (const node of [cursor, guide]) node.setAttribute('aria-hidden', 'true');
  host.setAttribute('role', 'group');
  host.append(head, list, cursor, guide);

  const pct = (ms) => `${(ms / span) * 100}%`;
  function place(node, start, length) {
    node.style.left = pct(start);
    node.style.width = pct(length);
  }
  // The ruler and every track share one width: a moment's x in the timeline's own box.
  const xOf = (ms) => ruler.offsetLeft + (ms / span) * ruler.clientWidth;
  const timeIn = (node, event) => {
    const rect = node.getBoundingClientRect();
    return clamp(((event.clientX - rect.left) / rect.width) * span, 0, span);
  };

  /* ---------- the preview ---------- */

  function frameText() {
    const doc = options.doc();
    const sync = doc && doc.defaultView && doc.defaultView.awMotionSync;
    if (sync) sync();
  }

  function switchMotion(run) {
    switching = true;
    try {
      run();
    } finally {
      switching = false;
    }
  }

  // Every animation of the preview in hand and paused, the ones it started since included.
  function grab() {
    const doc = options.doc();
    if (!doc) return;
    for (const animation of doc.getAnimations()) {
      if (held.has(animation)) continue;
      animation.pause();
      held.add(animation);
    }
  }

  // An animation its element gave up (another effect, a replay) stays idle: setting its time would
  // bring it back over the one that replaced it.
  function seek(ms) {
    at = clamp(ms, 0, span);
    grab();
    for (const animation of held) if (animation.playState !== 'idle') animation.currentTime = at;
    frameText();
    drawHead();
  }

  function stopPlaying() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  // Held at one moment; from rest the preview takes its entrances and starts over first.
  function holdAt(ms) {
    stopPlaying();
    if (mode === 'rest') {
      held = new Set();
      switchMotion(() => {
        options.motion(true);
        options.restart();
      });
    }
    setMode('hold');
    seek(ms);
  }

  function play() {
    stopPlaying();
    cancelAnimationFrame(reholdFrame);
    held = new Set();
    switchMotion(() => {
      if (mode === 'rest') options.motion(true);
      options.restart();
    });
    at = 0;
    startedAt = performance.now();
    setMode('play');
    frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    at = clamp(now - startedAt, 0, span);
    drawHead();
    if (at >= span) return void rest();
    frame = requestAnimationFrame(tick);
  }

  const toggle = () => (mode === 'play' ? holdAt(at) : play());

  // What was held runs on from the end of the window, so the card ends as it does after a play.
  function settle() {
    for (const animation of held) {
      if (animation.playState === 'idle') continue;
      if (animation.currentTime < span) animation.currentTime = span;
      const timing = animation.effect && animation.effect.getComputedTiming();
      if (timing && animation.currentTime < timing.endTime) animation.play();
    }
  }

  function rest() {
    stopPlaying();
    cancelAnimationFrame(reholdFrame);
    if (mode === 'rest') return;
    if (mode === 'hold') settle();
    held = new Set();
    setMode('rest');
    switchMotion(() => options.motion(false));
    // A count held halfway is written in full again once its animation is gone.
    frameText();
    options.rested();
    render();
  }

  // The preview was drawn again (an edit, an undo, another state): held, it is held again there.
  function changed() {
    if (switching || mode !== 'hold') return;
    cancelAnimationFrame(reholdFrame);
    reholdFrame = requestAnimationFrame(() => {
      held = new Set();
      switchMotion(() => options.restart());
      seek(at);
    });
  }

  /* ---------- drawing ---------- */

  // Folded, only the head stays (Play and the playhead) and the card takes the rows' room.
  function setFolded(folded) {
    host.classList.toggle('is-folded', folded);
    list.hidden = folded;
    foldButton.setAttribute('aria-expanded', String(!folded));
    alignMenus();
  }

  // Every effect menu as wide as the widest, so they line up; that one fits its longest effect.
  function alignMenus() {
    if (list.hidden) return;
    host.style.removeProperty('--tl-effect');
    const widest = Math.max(0, ...[...list.querySelectorAll('.pd-tl-effect')].map((menu) => menu.offsetWidth));
    if (widest) host.style.setProperty('--tl-effect', `${widest}px`);
  }

  function setMode(next) {
    mode = next;
    host.classList.toggle('is-rest', mode === 'rest');
    host.classList.toggle('is-playing', mode === 'play');
    const key = mode === 'play' ? 'tl.pause' : 'tl.play';
    playButton.replaceChildren(icon(mode === 'play' ? 'fa-pause' : 'fa-play'), el('span', '', label(key)));
    playButton.title = label(key);
  }

  function drawHead() {
    at = Math.min(at, span);
    cursor.style.left = `${xOf(at)}px`;
    clock.textContent = seconds(at);
    ruler.setAttribute('aria-valuenow', String(Math.round(at)));
    ruler.setAttribute('aria-valuetext', seconds(at));
  }

  function drawRuler() {
    ruler.style.setProperty('--tl-ticks', String(span / TICK_MS));
    ruler.setAttribute('aria-valuemax', String(span));
    ruler.setAttribute('aria-label', label('tl.playhead'));
    const every = span > LONG_SPAN_MS ? 1000 : 500;
    const marks = [];
    for (let ms = 0; ms < span; ms += every) {
      const mark = el('span', 'pd-tl-mark', seconds(ms));
      mark.style.left = pct(ms);
      marks.push(mark);
    }
    ruler.replaceChildren(...marks);
  }

  // A scroll bar on the rows narrows their tracks: the ruler gives up the same room.
  function alignHead() {
    head.style.paddingRight = `${list.offsetWidth - list.clientWidth}px`;
  }

  function setSlider(node, value, min, max) {
    node.setAttribute('aria-valuemin', String(min));
    node.setAttribute('aria-valuemax', String(max));
    node.setAttribute('aria-valuenow', String(Math.round(value)));
    node.setAttribute('aria-valuetext', seconds(value));
  }

  function slider(node, part, key, row, value, min, max) {
    node.tabIndex = 0;
    node.dataset.part = part;
    node.setAttribute('role', 'slider');
    node.setAttribute('aria-label', `${label(key)}: ${row.name}`);
    setSlider(node, value, min, max);
  }

  const effectName = (row) => (row.choices ? (row.choices.find(([value]) => value === row.enter) || [row.enter, row.enter])[1] : row.effect);

  function barNode(row) {
    const bar = el('div', row.fixed ? 'pd-tl-bar is-fixed' : 'pd-tl-bar');
    place(bar, row.delay, row.dur);
    const name = effectName(row);
    bar.title = `${row.name}: ${name} (${seconds(row.delay)} - ${seconds(row.delay + row.dur)})`;
    bar.appendChild(el('span', 'pd-tl-bar-name', name));
    if (row.fixed) return bar;
    if (row.maxDelay) {
      slider(bar, 'bar', 'tl.start', row, row.delay, 0, row.maxDelay);
      bar.addEventListener('pointerdown', (event) => startDrag(event, row, 'move', bar));
      // The grip sits in the bar: its keys must not move the start too.
      bar.addEventListener('keydown', (event) => event.target === bar && onSliderKey(event, row, 'delay'));
    }
    const grip = el('span', 'pd-tl-grip');
    slider(grip, 'grip', 'tl.length', row, row.dur, row.min, row.max);
    grip.addEventListener('pointerdown', (event) => startDrag(event, row, 'length', bar));
    grip.addEventListener('keydown', (event) => onSliderKey(event, row, 'dur'));
    bar.appendChild(grip);
    return bar;
  }

  function trackNode(row) {
    const track = el('div', 'pd-tl-track');
    if (row.enter === 'none') {
      // It comes in with the card: drawn faint along the card's own bar.
      track.classList.add('is-empty');
      track.title = label('tl.add');
      const ghost = el('span', 'pd-tl-ghost');
      const card = rows.find((other) => other.card);
      place(ghost, 0, card ? card.dur : 0);
      track.appendChild(ghost);
      track.addEventListener('pointerdown', (event) => addEntrance(event, row, track));
      return track;
    }
    track.appendChild(barNode(row));
    if (row.loop) {
      const end = row.delay + row.dur;
      const tail = el('span', 'pd-tl-loop');
      tail.title = row.loop;
      place(tail, end, Math.max(0, span - end));
      track.appendChild(tail);
    }
    return track;
  }

  function effectControl(row) {
    const control = el('select', 'pd-tl-effect');
    control.dataset.part = 'effect';
    control.setAttribute('aria-label', `${label('prop.entrance')}: ${row.name}`);
    for (const [value, text] of row.choices) control.appendChild(Object.assign(el('option', '', text), { value }));
    control.value = row.enter;
    control.addEventListener('change', () => options.change(row.id, { enter: control.value }, true));
    return control;
  }

  function rowNode(row) {
    const node = el('div', row.id === options.selected() ? 'pd-tl-row is-on' : 'pd-tl-row');
    node.dataset.id = row.id;
    node.setAttribute('role', 'listitem');
    const name = el('div', 'pd-tl-name');
    const pick = el('button', 'pd-tl-pick');
    pick.type = 'button';
    pick.dataset.part = 'pick';
    pick.title = row.name;
    pick.append(icon(row.icon), el('span', '', row.name));
    pick.addEventListener('click', () => options.select(row.id));
    name.appendChild(pick);
    if (row.choices) name.appendChild(effectControl(row));
    node.append(name, trackNode(row));
    return node;
  }

  // The rows are drawn again after every edit: the keyboard stays on the same control of the same row.
  function focusSpot() {
    const node = document.activeElement;
    const row = node && list.contains(node) ? node.closest('.pd-tl-row') : null;
    return row ? { id: row.dataset.id, part: node.dataset.part } : null;
  }
  function restoreFocus(spot) {
    const row = spot && [...list.children].find((node) => node.dataset.id === spot.id);
    const target = row && (row.querySelector(`[data-part="${spot.part}"]`) || row.querySelector('[data-part="pick"]'));
    if (target) target.focus({ preventScroll: true });
  }

  // Not while a bar is dragged: the window would rescale under the pointer, and the bar holding
  // the pointer would be replaced.
  function render() {
    if (drag) return;
    const shown = options.shown();
    host.hidden = !shown;
    if (!shown) return void rest();
    host.setAttribute('aria-label', label('tl.title'));
    foldButton.title = label('tl.title');
    foldButton.setAttribute('aria-label', label('tl.title'));
    const spot = focusSpot();
    const top = list.scrollTop;
    rows = options.rows();
    span = spanOf(rows);
    if (mode === 'rest') at = span;
    setMode(mode);
    drawRuler();
    list.replaceChildren(...rows.map(rowNode));
    alignMenus();
    list.scrollTop = top;
    restoreFocus(spot);
    alignHead();
    drawHead();
  }

  /* ---------- editing ---------- */

  function snapsFor(row) {
    const points = [0];
    for (const other of rows) if (other !== row && other.enter !== 'none') points.push(other.delay, other.delay + other.dur);
    if (mode === 'hold') points.push(at);
    return points;
  }

  function movedStart(row, shift, near) {
    let start = clamp(toStep(row.delay + shift, TIME_STEP_MS), 0, row.maxDelay);
    const snap = snapOf(drag.snaps, [start, start + row.dur], near);
    if (snap) start = clamp(snap.index ? snap.point - row.dur : snap.point, 0, row.maxDelay);
    return { start, length: row.dur, patch: { delay: start }, snapped: snap && snap.point };
  }

  function movedLength(row, shift, near) {
    let length = clamp(toStep(row.dur + shift, row.step), row.min, row.max);
    const snap = snapOf(drag.snaps, [row.delay + length], near);
    if (snap) length = clamp(toStep(snap.point - row.delay, row.step), row.min, row.max);
    return { start: row.delay, length, patch: { dur: length }, snapped: snap && snap.point };
  }

  function startDrag(event, row, kind, bar) {
    if (event.button !== 0) return;
    // The grip sits in its bar: one drag, the grip's.
    event.preventDefault();
    event.stopPropagation();
    const width = bar.parentNode.clientWidth;
    drag = { row, kind, bar, node: event.currentTarget, x0: event.clientX, width, moved: false, patch: null, snaps: snapsFor(row) };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
  }

  function onDragMove(event) {
    if (!drag) return;
    const dx = event.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const shift = (dx / drag.width) * span;
    const near = (SNAP_PX / drag.width) * span;
    const next = drag.kind === 'move' ? movedStart(drag.row, shift, near) : movedLength(drag.row, shift, near);
    drag.patch = next.patch;
    place(drag.bar, next.start, next.length);
    setSlider(drag.node, drag.kind === 'move' ? next.start : next.length, drag.kind === 'move' ? 0 : drag.row.min, drag.kind === 'move' ? drag.row.maxDelay : drag.row.max);
    guide.hidden = next.snapped == null;
    if (next.snapped != null) guide.style.left = `${xOf(next.snapped)}px`;
    options.change(drag.row.id, next.patch, false);
  }

  // A press that never moved picks the element, as a click on its name does.
  function endDrag() {
    if (!drag) return;
    const { row, moved, patch } = drag;
    drag = null;
    guide.hidden = true;
    if (moved && patch) options.change(row.id, patch, true);
    else options.select(row.id);
  }

  function addEntrance(event, row, track) {
    if (event.button !== 0) return;
    event.preventDefault();
    const delay = clamp(toStep(timeIn(track, event), TIME_STEP_MS), 0, row.maxDelay);
    options.change(row.id, { enter: NEW_ENTRANCE, delay }, true);
  }

  // Arrows move a start or a length by 50ms (250 with Shift), Home goes back to the least; Delete
  // takes the entrance away.
  function onSliderKey(event, row, field) {
    if ((event.key === 'Delete' || event.key === 'Backspace') && !row.card) {
      event.preventDefault();
      return void options.change(row.id, { enter: 'none' }, true);
    }
    const way = SLIDER_KEYS[event.key];
    if (!way && event.key !== 'Home') return;
    event.preventDefault();
    const by = way * (event.shiftKey ? NUDGE_BIG_MS : NUDGE_MS) || 0;
    if (field === 'delay') options.change(row.id, { delay: event.key === 'Home' ? 0 : clamp(row.delay + by, 0, row.maxDelay) }, true);
    else options.change(row.id, { dur: event.key === 'Home' ? row.min : clamp(toStep(row.dur + by, row.step), row.min, row.max) }, true);
  }

  function onRulerKey(event) {
    const way = SLIDER_KEYS[event.key];
    let next = null;
    if (way) next = at + way * (event.shiftKey ? NUDGE_BIG_MS : NUDGE_MS);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = span;
    else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      return void toggle();
    } else return;
    event.preventDefault();
    if (mode === 'hold') seek(next);
    else holdAt(next);
  }

  /* ---------- wiring ---------- */

  setFolded(true);
  foldButton.addEventListener('click', () => setFolded(!list.hidden));
  playButton.addEventListener('click', toggle);
  ruler.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    ruler.setPointerCapture(event.pointerId);
    ruler.focus({ preventScroll: true });
    scrubbing = true;
    holdAt(timeIn(ruler, event));
  });
  ruler.addEventListener('pointermove', (event) => {
    if (scrubbing) seek(timeIn(ruler, event));
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ruler.addEventListener(type, () => (scrubbing = false));
  ruler.addEventListener('keydown', onRulerKey);
  host.addEventListener('pointermove', onDragMove);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) host.addEventListener(type, endDrag);
  new ResizeObserver(() => {
    alignHead();
    drawHead();
  }).observe(host);

  return {
    render,
    play,
    rest,
    changed,
    fold: () => setFolded(true),
    unfold: () => setFolded(false),
    moving: () => mode !== 'rest',
  };
}

module.exports = { createTimeline, spanOf, snapOf };
