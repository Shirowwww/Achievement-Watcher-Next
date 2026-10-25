'use strict';

/*
  The free layout editor of the preset designer. Its value lives in the hidden #pd-canvas control like
  every other property, so undo, saving and layers work through the paths they already use.
  Coordinates are the card's own CSS pixels: the preview frame is zoomed from outside.
*/

const { CANVAS_MAX_ITEMS, CANVAS_SHAPES, normalizeCanvas } = require('../util/presetSchema.js');
const { CANVAS_EDIT_ROOM, CANVAS_PART_SELECTORS } = require('../util/customPreset.js');

// The designer controls that shape the card itself, shown alone while the card is selected.
const CARD_KEYS = [
  'width', 'minHeight', 'padX', 'padY', 'bgMode', 'bg', 'bg2', 'bgImage', 'opacity', 'artworkDim', 'bgAngle', 'artworkBlur',
  'artworkPosition', 'bgPattern', 'bgPatternOpacity', 'radius', 'accentBar', 'accentBarSize', 'borderWidth', 'borderColor', 'shadow', 'glow',
];
const CARD_ID = 'card';

// Paint order on the card: the text block before the lines inside it, so a line wins a click.
const PART_ORDER = ['text', 'icon', 'meta', 'title', 'detail', 'progress'];
const TRANSFORM_PROPS = ['translate', 'rotate', 'scale'];
const HANDLES = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
const CORNERS = ['nw', 'ne', 'se', 'sw'];
const SNAP_PX = 5;
// Close enough to place by eye: snapping would only fight a pixel-exact drag.
const SNAP_OFF_ZOOM = 3;
const DRAG_THRESHOLD_PX = 3;
const ROTATOR_ROOM_PX = 26;
const NUDGE_BIG = 10;
const PART_SCALE = [0.2, 4];
const TEXT_SIZE = [6, 96];
const LINE_ICONS = { text: 'fa-font', image: 'fa-image', shape: 'fa-shapes', part: 'fa-th-large' };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;
const isLine = (item) => item.kind === 'shape' && item.shape === 'line';
const clone = (value) => JSON.parse(JSON.stringify(value));
function rotVec(x, y, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) };
}
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

/**
 * @param {object} options
 * @param {HTMLElement} options.root     the designer (#options-notify-designer)
 * @param {HTMLElement} options.stage    the preview stage the handles are drawn over
 * @param {HTMLInputElement} options.input  the hidden #pd-canvas control
 * @param {() => HTMLIFrameElement|null} options.frame  the preview frame
 * @param {() => boolean} options.enabled  true while the single-card preview is on screen
 * @param {() => boolean} options.active   true while the designer tab is on screen
 * @param {() => void} options.apply     repaint the preview from the controls, synchronously
 * @param {(name: string) => string} options.assetUrl  a picture's URL for the crop ghost
 * @param {() => Promise<object|null>} options.importImage  {name, width, height}, {refused}, or null
 * @param {() => Promise<object|null>} options.importFont  {name}, or null when cancelled or refused (it reports a refusal itself)
 * @param {(text: string, kind?: string) => void} options.status
 * @param {(size: {width: number, minHeight?: number}, done: boolean) => void} options.resizeCard  live while dragging, one history step when done
 */
