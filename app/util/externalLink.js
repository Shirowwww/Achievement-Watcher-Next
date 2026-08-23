'use strict';

/*
  Guard for URLs handed to shell.openExternal(): a remote source (CrakFiles catalog) could name any
  scheme, so only http(s) is forwarded. App-built URLs (steam://uninstall/…) don't go through here.
*/
function isSafeExternalUrl(url) {
  if (typeof url !== 'string' || url === '') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false; // not an absolute URL at all
  }
}

// Opens `url` externally only when it passes isSafeExternalUrl(); onReject is called with the
// rejected URL otherwise instead of being silently dropped.
function openExternalSafe(shell, url, onReject) {
  if (!isSafeExternalUrl(url)) {
    if (typeof onReject === 'function') onReject(url);
    return false;
  }
  Promise.resolve(shell.openExternal(url)).catch(() => {});
  return true;
}

module.exports = { isSafeExternalUrl, openExternalSafe };
