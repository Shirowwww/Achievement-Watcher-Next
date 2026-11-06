'use strict';

/*
  The five named XML entities and numeric character references, decoded once. `&amp;` goes last so
  that "&amp;lt;" reads as the text "&lt;", never as "<". Loaded by the Watchdog through
  sharedAppModule, so it requires nothing.
*/

function safeCodePoint(value) {
  return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

module.exports = { decodeXmlEntities };
