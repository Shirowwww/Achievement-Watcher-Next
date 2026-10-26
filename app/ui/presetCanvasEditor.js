'use strict';

/*
  The free layout editor of the preset designer. Its value lives in the hidden #pd-canvas control like
  every other property, so undo, saving and layers work through the paths they already use.
  Coordinates are the card's own CSS pixels: the preview frame is zoomed from outside.
*/

const {
  ANIMATED_IMAGE_RE,
  CANVAS_DASHES,
  CANVAS_ENTRANCES,
  CANVAS_ICONS,
  CANVAS_LOOPS,
  CANVAS_MASK_SHAPES,
  CANVAS_MAX_DELAY_MS,
  CANVAS_MAX_ITEMS,
  CANVAS_POLYGON_SHAPES,
  CANVAS_SHAPE_SETTINGS,
  CANVAS_SHAPES,
  CANVAS_STATES,
  CANVAS_STYLED_PARTS,
  CANVAS_TIER_FILLS,
  CANVAS_TOKENS,
  canvasIn,
  canvasOrder,
  normalizeCanvas,
  normalizeCanvasItem,
} = require('../util/presetSchema.js');
const { createEditorHelp } = require('./presetEditorHelp.js');
const { drawnOnlyIn, foldEdit, itemOwns, partOwns, resetItem, resetPart } = require('./presetCanvasTiers.js');
const { CANVAS_EDIT_ROOM, CANVAS_PART_SELECTORS, CANVAS_STYLE_SELECTORS, canvasIconMask } = require('../util/customPreset.js');

// The designer controls that shape the card itself, shown alone while the card is selected.
const CARD_KEYS = [
  'width', 'minHeight', 'padX', 'padY', 'bgMode', 'bg', 'bg2', 'bgImage', 'opacity', 'artworkDim', 'bgAngle', 'artworkBlur',
  'artworkPosition', 'bgPattern', 'bgPatternOpacity', 'radius', 'accentBar', 'accentBarSize', 'borderWidth', 'borderColor', 'shadow', 'glow',
];
const CARD_ID = 'card';

