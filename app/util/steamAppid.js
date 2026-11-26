'use strict';

/*
  The one spelling of a Steam appid read from a file. Scene configs may pad it (a RELOADED
  steam_api.ini says AppId=0000358090), while Steam, GBE's save folders and every list key use the
  plain number: a padded id kept as read becomes a second, phantom game beside the real one.
*/
const MAX_STEAM_APPID = 4294967295;

// The canonical appid, or '' when `raw` is not a whole number in Steam's range.
function canonicalSteamAppid(raw) {
  const text = String(raw ?? '')
    .replace(/^﻿/, '')
    .trim();
  if (!/^\d{1,20}$/.test(text)) return '';
  const value = text.replace(/^0+(?=\d)/, '');
  if (value === '0' || value.length > 10 || Number(value) > MAX_STEAM_APPID) return '';
  return value;
}

module.exports = { canonicalSteamAppid, MAX_STEAM_APPID };
