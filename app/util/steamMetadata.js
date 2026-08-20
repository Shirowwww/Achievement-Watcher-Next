'use strict';

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
    translated: !!common.languages?.[langApi],
    icon: common.icon,
    header: headerImage?.[langApi] || libraryHeader?.[langApi] || headerImage?.english || libraryHeader?.english || store.header_image,
    portrait: libraryCapsule?.[langKey] || libraryCapsule?.english,
    background: store.background?.replace(/(\?|&)t=\d+$/, ''),
  };
}

module.exports = { resolveSteamMetadata };
