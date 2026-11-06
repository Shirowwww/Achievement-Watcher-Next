'use strict';

// RLD! writes State, Time and the progress counters of achievements.ini as a 5-byte hex blob: a
// little-endian uint32 plus a trailing byte that is discarded. Shared by the app reader (steam.js),
// the Watchdog (monitor.js) and the relock editor (achievementRelockText.js).

// Exactly 10 digits, the only length RLD writes. A shorter run of digits is as likely to be a decimal.
const RLD_BLOB_RE = /^[0-9a-fA-F]{10}$/;

// A value that CANNOT also be a decimal timestamp: guessing wrong on an all-digit blob would move a
// real unlock to the 1990s. A State key already proves the layout, so it is decoded without this.
function isUnambiguousRldBlob(value) {
  const s = String(value);
  return RLD_BLOB_RE.test(s) && /[a-fA-F]/.test(s);
}

function decodeRldBlob(value) {
  return new DataView(new Uint8Array(Buffer.from(String(value), 'hex')).buffer).getUint32(0, true);
}

module.exports = { RLD_BLOB_RE, isUnambiguousRldBlob, decodeRldBlob };
