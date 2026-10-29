'use strict';

/*
  User collections: named groups of library games. Pure data rules, no fs and no Electron, so the
  store, the renderer and the tests share one definition of what a valid collection is.

  A game is referenced by the id its library tile already carries (String(game.appid)). Official GOG
  and Ubisoft entries are namespaced there (gog-123, uplay-123), so two platforms sharing a numeric id
  stay apart. The source label is deliberately not part of the key: it changes between rescans
  ("Steam (Goldberg)" becomes "Steam (owned)") and would orphan the membership.
*/

const FORMAT = 1;
const MAX_COLLECTIONS = 50;
const MAX_GAMES_PER_COLLECTION = 5000;
const MAX_NAME_LENGTH = 48;
const DEFAULT_COLOR = '#8be9fd';
const COLORS = Object.freeze(['#8be9fd', '#50fa7b', '#f1fa8c', '#ffb86c', '#ff79c6', '#bd93f9', '#ff5555', '#a4b0be']);
const ICONS = Object.freeze(['folder', 'star', 'heart', 'gamepad', 'trophy', 'bookmark', 'users', 'fire']);
const DEFAULT_ICON = 'folder';

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GAME_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IMAGE_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{12}\.(?:png|jpg|gif|webp)$/;

const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]', 'g');

function normalizeName(value) {
  // Control characters and the Unicode line/paragraph separators never belong in a name.
  return String(value ?? '').replace(CONTROL_CHARACTERS, '').trim().slice(0, MAX_NAME_LENGTH).trim();
}

function normalizeColor(value) {
  const color = String(value ?? '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : DEFAULT_COLOR;
}

function normalizeIcon(value) {
  const icon = String(value ?? '').trim().toLowerCase();
  return ICONS.includes(icon) ? icon : DEFAULT_ICON;
}

function normalizeGameKey(value) {
  if (value === null || value === undefined || typeof value === 'object') return '';
  const key = String(value).trim();
  return GAME_KEY_PATTERN.test(key) ? key : '';
}

function normalizeGames(values) {
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const key = normalizeGameKey(value);
    if (key) seen.add(key);
    if (seen.size >= MAX_GAMES_PER_COLLECTION) break;
  }
  return [...seen];
}

function normalizeCollection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.toLowerCase() : '';
  const name = normalizeName(raw.name);
  if (!ID_PATTERN.test(id) || !name) return null;
  const image = typeof raw.image === 'string' && IMAGE_FILE_PATTERN.test(raw.image) && raw.image.startsWith(id + '-') ? raw.image : '';
  return { id, name, color: normalizeColor(raw.color), icon: normalizeIcon(raw.icon), image, games: normalizeGames(raw.games) };
}

// The view of the hidden games. Not a uuid, so it can never collide with a user collection.
const HIDDEN_ID = 'hidden';

/*
  `hidden` holds the games kept out of sight: out of All games and every collection, listed only in
  the Hidden view. Unlike the blacklist they are still scanned and still notify; a user who keeps
  the blacklist for tools asked for this.
*/
function emptyState() {
  return { format: FORMAT, collections: [], hidden: [] };
}

// Anything unreadable is dropped here, so no caller has to defend against a hand-edited file.
function normalizeState(raw) {
  const state = emptyState();
  const list = raw && typeof raw === 'object' && Array.isArray(raw.collections) ? raw.collections : [];
  const ids = new Set();
  for (const entry of list) {
    const collection = normalizeCollection(entry);
    if (!collection || ids.has(collection.id)) continue;
    ids.add(collection.id);
    state.collections.push(collection);
    if (state.collections.length >= MAX_COLLECTIONS) break;
  }
  state.hidden = normalizeGames(raw && typeof raw === 'object' ? raw.hidden : []);
  return state;
}

function collectionById(state, id) {
  return state.collections.find((collection) => collection.id === id) || null;
}

function replaceCollection(state, id, change) {
  return { ...state, collections: state.collections.map((collection) => (collection.id === id ? { ...collection, ...change } : collection)) };
}

