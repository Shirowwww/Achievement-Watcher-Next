'use strict';

/*
  The settings of an imported SAN theme, for the tier the preview shows: which of the theme's looks
  draws it and what else that look draws, which theme draws it, its trophy picture when the theme
  has one per tier, then the look's own settings, only those that change something on its card.
  A change is shown at once (`onPreview`) and saved a moment later (`onChange`).
*/

const { layoutOf } = require('../util/sanEngine/engine.js');
const { SAN_MOVABLE: MOVABLE, PART_SHIFT } = require('../util/sanTheme.js');

// The card's elements a hand may move or hide, kept in the look's `awparts`, and how far: the
// limits saving applies, so the panel never offers a place it would refuse.
const SHIFT_MAX = PART_SHIFT.max;
// As many steps back as the designer's own history keeps.
const HISTORY_MAX = 80;

const GROUPS = [
  { id: 'card', icon: 'fa-th-large', keys: ['preset', 'scale', 'roundness', 'opacity', 'displaytime'] },
  { id: 'background', icon: 'fa-fill-drip', keys: ['bgstyle', 'primarycolor', 'secondarycolor', 'tertiarycolor', 'gradientangle', 'brightness', 'blur'] },
  {
    id: 'text',
    icon: 'fa-font',
    keys: [
      'usecustomfontsizes', 'fontsize', 'unlockmsgfontsize', 'titlefontsize', 'descfontsize',
      'usecustomfontcolors', 'fontcolor', 'unlockmsgfontcolor', 'titlefontcolor', 'descfontcolor',
      'fontoutline', 'fontoutlinecolor', 'fontshadow', 'fontshadowcolor',
      'usecustomtext', 'customtextunlockmsg', 'customtexttitle', 'customtextdesc',
    ],
  },
  { id: 'glow', icon: 'fa-sun', keys: ['glow', 'glowcolor', 'glowsize', 'glowanim', 'glowspeed', 'glowrarity', 'glowcolorbronze', 'glowcolorsilver', 'glowcolorgold'] },
  { id: 'outline', icon: 'fa-border-style', keys: ['useoutline', 'outline', 'outlinecolor', 'outlinewidth'] },
  { id: 'icon', icon: 'fa-image', keys: ['iconroundness', 'iconscale', 'usegameicon'] },
];
// Open until folded, like the designer's first groups; the others start folded.
const OPEN_AT_FIRST = ['card', 'background'];

// What a click on an element of the card opens: the group that changes it, and for a line of text
// the fields named after that line. The logo is the trophy a theme may draw for each tier.
const PARTS = {
  unlockmsg: { group: 'text', line: 'unlockmsg' },
  title: { group: 'text', line: 'title' },
  desc: { group: 'text', line: 'desc' },
  text: { group: 'text' },
  icon: { group: 'icon' },
  logo: { group: 'card', also: '.pd-san-tier' },
  background: { group: 'background' },
  card: { group: 'card' },
};
// What changes a line the theme neither sizes nor colours on its own.
const EVERY_LINE = ['fontsize', 'fontcolor'];
const POINTED_MS = 1600;

// What a slider offers; a theme set past it (SAN allows far more) still shows its own value.
const RANGES = {
  scale: [50, 300, 5, '%'],
  roundness: [0, 200, 1, ''],
  opacity: [0, 100, 1, '%'],
  displaytime: [1, 30, 1, 's'],
  gradientangle: [0, 360, 5, '°'],
  brightness: [0, 200, 5, '%'],
  blur: [0, 200, 1, ''],
  fontsize: [50, 200, 5, '%'],
  unlockmsgfontsize: [50, 200, 5, '%'],
  titlefontsize: [50, 200, 5, '%'],
  descfontsize: [50, 200, 5, '%'],
  glowsize: [0, 200, 5, ''],
  glowspeed: [1, 200, 1, ''],
  outlinewidth: [0, 200, 5, ''],
  iconroundness: [0, 100, 1, ''],
  iconscale: [50, 200, 5, '%'],
};

const on = (key) => (v) => Boolean(v[key]);
const off = (key) => (v) => !v[key];
const background = (...styles) => (v) => styles.includes(v.bgstyle || 'solid');
const card = (...layouts) => (v) => layouts.includes(layoutOf(v.preset));
const either = (...rules) => (v) => rules.some((rule) => rule(v));
const both = (...rules) => (v) => rules.every((rule) => rule(v));

