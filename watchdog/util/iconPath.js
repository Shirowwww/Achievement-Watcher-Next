'use strict';

const path = require('path');

/*
  The local path behind the 'file:///' icon url a parser stored, or ''. The parsers write the raw
  path without percent-encoding, so a folder named "100% Orange" is not a malformed escape: only a
  url that decodes cleanly is decoded.
*/
function iconPathOf(entry) {
  const icon = String(entry && entry.icon ? entry.icon : '');
  if (!icon.startsWith('file:///')) return '';
  const raw = icon.slice('file:///'.length);
  try {
    return path.normalize(decodeURI(raw));
  } catch {
    return path.normalize(raw);
  }
}

module.exports = { iconPathOf };
