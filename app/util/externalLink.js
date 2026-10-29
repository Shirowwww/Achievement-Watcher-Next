'use strict';

const path = require('path');
const { fileURLToPath } = require('url');

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

/*
  Guard for the main window's own navigation: a page it moves to keeps the main preload bridge, so
  only a file under the app folder (`appRoot`, app.getAppPath()) may be reached, never one dropped
  in Downloads or a profile folder. Windows paths compare without case.
*/
function isAppFileUrl(url, appRoot) {
  let file;
  try {
    file = fileURLToPath(new URL(url));
  } catch {
    return false; // not a file: URL
  }
  const fold = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
  const relative = path.relative(fold(path.resolve(appRoot)), fold(path.resolve(file)));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

module.exports = { isAppFileUrl, isSafeExternalUrl, openExternalSafe };
