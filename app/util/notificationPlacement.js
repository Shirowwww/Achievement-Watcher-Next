'use strict';

/*
  Where an overlay popup goes and at what size. Counter progress (the "+1" of a stat achievement) may
  have its own position and scale; '' means "same as unlocks", game override included. An explicit
  progress choice applies to every game, since keeping progress away from unlocks is its whole point.
*/

const { POSITIONS, SCALES } = require('./gamePreset.js');

const DEFAULT_POSITION = 'center-bottom';

function normalizeProgressPosition(value) {
  const position = typeof value === 'string' ? value.trim() : '';
  return POSITIONS.includes(position) ? position : '';
}

function normalizeProgressScale(value) {
  if (value === '' || value == null) return '';
  const scale = Number(value);
  return SCALES.includes(scale) ? scale : '';
}

function positiveScale(value) {
  const scale = Number(value);
  return Number.isFinite(scale) && scale > 0 ? scale : 0;
}

// Each saved custom anchor lives under its own key of overlayBounds.json. Progress borrows the unlock
// anchor until it has been placed once, so switching it to Custom never lands somewhere arbitrary.
function savedAnchor(bounds, anchor) {
  if (!bounds || typeof bounds !== 'object') return null;
  return (anchor === 'progressNotif' && bounds.progressNotif) || bounds.notif || null;
}

function resolvePlacement({ kind, game, global } = {}) {
  const own = game || {};
  const settings = global || {};
  const gamePosition = own.position || '';
  let position = gamePosition || settings.position || DEFAULT_POSITION;
  let customPosition = gamePosition === 'custom' ? own.customPosition || null : null;
  let scale = positiveScale(own.scale) || positiveScale(settings.scale) || 1;
  let anchor = 'notif';

  if (String(kind || '').toLowerCase() === 'progress') {
    const progressPosition = normalizeProgressPosition(settings.progressPosition);
    if (progressPosition) {
      position = progressPosition;
      customPosition = null;
      anchor = 'progressNotif';
    }
    scale = normalizeProgressScale(settings.progressScale) || scale;
  }
  return { position, scale, customPosition, anchor };
}

module.exports = {
  normalizeProgressPosition,
  normalizeProgressScale,
  resolvePlacement,
  savedAnchor,
};