/*
  A field shows only while it changes something: what it depends on is on, and the card draws it.
  The colours are read where base.css and the layouts' stylesheets use them.
*/
const SHOWN_IF = {
  fontsize: off('usecustomfontsizes'),
  unlockmsgfontsize: on('usecustomfontsizes'),
  titlefontsize: on('usecustomfontsizes'),
  descfontsize: on('usecustomfontsizes'),
  fontcolor: off('usecustomfontcolors'),
  unlockmsgfontcolor: on('usecustomfontcolors'),
  titlefontcolor: on('usecustomfontcolors'),
  descfontcolor: on('usecustomfontcolors'),
  fontoutlinecolor: on('fontoutline'),
  fontshadowcolor: on('fontshadow'),
  customtextunlockmsg: on('usecustomtext'),
  customtexttitle: on('usecustomtext'),
  customtextdesc: on('usecustomtext'),
  primarycolor: either(background('solid', 'gradient'), card('gfwl', 'xqjan')),
  secondarycolor: either(background('gradient'), both(background('solid'), card('default')), card('xboxone', 'xqjan')),
  tertiarycolor: card('epicgames', 'gfwl', 'ps4', 'ps5', 'xbox360', 'xqjan'),
  gradientangle: background('gradient'),
  brightness: background('gameart'),
  blur: background('gameart', 'bgimg'),
  glowcolor: both(on('glow'), off('glowrarity')),
  glowsize: on('glow'),
  glowanim: on('glow'),
  glowspeed: both(on('glow'), (v) => Boolean(v.glowanim) && v.glowanim !== 'off'),
  glowrarity: on('glow'),
  glowcolorbronze: both(on('glow'), on('glowrarity')),
  glowcolorsilver: both(on('glow'), on('glowrarity')),
  glowcolorgold: both(on('glow'), on('glowrarity')),
  outline: on('useoutline'),
  outlinecolor: on('useoutline'),
  outlinewidth: on('useoutline'),
};

// SAN's base cards keep their product names; only "Default" is a word.
const LAYOUT_NAMES = {
  default: '',
  xqjan: 'XQJan',
  steamdeck: 'Steam Deck',
  epicgames: 'Epic Games',
  xboxone: 'Xbox One',
  xbox360: 'Xbox 360',
  ps5: 'PS5',
  ps4: 'PS4',
  ps3: 'PS3',
  windows: 'Windows',
  gfwl: 'Games for Windows Live',
};

const TIERS = ['auto', 'bronze', 'silver', 'gold'];
const SAVE_DELAY_MS = 350;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function option(value, text) {
  const node = el('option', '', text);
  node.value = value;
  return node;
}

function fill(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (all, key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : all));
}

// #rrggbbaa keeps its alpha: the colour input only edits the #rrggbb part.
function colorParts(value) {
  const raw = typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ? value : '#000000';
  return { rgb: raw.slice(0, 7), alpha: raw.slice(7) };
}

/**
 * @typedef {object} SanLookView  what the preview shows, worked out by the designer
 * @property {string} state  AW Next's state of the shown tier, for "drawn by"
 * @property {string} stateLabel  the shown tier as the preview's switch names it
 * @property {string} type  the theme's look that draws it
 * @property {string} from  the other theme drawing it instead, '' when it is this one
 * @property {string[]} shared  the other tiers that look draws
 * @property {string[]} sources  the other imported themes
 * @property {string} tierPictures  'auto' or the tier the pictures are pinned to
 * @property {boolean} perTier  whether the theme draws anything per tier
 *
 * @param {object} options
 * @param {HTMLElement} options.root  the empty container the panel fills
 * @param {(key: string) => string} options.label  a word of the panel's, by its data-sl key
 * @param {(type: string, changes: object) => void} options.onPreview
 * @param {(type: string, changes: object) => Promise<void>} options.onChange
 * @param {() => Promise<void>} options.onRestore
 * @param {(state: string, source: string) => Promise<void>} options.onDrawnBy
 * @param {(tier: string) => Promise<void>} options.onTierPictures
 * @param {(kind: 'record' | 'change' | 'step' | 'reset') => void} [options.onHistory]  a step recorded, a
 *   change that could not be one (it still ends any redo), a step undone or redone, the history cleared
 */
