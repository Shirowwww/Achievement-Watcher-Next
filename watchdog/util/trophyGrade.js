'use strict';

// The PlayStation trophy type letter (P/G/S/B in a TROPCONF/TROP.SFM entry) as the grade the popup is
// painted in. One table for the RPCS3, ShadPS4 and KytyPS5 watchers.
const TROPHY_GRADES = { P: 'platinum', G: 'gold', S: 'silver', B: 'bronze' };

function trophyGradeOf(type) {
  return TROPHY_GRADES[type] || undefined;
}

module.exports = { trophyGradeOf };
