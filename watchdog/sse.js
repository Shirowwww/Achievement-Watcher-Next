'use strict';

function parse(buffer) {
  if (!Buffer.isBuffer(buffer)) throw 'ENOTABUFFER';

  const Length = 24; //Each entries are 24 bytes long

  const header = buffer.slice(0, 4);
  const stats = bufferSplit(buffer.slice(header.length, buffer.length), Length);

  const expectedStatsCount = toInt(header);
  if (stats.length !== expectedStatsCount) throw 'EUNEXPECTEDFILECONTENT';

  let result = [];

  for (let i = 0; i < stats.length; i++) {
    try {
      const value = toInt(stats[i].slice(20, 21));
      if (value === 1) {
        //is an achievement or a stat when 0 or 1; is a stat 100% when > 1; NB: a stat has also an unlocktime with sse
        result.push({
          crc: toString(stats[i].slice(0, 4)),
          Achieved: value,
          UnlockTime: toInt(stats[i].slice(8, 12)),
        });
      }
    } catch {
      /* Do nothing */
    }
  }

  return result;
}

/*
  Every value in the file is little-endian, so it is read back to front. Buffer#slice hands out a
  view over the same memory rather than a copy, so reversing the argument in place would rewrite the
  bytes of the file buffer the caller still holds: parsing it a second time would read every CRC and
  unlock time byte-swapped. Both helpers reverse a copy.
*/
function toString(buffer) {
  // oxlint-disable-next-line unicorn/no-array-reverse -- Buffer#toReversed returns a plain Uint8Array, whose toString('hex') joins decimals with commas. The copy above already makes reverse() safe.
  return Buffer.from(buffer).reverse().toString('hex');
}

function toInt(buffer) {
  // oxlint-disable-next-line unicorn/no-array-reverse -- Buffer#toReversed returns a plain Uint8Array, whose toString('hex') joins decimals with commas. The copy above already makes reverse() safe.
  return parseInt(Buffer.from(buffer).reverse().toString('hex'), 16);
}

function bufferSplit(buffer, n) {
  let result = [];
  for (let i = 0, j = 1; i < buffer.length; i += n, j++) result.push(buffer.slice(i, n * j));
  return result;
}

module.exports = { parse };
