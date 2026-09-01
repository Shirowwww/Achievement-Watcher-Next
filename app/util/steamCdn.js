'use strict';

// Steam builds every one of these from the appid alone, so a game with no metadata still gets its
// real artwork. Written out in three places before, each with its own subset of the fields.
const BASE = 'https://cdn.akamai.steamstatic.com/steam/apps';

function steamCdnImages(appid) {
  const id = String(appid == null ? '' : appid).trim();
  if (!/^[0-9]+$/.test(id)) return { header: '', background: '', portrait: '', icon: '' };
  return {
    header: `${BASE}/${id}/header.jpg`,
    background: `${BASE}/${id}/page_bg_generated_v6b.jpg`,
    portrait: `${BASE}/${id}/library_600x900.jpg`,
    icon: `${BASE}/${id}/capsule_231x87.jpg`,
  };
}

module.exports = { steamCdnImages, STEAM_CDN_BASE: BASE };
