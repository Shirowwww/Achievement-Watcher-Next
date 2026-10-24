'use strict';

/*
  Relock editors for binary saves: each returns { buffer, changed } with every other byte untouched,
  and throws on a layout it does not recognise.
*/

const TROPUSR_MAGIC = 0x818f54ad;
const TROPUSR_HEADER = 0x30;
const TROPUSR_TABLE = 0x20;
const TROPUSR_STATE_TYPE = 6;

// RPCS3's own "Lock Trophy": state 0 and both timestamps 0, nothing else moves (TROPUSR.cpp LockTrophy).
function relockTropusr(buffer, trophyId) {
  if (buffer.length < TROPUSR_HEADER || buffer.readUInt32BE(0) !== TROPUSR_MAGIC) throw new Error('not a TROPUSR.DAT');
  const out = Buffer.from(buffer);
  let changed = false;
  const tables = buffer.readUInt32BE(8);
  for (let table = 0; table < tables; table += 1) {
    const at = TROPUSR_HEADER + table * TROPUSR_TABLE;
    if (at + TROPUSR_TABLE > buffer.length) throw new Error('TROPUSR.DAT table header out of range');
    if (buffer.readUInt32BE(at) !== TROPUSR_STATE_TYPE) continue;
    const stride = buffer.readUInt32BE(at + 4) + 0x10;
    const count = buffer.readUInt32BE(at + 12);
    const offset = Number(buffer.readBigUInt64BE(at + 16));
    if (stride < 0x30 || offset + count * stride > buffer.length) throw new Error('TROPUSR.DAT state table out of range');
    for (let index = 0; index < count; index += 1) {
      const entry = offset + index * stride;
      if (out.readUInt32BE(entry + 0x10) !== trophyId) continue;
      if (out.readUInt32BE(entry + 0x14) === 0 && out.readBigUInt64BE(entry + 0x20) === 0n && out.readBigUInt64BE(entry + 0x28) === 0n) continue;
      out.writeUInt32BE(0, entry + 0x14);
      out.writeBigUInt64BE(0n, entry + 0x20);
      out.writeBigUInt64BE(0n, entry + 0x28);
      changed = true;
    }
  }
  return { buffer: changed ? out : buffer, changed };
}

const ACH_HEADER = 16;
const ACH_RECORD = 16;

// Unleashed/Marathon ACH-DATA: the record goes, the rest moves up (a zero id ends the list) and the
// XOR of the records is written again, since the game refuses a file whose checksum is off.
function relockAchData(buffer, id) {
  if (buffer.length < ACH_HEADER || (buffer.length - ACH_HEADER) % ACH_RECORD !== 0) throw new Error('ACH-DATA has the wrong size');
  if (buffer.toString('latin1', 0, 4) !== 'ACH ' || buffer.readUInt32LE(4) > 1) throw new Error('ACH-DATA has an unknown header');
  const records = [];
  for (let at = ACH_HEADER; at < buffer.length; at += ACH_RECORD) {
    const record = buffer.subarray(at, at + ACH_RECORD);
    if (record.readUInt16LE(0)) records.push(record);
  }
  const kept = records.filter((record) => record.readUInt16LE(0) !== id);
  if (kept.length === records.length) return { buffer, changed: false };
  const out = Buffer.alloc(buffer.length);
  buffer.copy(out, 0, 0, ACH_HEADER);
  kept.forEach((record, index) => record.copy(out, ACH_HEADER + index * ACH_RECORD));
  let checksum = 0;
  for (let at = ACH_HEADER; at < out.length; at += 1) checksum ^= out[at];
  out.writeUInt32LE(checksum, 8);
  return { buffer: out, changed: true };
}

const XLLN_RECORD = 16;

// XLiveLessNess achievements.dat: every record of the id is dropped (a rewrite can leave two).
function relockXlln(buffer, id) {
  if (buffer.length % XLLN_RECORD !== 0) throw new Error('achievements.dat is not a whole number of records');
  const kept = [];
  for (let at = 0; at < buffer.length; at += XLLN_RECORD) {
    if (buffer.readUInt32LE(at) !== id) kept.push(buffer.subarray(at, at + XLLN_RECORD));
  }
  return kept.length * XLLN_RECORD === buffer.length ? { buffer, changed: false } : { buffer: Buffer.concat(kept), changed: true };
}

const FF7_BYTES = 8;

// FF7 (2013) achievement.dat: one bit per achievement, most significant bit first.
function relockBit(buffer, bit) {
  if (buffer.length !== FF7_BYTES) throw new Error('achievement.dat is not 8 bytes');
  const mask = 1 << (7 - (bit % 8));
  if ((buffer[bit >> 3] & mask) === 0) return { buffer, changed: false };
  const out = Buffer.from(buffer);
  out[bit >> 3] &= ~mask;
  return { buffer: out, changed: true };
}

// A GSE stat file (`stats/<name>`): one 4-byte counter, zeroed.
function lowerGseStat(buffer) {
  if (buffer.length !== 4) throw new Error('stat file is not 4 bytes');
  if (buffer.readInt32LE(0) === 0) return { buffer, changed: false };
  return { buffer: Buffer.alloc(4), changed: true };
}

module.exports = { relockTropusr, relockAchData, relockXlln, relockBit, lowerGseStat };
