'use strict';

/*
  Where a blurred, tinted page background is kept, and how the one place it should never have been
  kept is cleaned up.

  The achievement page paints a veiled version of the game's background picture. It is built once
  with sharp and cached, because the same picture always blurs to the same thing. It used to be
  written straight into `steam_cache/icon/<appid>/`, which is the folder the library's cover cache
  reads from, under the very name that cache derives from the picture's URL.

  For Steam and Epic that was invisible: the page background and the tile cover are two different
  URLs, so the two files never met. Xbox publishes ONE picture per game and hands it back as both,
  so the tinted background landed on the cover's own cache entry - and a cached cover is never
  fetched again, so the tile painted a blue ghost of the game from then on. Minecraft, Microsoft
  Solitaire and Grand Theft Auto V were all reported that way.

  A folder of its own makes the collision impossible for any source, now or later.
*/

const fs = require('fs');
const path = require('path');

const STYLIZED_ROOT = ['steam_cache', 'stylized'];
const XBOX_CACHE_ROOT = ['steam_cache', 'xbox'];
const ICON_CACHE_ROOT = ['steam_cache', 'icon'];
const PURGE_MARKER = ['cfg', 'purged-tinted-covers.json'];

// The appid names a folder, so it stays a plain id, exactly like every other cache path here.
function safeSegment(value) {
  return String(value || '').replace(/[^\w.-]/g, '_');
}

// The file name a picture URL is cached under: its own basename, query string dropped. Same
// derivation the stylizer has always used, so an existing file is still found after this move.
function stylizedFileName(imageUrl) {
  try {
    const parsed = new URL(String(imageUrl || ''));
    return path.basename(parsed.pathname);
  } catch {
    return '';
  }
}

function stylizedBackgroundPath(userDataPath, appid, imageUrl) {
  const file = stylizedFileName(imageUrl);
  if (!userDataPath || !appid || !file) return '';
  return path.join(userDataPath, ...STYLIZED_ROOT, safeSegment(appid), file);
}

// The veiled background already built for this game, or '' when there is none yet. The caller then
// paints the plain picture, exactly as it did before the first stylize pass finished.
function existingStylizedBackground(userDataPath, appid, imageUrl) {
  const file = stylizedBackgroundPath(userDataPath, appid, imageUrl);
  if (!file) return '';
  try {
    return fs.statSync(file).isFile() ? file : '';
  } catch {
    return '';
  }
}

/*
  One-time cleanup of the covers the old layout overwrote.

  Only Xbox games could be hit, and `steam_cache/xbox/` names exactly which ones - one folder per
  imported title. Their whole icon-cache folder goes: everything in it is downloaded artwork that
  the next scan fetches again on its own, so this costs one refetch and cannot lose anything.

  Deliberately not a content check. A tinted cover and a legitimate Steam page background look
  alike to any heuristic - Valve's own `page_bg_generated` files are flat and dark by design - and
  measuring them across a real cache flagged dozens of perfectly good files.
*/
function purgeTintedXboxCovers(userDataPath, { force = false } = {}) {
  if (!userDataPath) return { purged: 0, skipped: true };
  const marker = path.join(userDataPath, ...PURGE_MARKER);
  if (!force) {
    try {
      if (fs.existsSync(marker)) return { purged: 0, skipped: true };
    } catch {
      /* unreadable marker - run the sweep, it is idempotent */
    }
  }

  let purged = 0;
  const removed = [];
  try {
    const xboxRoot = path.join(userDataPath, ...XBOX_CACHE_ROOT);
    const iconRoot = path.join(userDataPath, ...ICON_CACHE_ROOT);
    for (const entry of fs.readdirSync(xboxRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const target = path.join(iconRoot, entry.name);
      if (!fs.existsSync(target)) continue;
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(entry.name);
      purged++;
    }
  } catch {
    // No Xbox library imported, or nothing readable: there is nothing to clean either way, and the
    // marker below still stops this from being retried on every start.
  }

  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, JSON.stringify({ at: new Date().toISOString(), purged, titles: removed }, null, 2), 'utf8');
  } catch {
    /* the sweep already ran; failing to record it only costs one repeat */
  }

  return { purged, titles: removed, skipped: false };
}

module.exports = { stylizedBackgroundPath, existingStylizedBackground, stylizedFileName, purgeTintedXboxCovers };
