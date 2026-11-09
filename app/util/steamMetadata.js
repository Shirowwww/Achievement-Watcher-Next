'use strict';

const { cleanText, httpsUrl, textList, MAX_VIDEOS, MAX_SCREENSHOTS } = require('./gameDetails.js');

function textOrEmpty(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text;
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = textOrEmpty(value);
    if (text) return text;
  }
  return '';
}

function resolveSteamMetadata({ appInfo, storeData, langApi = 'english', langKey = langApi } = {}) {
  const common = appInfo && typeof appInfo.common === 'object' ? appInfo.common : {};
  const store = storeData && typeof storeData === 'object' ? storeData : {};
  const headerImage = common.header_image;
  const libraryHeader = common.library_assets_full?.library_header?.image;
  const libraryCapsule = common.library_assets_full?.library_capsule?.image;
  const name = pickFirstText(common.name, store.name);
  const type = pickFirstText(common.type, store.type).toLowerCase();

  return {
    name: name || undefined,
    isGame: type === 'game',
    // The raw store/product type, empty when neither source answered. `isGame: false` alone cannot
    // tell "Steam says this is a DLC" from "nobody answered", and callers need that difference: see
    // shouldKeepFetchedAchievements in app/parser/steam.js.
    productType: type,
    translated: !!common.languages?.[langApi],
    icon: common.icon,
    header: headerImage?.[langApi] || libraryHeader?.[langApi] || headerImage?.english || libraryHeader?.english || store.header_image,
    portrait: libraryCapsule?.[langKey] || libraryCapsule?.english,
    background: store.background?.replace(/(\?|&)t=\d+$/, ''),
  };
}

/*
  The game page's share of a store appdetails answer: what the store says about the game, its
  trailers (HLS/DASH streams since 2025, no MP4 any more) and its screenshots. Every field is
  optional; anything that is not text or an https link is dropped.
*/
function resolveSteamStoreDetails(storeData) {
  const store = storeData && typeof storeData === 'object' ? storeData : {};
  const metacritic = Number(store.metacritic?.score);
  return {
    title: cleanText(store.name, 240),
    description: cleanText(store.short_description, 4000),
    genres: textList((Array.isArray(store.genres) ? store.genres : []).map((genre) => genre?.description)),
    developers: textList(store.developers),
    publishers: textList(store.publishers),
    releaseDate: store.release_date?.coming_soon ? '' : cleanText(store.release_date?.date, 80),
    website: httpsUrl(store.website),
    ratings: Number.isFinite(metacritic) && metacritic > 0 ? [{ source: 'metacritic', score: Math.round(metacritic), url: httpsUrl(store.metacritic?.url) }] : [],
    videos: (Array.isArray(store.movies) ? store.movies : [])
      .map((movie) => ({
        name: cleanText(movie?.name, 240),
        thumbnail: httpsUrl(movie?.thumbnail),
        hls: httpsUrl(movie?.hls_h264),
        dash: httpsUrl(movie?.dash_h264),
      }))
      .filter((video) => video.hls || video.dash)
      .slice(0, MAX_VIDEOS),
    screenshots: (Array.isArray(store.screenshots) ? store.screenshots : [])
      .map((shot) => ({ thumb: httpsUrl(shot?.path_thumbnail), full: httpsUrl(shot?.path_full) }))
      .filter((shot) => shot.full)
      .slice(0, MAX_SCREENSHOTS),
    background: httpsUrl(store.background_raw || store.background),
  };
}

module.exports = { resolveSteamMetadata, resolveSteamStoreDetails };
