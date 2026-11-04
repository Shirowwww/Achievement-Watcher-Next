'use strict';

/*
  The release notes of the offered update in the interface language.

  GitHub's release body is English and travels with the update offer. The translations are plain
  data published with the site: docs/data/notes/<locale>.json maps a version to its blocks (the
  { kind, text } list releaseNotes.js produces), written at release time by tools/site/release-notes.js
  and translated into every bundled locale. The installed app cannot carry them - the version being
  offered is newer than the app - so they are fetched when an offer is built.

  Nothing here is allowed to delay or break an offer: a missing file, a timeout or a malformed
  answer all mean "no translation", and the English body is shown.
*/

const SITE = require('./links.js').SITE;

const NOTES_TIMEOUT_MS = 4000;
const MAX_NOTES_BYTES = 512 * 1024;
// An app locale id is a Steam language name: lower case letters only.
const LOCALE_ID = /^[a-z]{2,16}$/;

function notesUrl(locale) {
  return LOCALE_ID.test(String(locale || '')) && locale !== 'english' ? `${SITE}/data/notes/${locale}.json` : null;
}

/**
 * @param {string} locale app locale id (config.achievement.lang)
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<Record<string, unknown> | null>} version -> blocks, or null when unavailable
 */
async function fetchLocalizedNotes(locale, { fetchImpl = globalThis.fetch, timeoutMs = NOTES_TIMEOUT_MS } = {}) {
  const url = notesUrl(locale);
  if (!url || typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > MAX_NOTES_BYTES) return null;
    const data = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

module.exports = { fetchLocalizedNotes, notesUrl };