const TEXT_BLOCK = 'text';
const MARK = 'mark';
const WEIGHTS = [400, 600, 700, 800];
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
const LINE_ICONS = { text: 'fa-font', image: 'fa-image', shape: 'fa-shapes', icon: 'fa-trophy', part: 'fa-th-large' };
// The designer's own settings of a card part, offered beside it when it is picked on the card.
const PART_KEYS = { icon: ['iconSize', 'iconShape', 'iconRadius', 'iconBorder', 'iconGlow'] };
// The preview's state buttons already name each state; the platinum one is called 100%.
const STATE_BUTTONS = { platinum: 'completion' };
const MAX_SWATCHES = 16;
const PASTE_STEP_PX = 10;
// The size a shadow or a glow starts at once it is picked: enough to be seen on any card.
const SHADOW_START = { drop: 8, glow: 12 };
// A 16px glyph per way to line the selection up with the card: the edge, then two bars against it.
const ALIGN_GLYPHS = {
  left: ['M2 1v14', 'M4 3h9v4H4zM4 9h6v4H4z'],
  center: ['M8 1v14', 'M3 3h10v4H3zM5 9h6v4H5z'],
  right: ['M14 1v14', 'M3 3h9v4H3zM6 9h6v4H6z'],
  top: ['M1 2h14', 'M3 4h4v9H3zM9 4h4v6H9z'],
  middle: ['M1 8h14', 'M3 3h4v10H3zM9 5h4v6H9z'],
  bottom: ['M1 14h14', 'M3 3h4v9H3zM9 6h4v6H9z'],
};
// The mirror buttons: the axis, a solid triangle and its outlined reflection, as image editors draw it.
const FLIP_GLYPHS = {
  x: ['M8 1v14', 'M6 3v10L1 8z', 'M10 3.5v9L14.5 8z'],
  y: ['M1 8h14', 'M3 6h10L8 1z', 'M3.5 10h9L8 14.5z'],
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;
const isLine = (item) => item.kind === 'shape' && item.shape === 'line';
const clone = (value) => JSON.parse(JSON.stringify(value));
// A text that shows the tier's name, in any state.
const saysTier = (item) =>
  item.kind === 'text' && [item, ...Object.values(item.tiers || {})].some((own) => typeof own.text === 'string' && own.text.includes('{tier}'));
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
// A 16px glyph from [path, 'stroke' | 'fill'] pairs, drawn in the button's own colour.
function svgGlyph(parts) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, paint] of parts) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute(paint, 'currentColor');
    if (paint === 'stroke') path.setAttribute('fill', 'none');
    svg.appendChild(path);
  }
  return svg;
}
const alignGlyph = (edge) => svgGlyph([[ALIGN_GLYPHS[edge][0], 'stroke'], [ALIGN_GLYPHS[edge][1], 'fill']]);
const flipGlyph = (axis) => svgGlyph([[FLIP_GLYPHS[axis][0], 'stroke'], [FLIP_GLYPHS[axis][1], 'fill'], [FLIP_GLYPHS[axis][2], 'stroke']]);

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
 * @param {() => string} options.markPseudo  'after', 'before', 'after,before' or '' for the base's brand mark
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
  // The colours the design already uses, offered by every colour picker of the designer.
  const swatches = el('datalist');
  swatches.id = 'pd-cv-swatches';
  document.body.appendChild(swatches);
  for (const control of controls.querySelectorAll('input[type="color"]')) control.setAttribute('list', swatches.id);
  const help = createEditorHelp({ root, label: (key) => label(key) });
  for (const field of controls.querySelectorAll('.pd-field[data-key]')) {
    if (CARD_KEYS.includes(field.dataset.key)) field.dataset.card = '1';
  }

  /*
    `layout` is what is stored, with what each state changes; `canvas` is the layout as the preview's
    state draws it, which every edit works on and store() folds back in. `alone` sends an edit to
    that state only, rather than to what every state shares.
  */
  let layout = normalizeCanvas(input.value);
  let canvas = null;
  let viewState = 'normal';
  let lastView = null;
  let sources = new WeakMap();
  let alone = false;
  let selected = null;
  let cropping = false;
  let drag = null;
  let guides = [];
  let current = null;
  let full = false;
  let watchedDoc = null;
  let snapOn = true;
  // Two or more boxes picked together: Shift or Ctrl + click, a box drawn round them, or Ctrl+A.
  let picks = [];
  const snapButton = root.querySelector('#pd-cv-snap');
  const snapping = () => snapOn && current && current.g.zoom < SNAP_OFF_ZOOM;

  const label = (key) => {
    const node = root.querySelector(`#pd-cv-text [data-cv="${key}"]`);
    return (node && node.textContent) || key;
  };

  // The state the preview shows, by its button: the one the layout is edited in.
  function previewState() {
    const button = root.querySelector('#pd-state button.is-on');
    const name = button ? button.dataset.state : 'normal';
    const state = Object.keys(STATE_BUTTONS).find((key) => STATE_BUTTONS[key] === name) || name;
    return CANVAS_STATES.includes(state) ? state : 'normal';
  }
  // The view the next edit is told apart from, and where each of its items is stored.
  function settle() {
    lastView = clone(canvas);
    sources = new WeakMap(canvas.items.map((item, index) => [item, index]));
  }
  function project() {
    viewState = previewState();
    canvas = canvasIn(layout, viewState);
    settle();
  }
  project();

  // A live edit repaints the preview, which calls refresh(): re-reading our own value there would
  // swap `canvas` for a copy while the panel still edits the old item, losing the next keystroke.
  let stored = null;
  // True when it did swap: an undo or a load, after which the panel holds items that are gone.
  function read() {
    if (input.value === stored) return false;
    layout = normalizeCanvas(input.value);
    stored = input.value;
    project();
    return true;
  }
  // The preview went to another state: the layout as that state draws it is the one edited now.
  function restate() {
    if (previewState() === viewState) return false;
    project();
    return true;
  }
  // The preview swaps states in place, without a repaint that would call refresh(). Its own
  // handler, on the button, has run by the time the click reaches the group.
  root.querySelector('#pd-state').addEventListener('click', () => {
    if (drag || !restate()) return;
    render();
    renderPanels(true);
  });
  // Live: the preview follows the pointer. Committed: one history step, through the change event
  // every designer control fires.
  function store() {
    layout = foldEdit(layout, lastView, canvas, { state: viewState, alone, sourceOf: (item) => sources.get(item) });
    settle();
    // {tier} shows the tier's name in the words of whoever edits the layout last.
    if (layout.items.some(saysTier)) layout.words = Object.fromEntries(CANVAS_TIER_FILLS.map((tier) => [tier, label(`fill.${tier}`)]));
    else delete layout.words;
    input.value = JSON.stringify(layout);
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
    if (key === MARK) return measureMark(g);
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

  /*
    A bundled preset's brand mark is a pseudo-element, which has no rect of its own. Its offsets come
    resolved in pixels from the card's padding box, the same origin as the canvas, and the move's
    translate, rotate and scale never change them.
  */
  function measureMark(g) {
    // The first is the mark itself; a ring that follows it is not what the handles frame.
    const pseudo = options.markPseudo().split(',')[0];
    if (!pseudo) return null;
    const style = g.doc.defaultView.getComputedStyle(g.card, `::${pseudo}`);
    if (style.display === 'none' || style.position !== 'absolute') return null;
    const px = (prop) => parseFloat(style.getPropertyValue(prop)) || 0;
    const extra = (a, b) => (style.boxSizing === 'border-box' ? 0 : px(`padding-${a}`) + px(`padding-${b}`) + px(`border-${a}-width`) + px(`border-${b}-width`));
    const w = px('width') + extra('left', 'right');
    const h = px('height') + extra('top', 'bottom');
    if (w < 1 || h < 1) return null;
    return { cx: px('left') + px('margin-left') + w / 2, cy: px('top') + px('margin-top') + h / 2, w, h };
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
    // A tier may draw the item its own way, as another element: the one on screen is this state's.
    const node = [...g.doc.querySelectorAll(`.aw-canvas > [data-i="${index}"]`)].find((one) => one.getClientRects().length);
    return node && node.offsetHeight ? node.offsetHeight : Math.round(item.size * 1.25);
  }

  function itemBox(g, item, index) {
    const h = itemHeight(g, item, index);
    return { id: `i:${index}`, type: 'item', index, cx: item.x + item.w / 2, cy: item.y + h / 2, w: item.w, h, r: item.r };
  }

  // Bottom first, as the card stacks them. The text block, which holds the lines, comes before all,
  // so a line wins a click over it.
  function collectBoxes(g) {
    const layers = canvasOrder(canvas).map((entry) => (Number.isInteger(entry) ? itemBox(g, canvas.items[entry], entry) : partBox(g, entry)));
    // The mark is drawn by the card itself, under or over its content, so it never joins the order.
    return [partBox(g, MARK), partBox(g, TEXT_BLOCK), ...layers].filter(Boolean);
  }

  const selectedBox = () => (current && current.boxes.find((box) => box.id === selected)) || null;
  const selectedItem = () => (selected && selected.startsWith('i:') ? canvas.items[Number(selected.slice(2))] : null);
  const grouped = () => picks.length > 1;
  const selection = () => (grouped() ? picks : selected && selected !== CARD_ID ? [selected] : []);
  const selectionBoxes = () => (current ? selection().map((id) => current.boxes.find((box) => box.id === id)).filter(Boolean) : []);
  const selectedItems = () => selection().filter((id) => id.startsWith('i:')).map((id) => canvas.items[Number(id.slice(2))]).filter(Boolean);
  const movable = () => selectionBoxes().filter((box) => !isLocked(box));
  const addsToGroup = (event) => event.shiftKey || event.ctrlKey;
  // The text block holds the lines: picked with one of them, it would carry that line twice.
  const groupable = (id) => id !== CARD_ID && id !== `p:${TEXT_BLOCK}`;
  // What a drawn box or Ctrl+A sweeps up: nothing locked or switched off either.
  const pickable = (box) => groupable(box.id) && !isLocked(box) && !(box.type === 'item' && canvas.items[box.index].off);

  // A box's outline on the card, a turned one included.
  function extentOf(box) {
    const rad = (box.r * Math.PI) / 180;
    const halfW = (Math.abs(box.w * Math.cos(rad)) + Math.abs(box.h * Math.sin(rad))) / 2;
    const halfH = (Math.abs(box.w * Math.sin(rad)) + Math.abs(box.h * Math.cos(rad))) / 2;
    return { left: box.cx - halfW, right: box.cx + halfW, top: box.cy - halfH, bottom: box.cy + halfH };
  }
  function boundsOf(boxes) {
    const all = boxes.map(extentOf);
    return {
      left: Math.min(...all.map((e) => e.left)),
      right: Math.max(...all.map((e) => e.right)),
      top: Math.min(...all.map((e) => e.top)),
      bottom: Math.max(...all.map((e) => e.bottom)),
    };
  }
  const frameBox = (b) => ({ cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2, w: b.right - b.left, h: b.bottom - b.top, r: 0 });
  const areaOf = ({ start, end }) => ({ left: Math.min(start.x, end.x), right: Math.max(start.x, end.x), top: Math.min(start.y, end.y), bottom: Math.max(start.y, end.y) });
  const touches = (a, b) => a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

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
    if (isLocked(box)) {
      node.classList.add('is-locked');
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

  // Each member outlined, and one frame round them all that lets clicks through to them.
  function groupNodes(g) {
    const boxes = selectionBoxes();
    const frame = el('div', 'pd-cv-group');
    place(frame, g, frameBox(boundsOf(boxes)));
    const members = boxes.map((box) => {
      const node = el('div', isLocked(box) ? 'pd-cv-sel is-member is-locked' : 'pd-cv-sel is-member');
      node.dataset.id = box.id;
      place(node, g, box);
      return node;
    });
    return [frame, ...members];
  }

  function marqueeNode(g) {
    const node = el('div', 'pd-cv-marquee');
    place(node, g, frameBox(areaOf(drag)));
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
    // A member gone (an undo, a part this card hides) leaves the group; the last one left is a plain pick.
    if (grouped()) {
      picks = picks.filter((id) => current.boxes.some((box) => box.id === id));
      if (picks.length === 1) selected = picks[0];
      if (!grouped()) picks = [];
    }
    // Under everything else, so a click on a part or an item still picks that.
    const card = el('div', 'pd-cv-box is-card');
    card.dataset.id = CARD_ID;
    card.title = label('card');
    place(card, g, cardBox(g));
    const nodes = [
      card,
      ...current.boxes.map((box) => {
        const node = el('div', isLocked(box) ? 'pd-cv-box is-locked' : 'pd-cv-box');
        node.dataset.id = box.id;
        node.title = boxName(box);
        place(node, g, box);
        return node;
      }),
    ];
    const box = selectedBox();
    if (grouped()) nodes.push(...groupNodes(g));
    else if (box) nodes.push(selectionNode(g, box));
    else if (selected === CARD_ID) nodes.push(cardSelectionNode(g));
    if (drag && drag.kind === 'marquee' && drag.moved) nodes.push(marqueeNode(g));
    for (const guide of guides) nodes.push(guideNode(g, guide));
    overlay.replaceChildren(...nodes);
  }

  const iconFor = (box) => LINE_ICONS[box.type === 'part' ? 'part' : canvas.items[box.index].kind];

  function boxName(box) {
    if (box.type === 'part') return label(`part.${box.key}`);
    const item = canvas.items[box.index];
    if (item.kind === 'text') return item.text.split('\n')[0].slice(0, 28) || label('kind.text');
    // The toolbar buttons already name each shape; three rows called "Shape" tell nothing apart.
    if (item.kind === 'icon') return label(`icon.${item.icon}`);
    return item.kind === 'shape' ? shapeName(item.shape) : label(`kind.${item.kind}`);
  }

  const isLocked = (box) => box.type === 'item' && Boolean(canvas.items[box.index] && canvas.items[box.index].lock);

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

  const entryOf = (id) => (id.startsWith('i:') ? Number(id.slice(2)) : id.slice(2));
  const idOf = (entry) => (Number.isInteger(entry) ? `i:${entry}` : `p:${entry}`);

  // `back` follows the order, so a build that only knows `back` still draws what is closest to it.
  function setOrder(order) {
    canvas.order = order;
    const firstPart = order.findIndex((entry) => !Number.isInteger(entry));
    order.forEach((entry, position) => {
      if (Number.isInteger(entry)) canvas.items[entry].back = position < firstPart;
    });
  }

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

  function follow(event) {
    event.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  function startDrag(kind, event, extra = {}) {
    const box = selectedBox();
    if (!box || !current || isLocked(box)) return;
    const orig = box.type === 'part' ? clone(moveOf(box.key)) : clone(canvas.items[box.index]);
    drag = { kind, box: { ...box }, orig, start: toCanvas(current.g, event), moved: false, ...extra };
    follow(event);
  }

  // The group moves as one and does not snap: each member would pull towards a different line.
  function startGroupDrag(event) {
    const boxes = movable();
    if (!boxes.length) return;
    drag = { kind: 'group', boxes: boxes.map((box) => ({ ...box })), start: toCanvas(current.g, event), moved: false };
    follow(event);
  }

  // From the card or around it a drag draws a box that picks what it touches, and a click picks
  // `clickId` (the card, or nothing). With Shift or Ctrl held, both add to what is picked already.
  function startMarquee(event, clickId) {
    if (!current) return;
    // A field being typed in settles first, as a click anywhere else would settle it.
    if (props.contains(document.activeElement)) document.activeElement.blur();
    const add = addsToGroup(event);
    const start = toCanvas(current.g, event);
    drag = { kind: 'marquee', clickId, add, base: add ? selection() : [], start, end: start, moved: false };
    follow(event);
  }

  function endMarquee(done) {
    if (done.moved) {
      const area = areaOf(done);
      const touched = current ? current.boxes.filter((box) => pickable(box) && touches(extentOf(box), area)).map((box) => box.id) : [];
      return pickMany([...new Set([...done.base, ...touched])]);
    }
    if (done.add) return render();
    if (done.clickId === CARD_ID) return selected === CARD_ID ? render() : select(CARD_ID);
    if (selected || grouped() || cropping) return select(null);
    render();
  }

  const moveBoxes = (boxes, dx, dy) => boxes.forEach((box) => setCenter(box, box.cx + dx, box.cy + dy));

  function onMove(event) {
    if (!drag || !current) return;
    // A release outside the window never reaches it; the next move with no button ends the drag.
    if (event.buttons === 0) return void endDrag();
    const p = toCanvas(current.g, event);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * current.g.zoom < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    if (drag.kind === 'marquee') {
      drag.end = p;
      return void render();
    }
    if (drag.kind === 'group') {
      moveBoxes(drag.boxes, dx, dy);
    } else if (drag.kind === 'move') {
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
    for (const box of drag.boxes || [drag.box]) keepInside(current.g, box);
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
    const done = drag;
    drag = null;
    guides = [];
    if (done && done.kind === 'marquee') return endMarquee(done);
    if (done && done.moved) commit();
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
    if (event.target.closest('.pd-cv-rot')) return startDrag('rotate', event);
    const node = event.target.closest('[data-id]');
    if (!node) return;
    const id = node.dataset.id;
    if (id === CARD_ID) return startMarquee(event, CARD_ID);
    if (addsToGroup(event)) return toggleMember(id);
    if (grouped() && picks.includes(id)) return startGroupDrag(event);
    if (cropping && id === selected) return startDrag('pan', event);
    if (id !== selected) select(id);
    startDrag('move', event);
  });

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.pd-cv-overlay [data-id], .pd-cv-overlay [data-h], .pd-cv-rot')) return;
    // A press on the stage's own scroll bar scrolls it.
    if (event.target === stage && (event.offsetX >= stage.clientWidth || event.offsetY >= stage.clientHeight)) return;
    startMarquee(event, null);
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
    picks = [];
    if (!id) cropping = false;
    repaint();
  }

  // Two or more make a group; one is a plain pick, with its handles and its own panel.
  function pickMany(ids) {
    if (ids.length < 2) return select(ids[0] || null);
    picks = ids;
    selected = null;
    cropping = false;
    repaint();
  }

  function toggleMember(id) {
    if (!groupable(id)) return;
    const ids = selection();
    pickMany(ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]);
  }

  function toggleCrop() {
    const item = selectedItem();
    if (!item || item.kind !== 'image' || (!cropping && item.lock)) return;
    cropping = !cropping;
    repaint();
  }

  // What was added comes in picked: one item alone, several (a pasted group) as a group.
  function addItems(raws) {
    if (canvas.items.length + raws.length > CANVAS_MAX_ITEMS) return void options.status(label('maxItems'), 'error');
    const before = canvas.items.length;
    canvas.items.push(...raws.map(normalizeCanvasItem).filter(Boolean));
    const added = canvas.items.length - before;
    if (!added) return void options.status(label('imageRefused'), 'error');
    const ids = Array.from({ length: added }, (_, offset) => `i:${before + offset}`);
    picks = added > 1 ? ids : [];
    selected = added > 1 ? null : ids[0];
    cropping = false;
    commit();
  }
  const addItem = (raw) => addItems([raw]);

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
    icon: () => addItem({ kind: 'icon', icon: 'trophy', fillMode: 'accent', ...centred(40, 40) }),
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

  const isHidden = (key) => Boolean(canvas.hidden && canvas.hidden.includes(key));

  // A part goes back where the preset puts it, and is shown again if it had been removed.
  function homeSelected() {
    if (!selected || !selected.startsWith('p:')) return;
    const key = selected.slice(2);
    delete canvas.move[key];
    if (canvas.hidden) canvas.hidden = canvas.hidden.filter((part) => part !== key);
    commit();
  }

  function dropItem(index) {
    canvas.items.splice(index, 1);
    if (canvas.order) canvas.order = canvas.order.filter((entry) => entry !== index).map((entry) => (Number.isInteger(entry) && entry > index ? entry - 1 : entry));
  }

  /*
    A part of the card cannot be deleted, only hidden: the preset still draws it. A locked item
    holds, deleting included, until it is unlocked. Edited for one state alone, an item another
    state still draws is only switched off in this one.
  */
  function removeSelected() {
    const ids = selection();
    const parts = ids.filter((id) => id.startsWith('p:')).map(entryOf).filter((key) => !isHidden(key));
    const items = ids.filter((id) => id.startsWith('i:')).map(entryOf).filter((index) => canvas.items[index] && !canvas.items[index].lock);
    if (!parts.length && !items.length) return;
    if (parts.length) canvas.hidden = [...(canvas.hidden || []), ...parts];
    // Highest first, so each index still names its item when its turn comes.
    for (const index of items.sort((a, b) => b - a)) {
      const from = sources.get(canvas.items[index]);
      if (alone && from !== undefined && !drawnOnlyIn(layout, from, viewState)) canvas.items[index].off = true;
      else dropItem(index);
    }
    if (items.length) {
      selected = null;
      picks = [];
      cropping = false;
    }
    commit();
  }

  // A copy is a new element to place, so it never comes in locked.
  function looseCopy(item, step) {
    const copy = clone(item);
    delete copy.lock;
    return { ...copy, x: item.x + step, y: item.y + step };
  }

  function duplicateSelected() {
    const items = selectedItems();
    if (items.length) addItems(items.map((item) => looseCopy(item, PASTE_STEP_PX)));
  }

  // Kept for the editor's lifetime, so elements can go from one preset to another.
  let clipboard = null;
  let pastes = 0;
  function copySelected() {
    const items = selectedItems();
    if (!items.length) return;
    clipboard = clone(items);
    pastes = 0;
    options.status(label('copied'), 'info');
  }
  function pasteItem() {
    if (!clipboard) return;
    pastes += 1;
    addItems(clipboard.map((item) => looseCopy(item, PASTE_STEP_PX * pastes)));
  }

  // How far a box must go so that its outline meets an edge or the middle of `frame`.
  function alignShift(extent, frame, edge) {
    const dx = { left: frame.left - extent.left, center: (frame.left + frame.right - extent.left - extent.right) / 2, right: frame.right - extent.right }[edge];
    const dy = { top: frame.top - extent.top, middle: (frame.top + frame.bottom - extent.top - extent.bottom) / 2, bottom: frame.bottom - extent.bottom }[edge];
    return [dx || 0, dy || 0];
  }

  // On the card, the selection moves as one block; among themselves, each member meets the
  // group's own outline, a locked member included, which holds still and shows where.
  function alignSelected(edge, onCard = true) {
    const boxes = selectionBoxes();
    const free = movable();
    if (!free.length) return;
    if (onCard) {
      const [dx, dy] = alignShift(boundsOf(free), { left: 0, top: 0, right: current.g.cardW, bottom: current.g.cardH }, edge);
      moveBoxes(free, dx, dy);
    } else {
      const frame = boundsOf(boxes);
      for (const box of free) {
        const [dx, dy] = alignShift(extentOf(box), frame, edge);
        setCenter(box, box.cx + dx, box.cy + dy);
      }
    }
    commit();
  }

  // The eye: an item is switched off, a part of the card is removed (and can be put back).
  function toggleShown(box) {
    if (box.type === 'item') {
      const item = canvas.items[box.index];
      if (item.off) delete item.off;
      else item.off = true;
    } else if (isHidden(box.key)) {
      canvas.hidden = canvas.hidden.filter((part) => part !== box.key);
    } else {
      canvas.hidden = [...(canvas.hidden || []), box.key];
    }
    commit();
  }

  function toggleLock(box) {
    const item = canvas.items[box.index];
    if (item.lock) delete item.lock;
    else item.lock = true;
    if (item.lock && box.id === selected) cropping = false;
    commit();
  }

  // One step past the next layer on screen: a part this card hides is not one to step over by hand.
  function reorder(id, step) {
    const order = canvasOrder(canvas);
    const entry = entryOf(id);
    const visible = new Set(current ? current.boxes.map((box) => box.id) : []);
    const shown = order.filter((other) => visible.has(idOf(other)));
    const target = shown[shown.indexOf(entry) + step];
    if (target === undefined) return;
    const rest = order.filter((other) => other !== entry);
    rest.splice(rest.indexOf(target) + (step > 0 ? 1 : 0), 0, entry);
    setOrder(rest);
    commit();
  }

  // To the very bottom or the very top of the stack.
  function sendItem(index, back) {
    const rest = canvasOrder(canvas).filter((entry) => entry !== index);
    setOrder(back ? [index, ...rest] : [...rest, index]);
    commit();
  }

  function nudge(dx, dy) {
    const boxes = movable();
    if (!boxes.length) return;
    moveBoxes(boxes, dx, dy);
    write();
    commit();
  }

  // Every state at once, whichever is edited.
  function resetAll() {
    layout = normalizeCanvas(null);
    project();
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

  function groupRow(key, control) {
    const row = el('div', 'pd-cv-prop');
    const name = el('span', '', label(key));
    name.id = `pd-cv-row-${key.replace(/\W+/g, '-')}`;
    control.setAttribute('aria-labelledby', name.id);
    row.append(name, control);
    return row;
  }

  // One number with the letter of its axis in front, for the rows that hold two.
  function axisControl(letter, value, min, max, apply) {
    const cell = el('span', 'pd-cv-axis');
    const control = numberControl(round1(value), min, max, 1, apply);
    control.setAttribute('aria-label', letter);
    cell.append(el('b', '', letter), control);
    return cell;
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
    bind(control, (node) => {
      const number = parseFloat(node.value);
      if (Number.isFinite(number)) apply(clamp(number, min, max));
    });
    // Once settled, the field shows what was applied rather than the out-of-range number typed.
    control.addEventListener('change', () => {
      const number = parseFloat(control.value);
      if (Number.isFinite(number)) control.value = String(clamp(number, min, max));
    });
    return control;
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
    control.setAttribute('list', swatches.id);
    return bind(control, (node) => apply(node.value));
  }

  // A colour that can follow something else: `named` lists those as [value, label key], and the
  // picker beside them only shows for a colour of the user's own.
  function colorChoice(value, named, apply) {
    const own = !named.some(([key]) => key === value);
    const custom = colorControl(own ? value : '#ffffff', (hex) => apply(hex));
    custom.hidden = !own;
    const choices = [...named.map(([key, text]) => [key, label(text)]), ['custom', label('prop.colorCustom')]];
    const mode = selectControl(choices, own ? 'custom' : value, (picked) => {
      custom.hidden = picked !== 'custom';
      apply(picked === 'custom' ? custom.value : picked);
    });
    return pair(mode, custom);
  }

  function switchControl(on, apply) {
    const control = el('input', 'pd-cv-switch');
    Object.assign(control, { type: 'checkbox', checked: Boolean(on) });
    control.setAttribute('role', 'switch');
    return bind(control, (node) => apply(node.checked));
  }

  // A field at its default is left out, so the layout keeps one spelling of it.
  function setOrDrop(item, key, value, fallback) {
    if (value === fallback) delete item[key];
    else item[key] = value;
  }

  // The panel shows more rows once a number leaves zero (a stroke, a shadow), and fewer when it
  // comes back: drawn again only then, so typing a width keeps the caret.
  function rebuildAcrossZero(control, valueNow) {
    const was = valueNow() > 0;
    control.addEventListener('change', () => {
      if (valueNow() > 0 !== was) renderProps(true);
    });
    return control;
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

  // `item` is an added text, or a card line seen through partStyle(); only the first has words to edit.
  function textRows(item, withText = true) {
    const text = el('input');
    Object.assign(text, { type: 'text', value: item.text, maxLength: 160 });
    text.dataset.prop = 'text';
    bind(text, (node) => (item.text = node.value || ' '));
    const colorCell = colorChoice(item.color, [['accent', 'prop.colorAccent'], ['text', 'prop.colorText']], (value) => (item.color = value));
    const upper = switchControl(item.upper, (on) => (item.upper = on));
    const align = segmentControl(
      ['left', 'center', 'right'].map((a) => [a, `fa-align-${a}`, menuName('pd-align', a)]),
      item.align,
      (v) => (item.align = v)
    );
    return {
      text: [
        withText ? propRow('prop.text', text) : null,
        withText ? tokenRow(text, item) : null,
        propRow('prop.font', selectControl(fontChoices(), item.font, (v) => (item.font = v))),
        propRow('prop.fontFile', fontFileControl(item)),
        propRow('prop.size', numberControl(item.size, TEXT_SIZE[0], TEXT_SIZE[1], 1, (v) => (item.size = v))),
        propRow('prop.weight', selectControl(WEIGHTS.map((w) => [w, String(w)]), item.weight, (v) => (item.weight = Number(v)))),
        propRow('prop.align', align),
        propRow('prop.upper', upper),
      ].filter(Boolean),
      // A card line keeps the preset's own shadow; only an added text gets one of its own.
      look: [propRow('prop.color', colorCell), ...(withText ? shadowRows(item, false) : [])],
    };
  }

  // Puts a word of the popup where the caret is, written the way the engine reads it.
  function tokenRow(field, item) {
    const group = el('span', 'pd-cv-tokens');
    group.setAttribute('role', 'group');
    for (const token of CANVAS_TOKENS) {
      const button = el('button', '', label(`token.${token}`));
      button.type = 'button';
      button.title = `{${token}}`;
      // The text field keeps its caret, so the word lands where the user was typing.
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? start;
        const word = `{${token}}`;
        const value = `${field.value.slice(0, start)}${word}${field.value.slice(end)}`;
        if (value.length > field.maxLength) return;
        field.value = value;
        field.setSelectionRange(start + word.length, start + word.length);
        item.text = value;
        commit();
      });
      group.appendChild(button);
    }
    return groupRow('prop.insert', group);
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

  // What fills a shape or an icon: a colour, a gradient, the colour of the popup's tier, or one tier's.
  function paintRows(item, withNone) {
    const modes = [['solid', label('fill.solid')], ['gradient', label('fill.gradient')], ['radial', label('fill.radial')], ['accent', label('fill.state')]];
    for (const tier of CANVAS_TIER_FILLS) modes.push([tier, label(`fill.${tier}`)]);
    if (withNone) modes.push(['none', label('fill.none')]);
    const rows = [propRow('prop.fill', selectControl(modes, item.fillMode, (v) => (item.fillMode = v), { rebuild: true }))];
    if (item.fillMode === 'solid') rows.push(propRow('prop.color', colorControl(item.fill, (hex) => (item.fill = hex))));
    if (item.fillMode === 'gradient' || item.fillMode === 'radial') {
      rows.push(propRow('prop.gradient', pair(colorControl(item.fill, (hex) => (item.fill = hex)), colorControl(item.fill2, (hex) => (item.fill2 = hex)))));
    }
    // A radial gradient spreads from the middle, so it has no direction to set.
    if (item.fillMode === 'gradient') rows.push(propRow('prop.angle', numberControl(item.angle, 0, 360, 5, (v) => (item.angle = v))));
    return rows;
  }

  // Picked by name, so "no shadow" is a choice rather than a size of 0. A glow is seen at once, lit
  // in the tier's colour: a black glow reads as a smudge.
  function setShadow(item, kind) {
    if (kind === 'none') {
      item.shadow = 0;
      delete item.shadowStyle;
      delete item.shadowColor;
      return;
    }
    setOrDrop(item, 'shadowStyle', kind, 'drop');
    if (!item.shadow) item.shadow = SHADOW_START[kind];
    if (kind === 'glow' && !item.shadowColor) item.shadowColor = 'accent';
  }

  // A drop shadow or a glow, in black, in the colour of the popup's tier or in any colour.
  function shadowRows(item, withBlur) {
    // The blur softens the element itself, so it comes first and the shadow's rows stay together.
    const rows = withBlur ? [propRow('prop.blur', numberControl(item.blur, 0, 20, 1, (v) => (item.blur = v)))] : [];
    const kind = item.shadow ? item.shadowStyle || 'drop' : 'none';
    const choices = ['none', 'drop', 'glow'].map((name) => [name, label(`shadow.${name}`)]);
    rows.push(propRow('prop.shadow', selectControl(choices, kind, (value) => setShadow(item, value), { rebuild: true })));
    if (!item.shadow) return rows;
    const size = rebuildAcrossZero(numberControl(item.shadow, 0, 40, 1, (v) => (item.shadow = v)), () => item.shadow || 0);
    const color = colorChoice(item.shadowColor || 'black', [['black', 'shadow.black'], ['accent', 'fill.state']], (value) => setOrDrop(item, 'shadowColor', value, 'black'));
    rows.push(propRow('prop.shadowSize', size), propRow('prop.shadowColor', color));
    return rows;
  }

  // The settings one shape has of its own: a star's points, an arrow's head, a triangle's top.
  const shapeSettingRows = (item, shape) =>
    Object.entries(CANVAS_SHAPE_SETTINGS[shape] || {}).map(([key, [min, max, fallback]]) =>
      propRow(`prop.${key}`, numberControl(item[key] ?? fallback, min, max, 1, (v) => setOrDrop(item, key, v, fallback)))
    );

  // Another shape keeps none of the last one's settings, so the layout holds only what it draws.
  // A picture's plain rectangle is no shape at all.
  function setShape(item, shape) {
    for (const key of Object.keys(CANVAS_SHAPE_SETTINGS[item.shape] || {})) delete item[key];
    const polygon = CANVAS_POLYGON_SHAPES.includes(shape);
    if (!polygon) delete item.round;
    // A plain shape looks the same mirrored, and the panel no longer offers to undo it.
    if (item.kind === 'shape' && !polygon) {
      delete item.flipX;
      delete item.flipY;
    }
    if (shape) item.shape = shape;
    else delete item.shape;
  }

  function dashControl(item) {
    return selectControl(CANVAS_DASHES.map((dash) => [dash, label(`dash.${dash}`)]), item.dash || 'solid', (v) => setOrDrop(item, 'dash', v, 'solid'));
  }

  // Mirrors the item; a shape that is the same both ways round has nothing to mirror.
  function flipRow(item) {
    const group = el('span', 'pd-cv-seg');
    group.setAttribute('role', 'group');
    for (const [key, axis] of [['flipX', 'x'], ['flipY', 'y']]) {
      const button = el('button');
      button.type = 'button';
      button.title = label(`flip.${axis}`);
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(Boolean(item[key])));
      button.appendChild(flipGlyph(axis));
      button.addEventListener('click', (event) => {
        event.preventDefault();
        setOrDrop(item, key, !item[key], false);
        commit();
      });
      group.appendChild(button);
    }
    return groupRow('prop.flip', group);
  }

  // How round the corners are: a rectangle's in pixels, a polygon's as a share of its size.
  function cornerRow(item) {
    if (item.shape === 'rect') return propRow('prop.radius', numberControl(item.radius, 0, 200, 1, (v) => (item.radius = v)));
    if (!CANVAS_POLYGON_SHAPES.includes(item.shape)) return null;
    return propRow('prop.radius', numberControl(item.round || 0, 0, 100, 1, (v) => setOrDrop(item, 'round', v, 0)));
  }

  function shapeRows(item) {
    const rows = [
      propRow('prop.shape', selectControl(CANVAS_SHAPES.map((shape) => [shape, shapeName(shape)]), item.shape, (v) => setShape(item, v), { rebuild: true })),
    ];
    if (isLine(item)) {
      rows.push(propRow('prop.color', colorControl(item.fill, (hex) => (item.fill = hex))), propRow('prop.dash', dashControl(item)));
      return rows;
    }
    rows.push(...shapeSettingRows(item, item.shape), cornerRow(item), ...paintRows(item, true));
    const stroke = rebuildAcrossZero(numberControl(item.stroke, 0, 20, 1, (v) => (item.stroke = v)), () => item.stroke);
    rows.push(propRow('prop.stroke', pair(stroke, colorControl(item.strokeColor, (hex) => (item.strokeColor = hex)))));
    if (item.stroke) rows.push(propRow('prop.dash', dashControl(item)));
    if (CANVAS_POLYGON_SHAPES.includes(item.shape)) rows.push(flipRow(item));
    rows.push(...shadowRows(item, true));
    return rows.filter(Boolean);
  }

  // A picture can be cut to any shape but a line, with that shape's own settings.
  function imageRows(item) {
    const shape = item.shape || 'rect';
    const choices = CANVAS_MASK_SHAPES.map((name) => [name, shapeName(name)]);
    const rows = [propRow('prop.shape', selectControl(choices, shape, (v) => setShape(item, v === 'rect' ? undefined : v), { rebuild: true }))];
    rows.push(...shapeSettingRows(item, shape));
    if (shape !== 'ellipse') rows.push(propRow('prop.radius', numberControl(item.radius, 0, 50, 1, (v) => (item.radius = v))));
    rows.push(flipRow(item));
    // An animated picture plays from where it is; this starts it over each time the popup shows.
    if (ANIMATED_IMAGE_RE.test(item.file)) rows.push(propRow('prop.replay', switchControl(item.replay, (on) => setOrDrop(item, 'replay', on, false))));
    return rows;
  }

  function iconRows(item) {
    const grid = el('span', 'pd-cv-icons');
    grid.setAttribute('role', 'group');
    for (const name of Object.keys(CANVAS_ICONS)) {
      const button = el('button');
      button.type = 'button';
      button.title = label(`icon.${name}`);
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(item.icon === name));
      const glyph = el('span');
      glyph.style.maskImage = canvasIconMask(name);
      button.appendChild(glyph);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        item.icon = name;
        commit();
      });
      grid.appendChild(button);
    }
    return [groupRow('prop.icon', grid), ...paintRows(item, false), flipRow(item), ...shadowRows(item, true)];
  }

  const stateName = (state) => {
    const button = root.querySelector(`#pd-state [data-state="${STATE_BUTTONS[state] || state}"]`);
    return (button && button.textContent) || state;
  };

  // The layer's eye, as a setting like the others: for every state, or for the shown one alone.
  const visibleRow = (item) => propRow('prop.visible', switchControl(!item.off, (on) => setOrDrop(item, 'off', !on, false)));

  /*
    Where an edit goes: to what every state shares, or to the shown state alone. A state that has
    its own values for the selection says so, with the way back to the shared look.
  */
  function tierBar(box) {
    const name = stateName(viewState);
    const bar = el('div', 'pd-cv-tier');
    const choice = el('span', 'pd-cv-tier-choice');
    choice.setAttribute('role', 'group');
    choice.setAttribute('aria-label', label('tier.edit'));
    for (const [only, text] of [[false, label('tier.all')], [true, label('tier.only').replace('{tier}', name)]]) {
      const button = el('button', '', text);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(alone === only));
      button.addEventListener('click', (event) => {
        event.preventDefault();
        alone = only;
        renderProps(true);
      });
      choice.appendChild(button);
    }
    bar.append(el('span', 'pd-cv-tier-label', label('tier.edit')), choice);
    const owns = box && (box.type === 'item' ? itemOwns(layout, sources.get(canvas.items[box.index]), viewState) : partOwns(layout, box.key, viewState));
    if (owns) {
      const note = el('p', 'pd-cv-tier-note', label('tier.changed').replace('{tier}', name));
      note.appendChild(actionButton('tier.reset', 'fa-undo', () => resetToShared(box)));
      bar.appendChild(note);
    }
    return bar;
  }

  function resetToShared(box) {
    layout = box.type === 'item' ? resetItem(layout, sources.get(canvas.items[box.index]), viewState) : resetPart(layout, box.key, viewState);
    project();
    commit();
  }

  function alignRow(onCard = true) {
    const group = el('span', 'pd-cv-seg pd-cv-align');
    group.setAttribute('role', 'group');
    for (const edge of Object.keys(ALIGN_GLYPHS)) {
      const button = el('button');
      button.type = 'button';
      button.title = label(`align.${edge}`);
      button.setAttribute('aria-label', button.title);
      button.appendChild(alignGlyph(edge));
      button.addEventListener('click', (event) => {
        event.preventDefault();
        alignSelected(edge, onCard);
      });
      group.appendChild(button);
    }
    return groupRow(onCard ? 'prop.alignCard' : 'prop.alignGroup', group);
  }

  // A picture keeps its proportions and its crop when its width is typed. Scaled from the size the
  // panel opened with, so each keystroke starts over instead of compounding the last one's rounding.
  function scaleImage(item, w, base) {
    const factor = w / base.w;
    item.h = round1(base.h * factor);
    item.fit = { ...base.fit, x: base.fit.x * factor, y: base.fit.y * factor, w: base.fit.w * factor };
    item.w = w;
    clampFit(item);
  }

  function sizeRows(item) {
    const rows = [
      propRow('prop.position', pair(axisControl('X', item.x, -600, 1200, (v) => (item.x = v)), axisControl('Y', item.y, -400, 800, (v) => (item.y = v)))),
    ];
    if (item.kind === 'text') rows.push(propRow('prop.dims', axisControl('W', item.w, 16, 1200, (v) => (item.w = v))));
    else if (item.kind === 'image') {
      const base = { w: item.w, h: item.h, fit: { ...item.fit } };
      rows.push(propRow('prop.dims', axisControl('W', item.w, 4, 1200, (v) => scaleImage(item, v, base))));
    } else {
      const minH = isLine(item) ? 1 : 4;
      rows.push(propRow('prop.dims', pair(axisControl('W', item.w, 4, 1200, (v) => (item.w = v)), axisControl('H', item.h, minH, 800, (v) => (item.h = v)))));
    }
    return rows;
  }

  // Shown unless its own data-shown-for says otherwise, read off the controls rather than the
  // `hidden` the designer sets later, so the panel never lags one change behind.
  function fieldShown(field) {
    if (field.hidden && !field.dataset.shownFor) return false;
    if (root.classList.contains('is-layered') && !field.dataset.layerSection) return false;
    if (!field.dataset.shownFor) return true;
    const [key, allowed] = field.dataset.shownFor.split(':');
    const control = root.querySelector(`#pd-${key}`);
    return Boolean(control) && String(allowed).split(',').includes(control.value);
  }

  // One of the designer's own controls, mirrored: edits go through it, so history and saving see them.
  function proxyRow(key) {
    const field = controls.querySelector(`.pd-field[data-key="${key}"]`);
    const real = field && field.querySelector('input, select');
    if (!real || !fieldShown(field)) return null;
    const name = field.querySelector('[data-lang]');
    let control;
    if (real.tagName === 'SELECT') {
      control = el('select');
      for (const option of real.options) control.appendChild(Object.assign(el('option', '', option.textContent), { value: option.value }));
    } else {
      control = el('input');
      Object.assign(control, { type: real.type === 'range' ? 'number' : real.type, min: real.min, max: real.max, step: real.step });
    }
    if (control.type === 'checkbox') control.checked = real.checked;
    else control.value = real.value;
    const pass = (type) => {
      if (control.type === 'checkbox') real.checked = control.checked;
      else if (control.value === '' && real.type === 'range') return;
      else real.value = control.value;
      real.dispatchEvent(new Event(type, { bubbles: true }));
    };
    control.addEventListener('input', () => pass('input'));
    control.addEventListener('change', () => {
      pass('change');
      // The real control has the last word: a slider keeps its value inside its own range.
      if (control.type !== 'checkbox') control.value = real.value;
      if (control.tagName === 'SELECT') renderProps(true);
    });
    const row = el('label', 'pd-cv-prop');
    row.append(el('span', '', name ? name.textContent : key), control);
    return row;
  }

  // Rows by section: what the item says, how it looks, where it sits.
  function itemRows(item) {
    const { text = [], look = [] } = item.kind === 'text' ? textRows(item) : {};
    if (item.kind === 'shape') look.push(...shapeRows(item));
    if (item.kind === 'icon') look.push(...iconRows(item));
    if (item.kind === 'image') look.push(...imageRows(item));
    look.push(propRow('prop.opacity', numberControl(Math.round(item.o * 100), 0, 100, 5, (v) => (item.o = v / 100))));
    const where = item.lock ? [] : [...sizeRows(item), propRow('prop.rotation', numberControl(item.r, -180, 180, 1, (v) => (item.r = v))), alignRow()];
    return { text, look, motion: motionRows(item), place: [...where, visibleRow(item)] };
  }

  // How the item comes in, counted from the card's own start, then how it keeps moving; the layout
  // editor itself holds still.
  function motionRows(item) {
    const choices = CANVAS_ENTRANCES.map((name) => [name, label(`enter.${name}`)]);
    const entrance = selectControl(
      choices,
      item.enter || 'none',
      (value) => {
        if (value !== 'none') return void (item.enter = value);
        delete item.enter;
        delete item.delay;
      },
      { rebuild: true }
    );
    const rows = [propRow('prop.entrance', entrance)];
    if (item.enter) {
      const delay = numberControl(item.delay || 0, 0, CANVAS_MAX_DELAY_MS, 50, (value) => {
        if (value) item.delay = value;
        else delete item.delay;
      });
      rows.push(propRow('prop.delay', delay));
    }
    const loop = selectControl(CANVAS_LOOPS.map((name) => [name, label(`loop.${name}`)]), item.loop || 'none', (v) => setOrDrop(item, 'loop', v, 'none'), {
      rebuild: true,
    });
    rows.push(propRow('prop.loop', loop));
    // The card holds still while it is edited, so say where the movement can be seen.
    if (item.enter || item.loop) rows.push(el('p', 'pd-cv-note', label('motionHint')));
    return rows;
  }

  function itemActions(item) {
    const actions = [
      // Named for what it does: an element behind the card is brought forward, and the other way round.
      actionButton(item.back ? 'act.front' : 'act.back', item.back ? 'fa-level-up-alt' : 'fa-level-down-alt', () => sendItem(canvas.items.indexOf(item), !item.back)),
    ];
    // Locked: nothing that changes it, and the way out where the delete button was.
    if (item.lock) {
      const box = { index: canvas.items.indexOf(item), id: selected };
      actions.push(actionButton('act.duplicate', 'fa-clone', duplicateSelected), actionButton('act.unlock', 'fa-lock-open', () => toggleLock(box)));
      return actions;
    }
    if (item.kind === 'image') actions.push(actionButton(cropping ? 'act.cropDone' : 'act.crop', 'fa-crop-alt', toggleCrop, cropping));
    actions.push(actionButton('act.duplicate', 'fa-clone', duplicateSelected), actionButton('act.delete', 'fa-trash-alt', removeSelected));
    return actions;
  }

  // What a line looks like before the user restyles it, read off the preview.
  function partLook(key) {
    const g = current && current.g;
    const node = g && g.card.querySelector(CANVAS_STYLE_SELECTORS[key]);
    const look = { color: 'text', font: 'card', fontFile: '', size: 16, weight: 400, align: 'left', upper: false };
    if (key === 'title') {
      const mode = root.querySelector('#pd-titleColorMode');
      const custom = root.querySelector('#pd-titleColor');
      look.color = mode && mode.value === 'custom' ? (custom && custom.value) || '#ffffff' : (mode && mode.value) || 'accent';
    }
    if (!node) return look;
    const style = g.doc.defaultView.getComputedStyle(node);
    look.size = clamp(round1(parseFloat(style.fontSize) || 16), TEXT_SIZE[0], TEXT_SIZE[1]);
    const weight = parseFloat(style.fontWeight) || 400;
    look.weight = WEIGHTS.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), WEIGHTS[0]);
    look.align = /center/.test(style.textAlign) ? 'center' : /right|end/.test(style.textAlign) ? 'right' : 'left';
    look.upper = style.textTransform === 'uppercase';
    return look;
  }

  // A stand-in item whose fields read the line's own style, or else its look, and write the style.
  function partStyle(key) {
    const look = partLook(key);
    const target = {};
    for (const prop of Object.keys(look)) {
      Object.defineProperty(target, prop, {
        enumerable: true,
        get: () => {
          const own = canvas.style && canvas.style[key];
          return own && own[prop] !== undefined ? own[prop] : look[prop];
        },
        set: (value) => {
          if (!canvas.style) canvas.style = {};
          if (!canvas.style[key]) canvas.style[key] = {};
          canvas.style[key][prop] = value;
        },
      });
    }
    return target;
  }

  function partRows(key) {
    const m = moveOf(key);
    const { text = [], look = [] } = CANVAS_STYLED_PARTS.includes(key) ? textRows(partStyle(key), false) : {};
    for (const field of PART_KEYS[key] || []) {
      const row = proxyRow(field);
      if (row) look.push(row);
    }
    const offset = pair(axisControl('X', m.x, -600, 600, (v) => (ensureMove(key).x = v)), axisControl('Y', m.y, -400, 400, (v) => (ensureMove(key).y = v)));
    return {
      text,
      look,
      place: [
        propRow('prop.offset', offset),
        propRow('prop.scale', numberControl(Math.round(m.s * 100), PART_SCALE[0] * 100, PART_SCALE[1] * 100, 5, (v) => (ensureMove(key).s = v / 100))),
        propRow('prop.rotation', numberControl(m.r, -180, 180, 1, (v) => (ensureMove(key).r = v))),
        alignRow(),
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

  function groupProps() {
    const head = el('div', 'pd-cv-props-head');
    head.append(icon('fa-object-group'), el('b', '', label('group.count').replace('{count}', picks.length)));
    const actions = [];
    if (selectedItems().length) actions.push(actionButton('act.duplicate', 'fa-clone', duplicateSelected));
    actions.push(actionButton('act.delete', 'fa-trash-alt', removeSelected));
    const body = el('div', 'pd-cv-sections');
    // Among themselves first: that is what a group is usually lined up for.
    body.appendChild(section('section.place', [alignRow(false), alignRow(true), el('p', 'pd-cv-note', label('group.hint'))], actions));
    return [head, tierBar(null), body];
  }

  function renderProps(force = false) {
    const box = selectedBox();
    // The controls panel: every control with nothing selected, only the card's own with the card.
    const cardOnly = selected === CARD_ID;
    cardPanel.hidden = !full || Boolean(box) || grouped();
    cardPanel.classList.toggle('is-card-only', cardOnly);
    cardTitle.textContent = label(cardOnly ? 'card' : 'general');
    cardHint.textContent = label(cardOnly ? 'cardHint' : 'generalHint');
    // Over a bundled preset the bar is only drawn once its section is ticked.
    const inherited = barSelect.closest('.pd-field[data-layer-section]') && barSelect.closest('.pd-field').classList.contains('is-inherited');
    barToggle.checked = barSelect.value !== 'none' && !inherited;
    // Rebuilding the panel under the caret would throw away what is being typed.
    if (!force && props.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON') return;
    if (grouped()) {
      props.hidden = false;
      return void props.replaceChildren(...groupProps());
    }
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
    const actions = item ? itemActions(item) : [actionButton('act.home', 'fa-undo', homeSelected)];
    if (!item && !isHidden(box.key)) actions.push(actionButton('act.delete', 'fa-trash-alt', removeSelected));
    const sections = [];
    if (rows.text && rows.text.length) sections.push(section('section.text', rows.text));
    if (rows.look && rows.look.length) sections.push(section('section.look', rows.look));
    if (rows.motion) sections.push(section('section.motion', rows.motion));
    sections.push(section('section.place', rows.place, actions));
    const body = el('div', 'pd-cv-sections');
    body.append(...sections);
    props.replaceChildren(head, tierBar(box), body);
  }

  function layerButton(box, kind, on, iconName, key, onClick) {
    const button = el('button', `pd-cv-layer-step pd-cv-layer-${kind}${on ? '' : ' is-off'}`);
    button.type = 'button';
    button.title = label(key);
    button.setAttribute('aria-label', `${label(key)}: ${boxName(box)}`);
    button.appendChild(icon(iconName));
    button.addEventListener('click', () => {
      onClick();
      const again = layerList.querySelector(`[data-id="${box.id}"]`);
      const target = again && again.parentNode.querySelector(`.pd-cv-layer-${kind}`);
      if (target) target.focus();
    });
    return button;
  }

  function layerRow(box) {
    const item = box.type === 'item' ? canvas.items[box.index] : null;
    const shown = item ? !item.off : !isHidden(box.key);
    const row = el('div', selection().includes(box.id) ? 'pd-cv-layer-row is-on' : 'pd-cv-layer-row');
    if (!shown) row.classList.add('is-hidden');
    row.setAttribute('role', 'listitem');
    const pick = el('button', 'pd-cv-layer');
    pick.type = 'button';
    pick.dataset.id = box.id;
    pick.title = boxName(box);
    pick.append(icon(iconFor(box)), el('span', '', boxName(box)));
    pick.addEventListener('click', (event) => (addsToGroup(event) ? toggleMember(box.id) : select(box.id)));
    row.appendChild(pick);
    row.appendChild(layerButton(box, 'eye', shown, shown ? 'fa-eye' : 'fa-eye-slash', shown ? 'act.hide' : 'act.show', () => toggleShown(box)));
    if (item) row.appendChild(layerButton(box, 'lock', !item.lock, item.lock ? 'fa-lock' : 'fa-lock-open', item.lock ? 'act.unlock' : 'act.lock', () => toggleLock(box)));
    if (box.key !== TEXT_BLOCK && box.key !== MARK) {
      for (const [step, name, key] of [[1, 'fa-chevron-up', 'act.layerUp'], [-1, 'fa-chevron-down', 'act.layerDown']]) {
        const move = el('button', 'pd-cv-layer-step');
        move.type = 'button';
        move.title = label(key);
        move.setAttribute('aria-label', label(key));
        move.dataset.step = String(step);
        move.appendChild(icon(name));
        // The list is rebuilt by the move: keep the keyboard on the same arrow of the same layer.
        move.addEventListener('click', () => {
          reorder(box.id, step);
          const again = layerList.querySelector(`[data-id="${box.id}"]`);
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

  function refreshSwatches() {
    const seen = new Set();
    const add = (value) => {
      if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) seen.add(value.toLowerCase());
    };
    for (const control of controls.querySelectorAll('input[type="color"]')) add(control.value);
    for (const item of canvas.items) [item.fill, item.fill2, item.strokeColor, item.color, item.shadowColor].forEach(add);
    for (const style of Object.values(canvas.style || {})) add(style.color);
    swatches.replaceChildren(...[...seen].slice(0, MAX_SWATCHES).map((value) => Object.assign(el('option'), { value })));
  }

  function renderPanels(force = false) {
    refreshSwatches();
    renderProps(force);
    // Top first, parts and added items in one stack, as the card draws them.
    const boxes = current ? current.boxes.toReversed() : [];
    // The card itself, first, under which everything else is drawn.
    const cardRow = el('div', selected === CARD_ID ? 'pd-cv-layer-row is-on' : 'pd-cv-layer-row');
    const cardPick = el('button', 'pd-cv-layer');
    cardPick.type = 'button';
    cardPick.dataset.id = CARD_ID;
    cardPick.append(icon('fa-id-card'), el('span', '', label('card')));
    cardPick.addEventListener('click', () => select(CARD_ID));
    cardRow.appendChild(cardPick);
    const rows = el('div', 'pd-cv-layer-group');
    rows.setAttribute('role', 'list');
    rows.append(...boxes.map(layerRow));
    layerList.replaceChildren(cardRow, ...(boxes.length ? [rows] : []));
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
    if (focused && /^(?:input|textarea|select)$/i.test(focused.tagName)) {
      // Escape leaves the field; passed on, it would close Settings under the editor.
      if (event.key !== 'Escape' || !full) return;
      focused.blur();
      event.preventDefault();
      return void event.stopPropagation();
    }
    const ctrl = event.ctrlKey && !event.altKey;
    const key = event.key.toLowerCase();
    // The sheet and the tour sit over the card: only their own keys get through.
    if (help.isOpen() && event.key !== 'Escape' && event.key !== '?') return;
    if (event.key === 'Escape') {
      if (help.isOpen()) help.close();
      else if (cropping) toggleCrop();
      else if (selected || grouped()) select(null);
      else if (full) setFull(false);
      else return;
    } else if (event.key === '?' && full) {
      help.toggle();
    } else if (ctrl && key === 'v' && full) {
      pasteItem();
    } else if (ctrl && key === 'a' && full) {
      pickMany(current ? current.boxes.filter(pickable).map((box) => box.id) : []);
    } else if (!selected && !grouped()) {
      return;
    } else if (ctrl && key === 'c') {
      // Text selected on the page is the user's copy, not the element's.
      if (String(window.getSelection())) return;
      copySelected();
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
    if (full) help.maybeTour();
    else help.close();
  }

  // Called after anything repainted the preview: undo, a load, a state switch, a resize.
  function refresh() {
    const swapped = !drag && (read() || restate());
    render();
    if (!drag) renderPanels(swapped);
  }

  return { refresh, setFull, isFull: () => full, isDragging: () => Boolean(drag && drag.moved) };
}

module.exports = { createCanvasEditor };