// `error` is 'name' or 'limit' when nothing was created.
function createCollection(state, { id, name, color, icon }) {
  const cleanName = normalizeName(name);
  if (!cleanName) return { state, collection: null, error: 'name' };
  if (state.collections.length >= MAX_COLLECTIONS) return { state, collection: null, error: 'limit' };
  const collection = normalizeCollection({ id, name: cleanName, color, icon, image: '', games: [] });
  if (!collection) return { state, collection: null, error: 'name' };
  return { state: { ...state, collections: [...state.collections, collection] }, collection, error: null };
}

function updateCollection(state, id, patch) {
  const current = collectionById(state, id);
  if (!current) return state;
  const change = {};
  if ('name' in patch && normalizeName(patch.name)) change.name = normalizeName(patch.name);
  if ('color' in patch) change.color = normalizeColor(patch.color);
  if ('icon' in patch) change.icon = normalizeIcon(patch.icon);
  if ('image' in patch) change.image = normalizeCollection({ ...current, image: patch.image }).image;
  return replaceCollection(state, id, change);
}

function removeCollection(state, id) {
  return { ...state, collections: state.collections.filter((collection) => collection.id !== id) };
}

function addGames(state, id, keys) {
  const current = collectionById(state, id);
  if (!current) return state;
  return replaceCollection(state, id, { games: normalizeGames([...current.games, ...(Array.isArray(keys) ? keys : [keys])]) });
}

function removeGames(state, id, keys) {
  const current = collectionById(state, id);
  if (!current) return state;
  const drop = new Set((Array.isArray(keys) ? keys : [keys]).map(normalizeGameKey));
  return replaceCollection(state, id, { games: current.games.filter((key) => !drop.has(key)) });
}

function hideGames(state, keys) {
  return { ...state, hidden: normalizeGames([...(state.hidden || []), ...(Array.isArray(keys) ? keys : [keys])]) };
}

function unhideGames(state, keys) {
  const drop = new Set((Array.isArray(keys) ? keys : [keys]).map(normalizeGameKey));
  return { ...state, hidden: (state.hidden || []).filter((key) => !drop.has(key)) };
}

function isHidden(state, key) {
  return (state.hidden || []).includes(normalizeGameKey(key));
}

function memberKeys(state, id) {
  if (id === HIDDEN_ID) return new Set(state.hidden || []);
  const current = collectionById(state, id);
  return current ? new Set(current.games) : null;
}

// The games a view leaves out: the hidden ones everywhere but in their own view.
function excludedKeys(state, id) {
  return id === HIDDEN_ID ? null : new Set(state.hidden || []);
}

// Members that are not in the library right now stay in the collection; they are only not listed.
function filterGames(games, state, id) {
  const list = Array.isArray(games) ? games : [];
  const members = memberKeys(state, id);
  const excluded = excludedKeys(state, id);
  if (!members && !(excluded && excluded.size)) return list.slice();
  return list.filter((game) => game && (!members || members.has(String(game.appid))) && !(excluded && excluded.has(String(game.appid))));
}

// What the menu shows next to a collection: the games the library would list for it right now.
function countGames(games, state, id, { installedOnly = false } = {}) {
  if (id !== HIDDEN_ID && !collectionById(state, id)) return 0;
  const listed = filterGames(games, state, id);
  return installedOnly ? listed.filter((game) => game.installed).length : listed.length;
}

module.exports = {
  FORMAT,
  MAX_COLLECTIONS,
  MAX_GAMES_PER_COLLECTION,
  MAX_NAME_LENGTH,
  COLORS,
  ICONS,
  DEFAULT_COLOR,
  DEFAULT_ICON,
  IMAGE_FILE_PATTERN,
  HIDDEN_ID,
  normalizeName,
  normalizeColor,
  normalizeIcon,
  normalizeGameKey,
  normalizeState,
  emptyState,
  collectionById,
  createCollection,
  updateCollection,
  removeCollection,
  addGames,
  removeGames,
  hideGames,
  unhideGames,
  isHidden,
  memberKeys,
  excludedKeys,
  filterGames,
  countGames,
};
