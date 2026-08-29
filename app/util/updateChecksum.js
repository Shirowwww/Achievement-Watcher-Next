'use strict';

// Error helpers for the electron-updater flow. Pulled out of init.js so the classification itself
// is unit-testable without an Electron runtime.

// electron-updater raises this specific error when a downloaded file's sha512 doesn't match the
// release metadata - the exact symptom of a corrupted or stale cached download.
//
// The match is deliberately narrow. Updater errors routinely carry remote text: a feed that cannot
// be parsed appends the whole GitHub Atom document, release notes included. Our own 3.8.6 notes say
// "a checksum mismatch clears the poisoned updater cache", so a loose search for that phrase turned
// a plain HTTP 504 on the releases feed into a fake checksum mismatch and sent a failed *check*
// down the cache-clearing download-recovery path. Only errors electron-updater itself threw as a
// checksum failure count: its own code first, and otherwise the exact message shapes it produces,
// read from the first line, which is never remote content.
const CHECKSUM_MESSAGE = /^(?:[\w-]+ )?checksum mismatch(?:$|[,:] expected )/i;

function isChecksumMismatchError(err) {
  if (!err) return false;
  if (err.code === 'ERR_CHECKSUM_MISMATCH') return true;
  // Any other code means electron-updater already classified the failure as something else.
  if (err.code) return false;
  const message = typeof err.message === 'string' ? err.message : String(err);
  const firstLine = message.split('\n', 1)[0].replace(/^Error:\s*/i, '').trim();
  return CHECKSUM_MESSAGE.test(firstLine);
}

// The raw message of an updater error can be enormous: the release-feed parse error embeds the
// full Atom XML, and an HTTP failure embeds the response body and every header. Logging or showing
// that verbatim buried one real failure under 1200 lines of our own release notes. Keep the first
// line - which is the actual reason - plus the error code, and say how much was dropped.
function summarizeUpdaterError(err, maxLength = 300) {
  if (!err) return 'unknown error';
  const message = (typeof err.message === 'string' ? err.message : String(err)).trim();
  if (!message) return err.code ? String(err.code) : 'unknown error';
  const [firstLine] = message.split('\n');
  let summary = firstLine.trim();
  if (summary.length > maxLength) summary = `${summary.slice(0, maxLength).trimEnd()}...`;
  const dropped = message.length - firstLine.length;
  if (dropped > 0) summary += ` (${dropped} more characters omitted)`;
  if (err.code && !summary.includes(err.code)) summary = `${err.code}: ${summary}`;
  return summary;
}

module.exports = { isChecksumMismatchError, summarizeUpdaterError };