function createSanLookPanel({ root, label, onPreview, onChange, onRestore, onDrawnBy, onTierPictures, onHistory = () => {} }) {
  let look = null;
  let view = null;
  let type = 'main';
  let timer = null;
  let pending = {};
  const open = new Map(OPEN_AT_FIRST.map((id) => [id, true]));

  // Every save is one step, kept with the values it replaced: going back is one more save.
  let history = [];
  let undone = [];
  let before = {};
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

  function flush() {
    clearTimeout(timer);
    const changes = pending;
    const replaced = before;
    pending = {};
    before = {};
    if (!Object.keys(changes).length) return;
    undone = [];
    // A step that could not be taken back (only values the theme never had) is not offered.
    if (Object.keys(savable(replaced)).length) {
      history.push({ type, before: replaced, after: copy(changes) });
      if (history.length > HISTORY_MAX) history.shift();
      onHistory('record');
    } else onHistory('change');
    void onChange(type, changes);
  }

  // A value the theme never had cannot be taken out again, except the places, which {} empties.
  const savable = (values) =>
    Object.fromEntries(
      Object.entries(values)
        .map(([key, value]) => [key, value === undefined && key === 'awparts' ? {} : copy(value)])
        .filter(([, value]) => value !== undefined),
    );

  function takeStep(back) {
    flush();
    const entry = (back ? history : undone).pop();
    if (!entry) return false;
    (back ? undone : history).push(entry);
    const values = savable(back ? entry.before : entry.after);
    if (look && look.values[entry.type]) Object.assign(look.values[entry.type], values);
    if (entry.type === type) onPreview(type, values);
    if (look && view) render(look, view);
    onHistory('step');
    void onChange(entry.type, values);
    return true;
  }

  // `hold`: a drag still going, saved and counted as one step once it ends.
  function change(key, value, { now = false, hold = false } = {}) {
    if (!(key in before)) before[key] = copy(look.values[type][key]);
    look.values[type][key] = value;
    pending[key] = value;
    onPreview(type, { [key]: value });
    syncShown();
    clearTimeout(timer);
    if (now) flush();
    else if (!hold) timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  function fieldLabel(key, extra) {
    const span = el('span');
    span.appendChild(el('span', '', label(`field.${key}`)));
    if (extra) span.append(' ', extra);
    return span;
  }

  function enumValues(key, spec, value) {
    if (key === 'preset') return spec.values.filter((one) => one !== 'os');
    // A picture of its own is only offered by the theme that already has one.
    if (key === 'bgstyle') return spec.values.filter((one) => one !== 'bgimg' || value === 'bgimg');
    return spec.values;
  }

  function enumText(key, one) {
    if (key === 'preset') return LAYOUT_NAMES[one] || label('value.default');
    return label(`value.${key}.${one}`);
  }

  function choiceControl(key, spec, value) {
    const select = el('select');
    const values = spec.kind === 'bool' ? ['true', 'false'] : enumValues(key, spec, value);
    for (const one of values) {
      select.appendChild(option(one, spec.kind === 'bool' ? label(one === 'true' ? 'value.on' : 'value.off') : enumText(key, one)));
    }
    select.value = spec.kind === 'bool' ? String(Boolean(value)) : String(value || values[0]);
    select.addEventListener('change', () => change(key, spec.kind === 'bool' ? select.value === 'true' : select.value, { now: true }));
    return select;
  }

  function rangeControl(key, spec, value, readout) {
    const [min, max, step, unit] = RANGES[key] || [spec.min, spec.max, 1, ''];
    const shown = Number.isFinite(Number(value)) ? Number(value) : min;
    readout.textContent = `${shown}${unit}`;
    const range = el('input');
    range.type = 'range';
    range.min = String(Math.min(min, shown));
    range.max = String(Math.max(max, shown));
    range.step = String(step);
    range.value = String(shown);
    range.addEventListener('input', () => {
      readout.textContent = `${range.value}${unit}`;
      change(key, Number(range.value));
    });
    return range;
  }

  function control(key, spec, value) {
    const field = el('label', 'pd-field');
    field.dataset.sanKey = key;
    let input = null;
    if (spec.kind === 'bool' || spec.kind === 'enum') {
      field.appendChild(fieldLabel(key));
      input = choiceControl(key, spec, value);
    } else if (spec.kind === 'num') {
      const readout = el('b', 'pd-value');
      field.appendChild(fieldLabel(key, readout));
      input = rangeControl(key, spec, value, readout);
    } else if (spec.kind === 'color') {
      field.appendChild(fieldLabel(key));
      const { rgb, alpha } = colorParts(value);
      input = el('input');
      input.type = 'color';
      input.value = rgb;
      input.addEventListener('input', () => change(key, input.value + alpha));
    } else if (spec.kind === 'text') {
      field.appendChild(fieldLabel(key));
      input = el('input');
      input.type = 'text';
      input.maxLength = spec.max;
      input.value = String(value || '');
      input.addEventListener('input', () => change(key, input.value));
    } else {
      return null;
    }
    input.id = `pd-sl-${key}`;
    if (input.tagName === 'SELECT') input.autocomplete = 'off';
    field.appendChild(input);
    return field;
  }

  // Hides what changes nothing, and a group left with nothing to show.
  function syncShown() {
    const values = look.values[type] || {};
    for (const field of root.querySelectorAll('.pd-field[data-san-key]')) {
      const rule = SHOWN_IF[field.dataset.sanKey];
      field.hidden = Boolean(rule) && !rule(values);
    }
    for (const section of root.querySelectorAll('.pd-group[data-group^="san-"]')) {
      section.hidden = !section.querySelector('.pd-field[data-san-key]:not([hidden])');
    }
  }

  function aboutText() {
    if (view.from) return fill(label('fromOther'), { name: view.from, own: label('own') });
    const parts = [look.types.length < 2 ? label('single') : fill(label('look'), { look: label(`type.${type}`), state: view.stateLabel })];
    if (view.shared.length) parts.push(fill(label('shared'), { states: view.shared.join(', ') }));
    return parts.join(' ');
  }

  // "Settings for: Gold" and the way back to the imported theme, then which look that is and what
  // else it draws.
  function headRow() {
    const box = el('div', 'pd-san-top');
    const line = el('div', 'pd-san-top-line');
    line.appendChild(el('b', 'pd-san-editing', fill(label('editing'), { state: view.stateLabel })));
    if (look.edited) {
      // Written out: it throws every change away, so an arrow alone would not say enough.
      const button = el('button', 'pd-cv-btn pd-san-restore');
      button.type = 'button';
      button.innerHTML = '<i class="fas fa-undo" aria-hidden="true"></i>';
      button.append(` ${label('restore')}`);
      button.addEventListener('click', () => {
        flush();
        void onRestore();
      });
      line.appendChild(button);
    }
    box.append(line, el('p', 'pd-san-hint', aboutText()));
    return box;
  }

  // Only once another SAN theme is imported: until then this one draws every tier.
  function drawnByRow() {
    // A look copied from a theme deleted since is still in the preset, so its name stays listed.
    const names = view.from && !view.sources.includes(view.from) ? [view.from, ...view.sources] : view.sources;
    if (!names.length) return [];
    const field = el('label', 'pd-field pd-san-from');
    field.appendChild(el('span', '', label('drawnBy')));
    const select = el('select');
    select.id = 'pd-sl-from';
    select.autocomplete = 'off';
    select.appendChild(option('', label('own')));
    for (const name of names) select.appendChild(option(name, name));
    select.value = view.from;
    select.addEventListener('change', () => {
      flush();
      void onDrawnBy(view.state, select.value);
    });
    field.appendChild(select);
    return [field];
  }

  // Its explanation is a tooltip and a description for screen readers: the choice reads on its own.
  function tierRow() {
    const field = el('div', 'pd-field pd-san-tier');
    const name = el('span', '', label('tierPictures'));
    name.title = label('tierHint');
    const hint = el('span', 'visually-hidden', label('tierHint'));
    hint.id = 'pd-sl-tier-hint';
    field.append(name, hint);
    const seg = el('div', 'pd-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label('tierPictures'));
    seg.setAttribute('aria-describedby', hint.id);
    seg.title = label('tierHint');
    for (const tier of TIERS) {
      const shown = tier === view.tierPictures;
      const button = el('button', shown ? 'is-on' : '', label(tier === 'auto' ? 'tierAuto' : tier));
      button.type = 'button';
      button.setAttribute('aria-pressed', String(shown));
      button.addEventListener('click', () => {
        if (tier !== view.tierPictures) void onTierPictures(tier);
      });
      seg.appendChild(button);
    }
    field.appendChild(seg);
    return [field];
  }

  function groupSection(group, fields) {
    const section = el('section', open.get(group.id) ? 'pd-group is-open' : 'pd-group');
    section.dataset.group = `san-${group.id}`;
    const head = el('button', 'pd-group-head');
    head.type = 'button';
    head.innerHTML = `<i class="fas ${group.icon}" aria-hidden="true"></i> `;
    head.appendChild(el('span', '', label(`group.${group.id}`)));
    head.insertAdjacentHTML('beforeend', ' <i class="fas fa-chevron-down pd-caret" aria-hidden="true"></i>');
    // The designer's own handler folds it; this only remembers it for the next tier shown.
    head.addEventListener('click', () => open.set(group.id, !section.classList.contains('is-open')));
    const body = el('div', 'pd-group-body');
    const list = el('div', 'pd-fields');
    list.append(...fields);
    body.appendChild(list);
    section.append(head, body);
    return section;
  }

  /**
   * @param {object|null} nextLook  the theme's looks and their settings, from the main process
   * @param {SanLookView} nextView
   */
  function render(nextLook, nextView) {
    if (Object.keys(pending).length) flush();
    // Values read again from the theme (another theme, a restore) start a history of their own.
    if (!nextLook || !look || nextLook.values !== look.values) {
      history = [];
      undone = [];
      before = {};
      onHistory('reset');
    }
    look = nextLook;
    view = nextView;
    if (!look || !look.types.length || !view) {
      root.hidden = true;
      root.replaceChildren();
      return;
    }
    type = look.types.includes(view.type) ? view.type : look.types[0];
    const values = look.values[type];
    const choices = [...drawnByRow(), ...(view.perTier ? tierRow() : [])];
    const parts = [headRow()];
    if (choices.length) {
      const box = el('div', 'pd-san-choices');
      box.append(...choices);
      parts.push(box);
    }
    if (!view.from) {
      for (const group of GROUPS) {
        const fields = group.keys.map((key) => look.fields[key] && control(key, look.fields[key], values[key])).filter(Boolean);
        if (fields.length) parts.push(groupSection(group, fields));
      }
    }
    root.replaceChildren(...parts);
    root.hidden = false;
    syncShown();
    if (placing) showPlace(placing);
  }

  /* ---------- where the picked element is drawn ---------- */

  // The element last picked on the card, whose place the panel shows; a drag's starting place.
  let placing = null;
  let dragBase = null;
  const placesOf = () => (look && look.values[type] && look.values[type].awparts) || {};
  const movable = (part) => MOVABLE.includes(part) && Boolean(look && view && !view.from && look.values[type]);
  const shiftOf = (value) => Math.max(-SHIFT_MAX, Math.min(SHIFT_MAX, Math.round(Number(value) || 0)));

  // `patch` null puts the element back; a field at its default is left out of the look.
  function setPlace(part, patch, now, hold = false) {
    const places = { ...placesOf() };
    const place = patch ? { ...places[part], ...patch } : {};
    for (const key of Object.keys(place)) if (!place[key]) delete place[key];
    if (Object.keys(place).length) places[part] = place;
    else delete places[part];
    change('awparts', places, { now, hold });
    syncPlace();
  }

  function placeBlock(part) {
    const place = placesOf()[part] || {};
    const box = el('div', 'pd-san-place');
    box.dataset.part = part;
    box.appendChild(el('b', 'pd-san-place-title', `${label('place')} : ${label(`part.${part}`)}`));
    const fields = el('div', 'pd-fields');
    for (const axis of ['x', 'y']) {
      const field = el('label', 'pd-field');
      field.appendChild(el('span', '', `${label('offset')} ${axis.toUpperCase()}`));
      const input = el('input');
      Object.assign(input, { type: 'number', min: String(-SHIFT_MAX), max: String(SHIFT_MAX), step: '1', value: String(place[axis] || 0) });
      input.id = `pd-sl-place-${axis}`;
      input.addEventListener('input', () => setPlace(part, { [axis]: shiftOf(input.value) }));
      field.appendChild(input);
      fields.appendChild(field);
    }
    const shown = el('label', 'pd-field');
    shown.appendChild(el('span', '', label('visible')));
    const select = el('select');
    select.id = 'pd-sl-place-shown';
    select.autocomplete = 'off';
    select.append(option('true', label('value.on')), option('false', label('value.off')));
    select.value = String(!place.hidden);
    select.addEventListener('change', () => setPlace(part, { hidden: select.value === 'false' }, true));
    shown.appendChild(select);
    fields.appendChild(shown);
    const home = el('button', 'inline-action-btn secondary pd-san-place-home', label('home'));
    home.type = 'button';
    home.disabled = !Object.keys(place).length;
    home.addEventListener('click', () => setPlace(part, null, true));
    box.append(fields, home);
    return box;
  }

  // Drawn again, unless a field of it is being typed in: then only the way back follows.
  function syncPlace() {
    const old = root.querySelector('.pd-san-place');
    if (!old) return;
    if (old.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      old.querySelector('.pd-san-place-home').disabled = !placesOf()[old.dataset.part];
      return;
    }
    old.replaceWith(placeBlock(old.dataset.part));
  }

  // At the head of the group that changes the element, which a click opens and brings into view.
  function showPlace(part) {
    placing = movable(part) ? part : null;
    const old = root.querySelector('.pd-san-place');
    if (old) old.remove();
    if (!placing) return;
    const group = root.querySelector(`.pd-group[data-group="san-${PARTS[placing].group}"]:not([hidden]) .pd-group-body`);
    if (group) group.prepend(placeBlock(placing));
    else root.querySelector('.pd-san-top').after(placeBlock(placing));
  }

  /**
   * An element dragged on the card, by this much from where the drag began, in the card's own
   * pixels; saved once `done`.
   */
  function nudge(part, dx, dy, done) {
    if (!movable(part)) return;
    if (placing !== part) showPlace(part);
    if (!dragBase || dragBase.part !== part) dragBase = { part, x: placesOf()[part]?.x || 0, y: placesOf()[part]?.y || 0 };
    setPlace(part, { x: shiftOf(dragBase.x + dx), y: shiftOf(dragBase.y + dy) }, done, !done);
    if (done) dragBase = null;
  }

  // A click on the card's element: the group that changes it opened and brought into view, and the
  // fields that change it lit for a moment. False when this look has no such group.
  let pointed = [];
  let pointedTimer = null;
  function reveal(part) {
    showPlace(part);
    const spot = PARTS[part];
    const section = spot && root.querySelector(`.pd-group[data-group="san-${spot.group}"]:not([hidden])`);
    if (!section) return false;
    open.set(spot.group, true);
    section.classList.add('is-open');
    const head = section.querySelector('.pd-group-head');
    head.setAttribute('aria-expanded', 'true');
    const shown = [...section.querySelectorAll('.pd-field[data-san-key]:not([hidden])')];
    const own = spot.line ? shown.filter((field) => field.dataset.sanKey.includes(spot.line)) : [];
    const lines = own.length || !spot.line ? own : shown.filter((field) => EVERY_LINE.includes(field.dataset.sanKey));
    const lit = [...(spot.also ? root.querySelectorAll(spot.also) : []), ...lines];
    for (const node of pointed) node.classList.remove('is-pointed');
    clearTimeout(pointedTimer);
    pointed = [head, ...lit];
    for (const node of pointed) node.classList.add('is-pointed');
    pointedTimer = setTimeout(() => pointed.forEach((node) => node.classList.remove('is-pointed')), POINTED_MS);
    // With the element's place at its head, the group shows from there.
    if (placing) head.scrollIntoView({ block: 'start' });
    else (lit[0] || head).scrollIntoView({ block: lit.length ? 'center' : 'start' });
    return true;
  }

  const partName = (part) => (PARTS[part] ? label(`part.${part}`) : '');

  return {
    render,
    flush,
    reveal,
    partName,
    nudge,
    movable,
    undo: () => takeStep(true),
    redo: () => takeStep(false),
    canUndo: () => history.length > 0 || Object.keys(pending).length > 0,
    canRedo: () => undone.length > 0,
  };
}

module.exports = { createSanLookPanel };
