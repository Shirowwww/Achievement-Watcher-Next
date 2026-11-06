'use strict';

// Namespace native ids before they enter shared caches, so official GOG/Ubisoft entries never
// collide with Steam appids.

// Map an internal parser `data.type` / source to a stable short platform tag.
const SOURCE_TO_PLATFORM = {
  gogOfficial: 'gog-official',
  ubisoftOfficial: 'ubisoft-official',
  epicOfficial: 'epic-official',
  steamOfficial: 'steam-official',
};

// Platforms whose native id space overlaps Steam's numeric appids and therefore need a namespaced
// cache key. (Epic namespaces are hex strings, already collision-proof.)
const NEEDS_NAMESPACE = new Set(['ubisoft-official', 'gog-official']);

const PLATFORM_PREFIX = {
  'gog-official': 'gog',
  'ubisoft-official': 'uplay',
  'epic-official': 'epic',
  'steam-official': 'steam',
};

function normalizeType(type) {
  return SOURCE_TO_PLATFORM[type] || String(type || '').trim().toLowerCase();
}

// Collision-safe cache key for a source's appid. Native-id official sources get a `<prefix>-<id>`
// key; everything else keeps its bare appid (so Steam/emulator caches are unchanged - back-compat).
function officialAppId(type, rawId) {
  const id = String(rawId || '').trim();
  if (!id) return id;
  const platform = normalizeType(type);
  if (NEEDS_NAMESPACE.has(platform) && !id.includes('-')) {
    return `${PLATFORM_PREFIX[platform]}-${id}`;
  }
  return id;
}

// Recover the raw native id from a namespaced cache key (inverse of officialAppId).
function rawAppId(value) {
  const s = String(value || '');
  const m = s.match(/^(?:gog|uplay|epic|steam)-(.+)$/);
  return m ? m[1] : s;
}

// Sources listed under a bare numeric native id that is not a Steam appid (EA's masterTitleId).
const NATIVE_NUMERIC_SOURCES = new Set(['ea']);

// The Steam appid to ask Steam, SteamDB or SteamGridDB about, or '' when the game has none.
function steamAppidOf(game) {
  const own = String((game && game.steamappid) || '').trim();
  if (/^\d+$/.test(own)) return own;
  const appid = String((game && game.appid) || '').trim();
  if (!/^\d+$/.test(appid)) return '';
  const source = String(game.source || '').trim().toLowerCase();
  const system = String(game.system || '').trim().toLowerCase();
  return NATIVE_NUMERIC_SOURCES.has(source) || NATIVE_NUMERIC_SOURCES.has(system) ? '' : appid;
}

module.exports = {
  normalizeType,
  officialAppId,
  rawAppId,
  steamAppidOf,
};
