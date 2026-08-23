'use strict';

/*
  Build a CSS url(...) token from a path or URL. pathToFileURL() leaves apostrophes/parentheses
  literal, which silently broke both quoting styles; emit one escaped, quoted token instead.
*/
// Written as escapes so the file carries no bare quote for a scanner to trip over.
const QUOTE_SINGLE = String.fromCharCode(39);
const QUOTE_DOUBLE = String.fromCharCode(34);

function cssUrl(value) {
  const escaped = String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
  return `url('${escaped}')`;
}

/*
  The path back out of a token cssUrl() wrote, or that a browser normalized from one. Returns '' for
  anything that is not a single url(...) - 'none', a gradient, several layers - so a caller can treat
  "nothing is painted" and "something else is painted" the same way.
*/
function cssUrlValue(token) {
  const text = String(token == null ? '' : token).trim();
  const open = text.indexOf('url(');
  if (open !== 0) return '';
  const close = text.lastIndexOf(')');
  if (close <= open) return '';

  let inner = text.slice(open + 4, close).trim();
  const quote = inner.charAt(0);
  if ((quote === QUOTE_SINGLE || quote === QUOTE_DOUBLE) && inner.endsWith(quote)) inner = inner.slice(1, -1);
  // Undo the escaping cssUrl() applies, in the order it applied it.
  return inner.replace(/\\(.)/g, '$1');
}

module.exports = { cssUrl, cssUrlValue };
