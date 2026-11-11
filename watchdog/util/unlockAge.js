'use strict';

/*
  Some saves stamp an unlock a few minutes ahead of this PC's clock (a Goldberg save of LEGO Marvel
  Super Heroes did, by 1 to 4 minutes). Read as "in the future", each was dropped as Outatime: no
  popup, and the library listed it "in 3 minutes". Within this tolerance the unlock is taken as made
  at the read; a stamp further ahead is still not trusted as fresh.
*/
const FUTURE_TOLERANCE_S = 10 * 60;

/**
 * @param {number} unlockTime  the save's stamp, in Unix seconds
 * @param {number} readAt  when the save was read, in Unix seconds
 * @returns {number} the stamp, or readAt when the stamp is only slightly ahead of it
 */
function freshUnlockTime(unlockTime, readAt) {
  const ahead = unlockTime - readAt;
  return ahead > 0 && ahead <= FUTURE_TOLERANCE_S ? readAt : unlockTime;
}

module.exports = { freshUnlockTime, FUTURE_TOLERANCE_S };
