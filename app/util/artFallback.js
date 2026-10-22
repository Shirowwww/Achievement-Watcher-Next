'use strict';

/*
  Fills the gaps in a game's pictures from SteamGridDB's set. A source's own art always wins, except a
  header it marks `headerStandIn`: a trophy or achievement icon put up only so the card is not empty.
  A PlayStation list is the exception: SteamGridDB's covers come first, Sony's store art is the fallback.
*/
function fillArt(img, fallback, type) {
  const { headerStandIn, ...art } = img || {};
  const ownHeader = headerStandIn ? '' : art.header;
  const gridFirst = type === 'psnLibrary';
  art.header = (gridFirst ? fallback.landscape || ownHeader : ownHeader || fallback.landscape) || art.header || '';
  art.portrait = (gridFirst ? fallback.portrait || art.portrait : art.portrait || fallback.portrait) || '';
  // A community hero is raw key art, not one of Steam's pre-darkened page backgrounds, so the
  // game screen has to veil it to keep the text on top readable.
  if (!art.background && fallback.background) {
    art.background = fallback.background;
    art.overlay = true;
  }
  art.logo = art.logo || fallback.logo || '';
  art.icon = art.icon || fallback.icon || fallback.logo || '';
  // A recompiled game SteamGridDB does not know still has its marketplace background.
  if (!art.header && type === 'x360recomp') art.header = art.background || '';
  return art;
}

module.exports = { fillArt };
