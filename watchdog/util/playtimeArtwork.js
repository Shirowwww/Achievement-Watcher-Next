'use strict';

const path = require('path');
const { steamHeaderImage, steamLibraryImage, steamSquareLogo } = require('./steamArtwork.js');

function numericSteamId(game) {
  const candidates = [game && game.steamappid, game && game.appid];
  for (const value of candidates) {
    const id = String(value == null ? '' : value).trim();
    if (/^\d+$/.test(id)) return id;
  }
  return '';
}

function usableArtwork(value) {
  if (typeof value !== 'string') return undefined;
  const source = value.trim();
  if (!source) return undefined;
  if (/^https?:\/\//i.test(source) || source.startsWith('file:///') || path.isAbsolute(source)) return source;
  return undefined;
}

function resolvePlaytimeArtwork(game = {}, options = {}) {
  const steamId = numericSteamId(game);
  const iconUrl = usableArtwork(game.iconUrl);
  const headerUrl = usableArtwork(game.headerUrl);
  const portraitUrl = usableArtwork(game.portraitUrl);
  const steamIcon =
    steamId && game.icon
      ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${steamId}/${game.icon}.jpg`
      : undefined;
  // A community square logo, when the app has already resolved one for this game.
  const communityLogo = usableArtwork(steamSquareLogo(steamId || game.appid, game.name, options));
  // The square logo the library already fetched for this game.
  const squareLogo = iconUrl || communityLogo || steamIcon;

  return {
    icon: squareLogo,
    // A square logo needs no cropping at all; a poster does, and a 32x32 clienticon cannot be
    // rescued by any amount of it, so both stay behind whatever real square art exists.
    gameIcon: iconUrl || communityLogo || portraitUrl || (steamId ? steamLibraryImage(steamId) : undefined) || squareLogo,
    // The square logo is the last resort for the hero slot: a game with no header or portrait art
    // (a manual entry, a synthetic appid) otherwise ends its session on a card with an empty image.
    image: headerUrl || portraitUrl || (steamId ? steamHeaderImage(steamId) : undefined) || squareLogo,
  };
}

module.exports = { numericSteamId, usableArtwork, resolvePlaytimeArtwork };
