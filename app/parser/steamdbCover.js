'use strict';

// Parse SteamDB HTML to recover hashed library-cover URLs.

const htmlParser = require('node-html-parser');

const CDN_BASE = 'https://shared.fastly.steamstatic.com';

const LIBRARY_PORTRAIT_RE = /library_600x900\.jpg/i;
const LIBRARY_CAPSULE_RE = /library_capsule(?:_[a-z0-9]+)*\.jpg/i;
const ABSOLUTE_ASSET_RE = /https?:\/\/[^"'<\s]*(?:library_600x900\.jpg|library_capsule(?:_[a-z0-9]+)*\.jpg)/i;
const RELATIVE_ASSET_RE = /store_item_assets\/steam\/apps\/\d+\/[^"'<\s]*(?:library_600x900\.jpg|library_capsule(?:_[a-z0-9]+)*\.jpg)/i;

// SteamDB renders asset links either absolute or relative to the store-asset CDN root.
function normalizeSteamDbAssetUrl(appid, value) {
  const raw = String(value || '')
    .trim()
    .split('?')[0];
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const clean = raw.replace(/^\/+/, '');
  if (clean.startsWith('store_item_assets/')) return `${CDN_BASE}/${clean}`;
  return `${CDN_BASE}/store_item_assets/steam/apps/${appid}/${clean}`;
}

function isPortraitAsset(value) {
  return LIBRARY_PORTRAIT_RE.test(String(value || ''));
}

function isCapsuleAsset(value) {
  return LIBRARY_CAPSULE_RE.test(String(value || ''));
}

// The 600x900 portrait is what the library grid wants; the wider library_capsule is the fallback.
function coverFromHtml(appid, html) {
  const source = String(html || '');
  if (!source) return null;

  let capsule = '';
  try {
    const root = htmlParser.parse(source);
    for (const anchor of root.querySelectorAll('a')) {
      const href = anchor.getAttribute('href') || '';
      const text = anchor.text || '';
      const candidate = isPortraitAsset(href) || isCapsuleAsset(href) ? href : text;
      if (isPortraitAsset(candidate)) return normalizeSteamDbAssetUrl(appid, candidate);
      if (!capsule && isCapsuleAsset(candidate)) capsule = candidate;
    }
  } catch {
    /* malformed HTML -> fall through to the raw regex sweep below */
  }
  if (capsule) return normalizeSteamDbAssetUrl(appid, capsule);

  // No anchor matched (SteamDB reshuffles its assets table): sweep the raw markup instead.
  const absolute = source.match(ABSOLUTE_ASSET_RE);
  if (absolute) return normalizeSteamDbAssetUrl(appid, absolute[0]);
  const relative = source.match(RELATIVE_ASSET_RE);
  if (relative) return normalizeSteamDbAssetUrl(appid, relative[0]);

  return null;
}

// Every library asset URL found on a SteamDB info page (deduplicated). The 600x900 portrait comes
// first when present, then any wider library_capsule variants - callers filter by orientation.
function coversFromHtml(appid, html) {
  const source = String(html || '');
  if (!source) return [];
  const out = [];
  const push = (value) => {
    const url = normalizeSteamDbAssetUrl(appid, value);
    if (url && !out.includes(url)) out.push(url);
  };
  try {
    const root = htmlParser.parse(source);
    for (const anchor of root.querySelectorAll('a')) {
      const href = anchor.getAttribute('href') || '';
      const text = anchor.text || '';
      for (const candidate of [href, text]) {
        if (isPortraitAsset(candidate)) push(candidate);
      }
    }
  } catch {
    /* malformed HTML -> raw sweep below */
  }
  const sweep = /https?:\/\/[^"'<\s]*(?:library_600x900\.jpg|library_capsule(?:_[a-z0-9]+)*\.jpg)|store_item_assets\/steam\/apps\/\d+\/[^"'<\s]*(?:library_600x900\.jpg|library_capsule(?:_[a-z0-9]+)*\.jpg)/gi;
  let match;
  while ((match = sweep.exec(source))) push(match[0]);
  return out;
}

/*
  Game icons, which live somewhere else entirely.

  A library cover is a store asset under store_item_assets; the icon a game is recognised by is a
  community image under /steamcommunity/public/images/apps/<appid>/<hash>.<ext>. SteamDB shows it
  twice: as the page's own avatar, and as the raw `icon`/`clienticon` hashes in the appinfo table.
  Both are read here, because a delisted game often still lists the hash after the image tag is gone.
*/
const ICON_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com';
const ICON_ASSET_RE = /(?:https?:\/\/[^"'<\s]+)?\/?steamcommunity\/public\/images\/apps\/\d+\/[0-9a-f]{8,64}\.(?:jpe?g|png|ico)/gi;
// Rows of the appinfo table whose value is the content hash of an icon.
const ICON_FIELDS = new Set(['icon', 'clienticon', 'clienticns', 'logo', 'logo_small']);
const HASH_RE = /^[0-9a-f]{40}$/i;

function normalizeSteamDbIconUrl(appid, value) {
  const raw = String(value || '')
    .trim()
    .split('?')[0];
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const clean = raw.replace(/^\/+/, '');
  if (clean.startsWith('steamcommunity/')) return `${ICON_CDN_BASE}/${clean}`;
  if (HASH_RE.test(clean)) return `${ICON_CDN_BASE}/steamcommunity/public/images/apps/${appid}/${clean}.jpg`;
  return '';
}

// Every icon URL a SteamDB info page carries, deduplicated, `clienticon` first: it is the square
// image Windows and the Steam client show, where `logo` is a wide banner that would have to be cut.
function iconsFromHtml(appid, html) {
  const source = String(html || '');
  if (!source) return [];
  const out = [];
  const push = (value) => {
    const url = normalizeSteamDbIconUrl(appid, value);
    if (url && !out.includes(url)) out.push(url);
  };

  const fromFields = [];
  // <tr><td>clienticon</td><td>a1b2…</td></tr>, whatever attributes and nesting SteamDB puts on them.
  const rows = source.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map((cell) =>
      cell
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .trim()
    );
    if (cells.length < 2) continue;
    const field = cells[0].toLowerCase();
    if (!ICON_FIELDS.has(field)) continue;
    const hash = (cells[1].match(/[0-9a-f]{40}/i) || [])[0];
    if (hash) fromFields.push({ field, hash });
  }
  for (const entry of fromFields.slice().sort((a, b) => (a.field === 'clienticon' ? -1 : 0) - (b.field === 'clienticon' ? -1 : 0))) {
    push(entry.hash);
  }

  ICON_ASSET_RE.lastIndex = 0;
  let match;
  while ((match = ICON_ASSET_RE.exec(source))) push(match[0]);
  return out;
}

module.exports = {
  CDN_BASE,
  ICON_CDN_BASE,
  normalizeSteamDbAssetUrl,
  normalizeSteamDbIconUrl,
  isPortraitAsset,
  isCapsuleAsset,
  coverFromHtml,
  coversFromHtml,
  iconsFromHtml,
};
