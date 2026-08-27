'use strict';

function parse(buffer) {
  if (!Buffer.isBuffer(buffer)) throw 'ERR_INVALID_ARGS';

  const length = 24; //Each entries are 24 bytes long
  const header = buffer.slice(0, 4);

  const stats = bufferSplitIntoChuncks(buffer.slice(header.length, buffer.length), length);
  const expectedStatsCount = header.readInt32LE();
  if (stats.length !== expectedStatsCount) throw 'ERR_UNEXPECTED_STATS_COUNT';

  let result = [];

  for (let i = 0; i < stats.length; i++) {
    try {
      const value = stats[i].slice(20, 24).readInt32LE();
      if (value > 1) continue; //0/1 = achievement or stat; a stat at 100% reads >1 and also has an unlocktime

      result.push({
        // oxlint-disable-next-line unicorn/no-array-reverse -- Buffer#toReversed returns a plain Uint8Array, whose toString('hex') joins decimals with commas. The copy above already makes reverse() safe.
        crc: Buffer.from(stats[i].subarray(0, 4)).reverse().toString('hex'), //api_name is a CRC32
        Achieved: value,
        UnlockTime: stats[i].slice(8, 12).readInt32LE(),
      });
    } catch {
      continue;
    }
  }

  return result;
}

function bufferSplitIntoChuncks(buffer, n) {
  let result = [];
  for (let i = 0, j = 1; i < buffer.length; i += n, j++) result.push(buffer.slice(i, n * j));
  return result;
}

module.exports = { parse };