function createCanvasEditor(options) {
  const { root, stage, input } = options;
  const preview = root.querySelector('.pd-preview');
  const props = root.querySelector('#pd-cv-props');
  const cardPanel = root.querySelector('#pd-cv-card');
  const cardTitle = root.querySelector('#pd-cv-card-title');
  const cardHint = root.querySelector('#pd-cv-card-hint');
  const barToggle = root.querySelector('#pd-cv-bar-toggle');
  const barSelect = root.querySelector('#pd-accentBar');
  let lastBar = 'left';
  const controls = root.querySelector('.pd-controls');
  const controlsHome = document.createComment('pd-controls');
  const layerList = root.querySelector('#pd-cv-layer-list');
  const summary = root.querySelector('#pd-canvas-summary');
  const overlay = el('div', 'pd-cv-overlay');
  stage.appendChild(overlay);
  for (const field of controls.querySelectorAll('.pd-field[data-key]')) {
    if (CARD_KEYS.includes(field.dataset.key)) field.dataset.card = '1';
  }

  let canvas = normalizeCanvas(input.value);
  let selected = null;
  let cropping = false;
  let drag = null;
  let guides = [];
  let current = null;
  let full = false;
  let watchedDoc = null;
  let snapOn = true;
  const snapButton = root.querySelector('#pd-cv-snap');
  const snapping = () => snapOn && current && current.g.zoom < SNAP_OFF_ZOOM;

  const label = (key) => {
    const node = root.querySelector(`#pd-cv-text [data-cv="${key}"]`);
    return (node && node.textContent) || key;
  };

  // A live edit repaints the preview, which calls refresh(): re-reading our own value there would
  // swap `canvas` for a copy while the panel still edits the old item, losing the next keystroke.
  let stored = null;
  function read() {
    if (input.value === stored) return;
    canvas = normalizeCanvas(input.value);
    stored = input.value;
  }
  // Live: the preview follows the pointer. Committed: one history step, through the change event
  // every designer control fires.
  function store() {
    input.value = JSON.stringify(canvas);
    stored = input.value;
  }
  function write() {
    store();
    options.apply();
  }
  function commit() {
    store();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    repaint();
  }
  // Boxes first: the panels describe the selection, which may be an item added a moment ago.
  function repaint() {
    render();
    renderPanels();
  }

  /* ---------- geometry ---------- */

  function geometry() {
    if (!options.enabled()) return null;
    const frame = options.frame();
    let doc = null;
    try {
      doc = frame && frame.contentDocument;
    } catch {
      // A frame between documents has nothing to measure yet: no overlay this time.
      return null;
    }
    const card = doc && doc.querySelector('.ach');
    if (!card || !frame.offsetWidth) return null;
    // The entry animation moves the card for a moment after every replay; measure again once it lands.
    if (doc !== watchedDoc) {
      watchedDoc = doc;
      doc.addEventListener('animationend', () => drag || render(), true);
    }
    const frameRect = frame.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      doc,
      card,
      zoom: frameRect.width / frame.offsetWidth,
      ox: cardRect.left + card.clientLeft,
      oy: cardRect.top + card.clientTop,
      sx: frameRect.left - overlayRect.left,
      sy: frameRect.top - overlayRect.top,
      cardW: card.clientWidth,
      cardH: card.clientHeight,
      // Items sit inside the borders; the card's own box, and its width setting, include them.
      edgeL: card.clientLeft,
      edgeT: card.clientTop,
      outerW: card.offsetWidth,
      outerH: card.offsetHeight,
    };
  }

  function toCanvas(g, event) {
    const rect = overlay.getBoundingClientRect();
    return { x: (event.clientX - rect.left - g.sx) / g.zoom - g.ox, y: (event.clientY - rect.top - g.sy) / g.zoom - g.oy };
  }

  // Where a part sits without its own move. Presets animate their parts, so transitions stay off
  // until the restored transform is computed, or the part would glide home and back each time.
  function measurePart(g, key) {
    const node = g.card.querySelector(CANVAS_PART_SELECTORS[key]);
    if (!node || !node.getClientRects().length) return null;
    node.style.setProperty('transition', 'none', 'important');
    for (const prop of TRANSFORM_PROPS) node.style.setProperty(prop, 'none', 'important');
    const rect = node.getBoundingClientRect();
    for (const prop of TRANSFORM_PROPS) node.style.removeProperty(prop);
    void g.doc.defaultView.getComputedStyle(node).translate;
    node.style.removeProperty('transition');
    if (rect.width < 1 || rect.height < 1) return null;
    return { cx: rect.left + rect.width / 2 - g.ox, cy: rect.top + rect.height / 2 - g.oy, w: rect.width, h: rect.height };
  }

  const freshMove = () => ({ x: 0, y: 0, r: 0, s: 1 });
  const moveOf = (key) => canvas.move[key] || freshMove();

  function partBox(g, key) {
    const home = drag && drag.box && drag.box.id === `p:${key}` ? drag.box.home : measurePart(g, key);
    if (!home) return null;
    const m = moveOf(key);
    return { id: `p:${key}`, type: 'part', key, home, cx: home.cx + m.x, cy: home.cy + m.y, w: home.w * m.s, h: home.h * m.s, r: m.r };
  }

  function itemHeight(g, item, index) {
    if (item.kind !== 'text') return item.h;
    const node = g.doc.querySelector(`.aw-canvas > [data-i="${index}"]`);
    return node && node.offsetHeight ? node.offsetHeight : Math.round(item.size * 1.25);
  }

  function itemBox(g, item, index) {
    const h = itemHeight(g, item, index);
    return { id: `i:${index}`, type: 'item', index, cx: item.x + item.w / 2, cy: item.y + h / 2, w: item.w, h, r: item.r };
  }

  function collectBoxes(g) {
    const items = canvas.items.map((item, index) => itemBox(g, item, index));
    const parts = PART_ORDER.map((key) => partBox(g, key)).filter(Boolean);
    return [...items.filter((box) => canvas.items[box.index].back), ...parts, ...items.filter((box) => !canvas.items[box.index].back)];
  }

  const selectedBox = () => (current && current.boxes.find((box) => box.id === selected)) || null;
  const selectedItem = () => (selected && selected.startsWith('i:') ? canvas.items[Number(selected.slice(2))] : null);

  /* ---------- drawing ---------- */

  function place(node, g, box) {
    node.style.left = `${g.sx + (g.ox + box.cx - box.w / 2) * g.zoom}px`;
    node.style.top = `${g.sy + (g.oy + box.cy - box.h / 2) * g.zoom}px`;
    node.style.width = `${Math.max(2, box.w * g.zoom)}px`;
    node.style.height = `${Math.max(2, box.h * g.zoom)}px`;
    node.style.transform = box.r ? `rotate(${box.r}deg)` : '';
  }

  function handlesFor(box) {
    if (box.type === 'part') return CORNERS;
    const item = canvas.items[box.index];
    if (item.kind === 'text') return [...CORNERS, 'e', 'w'];
    if (isLine(item)) return ['e', 'w'];
    return Object.keys(HANDLES);
  }

  function cropGhost(g, item) {
    const ghost = el('div', 'pd-cv-ghost');
    ghost.dataset.id = selected;
    ghost.style.left = `${item.fit.x * g.zoom}px`;
    ghost.style.top = `${item.fit.y * g.zoom}px`;
    ghost.style.width = `${item.fit.w * g.zoom}px`;
    ghost.style.height = `${(item.fit.w / item.fit.ar) * g.zoom}px`;
    const url = item.file ? options.assetUrl(item.file) : '';
    if (url) ghost.style.backgroundImage = `url("${url}")`;
    return ghost;
  }

  const cardBox = (g) => ({ id: CARD_ID, type: 'card', cx: g.outerW / 2 - g.edgeL, cy: g.outerH / 2 - g.edgeT, w: g.outerW, h: g.outerH, r: 0 });

  // The card is resized from its edges and never moved or turned: the popup is placed by the host.
  function cardSelectionNode(g) {
    const node = el('div', 'pd-cv-sel is-card');
    node.dataset.id = CARD_ID;
    place(node, g, cardBox(g));
    for (const key of Object.keys(HANDLES)) {
      const handle = el('span', 'pd-cv-h');
      handle.dataset.h = key;
      node.appendChild(handle);
    }
    return node;
  }

  function selectionNode(g, box) {
    const node = el('div', 'pd-cv-sel');
    node.dataset.id = box.id;
    place(node, g, box);
    const item = selectedItem();
    if (cropping && item && item.kind === 'image') {
      node.classList.add('is-cropping');
      node.appendChild(cropGhost(g, item));
      return node;
    }
    for (const key of handlesFor(box)) {
      const handle = el('span', 'pd-cv-h');
      handle.dataset.h = key;
      node.appendChild(handle);
    }
    const rotator = el('span', 'pd-cv-rot');
    if (parseFloat(node.style.top) < ROTATOR_ROOM_PX) rotator.classList.add('is-below');
    node.appendChild(rotator);
    return node;
  }

  function guideNode(g, guide) {
    const node = el('div', `pd-cv-guide is-${guide.axis}`);
    if (guide.axis === 'x') node.style.left = `${g.sx + (g.ox + guide.pos) * g.zoom}px`;
    else node.style.top = `${g.sy + (g.oy + guide.pos) * g.zoom}px`;
    return node;
  }

  function render() {
    const g = geometry();
    overlay.hidden = !g;
    if (!g) {
      current = null;
      overlay.replaceChildren();
      return;
    }
    current = { g, boxes: collectBoxes(g) };
    snapButton.classList.toggle('is-suspended', snapOn && !snapping());
    if (selected && selected !== CARD_ID && !selectedBox()) selected = null;
    // Under everything else, so a click on a part or an item still picks that.
    const card = el('div', 'pd-cv-box is-card');
    card.dataset.id = CARD_ID;
    card.title = label('card');
    place(card, g, cardBox(g));
    const nodes = [
      card,
      ...current.boxes.map((box) => {
        const node = el('div', 'pd-cv-box');
        node.dataset.id = box.id;
        node.title = boxName(box);
        place(node, g, box);
        return node;
      }),
    ];
    const box = selectedBox();
    if (box) nodes.push(selectionNode(g, box));
    else if (selected === CARD_ID) nodes.push(cardSelectionNode(g));
    for (const guide of guides) nodes.push(guideNode(g, guide));
    overlay.replaceChildren(...nodes);
  }

  const iconFor = (box) => LINE_ICONS[box.type === 'part' ? 'part' : canvas.items[box.index].kind];

  function boxName(box) {
    if (box.type === 'part') return label(`part.${box.key}`);
    const item = canvas.items[box.index];
    if (item.kind === 'text') return item.text.split('\n')[0].slice(0, 28) || label('kind.text');
    // The toolbar buttons already name each shape; three rows called "Shape" tell nothing apart.
    return item.kind === 'shape' ? shapeName(item.shape) : label(`kind.${item.kind}`);
  }

  /* ---------- snapping ---------- */

  function snapCenter(box, cx, cy) {
    const { g } = current;
    const xs = [0, g.cardW / 2, g.cardW];
    const ys = [0, g.cardH / 2, g.cardH];
    for (const other of current.boxes) {
      if (other.id === box.id) continue;
      xs.push(other.cx);
      ys.push(other.cy);
      if (other.r) continue;
      xs.push(other.cx - other.w / 2, other.cx + other.w / 2);
      ys.push(other.cy - other.h / 2, other.cy + other.h / 2);
    }
    const reach = SNAP_PX / g.zoom;
    const offsets = (half) => (box.r ? [0] : [-half, 0, half]);
    const best = (pos, offs, targets) => {
      let found = null;
      for (const off of offs) {
        for (const target of targets) {
          const distance = Math.abs(pos + off - target);
          if (distance < reach && (!found || distance < found.distance)) found = { distance, value: target - off, target };
        }
      }
      return found;
    };
    const bx = best(cx, offsets(box.w / 2), xs);
    const by = best(cy, offsets(box.h / 2), ys);
    guides = [];
    if (bx) guides.push({ axis: 'x', pos: bx.target });
    if (by) guides.push({ axis: 'y', pos: by.target });
    return { cx: bx ? bx.value : cx, cy: by ? by.value : cy };
  }

  /* ---------- editing ---------- */

  function ensureMove(key) {
    if (!canvas.move[key]) canvas.move[key] = freshMove();
    return canvas.move[key];
  }

  function setCenter(box, cx, cy) {
    if (box.type === 'part') {
      const m = ensureMove(box.key);
      m.x = round1(cx - box.home.cx);
      m.y = round1(cy - box.home.cy);
      return;
    }
    const item = canvas.items[box.index];
    item.x = round1(cx - box.w / 2);
    item.y = round1(cy - box.h / 2);
  }

  // Past the working area an item would leave the preview, and nothing could pick it up again.
  function keepInside(g, box) {
    if (box.type !== 'item') return;
    const item = canvas.items[box.index];
    const h = itemHeight(g, item, box.index);
    item.x = round1(clamp(item.x, -CANVAS_EDIT_ROOM.x, g.cardW + CANVAS_EDIT_ROOM.x - Math.min(item.w, g.cardW + CANVAS_EDIT_ROOM.x * 2)));
    item.y = round1(clamp(item.y, -CANVAS_EDIT_ROOM.y, g.cardH + CANVAS_EDIT_ROOM.y - Math.min(h, g.cardH + CANVAS_EDIT_ROOM.y * 2)));
  }

  function setRotation(box, deg) {
    if (box.type === 'part') ensureMove(box.key).r = deg;
    else canvas.items[box.index].r = deg;
  }

  // The picture always covers its frame: the crop can only show less of it, never a gap.
  function clampFit(item) {
    const fit = item.fit;
    fit.w = Math.max(fit.w, item.w, item.h * fit.ar);
    fit.x = round1(clamp(fit.x, item.w - fit.w, 0));
    fit.y = round1(clamp(fit.y, item.h - fit.w / fit.ar, 0));
    fit.w = round1(fit.w);
  }

  function resizeItem(event, p) {
    const { box, orig } = drag;
    const item = canvas.items[box.index];
    const [hx, hy] = HANDLES[drag.handle];
    const local = rotVec(p.x - drag.start.x, p.y - drag.start.y, -box.r);
    const corner = hx !== 0 && hy !== 0;
    let w = box.w;
    let h = box.h;
    if (item.kind === 'text') {
      if (corner) {
        const factor = Math.max(0.2, (box.w + hx * local.x) / box.w);
        item.size = clamp(round1(orig.size * factor), TEXT_SIZE[0], TEXT_SIZE[1]);
        w = box.w * factor;
        h = box.h * factor;
      } else {
        w = Math.max(16, box.w + hx * local.x);
      }
    } else {
      if (hx) w = box.w + hx * local.x;
      if (hy) h = box.h + hy * local.y;
      // A picture keeps its shape unless Shift says otherwise; a shape is free unless Shift says so.
      if (corner && (item.kind === 'image') !== event.shiftKey) {
        const factor = Math.max(w / box.w, h / box.h);
        w = box.w * factor;
        h = box.h * factor;
      }
      w = Math.max(4, w);
      h = Math.max(isLine(item) ? 1 : 4, h);
    }
    const shift = rotVec(hx ? (hx * (w - box.w)) / 2 : 0, hy ? (hy * (h - box.h)) / 2 : 0, box.r);
    item.w = round1(w);
    if (item.kind !== 'text') item.h = round1(h);
    item.x = round1(box.cx + shift.x - w / 2);
    item.y = round1(box.cy + shift.y - h / 2);
    if (item.kind === 'image') refitAfterResize(item, orig, corner, hx, hy);
  }

  function refitAfterResize(item, orig, corner, hx, hy) {
    if (corner) {
      const factor = item.w / orig.w;
      item.fit = { ...orig.fit, x: orig.fit.x * factor, y: orig.fit.y * factor, w: orig.fit.w * factor };
    } else {
      item.fit = { ...orig.fit, x: orig.fit.x + (hx === -1 ? item.w - orig.w : 0), y: orig.fit.y + (hy === -1 ? item.h - orig.h : 0) };
    }
    clampFit(item);
  }

  // A part only scales evenly, around its centre, as its own `scale` property does.
  function resizePart(p) {
    const { box, orig } = drag;
    const before = Math.hypot(drag.start.x - box.cx, drag.start.y - box.cy) || 1;
    const after = Math.hypot(p.x - box.cx, p.y - box.cy);
    ensureMove(box.key).s = Math.round(clamp(orig.s * (after / before), PART_SCALE[0], PART_SCALE[1]) * 1000) / 1000;
  }

  function rotateTo(event, p) {
    const { box } = drag;
    let angle = (Math.atan2(p.y - box.cy, p.x - box.cx) * 180) / Math.PI + 90;
    if (event.shiftKey) angle = Math.round(angle / 15) * 15;
    else if (Math.abs(angle - Math.round(angle / 90) * 90) < 4) angle = Math.round(angle / 90) * 90;
    setRotation(box, Math.round((((angle % 360) + 540) % 360) - 180));
  }

  function pan(p) {
    const { box, orig } = drag;
    const item = canvas.items[box.index];
    const local = rotVec(p.x - drag.start.x, p.y - drag.start.y, -box.r);
    item.fit = { ...orig.fit, x: orig.fit.x + local.x, y: orig.fit.y + local.y };
    clampFit(item);
  }

  /* ---------- pointer ---------- */

  function startDrag(kind, event, extra = {}) {
    const box = selectedBox();
    if (!box || !current) return;
    const orig = box.type === 'part' ? clone(moveOf(box.key)) : clone(canvas.items[box.index]);
    drag = { kind, box: { ...box }, orig, start: toCanvas(current.g, event), moved: false, ...extra };
    event.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  function onMove(event) {
    if (!drag || !current) return;
    // A release outside the window never reaches it; the next move with no button ends the drag.
    if (event.buttons === 0) return void endDrag();
    const p = toCanvas(current.g, event);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * current.g.zoom < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    if (drag.kind === 'move') {
      const free = event.altKey || !snapping();
      const target = free ? { cx: drag.box.cx + dx, cy: drag.box.cy + dy } : snapCenter(drag.box, drag.box.cx + dx, drag.box.cy + dy);
      if (free) guides = [];
      setCenter(drag.box, target.cx, target.cy);
    } else if (drag.kind === 'resize') {
      if (drag.box.type === 'part') resizePart(p);
      else resizeItem(event, p);
    } else if (drag.kind === 'rotate') {
      rotateTo(event, p);
    } else if (drag.kind === 'pan') {
      pan(p);
    }
    keepInside(current.g, drag.box);
    write();
  }

  /*
    The card grows from its centre, where the host keeps it, so each edge moves by half the change.
    Measured in screen pixels from where the drag began: the card moves inside the frame as it grows,
    which would shift any coordinate taken relative to it.
  */
  function startCardResize(event, handle) {
    const g = current.g;
    drag = { kind: 'card', handle, zoom: g.zoom, x: event.clientX, y: event.clientY, w: g.outerW, h: g.outerH, moved: false };
    event.preventDefault();
    window.addEventListener('pointermove', onCardMove);
    window.addEventListener('pointerup', endCardResize);
    window.addEventListener('pointercancel', endCardResize);
  }

  function cardSizeFor(event) {
    const [hx, hy] = HANDLES[drag.handle];
    const size = { width: Math.round(drag.w + (2 * hx * (event.clientX - drag.x)) / drag.zoom) };
    if (hy) size.minHeight = Math.max(0, Math.round(drag.h + (2 * hy * (event.clientY - drag.y)) / drag.zoom));
    return size;
  }

  function onCardMove(event) {
    if (!drag) return;
    if (event.buttons === 0) return void endCardResize(event);
    drag.moved = true;
    options.resizeCard(cardSizeFor(event), false);
  }

  function endCardResize(event) {
    window.removeEventListener('pointermove', onCardMove);
    window.removeEventListener('pointerup', endCardResize);
    window.removeEventListener('pointercancel', endCardResize);
    const size = drag && drag.moved ? cardSizeFor(event) : null;
    drag = null;
    if (size) options.resizeCard(size, true);
    render();
  }

  function endDrag() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    const moved = drag && drag.moved;
    drag = null;
    guides = [];
    if (moved) commit();
    render();
  }

  overlay.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !current) return;
    // Picking repaints the overlay, so the stage below could no longer tell this was a pick and
    // would clear it again.
    if (event.target.closest('[data-id], [data-h], .pd-cv-rot')) event.stopPropagation();
    const handle = event.target.closest('[data-h]');
    if (handle && selected === CARD_ID) return startCardResize(event, handle.dataset.h);
    if (handle) return startDrag('resize', event, { handle: handle.dataset.h });
    if (event.target.closest(`[data-id="${CARD_ID}"]`)) return void (selected !== CARD_ID && select(CARD_ID));
    if (event.target.closest('.pd-cv-rot')) return startDrag('rotate', event);
    const node = event.target.closest('[data-id]');
    if (!node) return;
    const id = node.dataset.id;
    if (cropping && id === selected) return startDrag('pan', event);
    if (id !== selected) select(id);
    startDrag('move', event);
  });

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.pd-cv-overlay [data-id], .pd-cv-overlay [data-h], .pd-cv-rot')) return;
    if (selected || cropping) select(null);
  });

  overlay.addEventListener('dblclick', (event) => {
    const item = selectedItem();
    if (!item || !event.target.closest('[data-id]')) return;
    if (item.kind === 'image') return toggleCrop();
    if (item.kind === 'text') {
      const field = props.querySelector('[data-prop="text"]');
      if (field) field.focus();
    }
  });

  // In crop mode the wheel zooms the picture inside its frame, around the frame's centre.
  overlay.addEventListener(
    'wheel',
    (event) => {
      const item = selectedItem();
      if (!cropping || !item || item.kind !== 'image') return;
      event.preventDefault();
      const fit = item.fit;
      const rx = (item.w / 2 - fit.x) / fit.w;
      const ry = (item.h / 2 - fit.y) / (fit.w / fit.ar);
      fit.w = fit.w * (event.deltaY < 0 ? 1.08 : 1 / 1.08);
      fit.x = item.w / 2 - rx * fit.w;
      fit.y = item.h / 2 - ry * (fit.w / fit.ar);
      clampFit(item);
      write();
      commit();
    },
    { passive: false }
  );

  /* ---------- actions ---------- */

  function select(id) {
    if (id !== selected) cropping = false;
    selected = id;
    if (!id) cropping = false;
    repaint();
  }

  function toggleCrop() {
    const item = selectedItem();
    if (!item || item.kind !== 'image') return;
    cropping = !cropping;
    repaint();
  }

  function addItem(raw) {
    if (canvas.items.length >= CANVAS_MAX_ITEMS) return;
    const before = canvas.items.length;
    canvas.items.push(raw);
    canvas = normalizeCanvas(canvas);
    if (canvas.items.length === before) return void options.status(label('imageRefused'), 'error');
    selected = `i:${canvas.items.length - 1}`;
    cropping = false;
    commit();
  }

  // A new item lands in the middle of the card, so it is seen at once whatever the layout.
  function centred(w, h) {
    const g = current ? current.g : { cardW: 400, cardH: 100 };
    return { x: Math.round(g.cardW / 2 - w / 2), y: Math.round(g.cardH / 2 - h / 2), w, h };
  }

  const ADDERS = {
    text: () => addItem({ kind: 'text', text: label('newText'), size: 16, weight: 700, color: 'text', align: 'center', ...centred(140, 20) }),
    rect: () => addItem({ kind: 'shape', shape: 'rect', fill: '#ffffff', fillMode: 'accent', o: 0.85, radius: 6, ...centred(80, 36) }),
    ellipse: () => addItem({ kind: 'shape', shape: 'ellipse', fill: '#ffffff', fillMode: 'accent', o: 0.85, ...centred(48, 48) }),
    line: () => addItem({ kind: 'shape', shape: 'line', fill: '#ffffff', o: 0.85, ...centred(120, 2) }),
    image: addImage,
  };

  async function addImage() {
    const picked = await options.importImage();
    if (!picked) return;
    if (picked.refused) return void options.status(label('imageRefused'), 'error');
    const ar = picked.width > 0 && picked.height > 0 ? picked.width / picked.height : 1;
    const w = ar >= 1 ? 80 : Math.round(80 * ar);
    const h = ar >= 1 ? Math.round(80 / ar) : 80;
    addItem({ kind: 'image', file: picked.name, fit: { x: 0, y: 0, w, ar }, ...centred(w, h) });
  }

  function removeSelected() {
    if (!selected || selected === CARD_ID) return;
    if (selected.startsWith('p:')) delete canvas.move[selected.slice(2)];
    else canvas.items.splice(Number(selected.slice(2)), 1);
    selected = null;
    cropping = false;
    commit();
  }

  function duplicateSelected() {
    const item = selectedItem();
    if (!item) return;
    addItem({ ...clone(item), x: item.x + 10, y: item.y + 10 });
  }

  function reorder(index, step) {
    const to = index + step;
    if (to < 0 || to >= canvas.items.length) return;
    const items = canvas.items;
    [items[index], items[to]] = [items[to], items[index]];
    if (selected === `i:${index}`) selected = `i:${to}`;
    else if (selected === `i:${to}`) selected = `i:${index}`;
    commit();
  }

  function nudge(dx, dy) {
    const box = selectedBox();
    if (!box) return;
    setCenter(box, box.cx + dx, box.cy + dy);
    write();
    commit();
  }

  function resetAll() {
    canvas = { move: {}, items: [] };
    selected = null;
    cropping = false;
    commit();
  }

  /* ---------- panels ---------- */

  function propRow(key, control) {
    const row = el('label', 'pd-cv-prop');
    row.append(el('span', '', label(key)), control);
    return row;
  }

  // Every control edits live and settles one history step when the browser says it is done.
  // `rebuild`: the choice changes which rows the panel shows, so it is drawn again around it.
  function bind(control, apply, { rebuild = false } = {}) {
    control.addEventListener('input', () => {
      apply(control);
      write();
    });
    control.addEventListener('change', () => {
      apply(control);
      commit();
      if (rebuild) renderProps(true);
    });
    return control;
  }

  function numberControl(value, min, max, step, apply) {
    const control = el('input');
    Object.assign(control, { type: 'number', min, max, step, value });
    return bind(control, (node) => {
      const number = parseFloat(node.value);
      if (Number.isFinite(number)) apply(clamp(number, min, max));
    });
  }

  function selectControl(choices, value, apply, bindOptions) {
    const control = el('select');
    for (const [key, text] of choices) control.appendChild(Object.assign(el('option', '', text), { value: String(key) }));
    control.value = String(value);
    return bind(control, (node) => apply(node.value), bindOptions);
  }

  // Icon buttons for a short list of values; each click is one history step.
  function segmentControl(choices, value, apply) {
    const group = el('span', 'pd-cv-seg');
    group.setAttribute('role', 'group');
    for (const [key, iconName, text] of choices) {
      const button = el('button');
      button.type = 'button';
      button.title = text;
      button.setAttribute('aria-label', text);
      button.setAttribute('aria-pressed', String(key === value));
      button.appendChild(icon(iconName));
      button.addEventListener('click', (event) => {
        event.preventDefault();
        apply(key);
        commit();
      });
      group.appendChild(button);
    }
    return group;
  }

  function colorControl(value, apply) {
    const control = el('input');
    Object.assign(control, { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff' });
    return bind(control, (node) => apply(node.value));
  }

  function actionButton(key, iconName, onClick, on = false) {
    const button = el('button', `pd-cv-btn${on ? ' is-on' : ''}`);
    button.type = 'button';
    button.append(icon(iconName), document.createTextNode(` ${label(key)}`));
    button.addEventListener('click', onClick);
    return button;
  }

  // The card's own Alignment and Font menus already name these values in the user's language.
  function menuName(menu, value) {
    const option = root.querySelector(`#${menu} option[value="${value}"]`);
    return (option && option.textContent) || value;
  }
  const fontChoices = () => [
    ['card', label('prop.fontCard')],
    ...[...root.querySelectorAll('#pd-fontFamily option')].map((option) => [option.value, option.textContent]),
  ];

  // The imported fonts are the ones the card's own font-file menu lists, its "none" entry first.
  function fontFileControl(item) {
    const choices = [...root.querySelectorAll('#pd-fontFile option')].map((option) => [option.value, option.textContent]);
    if (item.fontFile && !choices.some(([value]) => value === item.fontFile)) choices.push([item.fontFile, item.fontFile]);
    const cell = el('span', 'pd-cv-pair');
    const importButton = el('button', 'pd-cv-btn');
    importButton.type = 'button';
    const importLabel = label('act.importFont');
    importButton.title = importLabel;
    importButton.setAttribute('aria-label', importLabel);
    importButton.appendChild(icon('fa-folder-open'));
    importButton.addEventListener('click', async () => {
      const picked = await options.importFont();
      if (!picked) return;
      item.fontFile = picked.name;
      commit();
    });
    cell.append(selectControl(choices, item.fontFile, (v) => (item.fontFile = v)), importButton);
    return cell;
  }

  function textRows(item) {
    const text = el('input');
    Object.assign(text, { type: 'text', value: item.text, maxLength: 160 });
    text.dataset.prop = 'text';
    bind(text, (node) => (item.text = node.value || ' '));
    const colorMode = item.color === 'accent' || item.color === 'text' ? item.color : 'custom';
    const custom = colorControl(colorMode === 'custom' ? item.color : '#ffffff', (hex) => (item.color = hex));
    custom.hidden = colorMode !== 'custom';
    const mode = selectControl(
      [['accent', label('prop.colorAccent')], ['text', label('prop.colorText')], ['custom', label('prop.colorCustom')]],
      colorMode,
      (value) => {
        custom.hidden = value !== 'custom';
        item.color = value === 'custom' ? custom.value : value;
      }
    );
    const upper = el('input', 'pd-cv-switch');
    Object.assign(upper, { type: 'checkbox', checked: item.upper });
    upper.setAttribute('role', 'switch');
    bind(upper, (node) => (item.upper = node.checked));
    const colorCell = el('span', 'pd-cv-pair');
    colorCell.append(mode, custom);
    const align = segmentControl(
      ['left', 'center', 'right'].map((a) => [a, `fa-align-${a}`, menuName('pd-align', a)]),
      item.align,
      (v) => (item.align = v)
    );
    return {
      text: [
        propRow('prop.text', text),
        propRow('prop.font', selectControl(fontChoices(), item.font, (v) => (item.font = v))),
        propRow('prop.fontFile', fontFileControl(item)),
        propRow('prop.size', numberControl(item.size, TEXT_SIZE[0], TEXT_SIZE[1], 1, (v) => (item.size = v))),
        propRow('prop.weight', selectControl([400, 600, 700, 800].map((w) => [w, String(w)]), item.weight, (v) => (item.weight = Number(v)))),
        propRow('prop.align', align),
        propRow('prop.upper', upper),
      ],
      look: [propRow('prop.color', colorCell)],
    };
  }

  function shapeName(shape) {
    const adder = root.querySelector(`[data-cv-add="${shape}"] span`);
    return (adder && adder.textContent) || label(`shape.${shape}`);
  }

  function pair(...cells) {
    const cell = el('span', 'pd-cv-pair');
    cell.append(...cells);
    return cell;
  }

  function shapeRows(item) {
    const rows = [
      propRow('prop.shape', selectControl(CANVAS_SHAPES.map((shape) => [shape, shapeName(shape)]), item.shape, (v) => (item.shape = v), { rebuild: true })),
    ];
    if (isLine(item)) {
      rows.push(propRow('prop.color', colorControl(item.fill, (hex) => (item.fill = hex))));
      return rows;
    }
    const fillMode = selectControl(
      [['solid', label('fill.solid')], ['gradient', label('fill.gradient')], ['accent', label('prop.colorAccent')], ['none', label('fill.none')]],
      item.fillMode,
      (v) => (item.fillMode = v),
      { rebuild: true }
    );
    rows.push(propRow('prop.fill', fillMode));
    if (item.fillMode === 'solid') rows.push(propRow('prop.color', colorControl(item.fill, (hex) => (item.fill = hex))));
    if (item.fillMode === 'gradient') {
      rows.push(
        propRow('prop.gradient', pair(colorControl(item.fill, (hex) => (item.fill = hex)), colorControl(item.fill2, (hex) => (item.fill2 = hex)))),
        propRow('prop.angle', numberControl(item.angle, 0, 360, 5, (v) => (item.angle = v)))
      );
    }
    if (item.shape === 'rect') rows.push(propRow('prop.radius', numberControl(item.radius, 0, 200, 1, (v) => (item.radius = v))));
    rows.push(
      propRow('prop.stroke', pair(numberControl(item.stroke, 0, 20, 1, (v) => (item.stroke = v)), colorControl(item.strokeColor, (hex) => (item.strokeColor = hex)))),
      propRow('prop.shadow', numberControl(item.shadow, 0, 40, 1, (v) => (item.shadow = v))),
      propRow('prop.blur', numberControl(item.blur, 0, 20, 1, (v) => (item.blur = v)))
    );
    return rows;
  }

  // Rows by section: what the item says, how it looks, where it sits.
  function itemRows(item) {
    const { text = [], look = [] } = item.kind === 'text' ? textRows(item) : {};
    if (item.kind === 'shape') look.push(...shapeRows(item));
    if (item.kind === 'image') look.push(propRow('prop.radius', numberControl(item.radius, 0, 50, 1, (v) => (item.radius = v))));
    look.push(propRow('prop.opacity', numberControl(Math.round(item.o * 100), 0, 100, 5, (v) => (item.o = v / 100))));
    return { text, look, place: [propRow('prop.rotation', numberControl(item.r, -180, 180, 1, (v) => (item.r = v)))] };
  }

  function itemActions(item) {
    const actions = [
      actionButton(item.back ? 'act.back' : 'act.front', item.back ? 'fa-level-down-alt' : 'fa-level-up-alt', () => {
        item.back = !item.back;
        commit();
      }),
    ];
    if (item.kind === 'image') actions.push(actionButton(cropping ? 'act.cropDone' : 'act.crop', 'fa-crop-alt', toggleCrop, cropping));
    actions.push(actionButton('act.duplicate', 'fa-clone', duplicateSelected), actionButton('act.delete', 'fa-trash-alt', removeSelected));
    return actions;
  }

  function partRows(key) {
    const m = moveOf(key);
    return {
      place: [
        propRow('prop.scale', numberControl(Math.round(m.s * 100), PART_SCALE[0] * 100, PART_SCALE[1] * 100, 5, (v) => (ensureMove(key).s = v / 100))),
        propRow('prop.rotation', numberControl(m.r, -180, 180, 1, (v) => (ensureMove(key).r = v))),
      ],
    };
  }

  function section(key, rows, actions = []) {
    const block = el('div', 'pd-cv-section');
    block.appendChild(el('span', 'pd-cv-section-title', label(key)));
    block.append(...rows);
    if (actions.length) {
      const bar = el('div', 'pd-cv-props-actions');
      bar.append(...actions);
      block.appendChild(bar);
    }
    return block;
  }

  function renderProps(force = false) {
    const box = selectedBox();
    // The controls panel: every control with nothing selected, only the card's own with the card.
    const cardOnly = selected === CARD_ID;
    cardPanel.hidden = !full || Boolean(box);
    cardPanel.classList.toggle('is-card-only', cardOnly);
    cardTitle.textContent = label(cardOnly ? 'card' : 'general');
    cardHint.textContent = label(cardOnly ? 'cardHint' : 'generalHint');
    barToggle.checked = barSelect.value !== 'none';
    // Rebuilding the panel under the caret would throw away what is being typed.
    if (!force && props.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON') return;
    if (!box) {
      props.hidden = true;
      return void props.replaceChildren();
    }
    props.hidden = false;
    const head = el('div', 'pd-cv-props-head');
    head.append(icon(iconFor(box)), el('b', '', boxName(box)));
    const item = box.type === 'item' ? canvas.items[box.index] : null;
    if (item) head.appendChild(el('span', 'pd-cv-chip', label(`kind.${item.kind}`)));
    const rows = item ? itemRows(item) : partRows(box.key);
    const actions = item ? itemActions(item) : [actionButton('act.home', 'fa-undo', removeSelected)];
    const sections = [];
    if (rows.text && rows.text.length) sections.push(section('section.text', rows.text));
    if (rows.look && rows.look.length) sections.push(section('section.look', rows.look));
    sections.push(section('section.place', rows.place, actions));
    const body = el('div', 'pd-cv-sections');
    body.append(...sections);
    props.replaceChildren(head, body);
  }

  function layerRow(box) {
    const row = el('div', box.id === selected ? 'pd-cv-layer-row is-on' : 'pd-cv-layer-row');
    row.setAttribute('role', 'listitem');
    const pick = el('button', 'pd-cv-layer');
    pick.type = 'button';
    pick.dataset.id = box.id;
    pick.title = boxName(box);
    pick.append(icon(iconFor(box)), el('span', '', boxName(box)));
    pick.addEventListener('click', () => select(box.id));
    row.appendChild(pick);
    if (box.type === 'item') {
      for (const [step, name, key] of [[1, 'fa-chevron-up', 'act.layerUp'], [-1, 'fa-chevron-down', 'act.layerDown']]) {
        const move = el('button', 'pd-cv-layer-step');
        move.type = 'button';
        move.title = label(key);
        move.setAttribute('aria-label', label(key));
        move.dataset.step = String(step);
        move.appendChild(icon(name));
        // The list is rebuilt by the move: keep the keyboard on the same arrow of the same item.
        move.addEventListener('click', () => {
          reorder(box.index, step);
          const again = layerList.querySelector(`[data-id="i:${box.index + step}"]`);
          const target = again && again.parentNode.querySelector(`[data-step="${step}"]`);
          if (target) target.focus();
        });
        row.appendChild(move);
      }
    }
    return row;
  }

  function renderSummary() {
    const moved = Object.keys(canvas.move).length;
    const items = canvas.items.length;
    const parts = [];
    if (moved) parts.push(label('summaryMoved').replace('{count}', moved));
    if (items) parts.push(label('summaryItems').replace('{count}', items));
    summary.textContent = parts.length ? parts.join(' · ') : label('summaryNone');
  }

  function renderPanels() {
    renderProps();
    const boxes = current ? current.boxes.toReversed() : [];
    const groups = [
      ['layersAdded', boxes.filter((box) => box.type === 'item')],
      ['layersParts', boxes.filter((box) => box.type !== 'item')],
    ].filter(([, list]) => list.length);
    // The card itself, first, under which everything else is drawn.
    const cardRow = el('div', selected === CARD_ID ? 'pd-cv-layer-row is-on' : 'pd-cv-layer-row');
    const cardPick = el('button', 'pd-cv-layer');
    cardPick.type = 'button';
    cardPick.dataset.id = CARD_ID;
    cardPick.append(icon('fa-id-card'), el('span', '', label('card')));
    cardPick.addEventListener('click', () => select(CARD_ID));
    cardRow.appendChild(cardPick);
    layerList.replaceChildren(
      cardRow,
      ...groups.flatMap(([key, list]) => {
        const rows = el('div', 'pd-cv-layer-group');
        rows.setAttribute('role', 'list');
        rows.setAttribute('aria-label', label(key));
        rows.append(...list.map(layerRow));
        return [el('span', 'pd-cv-section-title', label(key)), rows];
      })
    );
    renderSummary();
    const atCap = canvas.items.length >= CANVAS_MAX_ITEMS;
    for (const button of root.querySelectorAll('[data-cv-add]')) button.disabled = atCap;
  }

  /* ---------- wiring ---------- */

  for (const button of root.querySelectorAll('[data-cv-add]')) {
    button.addEventListener('click', () => ADDERS[button.dataset.cvAdd]());
  }
  root.querySelector('#pd-canvas-reset').addEventListener('click', resetAll);
  root.querySelector('#pd-cv-full').addEventListener('click', () => setFull(true));
  // Switching the bar off remembers its side, so switching it back on restores it.
  barToggle.addEventListener('change', () => {
    if (barSelect.value !== 'none') lastBar = barSelect.value;
    barSelect.value = barToggle.checked ? lastBar : 'none';
    barSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  root.querySelector('#pd-cv-close').addEventListener('click', () => setFull(false));
  snapButton.addEventListener('click', () => {
    snapOn = !snapOn;
    snapButton.setAttribute('aria-pressed', String(snapOn));
    render();
  });
  // The stage scrolls once zoomed in; the handles follow the card.
  stage.addEventListener('scroll', () => render(), { passive: true });

  function onKey(event) {
    if (!options.active()) return;
    const focused = document.activeElement;
    if (focused && /^(?:input|textarea|select)$/i.test(focused.tagName)) return;
    if (event.key === 'Escape') {
      if (cropping) toggleCrop();
      else if (selected) select(null);
      else if (full) setFull(false);
      else return;
    } else if (!selected) {
      return;
    } else if (event.key.startsWith('Arrow')) {
      const step = event.shiftKey ? NUDGE_BIG : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      nudge(delta[0], delta[1]);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      removeSelected();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'd') {
      duplicateSelected();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  // Capture, so Escape is spent here before it can close Settings.
  document.addEventListener('keydown', onKey, true);

  // Moved, never copied: the controls keep their ids, values and handlers, and saving reads them.
  function placeControls() {
    if (full && controls.parentNode !== cardPanel) {
      controls.before(controlsHome);
      cardPanel.appendChild(controls);
    } else if (!full && controlsHome.parentNode) {
      controlsHome.replaceWith(controls);
    }
  }

  function setFull(on) {
    full = Boolean(on);
    if (!full) {
      selected = null;
      cropping = false;
    }
    placeControls();
    preview.classList.toggle('is-cv-full', full);
    document.body.classList.toggle('pd-cv-open', full);
    // Full screen edits around the card, the normal view shows the popup as it ships: a new stylesheet.
    options.apply();
    repaint();
  }

  // Called after anything repainted the preview: undo, a load, a state switch, a resize.
  function refresh() {
    if (!drag) read();
    render();
    if (!drag) renderPanels();
  }

  return { refresh, setFull, isFull: () => full, isDragging: () => Boolean(drag && drag.moved) };
}

module.exports = { createCanvasEditor };
