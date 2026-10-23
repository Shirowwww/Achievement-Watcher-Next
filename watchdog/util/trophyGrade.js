'use strict';

// The PlayStation trophy type letter (P/G/S/B in a TROPCONF/TROP.SFM entry) as the grade the popup is
// painted in. One table for the RPCS3, ShadPS4 and KytyPS5 watchers.
const TROPHY_GRADES = { P: 'platinum', G: 'gold', S: 'silver', B: 'bronze' };

function trophyGradeOf(type) {
  return TROPHY_GRADES[type] || undefined;
}

// A real platinum trophy takes the platinum popup the app shows at 100%, unless that one is turned off.
function platinumFields(type, options) {
  const wanted = !(options && options.notification && options.notification.platinum === false);
  // A 'P' trophy is the console's own platinum: its name and icon are the real ones.
  return type === 'P' && wanted ? { notificationType: 'platinum', realPlatinum: true } : {};
}

module.exports = { trophyGradeOf, platinumFields };
