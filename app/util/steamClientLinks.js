'use strict';

/*
  URLs for useful Steam links. The store page and the hub open in the client only if it's already
  running; with Steam closed, the web page opens in the browser instead of launching the client,
  since that's not what a link click should do. These URLs are built by the application, so they
  don't go through openExternalSafe(), which by design only allows http and https.
*/

function numericAppid(appid) {
  const id = String(appid == null ? '' : appid).trim();
  return /^[0-9]+$/.test(id) ? id : '';
}

function steamStoreUrl(appid, { clientRunning = false } = {}) {
  const id = numericAppid(appid);
  if (!id) return '';
  return clientRunning ? `steam://store/${id}` : `https://store.steampowered.com/app/${id}/`;
}

function steamGameHubUrl(appid, { clientRunning = false } = {}) {
  const id = numericAppid(appid);
  if (!id) return '';
  return clientRunning ? `steam://url/GameHub/${id}` : `https://steamcommunity.com/app/${id}/guides/`;
}

function steamInstallUrl(appid) {
  const id = numericAppid(appid);
  return id ? `steam://install/${id}` : '';
}

// A Steam game that's owned but not on disk: the executable picker makes no sense, there's no
// file to choose. Any other entry keeps its existing launch path.
function shouldOfferSteamInstall(game) {
  if (!game) return false;
  return !!game.steamOfficial && game.installed !== true && !!numericAppid(game.appid);
}

module.exports = { numericAppid, steamStoreUrl, steamGameHubUrl, steamInstallUrl, shouldOfferSteamInstall };
