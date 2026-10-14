'use strict';

/*
  What the update window shows for a given updater state. Pure: the strings arrive already
  translated (init.js resolves them, where the locale linter sees the keys), so every state can be
  checked without Electron.

  The window follows the one shared updater state (util/updateStatus.js): the offer, then the
  download it started, then the hand-over to the installer, whose own card takes over on screen.
*/

const { formatNumber, formatPercent } = require('./intlFormat.js');

const UNITS = ['B', 'KB', 'MB', 'GB'];

// Byte units stay as written everywhere in the app; the number follows the app language.
function formatBytes(bytes, lang) {
  let value = Math.max(0, Number(bytes) || 0);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${formatNumber(value, lang || 'english', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${UNITS[unit]}`;
}

function fill(template, params) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match));
}

const action = (id, label, kind) => ({ id, label, kind });

function offerView(offer, strings, portable, lang) {
  const meta = [offer.currentVersion && offer.version ? `${offer.currentVersion} → ${offer.version}` : offer.version, offer.size ? formatBytes(offer.size, lang) : '']
    .filter(Boolean)
    .join(' · ');
  return {
    phase: portable ? 'portable' : 'available',
    title: strings.available,
    meta,
    message: portable ? strings.portableDetail : '',
    progress: null,
    actions: portable
      ? [action('skip', strings.skip, 'link'), action('later', strings.later, 'ghost'), action('release', strings.openReleasePage, 'primary')]
      : [action('skip', strings.skip, 'link'), action('later', strings.later, 'ghost'), action('install', strings.updateNow, 'primary')],
  };
}

function downloadView(status, strings, lang) {
  const percent = Math.max(0, Math.min(100, Number(status.percent) || 0));
  // Every byte is in, and the signature check runs (a few seconds): nothing is left to cancel.
  if (percent >= 100) {
    return {
      phase: 'verifying',
      title: strings.verifyingTitle,
      meta: '',
      message: '',
      progress: { percent: 100, percentText: '', detail: '', indeterminate: true },
      actions: [action('background', strings.background, 'ghost')],
    };
  }
  const bytes = (value) => formatBytes(value, lang);
  const detail = status.total ? fill(strings.downloadDetail, { done: bytes(status.transferred), total: bytes(status.total), speed: bytes(status.bytesPerSecond) }) : '';
  return {
    phase: 'downloading',
    title: fill(strings.downloadingTitle, { version: status.version }),
    meta: '',
    message: '',
    progress: { percent, percentText: formatPercent(Math.floor(percent), lang || 'english'), detail, indeterminate: false },
    actions: [action('cancel', strings.cancel, 'link'), action('background', strings.background, 'ghost')],
  };
}

// The updater's own message is English and technical: it stays in the log, and only its error code
// (ERR_UPDATER_INVALID_SIGNATURE...) shows under the title, for a bug report.
function errorCode(error) {
  const match = /\bERR_[A-Z0-9_]+/.exec(String(error || ''));
  return match ? match[0] : '';
}

// What the user can do depends on where the update stopped.
function failureDetail(error, strings) {
  if (errorCode(error) === 'ERR_UPDATER_INVALID_SIGNATURE') return strings.failedSignature;
  if (error.startsWith('download failed')) return strings.failedDownload;
  return fill(strings.failedDetail, { message: error });
}

/**
 * @param {{ status: object, offer: object|null, strings: object, portable: boolean, lang?: string }} input
 *   lang is the app language id (french, german...), for numbers.
 * @returns {object|null} null when there is nothing to show.
 */
function buildUpdateWindowView({ status, offer, strings, portable, lang }) {
  const phase = (status && status.phase) || 'idle';
  const notes = offer ? { title: strings.whatsNew, blocks: offer.notes || [], empty: strings.notesUnavailable, link: strings.fullNotes } : null;
  const base = (view) => ({ ...view, notes, close: strings.close });
  switch (phase) {
    case 'downloading':
      return base(downloadView(status, strings, lang));
    case 'ready':
    case 'installing':
      return base({
        phase: 'installing',
        title: fill(strings.installingTitle, { version: status.version }),
        meta: '',
        message: fill(strings.installingDetail, { version: status.version }),
        progress: { percent: 100, detail: '', indeterminate: true },
        actions: [],
      });
    case 'held':
      return base({
        phase: 'held',
        title: strings.ready,
        meta: '',
        message: fill(strings.readyAfterGame, { version: status.version }),
        progress: null,
        actions: [action('background', strings.later, 'ghost'), action('install-now', strings.installNow, 'primary')],
      });
    case 'error':
      return base({
        phase: 'error',
        title: strings.failedTitle,
        meta: errorCode(status.error),
        message: failureDetail(status.error || '', strings),
        progress: null,
        actions: [action('close', strings.close, 'ghost'), action('release', strings.openReleasePage, 'primary')],
      });
    default:
      return offer ? base(offerView(offer, strings, portable, lang)) : null;
  }
}

module.exports = { buildUpdateWindowView, formatBytes };
